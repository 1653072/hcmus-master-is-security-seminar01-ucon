package main

import (
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/handlers"
	"github.com/ucon-movie/backend/internal/middleware"
)

func main() {
	if err := database.Connect(); err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	log.Println("Connected to database")

	r := gin.Default()

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-2FA-Code"},
		AllowCredentials: true,
	}))

	api := r.Group("/api")

	// Public routes
	api.POST("/auth/register", handlers.Register)
	api.POST("/auth/login", handlers.Login)

	// Protected routes
	auth := api.Group("/", middleware.JWTAuth())
	{
		auth.GET("/auth/me", handlers.GetMe)

		// Movies (all users)
		auth.GET("/movies", handlers.ListMovies)
		auth.GET("/movies/:id", handlers.GetMovie)

		// Geo location
		auth.POST("/users/location", handlers.SaveUserLocation)

		// Rentals (basic_user)
		auth.POST("/rentals", handlers.RentMovie)
		auth.GET("/rentals", handlers.ListRentals)
		auth.POST("/rentals/:id/play", handlers.PlayRental)

		// Ads
		auth.POST("/ads/complete", handlers.CompleteAd)
		auth.GET("/ads/:ad_id/stream", handlers.StreamAd)

		// Sessions
		auth.POST("/sessions/:id/stop", handlers.StopSession)
		auth.GET("/sessions/:id/events", handlers.SessionSSE)

		// Video streaming
		auth.GET("/stream/:session_id", handlers.StreamVideo)

		// Subscriptions
		auth.POST("/subscriptions", handlers.Subscribe)
		auth.GET("/subscriptions/me", handlers.GetMySubscription)
		auth.POST("/subscriptions/play/:movie_id", handlers.PlaySubscription)

		// Offline downloads (premium_user)
		auth.GET("/offline", handlers.ListOfflineDownloads)
		auth.POST("/offline/download/:movie_id", handlers.DownloadMovie)
		auth.DELETE("/offline/:download_id", handlers.DeleteDownload)

		// Watch history
		auth.GET("/history", handlers.ListHistory)

		// Admin routes
		admin := auth.Group("/admin", middleware.RequireRole("admin"))
		{
			admin.GET("/movies", handlers.AdminListMovies)
			admin.POST("/movies", handlers.AdminCreateMovie)
			admin.PUT("/movies/:id", handlers.AdminUpdateMovie)
			admin.DELETE("/movies/:id", handlers.AdminDeleteMovie)
			admin.GET("/audit-log", handlers.AdminGetAuditLog)
			admin.GET("/users", handlers.AdminListUsers)
			admin.PUT("/users/:id/block", handlers.AdminBlockUser)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server starting on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
