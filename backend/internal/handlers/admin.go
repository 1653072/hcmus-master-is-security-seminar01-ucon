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

func check2FA(c *gin.Context) bool {
	code := c.GetHeader("X-2FA-Code")
	if err := ucon.PreB1_TwoFactorAuth(code); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preB1"})
		return false
	}
	return true
}

func AdminListMovies(c *gin.Context) {
	if !check2FA(c) {
		return
	}
	rows, err := database.Pool.Query(context.Background(),
		`SELECT movie_id, title, genre, duration_minutes, geo_restriction, is_available, video_file, created_at, updated_at
         FROM movies ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch movies"})
		return
	}
	defer rows.Close()
	movies := make([]models.Movie, 0)
	for rows.Next() {
		var m models.Movie
		if err := rows.Scan(&m.MovieID, &m.Title, &m.Genre, &m.DurationMinutes,
			&m.GeoRestriction, &m.IsAvailable, &m.VideoFile, &m.CreatedAt, &m.UpdatedAt); err != nil {
			continue
		}
		movies = append(movies, m)
	}
	c.JSON(http.StatusOK, movies)
}

type MovieRequest struct {
	Title           string   `json:"title" binding:"required"`
	Genre           string   `json:"genre" binding:"required"`
	DurationMinutes int      `json:"duration_minutes" binding:"required,min=1"`
	GeoRestriction  []string `json:"geo_restriction"`
	IsAvailable     bool     `json:"is_available"`
	VideoFile       string   `json:"video_file" binding:"required"`
	Reason          string   `json:"reason" binding:"required"`
}

func AdminCreateMovie(c *gin.Context) {
	if !check2FA(c) {
		return
	}
	claims := middleware.GetClaims(c)
	adminID, _ := uuid.Parse(claims.UserID)

	var req MovieRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.GeoRestriction == nil {
		req.GeoRestriction = []string{}
	}

	var movie models.Movie
	err := database.Pool.QueryRow(context.Background(),
		`INSERT INTO movies (title, genre, duration_minutes, geo_restriction, is_available, video_file)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING movie_id, title, genre, duration_minutes, geo_restriction, is_available, video_file, created_at, updated_at`,
		req.Title, req.Genre, req.DurationMinutes, req.GeoRestriction, req.IsAvailable, req.VideoFile,
	).Scan(&movie.MovieID, &movie.Title, &movie.Genre, &movie.DurationMinutes,
		&movie.GeoRestriction, &movie.IsAvailable, &movie.VideoFile, &movie.CreatedAt, &movie.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create movie"})
		return
	}

	// onA3: audit log
	_ = ucon.OnA3_WriteAuditLog(context.Background(), database.Pool, adminID,
		"CREATE_MOVIE", "movie", movie.MovieID.String(), req.Reason)

	c.JSON(http.StatusCreated, gin.H{"movie": movie, "ucon": []string{"preA0", "preB1", "onA3"}})
}

func AdminUpdateMovie(c *gin.Context) {
	if !check2FA(c) {
		return
	}
	claims := middleware.GetClaims(c)
	adminID, _ := uuid.Parse(claims.UserID)

	movieID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid movie id"})
		return
	}

	var req MovieRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var movie models.Movie
	err = database.Pool.QueryRow(context.Background(),
		`UPDATE movies SET title=$1, genre=$2, duration_minutes=$3, geo_restriction=$4,
         is_available=$5, video_file=$6, updated_at=NOW()
         WHERE movie_id=$7
         RETURNING movie_id, title, genre, duration_minutes, geo_restriction, is_available, video_file, created_at, updated_at`,
		req.Title, req.Genre, req.DurationMinutes, req.GeoRestriction, req.IsAvailable, req.VideoFile, movieID,
	).Scan(&movie.MovieID, &movie.Title, &movie.Genre, &movie.DurationMinutes,
		&movie.GeoRestriction, &movie.IsAvailable, &movie.VideoFile, &movie.CreatedAt, &movie.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "movie not found"})
		return
	}

	_ = ucon.OnA3_WriteAuditLog(context.Background(), database.Pool, adminID,
		"UPDATE_MOVIE", "movie", movieID.String(), req.Reason)

	c.JSON(http.StatusOK, gin.H{"movie": movie, "ucon": []string{"preA0", "preB1", "onA3"}})
}

func AdminDeleteMovie(c *gin.Context) {
	if !check2FA(c) {
		return
	}
	claims := middleware.GetClaims(c)
	adminID, _ := uuid.Parse(claims.UserID)

	movieID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid movie id"})
		return
	}

	reason := c.Query("reason")
	if reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reason query param is required"})
		return
	}

	_, err = database.Pool.Exec(context.Background(),
		`UPDATE movies SET is_available = FALSE, updated_at = NOW() WHERE movie_id = $1`, movieID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "movie not found"})
		return
	}

	_ = ucon.OnA3_WriteAuditLog(context.Background(), database.Pool, adminID,
		"SOFT_DELETE_MOVIE", "movie", movieID.String(), reason)

	c.JSON(http.StatusOK, gin.H{"message": "movie deactivated", "ucon": []string{"preA0", "preB1", "onA3"}})
}

func AdminGetAuditLog(c *gin.Context) {
	rows, err := database.Pool.Query(context.Background(),
		`SELECT al.log_id, al.admin_id, al.action, al.target_type, al.target_id, al.reason, al.created_at,
                u.username as admin_username
         FROM audit_log al JOIN users u ON al.admin_id = u.user_id
         ORDER BY al.created_at DESC LIMIT 100`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch audit log"})
		return
	}
	defer rows.Close()

	type LogEntry struct {
		models.AuditLog
		AdminUsername string `json:"admin_username"`
	}
	logs := make([]LogEntry, 0)
	for rows.Next() {
		var l LogEntry
		if err := rows.Scan(&l.LogID, &l.AdminID, &l.Action, &l.TargetType, &l.TargetID, &l.Reason, &l.CreatedAt, &l.AdminUsername); err != nil {
			continue
		}
		logs = append(logs, l)
	}
	c.JSON(http.StatusOK, logs)
}

func AdminListUsers(c *gin.Context) {
	rows, err := database.Pool.Query(context.Background(),
		`SELECT user_id, username, full_name, gender, role, account_type, offline_count, status, created_at, updated_at
         FROM users ORDER BY created_at DESC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch users"})
		return
	}
	defer rows.Close()

	type UserSummary struct {
		UserID       uuid.UUID `json:"user_id"`
		Username     string    `json:"username"`
		FullName     string    `json:"full_name"`
		Gender       string    `json:"gender"`
		Role         string    `json:"role"`
		AccountType  *string   `json:"account_type"`
		OfflineCount int       `json:"offline_count"`
		Status       string    `json:"status"`
	}
	users := make([]UserSummary, 0)
	for rows.Next() {
		var u UserSummary
		var createdAt, updatedAt interface{}
		if err := rows.Scan(&u.UserID, &u.Username, &u.FullName, &u.Gender,
			&u.Role, &u.AccountType, &u.OfflineCount, &u.Status, &createdAt, &updatedAt); err != nil {
			continue
		}
		users = append(users, u)
	}
	c.JSON(http.StatusOK, users)
}

func AdminBlockUser(c *gin.Context) {
	if !check2FA(c) {
		return
	}
	claims := middleware.GetClaims(c)
	adminID, _ := uuid.Parse(claims.UserID)

	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	reason := c.Query("reason")
	if reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reason query param required"})
		return
	}

	_, err = database.Pool.Exec(context.Background(),
		`UPDATE users SET status = 'blocked', updated_at = NOW() WHERE user_id = $1`, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	_ = ucon.OnA3_WriteAuditLog(context.Background(), database.Pool, adminID,
		"BLOCK_USER", "user", userID.String(), reason)

	c.JSON(http.StatusOK, gin.H{"message": "user blocked", "ucon": []string{"preA0", "preB1", "onA3"}})
}
