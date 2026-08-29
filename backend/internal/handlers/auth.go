package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ucon-movie/backend/internal/auth"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/models"
)

type RegisterRequest struct {
	Username    string `json:"username" binding:"required,min=3,max=50"`
	Password    string `json:"password" binding:"required,min=8"`
	FullName    string `json:"full_name" binding:"required"`
	Gender      string `json:"gender" binding:"required,oneof=unknown male female"`
	AccountType string `json:"account_type" binding:"required,oneof=basic premium"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	var user models.User
	err = database.Pool.QueryRow(context.Background(),
		`INSERT INTO users (username, password_hash, full_name, gender, role, account_type)
         VALUES ($1, $2, $3, $4, 'user', $5)
         RETURNING user_id, username, password_hash, full_name, gender, role, account_type,
                   offline_count, copyright_consented_at, offline_consent_at, status, created_at, updated_at`,
		req.Username, hash, req.FullName, req.Gender, req.AccountType,
	).Scan(
		&user.UserID, &user.Username, &user.PasswordHash, &user.FullName,
		&user.Gender, &user.Role, &user.AccountType, &user.OfflineCount,
		&user.CopyrightConsentedAt, &user.OfflineConsentedAt, &user.Status, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
		return
	}

	token, err := auth.GenerateToken(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"token": token, "user": user})
}

func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	err := database.Pool.QueryRow(context.Background(),
		`SELECT user_id, username, password_hash, full_name, gender, role, account_type,
                offline_count, copyright_consented_at, offline_consent_at, status, created_at, updated_at
         FROM users WHERE username = $1`,
		req.Username,
	).Scan(
		&user.UserID, &user.Username, &user.PasswordHash, &user.FullName,
		&user.Gender, &user.Role, &user.AccountType, &user.OfflineCount,
		&user.CopyrightConsentedAt, &user.OfflineConsentedAt, &user.Status, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if user.Status != "active" {
		c.JSON(http.StatusForbidden, gin.H{"error": "account is " + user.Status})
		return
	}

	if !auth.CheckPassword(req.Password, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := auth.GenerateToken(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

func GetMe(c *gin.Context) {
	claims, _ := c.Get("claims")
	jwtClaims, ok := claims.(*auth.JWTClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var user models.User
	err := database.Pool.QueryRow(context.Background(),
		`SELECT user_id, username, password_hash, full_name, gender, role, account_type,
                offline_count, copyright_consented_at, offline_consent_at, status, created_at, updated_at
         FROM users WHERE user_id = $1`,
		jwtClaims.UserID,
	).Scan(
		&user.UserID, &user.Username, &user.PasswordHash, &user.FullName,
		&user.Gender, &user.Role, &user.AccountType, &user.OfflineCount,
		&user.CopyrightConsentedAt, &user.OfflineConsentedAt, &user.Status, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, user)
}
