package auth

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/ucon-movie/backend/internal/models"
)

func jwtSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "ucon_jwt_secret_change_in_production"
	}
	return []byte(s)
}

type JWTClaims struct {
	UserID      string  `json:"user_id"`
	Username    string  `json:"username"`
	Role        string  `json:"role"`
	AccountType *string `json:"account_type"`
	jwt.RegisteredClaims
}

func GenerateToken(user *models.User) (string, error) {
	claims := JWTClaims{
		UserID:      user.UserID.String(),
		Username:    user.Username,
		Role:        user.Role,
		AccountType: user.AccountType,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret())
}

func ValidateToken(tokenStr string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret(), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}
	claims, ok := token.Claims.(*JWTClaims)
	if !ok {
		return nil, errors.New("invalid claims")
	}
	return claims, nil
}
