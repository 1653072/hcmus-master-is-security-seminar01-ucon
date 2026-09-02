package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/middleware"
	"github.com/ucon-movie/backend/internal/models"
	"github.com/ucon-movie/backend/internal/ucon"
)

func ListOfflineDownloads(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	// onA0: opening the offline library is the checkpoint that revokes any
	// downloads left over from a subscription that has since expired.
	_ = ucon.OnA0_RevokeExpiredOfflineDownloads(context.Background(), database.Pool, userID)

	rows, err := database.Pool.Query(context.Background(),
		`SELECT od.download_id, od.user_id, od.movie_id, od.downloaded_at, od.status, od.created_at, od.updated_at,
                m.title, m.genre, m.duration_minutes
         FROM offline_downloads od JOIN movies m ON od.movie_id = m.movie_id
         WHERE od.user_id = $1 AND od.status = 'active' ORDER BY od.created_at DESC`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch downloads"})
		return
	}
	defer rows.Close()

	type DownloadWithMovie struct {
		models.OfflineDownload
		MovieTitle    string `json:"movie_title"`
		MovieGenre    string `json:"movie_genre"`
		MovieDuration int    `json:"movie_duration_minutes"`
	}
	downloads := make([]DownloadWithMovie, 0)
	for rows.Next() {
		var d DownloadWithMovie
		if err := rows.Scan(&d.DownloadID, &d.UserID, &d.MovieID, &d.DownloadedAt, &d.Status, &d.CreatedAt, &d.UpdatedAt,
			&d.MovieTitle, &d.MovieGenre, &d.MovieDuration); err != nil {
			continue
		}
		downloads = append(downloads, d)
	}
	c.JSON(http.StatusOK, downloads)
}

func DownloadMovie(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	movieID, err := uuid.Parse(c.Param("movie_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid movie id"})
		return
	}

	// preA0: subscription valid
	var sub models.Subscription
	err = database.Pool.QueryRow(context.Background(),
		`SELECT subscription_id, user_id, subscription_expiry, active_device_count, created_at, updated_at
         FROM subscriptions WHERE user_id = $1`, userID,
	).Scan(&sub.SubscriptionID, &sub.UserID, &sub.SubscriptionExpiry,
		&sub.ActiveDeviceCount, &sub.CreatedAt, &sub.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "no active subscription", "ucon": "preA0"})
		return
	}
	if err := ucon.PreA0_SubscriptionExpiry(&sub); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preA0"})
		return
	}

	// preC0: geo restriction
	var movie models.Movie
	_ = database.Pool.QueryRow(context.Background(),
		`SELECT movie_id, title, genre, duration_minutes, geo_restriction, is_available, video_file, created_at, updated_at
         FROM movies WHERE movie_id = $1`, movieID,
	).Scan(&movie.MovieID, &movie.Title, &movie.Genre, &movie.DurationMinutes,
		&movie.GeoRestriction, &movie.IsAvailable, &movie.VideoFile, &movie.CreatedAt, &movie.UpdatedAt)

	countryCode := ucon.GetUserCountryCode(context.Background(), database.Pool, userID)
	if err := ucon.PreC0_GeoRestriction(&movie, countryCode); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preC0"})
		return
	}

	// Check user offline_count < 5
	var offlineCount int
	_ = database.Pool.QueryRow(context.Background(),
		`SELECT offline_count FROM users WHERE user_id = $1`, userID,
	).Scan(&offlineCount)
	if offlineCount >= 5 {
		c.JSON(http.StatusForbidden, gin.H{"error": "maximum offline storage limit (5 movies) reached", "ucon": "preA1"})
		return
	}

	// preB1: must commit to not sharing the downloaded file before it's granted
	if err := ucon.PreB1_OfflineConsent(context.Background(), database.Pool, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record consent"})
		return
	}

	// preA1: increment offline_count (atomic)
	if err := ucon.PreA1_IncrementOfflineCount(context.Background(), database.Pool, userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preA1"})
		return
	}

	var download models.OfflineDownload
	err = database.Pool.QueryRow(context.Background(),
		`INSERT INTO offline_downloads (user_id, movie_id) VALUES ($1, $2)
         RETURNING download_id, user_id, movie_id, downloaded_at, status, created_at, updated_at`,
		userID, movieID,
	).Scan(&download.DownloadID, &download.UserID, &download.MovieID, &download.DownloadedAt, &download.Status, &download.CreatedAt, &download.UpdatedAt)
	if err != nil {
		_ = ucon.OnA3_DecrementOfflineCount(context.Background(), database.Pool, userID)
		c.JSON(http.StatusConflict, gin.H{"error": "this movie is already stored offline", "ucon": "preA1"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"download": download,
		"ucon":     []string{"preA0", "preC0", "preA1", "preB1"},
	})
}

func DeleteDownload(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	downloadID, err := uuid.Parse(c.Param("download_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid download id"})
		return
	}

	var download models.OfflineDownload
	err = database.Pool.QueryRow(context.Background(),
		`UPDATE offline_downloads SET status = 'deleted', updated_at = NOW()
         WHERE download_id = $1 AND user_id = $2 AND status = 'active'
         RETURNING download_id, user_id, movie_id, downloaded_at, status, created_at, updated_at`,
		downloadID, userID,
	).Scan(&download.DownloadID, &download.UserID, &download.MovieID, &download.DownloadedAt, &download.Status, &download.CreatedAt, &download.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "active download not found"})
		return
	}

	// onA3: decrement offline_count
	_ = ucon.OnA3_DecrementOfflineCount(context.Background(), database.Pool, userID)

	c.JSON(http.StatusOK, gin.H{"message": "download deleted", "download": download, "ucon": []string{"onA3"}})
}
