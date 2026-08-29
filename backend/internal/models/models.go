package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	UserID               uuid.UUID  `db:"user_id" json:"user_id"`
	Username             string     `db:"username" json:"username"`
	PasswordHash         string     `db:"password_hash" json:"-"`
	FullName             string     `db:"full_name" json:"full_name"`
	Gender               string     `db:"gender" json:"gender"`
	Role                 string     `db:"role" json:"role"`
	AccountType          *string    `db:"account_type" json:"account_type"`
	OfflineCount         int        `db:"offline_count" json:"offline_count"`
	CopyrightConsentedAt *time.Time `db:"copyright_consented_at" json:"copyright_consented_at"`
	OfflineConsentedAt   *time.Time `db:"offline_consent_at" json:"offline_consent_at"`
	Status               string     `db:"status" json:"status"`
	CreatedAt            time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt            time.Time  `db:"updated_at" json:"updated_at"`
}

type Movie struct {
	MovieID         uuid.UUID `db:"movie_id" json:"movie_id"`
	Title           string    `db:"title" json:"title"`
	Genre           string    `db:"genre" json:"genre"`
	DurationMinutes int       `db:"duration_minutes" json:"duration_minutes"`
	GeoRestriction  []string  `db:"geo_restriction" json:"geo_restriction"`
	IsAvailable     bool      `db:"is_available" json:"is_available"`
	VideoFile       string    `db:"video_file" json:"video_file"`
	CreatedAt       time.Time `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time `db:"updated_at" json:"updated_at"`
}

type Rental struct {
	RentalID             uuid.UUID `db:"rental_id" json:"rental_id"`
	UserID               uuid.UUID `db:"user_id" json:"user_id"`
	MovieID              uuid.UUID `db:"movie_id" json:"movie_id"`
	RentalViewsRemaining int       `db:"rental_views_remaining" json:"rental_views_remaining"`
	RentalExpiry         time.Time `db:"rental_expiry" json:"rental_expiry"`
	CreatedAt            time.Time `db:"created_at" json:"created_at"`
}

type Subscription struct {
	SubscriptionID     uuid.UUID `db:"subscription_id" json:"subscription_id"`
	UserID             uuid.UUID `db:"user_id" json:"user_id"`
	SubscriptionExpiry time.Time `db:"subscription_expiry" json:"subscription_expiry"`
	ActiveDeviceCount  int       `db:"active_device_count" json:"active_device_count"`
	CreatedAt          time.Time `db:"created_at" json:"created_at"`
	UpdatedAt          time.Time `db:"updated_at" json:"updated_at"`
}

type Session struct {
	SessionID   uuid.UUID  `db:"session_id" json:"session_id"`
	UserID      uuid.UUID  `db:"user_id" json:"user_id"`
	MovieID     uuid.UUID  `db:"movie_id" json:"movie_id"`
	SessionType string     `db:"session_type" json:"session_type"`
	RentalID    *uuid.UUID `db:"rental_id" json:"rental_id"`
	DeviceInfo  string     `db:"device_info" json:"device_info"`
	StartedAt   time.Time  `db:"started_at" json:"started_at"`
	EndedAt     *time.Time `db:"ended_at" json:"ended_at"`
	IsActive    bool       `db:"is_active" json:"is_active"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updated_at"`
}

type WatchHistory struct {
	HistoryID  uuid.UUID `db:"history_id" json:"history_id"`
	UserID     uuid.UUID `db:"user_id" json:"user_id"`
	MovieID    uuid.UUID `db:"movie_id" json:"movie_id"`
	WatchStart time.Time `db:"watch_start" json:"watch_start"`
	WatchEnd   time.Time `db:"watch_end" json:"watch_end"`
	DeviceInfo string    `db:"device_info" json:"device_info"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
}

type OfflineDownload struct {
	DownloadID   uuid.UUID `db:"download_id" json:"download_id"`
	UserID       uuid.UUID `db:"user_id" json:"user_id"`
	MovieID      uuid.UUID `db:"movie_id" json:"movie_id"`
	DownloadedAt time.Time `db:"downloaded_at" json:"downloaded_at"`
	Status       string    `db:"status" json:"status"`
	CreatedAt    time.Time `db:"created_at" json:"created_at"`
}

type AuditLog struct {
	LogID      uuid.UUID `db:"log_id" json:"log_id"`
	AdminID    uuid.UUID `db:"admin_id" json:"admin_id"`
	Action     string    `db:"action" json:"action"`
	TargetType string    `db:"target_type" json:"target_type"`
	TargetID   string    `db:"target_id" json:"target_id"`
	Reason     string    `db:"reason" json:"reason"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
}

type UserLocation struct {
	LocationID  uuid.UUID `db:"location_id" json:"location_id"`
	UserID      uuid.UUID `db:"user_id" json:"user_id"`
	CountryCode string    `db:"country_code" json:"country_code"`
	Latitude    float64   `db:"latitude" json:"latitude"`
	Longitude   float64   `db:"longitude" json:"longitude"`
	CapturedAt  time.Time `db:"captured_at" json:"captured_at"`
}

type PaymentTransaction struct {
	TransactionID   uuid.UUID `db:"transaction_id" json:"transaction_id"`
	UserID          uuid.UUID `db:"user_id" json:"user_id"`
	TransactionType string    `db:"transaction_type" json:"transaction_type"`
	TargetID        uuid.UUID `db:"target_id" json:"target_id"`
	AmountVND       int       `db:"amount_vnd" json:"amount_vnd"`
	Status          string    `db:"status" json:"status"`
	CreatedAt       time.Time `db:"created_at" json:"created_at"`
}

type Ad struct {
	AdID            uuid.UUID `db:"ad_id" json:"ad_id"`
	Title           string    `db:"title" json:"title"`
	VideoFile       string    `db:"video_file" json:"video_file"`
	DurationSeconds int       `db:"duration_seconds" json:"duration_seconds"`
	IsActive        bool      `db:"is_active" json:"is_active"`
	CreatedAt       time.Time `db:"created_at" json:"created_at"`
}

type AdsHistory struct {
	HistoryID            uuid.UUID  `db:"history_id" json:"history_id"`
	UserID               uuid.UUID  `db:"user_id" json:"user_id"`
	RentalID             uuid.UUID  `db:"rental_id" json:"rental_id"`
	MovieID              uuid.UUID  `db:"movie_id" json:"movie_id"`
	AdID                 uuid.UUID  `db:"ad_id" json:"ad_id"`
	WatchStart           time.Time  `db:"watch_start" json:"watch_start"`
	WatchEnd             *time.Time `db:"watch_end" json:"watch_end"`
	WatchDurationSeconds int        `db:"watch_duration_seconds" json:"watch_duration_seconds"`
	Completed            bool       `db:"completed" json:"completed"`
	CreatedAt            time.Time  `db:"created_at" json:"created_at"`
}

// JWT Claims
type Claims struct {
	UserID      string  `json:"user_id"`
	Username    string  `json:"username"`
	Role        string  `json:"role"`
	AccountType *string `json:"account_type"`
}
