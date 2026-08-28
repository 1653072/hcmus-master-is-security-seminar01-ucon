package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/ucon-movie/backend/internal/auth"
)

const (
	ClaimsKey = "claims"
)

func JWTAuth() gin.HandlerFunc {
    return func(c *gin.Context) {
        tokenStr := ""

        authHeader := c.GetHeader("Authorization")
        if authHeader != "" {
            parts := strings.SplitN(authHeader, " ", 2)
            if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
                tokenStr = parts[1]
            } else {
                c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header format"})
                c.Abort()
                return
            }
        } else if t := c.Query("token"); t != "" {
            // Fallback for SSE (EventSource does not support custom headers)
            tokenStr = t
        } else {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization"})
            c.Abort()
            return
        }

        claims, err := auth.ValidateToken(tokenStr)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			c.Abort()
			return
		}
		c.Set(ClaimsKey, claims)
		c.Next()
	}
}

func RequireRole(role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := GetClaims(c)
		if claims == nil || claims.Role != role {
			c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func RequireAccountType(accountType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := GetClaims(c)
		if claims == nil || claims.AccountType == nil || *claims.AccountType != accountType {
			c.JSON(http.StatusForbidden, gin.H{"error": "account type not permitted"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func RequireActiveUser() gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := GetClaims(c)
		if claims == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func GetClaims(c *gin.Context) *auth.JWTClaims {
	v, exists := c.Get(ClaimsKey)
	if !exists {
		return nil
	}
	claims, ok := v.(*auth.JWTClaims)
	if !ok {
		return nil
	}
	return claims
}
