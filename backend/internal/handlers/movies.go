package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/models"
)

func ListMovies(c *gin.Context) {
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

func GetMovie(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid movie id"})
		return
	}

	var m models.Movie
	err = database.Pool.QueryRow(context.Background(),
		`SELECT movie_id, title, genre, duration_minutes, geo_restriction, is_available, video_file, created_at, updated_at
         FROM movies WHERE movie_id = $1`, id,
	).Scan(&m.MovieID, &m.Title, &m.Genre, &m.DurationMinutes,
		&m.GeoRestriction, &m.IsAvailable, &m.VideoFile, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "movie not found"})
		return
	}
	c.JSON(http.StatusOK, m)
}

func scanMovie(row pgx.Row) (*models.Movie, error) {
	var m models.Movie
	err := row.Scan(&m.MovieID, &m.Title, &m.Genre, &m.DurationMinutes,
		&m.GeoRestriction, &m.IsAvailable, &m.VideoFile, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}
