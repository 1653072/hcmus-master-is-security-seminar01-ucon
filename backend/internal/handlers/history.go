package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/middleware"
	"github.com/ucon-movie/backend/internal/models"
)

func ListHistory(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	rows, err := database.Pool.Query(context.Background(),
		`SELECT wh.history_id, wh.user_id, wh.movie_id, wh.watch_start, wh.watch_end, wh.device_info, wh.created_at,
                m.title, m.genre, m.duration_minutes
         FROM watch_history wh JOIN movies m ON wh.movie_id = m.movie_id
         WHERE wh.user_id = $1 ORDER BY wh.watch_start DESC`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch history"})
		return
	}
	defer rows.Close()

	type HistoryWithMovie struct {
		models.WatchHistory
		MovieTitle    string `json:"movie_title"`
		MovieGenre    string `json:"movie_genre"`
		MovieDuration int    `json:"movie_duration_minutes"`
	}
	history := make([]HistoryWithMovie, 0)
	for rows.Next() {
		var h HistoryWithMovie
		if err := rows.Scan(&h.HistoryID, &h.UserID, &h.MovieID, &h.WatchStart, &h.WatchEnd,
			&h.DeviceInfo, &h.CreatedAt, &h.MovieTitle, &h.MovieGenre, &h.MovieDuration); err != nil {
			continue
		}
		history = append(history, h)
	}
	c.JSON(http.StatusOK, gin.H{
		"history": history,
		"ucon":    "preA0 (user_id match enforced, DELETE denied by policy)",
	})
}
