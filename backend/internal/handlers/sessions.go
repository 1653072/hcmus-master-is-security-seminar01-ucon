package handlers

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/middleware"
	"github.com/ucon-movie/backend/internal/models"
	"github.com/ucon-movie/backend/internal/ucon"
)

func StopSession(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	sessionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	var session models.Session
	err = database.Pool.QueryRow(context.Background(),
		`UPDATE sessions SET is_active = FALSE, ended_at = NOW(), updated_at = NOW()
         WHERE session_id = $1 AND user_id = $2 AND is_active = TRUE
         RETURNING session_id, user_id, movie_id, session_type, rental_id, device_info,
                   started_at, ended_at, is_active, created_at, updated_at`,
		sessionID, userID,
	).Scan(&session.SessionID, &session.UserID, &session.MovieID, &session.SessionType,
		&session.RentalID, &session.DeviceInfo, &session.StartedAt, &session.EndedAt,
		&session.IsActive, &session.CreatedAt, &session.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "active session not found"})
		return
	}

	// onA3: write watch_history
	_ = ucon.OnA3_WriteWatchHistory(context.Background(), database.Pool, &session)

	// onA3: decrement device count if subscription session
	if session.SessionType == "subscription" {
		var subID uuid.UUID
		_ = database.Pool.QueryRow(context.Background(),
			`SELECT subscription_id FROM subscriptions WHERE user_id = $1`, userID,
		).Scan(&subID)
		_ = ucon.OnA3_DecrementDeviceCount(context.Background(), database.Pool, subID)
	}

	c.JSON(http.StatusOK, gin.H{"message": "session stopped", "session": session, "ucon": []string{"onA3"}})
}

// SessionSSE implements Server-Sent Events for Continuity of Decisions (onA0).
// Monitors rental_expiry or subscription_expiry every 15 seconds.
func SessionSSE(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	sessionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	// Verify session belongs to user
	var session models.Session
	err = database.Pool.QueryRow(context.Background(),
		`SELECT session_id, user_id, movie_id, session_type, rental_id, device_info,
                started_at, ended_at, is_active, created_at, updated_at
         FROM sessions WHERE session_id = $1 AND user_id = $2`,
		sessionID, userID,
	).Scan(&session.SessionID, &session.UserID, &session.MovieID, &session.SessionType,
		&session.RentalID, &session.DeviceInfo, &session.StartedAt, &session.EndedAt,
		&session.IsActive, &session.CreatedAt, &session.UpdatedAt)
	if err != nil || !session.IsActive {
		c.JSON(http.StatusNotFound, gin.H{"error": "active session not found"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	clientGone := c.Request.Context().Done()

	sendEvent := func(event, data string) {
		c.Writer.WriteString(fmt.Sprintf("event: %s\ndata: %s\n\n", event, data))
		c.Writer.Flush()
	}

	// Send initial connection event
	sendEvent("CONNECTED", `{"status":"monitoring","interval_seconds":15}`)

	for {
		select {
		case <-clientGone:
			// Client disconnected — close session and write history
			closeSession(sessionID, userID, &session)
			return

		case <-ticker.C:
			// onA0: check expiry conditions
			revoked, reason := checkSessionExpiry(context.Background(), &session)
			if revoked {
				sendEvent("REVOKED", fmt.Sprintf(`{"reason":"%s","ucon":"onA0"}`, reason))
				closeSession(sessionID, userID, &session)
				return
			}
			sendEvent("HEARTBEAT", fmt.Sprintf(`{"status":"valid","checked_at":"%s"}`, time.Now().UTC().Format(time.RFC3339)))
		}
	}
}

func checkSessionExpiry(ctx context.Context, session *models.Session) (bool, string) {
	if session.SessionType == "rental" && session.RentalID != nil {
		var expiry time.Time
		err := database.Pool.QueryRow(ctx,
			`SELECT rental_expiry FROM rentals WHERE rental_id = $1`, session.RentalID,
		).Scan(&expiry)
		if err != nil || time.Now().After(expiry) {
			return true, "rental_expired"
		}
	} else if session.SessionType == "subscription" {
		var expiry time.Time
		err := database.Pool.QueryRow(ctx,
			`SELECT subscription_expiry FROM subscriptions WHERE user_id = $1`, session.UserID,
		).Scan(&expiry)
		if err != nil || time.Now().After(expiry) {
			return true, "subscription_expired"
		}
	}
	return false, ""
}

func closeSession(sessionID, userID uuid.UUID, session *models.Session) {
	ctx := context.Background()
	var s models.Session
	err := database.Pool.QueryRow(ctx,
		`UPDATE sessions SET is_active = FALSE, ended_at = NOW(), updated_at = NOW()
         WHERE session_id = $1 AND is_active = TRUE
         RETURNING session_id, user_id, movie_id, session_type, rental_id, device_info,
                   started_at, ended_at, is_active, created_at, updated_at`,
		sessionID,
	).Scan(&s.SessionID, &s.UserID, &s.MovieID, &s.SessionType, &s.RentalID,
		&s.DeviceInfo, &s.StartedAt, &s.EndedAt, &s.IsActive, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return
	}
	_ = ucon.OnA3_WriteWatchHistory(ctx, database.Pool, &s)

	if s.SessionType == "subscription" {
		var subID uuid.UUID
		_ = database.Pool.QueryRow(ctx,
			`SELECT subscription_id FROM subscriptions WHERE user_id = $1`, userID,
		).Scan(&subID)
		_ = ucon.OnA3_DecrementDeviceCount(ctx, database.Pool, subID)
	}
}

// StreamVideo serves movie video files with HTTP Range request support.
// Validates: JWT, session active, session belongs to user.
func StreamVideo(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	sessionID, err := uuid.Parse(c.Param("session_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	var session models.Session
	var videoFile string
	err = database.Pool.QueryRow(context.Background(),
		`SELECT s.session_id, s.user_id, s.movie_id, s.session_type, s.rental_id, s.device_info,
                s.started_at, s.ended_at, s.is_active, s.created_at, s.updated_at, m.video_file
         FROM sessions s JOIN movies m ON s.movie_id = m.movie_id
         WHERE s.session_id = $1 AND s.user_id = $2 AND s.is_active = TRUE`,
		sessionID, userID,
	).Scan(&session.SessionID, &session.UserID, &session.MovieID, &session.SessionType,
		&session.RentalID, &session.DeviceInfo, &session.StartedAt, &session.EndedAt,
		&session.IsActive, &session.CreatedAt, &session.UpdatedAt, &videoFile)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "active session not found"})
		return
	}

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "./static"
	}
	filePath := filepath.Join(staticDir, "videos", videoFile)

	f, err := os.Open(filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "video file not found"})
		return
	}
	defer f.Close()

	fi, _ := f.Stat()
	http.ServeContent(c.Writer, c.Request, videoFile, fi.ModTime(), f)
}

// StreamAd serves ad video files. Requires JWT (basic_user only).
func StreamAd(c *gin.Context) {
	adID, err := uuid.Parse(c.Param("ad_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ad id"})
		return
	}

	var videoFile string
	err = database.Pool.QueryRow(context.Background(),
		`SELECT video_file FROM ads WHERE ad_id = $1 AND is_active = TRUE`, adID,
	).Scan(&videoFile)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ad not found"})
		return
	}

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "./static"
	}
	filePath := filepath.Join(staticDir, "ads", videoFile)

	f, err := os.Open(filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ad video file not found"})
		return
	}
	defer f.Close()

	fi, _ := f.Stat()
	http.ServeContent(c.Writer, c.Request, videoFile, fi.ModTime(), f)
}
