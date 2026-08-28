package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/middleware"
	"github.com/ucon-movie/backend/internal/ucon"
)

type LocationRequest struct {
	Latitude  float64 `json:"latitude" binding:"required"`
	Longitude float64 `json:"longitude" binding:"required"`
}

func SaveUserLocation(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	var req LocationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	countryCode, err := ucon.FetchCountryCode(req.Latitude, req.Longitude)
	if err != nil {
		countryCode = "XX"
	}

	_, err = database.Pool.Exec(context.Background(),
		`INSERT INTO user_locations (user_id, country_code, latitude, longitude)
         VALUES ($1, $2, $3, $4)`,
		userID, countryCode, req.Latitude, req.Longitude,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save location"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"country_code": countryCode,
		"latitude":     req.Latitude,
		"longitude":    req.Longitude,
		"ucon":         "preC0 — country_code resolved for geo-restriction checks",
	})
}
