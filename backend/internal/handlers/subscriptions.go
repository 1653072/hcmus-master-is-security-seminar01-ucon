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

type SubscribeRequest struct {
	Months int `json:"months" binding:"required,min=1,max=12"`
}

func Subscribe(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	var req SubscribeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// preB1: mock payment first (create temp subscription_id placeholder)
	tempID := uuid.New()
	_, err := ucon.PreB1_MockPayment(context.Background(), database.Pool, userID, "subscription", tempID, 99000*req.Months)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "payment failed"})
		return
	}

	// preA1: update or create subscription
	sub, err := ucon.PreA1_UpdateSubscriptionExpiry(context.Background(), database.Pool, userID, req.Months)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Update account_type to premium
	_, _ = database.Pool.Exec(context.Background(),
		`UPDATE users SET account_type = 'premium', updated_at = NOW() WHERE user_id = $1 AND account_type = 'basic'`,
		userID,
	)

	c.JSON(http.StatusOK, gin.H{
		"subscription": sub,
		"ucon":         []string{"preA0", "preB1", "preA1"},
	})
}

func GetMySubscription(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	var sub models.Subscription
	err := database.Pool.QueryRow(context.Background(),
		`SELECT subscription_id, user_id, subscription_expiry, active_device_count, created_at, updated_at
         FROM subscriptions WHERE user_id = $1`, userID,
	).Scan(&sub.SubscriptionID, &sub.UserID, &sub.SubscriptionExpiry,
		&sub.ActiveDeviceCount, &sub.CreatedAt, &sub.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no subscription found"})
		return
	}
	c.JSON(http.StatusOK, sub)
}

func PlaySubscription(c *gin.Context) {
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
		c.JSON(http.StatusForbidden, gin.H{"error": "no subscription found", "ucon": "preA0"})
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

	// preA1: increment device count (atomic, max 3)
	if err := ucon.PreA1_IncrementDeviceCount(context.Background(), database.Pool, sub.SubscriptionID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preA1"})
		return
	}

	deviceInfo := c.GetHeader("User-Agent")
	var session models.Session
	err = database.Pool.QueryRow(context.Background(),
		`INSERT INTO sessions (user_id, movie_id, session_type, device_info)
         VALUES ($1, $2, 'subscription', $3)
         RETURNING session_id, user_id, movie_id, session_type, rental_id, device_info,
                   started_at, ended_at, is_active, created_at, updated_at`,
		userID, movieID, deviceInfo,
	).Scan(&session.SessionID, &session.UserID, &session.MovieID, &session.SessionType,
		&session.RentalID, &session.DeviceInfo, &session.StartedAt, &session.EndedAt,
		&session.IsActive, &session.CreatedAt, &session.UpdatedAt)
	if err != nil {
		// Rollback device count increment
		_, _ = database.Pool.Exec(context.Background(),
			`UPDATE subscriptions SET active_device_count = GREATEST(0, active_device_count - 1) WHERE subscription_id = $1`,
			sub.SubscriptionID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id":       session.SessionID,
		"video_stream_url": "/api/stream/" + session.SessionID.String(),
		"sse_url":          "/api/sessions/" + session.SessionID.String() + "/events",
		"ucon":             []string{"preA0", "preC0", "preA1"},
	})
}
