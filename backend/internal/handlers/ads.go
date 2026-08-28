package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/middleware"
)

type CompleteAdRequest struct {
	RentalID             uuid.UUID `json:"rental_id" binding:"required"`
	AdID                 uuid.UUID `json:"ad_id" binding:"required"`
	WatchDurationSeconds int       `json:"watch_duration_seconds" binding:"required,min=0"`
}

// CompleteAd records ad completion for preB0 obligation.
// Sets completed=true if watch_duration_seconds >= 15.
func CompleteAd(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	var req CompleteAdRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify rental belongs to user
	var movieID uuid.UUID
	err := database.Pool.QueryRow(context.Background(),
		`SELECT movie_id FROM rentals WHERE rental_id = $1 AND user_id = $2`,
		req.RentalID, userID,
	).Scan(&movieID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "rental not found"})
		return
	}

	completed := req.WatchDurationSeconds >= 15
	now := time.Now()

	_, err = database.Pool.Exec(context.Background(),
		`INSERT INTO ads_history (user_id, rental_id, movie_id, ad_id, watch_end, watch_duration_seconds, completed)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		userID, req.RentalID, movieID, req.AdID, now, req.WatchDurationSeconds, completed,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record ad completion"})
		return
	}

	if !completed {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":    "ad watch duration must be at least 15 seconds",
			"ucon":     "preB0",
			"watched":  req.WatchDurationSeconds,
			"required": 15,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"completed":            true,
		"watch_duration_seconds": req.WatchDurationSeconds,
		"ucon":                 "preB0",
		"message":              "ad obligation satisfied, you may now play the movie",
	})
}
