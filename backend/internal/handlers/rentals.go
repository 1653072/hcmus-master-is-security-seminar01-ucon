package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/ucon-movie/backend/internal/auth"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/middleware"
	"github.com/ucon-movie/backend/internal/models"
	"github.com/ucon-movie/backend/internal/ucon"
)

type RentMovieRequest struct {
	MovieID uuid.UUID `json:"movie_id" binding:"required"`
}

func RentMovie(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	var req RentMovieRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// preA0: account_type must be basic
	if err := ucon.PreA0_AccountType(claims.AccountType, "basic"); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preA0"})
		return
	}

	// preA0: movie must be available
	var movie models.Movie
	err := database.Pool.QueryRow(context.Background(),
		`SELECT movie_id, title, genre, duration_minutes, geo_restriction, is_available, video_file, created_at, updated_at
         FROM movies WHERE movie_id = $1`, req.MovieID,
	).Scan(&movie.MovieID, &movie.Title, &movie.Genre, &movie.DurationMinutes,
		&movie.GeoRestriction, &movie.IsAvailable, &movie.VideoFile, &movie.CreatedAt, &movie.UpdatedAt)
	if err != nil || !movie.IsAvailable {
		c.JSON(http.StatusNotFound, gin.H{"error": "movie not found or unavailable", "ucon": "preA0"})
		return
	}

	// preB1: copyright consent (first-time)
	if err := ucon.PreB1_CopyrightConsent(context.Background(), database.Pool, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record consent"})
		return
	}

	// preA1: create rental
	rental, err := ucon.PreA1_CreateRental(context.Background(), database.Pool, userID, req.MovieID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// preB1: mock payment
	_, err = ucon.PreB1_MockPayment(context.Background(), database.Pool, userID, "rental", rental.RentalID, 45000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "payment failed"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"rental": rental, "ucon": []string{"preA0", "preB1", "preA1"}})
}

func ListRentals(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	rows, err := database.Pool.Query(context.Background(),
		`SELECT r.rental_id, r.user_id, r.movie_id, r.rental_views_remaining, r.rental_expiry, r.created_at, r.updated_at,
                m.title, m.genre, m.duration_minutes
         FROM rentals r JOIN movies m ON r.movie_id = m.movie_id
         WHERE r.user_id = $1 ORDER BY r.created_at DESC`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch rentals"})
		return
	}
	defer rows.Close()

	type RentalWithMovie struct {
		models.Rental
		MovieTitle    string `json:"movie_title"`
		MovieGenre    string `json:"movie_genre"`
		MovieDuration int    `json:"movie_duration_minutes"`
	}
	rentals := make([]RentalWithMovie, 0)
	for rows.Next() {
		var r RentalWithMovie
		if err := rows.Scan(&r.RentalID, &r.UserID, &r.MovieID, &r.RentalViewsRemaining,
			&r.RentalExpiry, &r.CreatedAt, &r.UpdatedAt, &r.MovieTitle, &r.MovieGenre, &r.MovieDuration); err != nil {
			continue
		}
		rentals = append(rentals, r)
	}
	c.JSON(http.StatusOK, rentals)
}

// PlayRental starts a play session for a rental (basic_user).
// Implements: preA0 (rental_exists, expiry), preC0 (geo), preB0 (ad), preA1 (decrement)
func PlayRental(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	rentalID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rental id"})
		return
	}

	// preA0: rental exists and belongs to user
	var rental models.Rental
	err = database.Pool.QueryRow(context.Background(),
		`SELECT rental_id, user_id, movie_id, rental_views_remaining, rental_expiry, created_at, updated_at
         FROM rentals WHERE rental_id = $1 AND user_id = $2`,
		rentalID, userID,
	).Scan(&rental.RentalID, &rental.UserID, &rental.MovieID,
		&rental.RentalViewsRemaining, &rental.RentalExpiry, &rental.CreatedAt, &rental.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "rental not found", "ucon": "preA0"})
		return
	}

	if err := ucon.PreA0_RentalExpiry(&rental); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preA0"})
		return
	}

	if rental.RentalViewsRemaining <= 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "no views remaining for this rental", "ucon": "preA0"})
		return
	}

	// preC0: geo restriction
	var movie models.Movie
	_ = database.Pool.QueryRow(context.Background(),
		`SELECT movie_id, title, genre, duration_minutes, geo_restriction, is_available, video_file, created_at, updated_at
         FROM movies WHERE movie_id = $1`, rental.MovieID,
	).Scan(&movie.MovieID, &movie.Title, &movie.Genre, &movie.DurationMinutes,
		&movie.GeoRestriction, &movie.IsAvailable, &movie.VideoFile, &movie.CreatedAt, &movie.UpdatedAt)

	countryCode := ucon.GetUserCountryCode(context.Background(), database.Pool, userID)
	if err := ucon.PreC0_GeoRestriction(&movie, countryCode); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preC0"})
		return
	}

	// preB0: ad obligation
	ad, err := ucon.PreB0_AdObligation(context.Background(), database.Pool, userID, rentalID)
	if err != nil {
		// Must watch ad first
		adStreamURL := "/api/ads/" + ad.AdID.String() + "/stream"
		c.JSON(http.StatusForbidden, gin.H{
			"error":                err.Error(),
			"ucon":                 "preB0",
			"obligation":           "watch_ad",
			"ad_id":                ad.AdID,
			"ad_title":             ad.Title,
			"ad_stream_url":        adStreamURL,
			"ad_duration_seconds":  ad.DurationSeconds,
		})
		return
	}

	// preA1: decrement views (atomic)
	if err := ucon.PreA1_DecrementViews(context.Background(), database.Pool, rentalID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preA1"})
		return
	}

	// Create session
	deviceInfo := c.GetHeader("User-Agent")
	var session models.Session
	err = database.Pool.QueryRow(context.Background(),
		`INSERT INTO sessions (user_id, movie_id, session_type, rental_id, device_info)
         VALUES ($1, $2, 'rental', $3, $4)
         RETURNING session_id, user_id, movie_id, session_type, rental_id, device_info,
                   started_at, ended_at, is_active, created_at, updated_at`,
		userID, rental.MovieID, rentalID, deviceInfo,
	).Scan(&session.SessionID, &session.UserID, &session.MovieID, &session.SessionType,
		&session.RentalID, &session.DeviceInfo, &session.StartedAt, &session.EndedAt,
		&session.IsActive, &session.CreatedAt, &session.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id":      session.SessionID,
		"video_stream_url": "/api/stream/" + session.SessionID.String(),
		"sse_url":         "/api/sessions/" + session.SessionID.String() + "/events",
		"ucon":            []string{"preA0", "preC0", "preB0", "preA1"},
		"views_remaining": rental.RentalViewsRemaining - 1,
	})
}

// getClaims helper (re-export for internal use)
func getClaims(c *gin.Context) *auth.JWTClaims {
	return middleware.GetClaims(c)
}
