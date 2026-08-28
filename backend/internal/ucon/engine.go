package ucon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ucon-movie/backend/internal/models"
)

// ── Authorization (A) — pre, immutable (preA0) ───────────────────────────────

func PreA0_RentalExists(rental *models.Rental) error {
	if rental == nil {
		return errors.New("rental not found")
	}
	return nil
}

func PreA0_RentalExpiry(rental *models.Rental) error {
	if time.Now().After(rental.RentalExpiry) {
		return fmt.Errorf("rental has expired at %s", rental.RentalExpiry.Format(time.RFC3339))
	}
	return nil
}

func PreA0_SubscriptionExpiry(sub *models.Subscription) error {
	if sub == nil {
		return errors.New("no active subscription found")
	}
	if time.Now().After(sub.SubscriptionExpiry) {
		return fmt.Errorf("subscription expired at %s", sub.SubscriptionExpiry.Format(time.RFC3339))
	}
	return nil
}

func PreA0_AccountType(accountType *string, required string) error {
	if accountType == nil || *accountType != required {
		return fmt.Errorf("requires account type '%s'", required)
	}
	return nil
}

func PreA0_RoleCheck(role, required string) error {
	if role != required {
		return fmt.Errorf("requires role '%s'", required)
	}
	return nil
}

func PreA0_OwnershipCheck(subjectUserID, objectUserID uuid.UUID) error {
	if subjectUserID != objectUserID {
		return errors.New("access denied: resource belongs to another user")
	}
	return nil
}

func PreA0_MovieAvailable(movie *models.Movie) error {
	if movie == nil {
		return errors.New("movie not found")
	}
	if !movie.IsAvailable {
		return errors.New("movie is not currently available")
	}
	return nil
}

// ── Condition (C) — pre, environment (preC0) ─────────────────────────────────

// PreC0_GeoRestriction checks user's country against movie's geo_restriction list.
// If geo_restriction is empty, access is unrestricted for all regions.
// userCountryCode: ISO 3166-1 alpha-2 (e.g. "VN", "US")
func PreC0_GeoRestriction(movie *models.Movie, userCountryCode string) error {
	if len(movie.GeoRestriction) == 0 {
		return nil // unrestricted
	}
	for _, code := range movie.GeoRestriction {
		if code == userCountryCode {
			return nil
		}
	}
	return fmt.Errorf("content not available in your region (%s)", userCountryCode)
}

// ReverseGeocode resolves lat/lng to ISO 3166-1 alpha-2 country code using Nominatim.
func ReverseGeocode(lat, lon float64) (string, error) {
	apiURL := fmt.Sprintf(
		"https://nominatim.openstreetmap.org/reverse?lat=%f&lon=%f&format=json",
		lat, lon,
	)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, apiURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "ucon-movie-platform/1.0")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("geocoding request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var result struct {
		Address struct {
			CountryCode string `json:"country_code"`
		} `json:"address"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	code := result.Address.CountryCode
	if code == "" {
		return "XX", nil // unknown
	}
	// Nominatim returns lowercase; convert to uppercase
	if len(code) == 2 {
		upper := ""
		for _, ch := range code {
			if ch >= 'a' && ch <= 'z' {
				upper += string(rune(ch - 32))
			} else {
				upper += string(ch)
			}
		}
		return upper, nil
	}
	return code, nil
}

// GetUserCountryCode fetches the latest recorded country code for a user.
func GetUserCountryCode(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) string {
	var code string
	err := db.QueryRow(ctx,
		`SELECT country_code FROM user_locations WHERE user_id=$1 ORDER BY captured_at DESC LIMIT 1`,
		userID,
	).Scan(&code)
	if err != nil {
		return "XX" // unknown — will fail geo_restriction checks if movie has restrictions
	}
	return code
}

// ── Authorization (A) — pre, mutable (preA1) ─────────────────────────────────

// PreA1_DecrementViews atomically decrements rental_views_remaining by 1.
// Returns error if no views remaining (concurrent-safe via WHERE clause).
func PreA1_DecrementViews(ctx context.Context, db *pgxpool.Pool, rentalID uuid.UUID) error {
	tag, err := db.Exec(ctx,
		`UPDATE rentals SET rental_views_remaining = rental_views_remaining - 1
         WHERE rental_id = $1 AND rental_views_remaining > 0`,
		rentalID,
	)
	if err != nil {
		return fmt.Errorf("failed to decrement views: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("no views remaining for this rental")
	}
	return nil
}

// PreA1_IncrementDeviceCount atomically increments active_device_count.
// Returns error if already at max (3 devices).
func PreA1_IncrementDeviceCount(ctx context.Context, db *pgxpool.Pool, subID uuid.UUID) error {
	tag, err := db.Exec(ctx,
		`UPDATE subscriptions SET active_device_count = active_device_count + 1,
         updated_at = NOW()
         WHERE subscription_id = $1 AND active_device_count < 3`,
		subID,
	)
	if err != nil {
		return fmt.Errorf("failed to increment device count: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("maximum device limit (3) reached for this subscription")
	}
	return nil
}

// PreA1_IncrementOfflineCount atomically increments offline_count on users.
// Returns error if already at limit (5 files).
func PreA1_IncrementOfflineCount(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) error {
	tag, err := db.Exec(ctx,
		`UPDATE users SET offline_count = offline_count + 1, updated_at = NOW()
         WHERE user_id = $1 AND offline_count < 5`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("failed to increment offline count: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("maximum offline storage limit (5 movies) reached")
	}
	return nil
}

// PreA1_CreateRental creates a new rental record with 3 views and 72h expiry.
func PreA1_CreateRental(ctx context.Context, db *pgxpool.Pool, userID, movieID uuid.UUID) (*models.Rental, error) {
	rental := &models.Rental{}
	err := db.QueryRow(ctx,
		`INSERT INTO rentals (user_id, movie_id, rental_views_remaining, rental_expiry)
         VALUES ($1, $2, 3, NOW() + INTERVAL '72 hours')
         RETURNING rental_id, user_id, movie_id, rental_views_remaining, rental_expiry, created_at`,
		userID, movieID,
	).Scan(
		&rental.RentalID, &rental.UserID, &rental.MovieID,
		&rental.RentalViewsRemaining, &rental.RentalExpiry, &rental.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create rental: %w", err)
	}
	return rental, nil
}

// PreA1_UpdateSubscriptionExpiry extends or creates a subscription.
func PreA1_UpdateSubscriptionExpiry(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, months int) (*models.Subscription, error) {
	sub := &models.Subscription{}
	err := db.QueryRow(ctx,
		`INSERT INTO subscriptions (user_id, subscription_expiry)
         VALUES ($1, NOW() + ($2 || ' months')::INTERVAL)
         ON CONFLICT (user_id) DO UPDATE
           SET subscription_expiry = GREATEST(subscriptions.subscription_expiry, NOW()) + ($2 || ' months')::INTERVAL,
               updated_at = NOW()
         RETURNING subscription_id, user_id, subscription_expiry, active_device_count, created_at, updated_at`,
		userID, months,
	).Scan(
		&sub.SubscriptionID, &sub.UserID, &sub.SubscriptionExpiry,
		&sub.ActiveDeviceCount, &sub.CreatedAt, &sub.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update subscription: %w", err)
	}
	return sub, nil
}

// ── Obligation (B) — pre ──────────────────────────────────────────────────────

// PreB0_AdObligation checks if the user has completed watching an ad for this rental
// within the last 5 minutes. Returns the active ad info if obligation is not met.
func PreB0_AdObligation(ctx context.Context, db *pgxpool.Pool, userID, rentalID uuid.UUID) (*models.Ad, error) {
	// Check for a completed ad record in the last 5 minutes
	var count int
	err := db.QueryRow(ctx,
		`SELECT COUNT(*) FROM ads_history
         WHERE user_id = $1 AND rental_id = $2 AND completed = TRUE
         AND created_at > NOW() - INTERVAL '5 minutes'`,
		userID, rentalID,
	).Scan(&count)
	if err != nil {
		return nil, fmt.Errorf("failed to check ad obligation: %w", err)
	}
	if count > 0 {
		return nil, nil // obligation satisfied
	}

	// Fetch the active ad to serve
	ad := &models.Ad{}
	err = db.QueryRow(ctx,
		`SELECT ad_id, title, video_file, duration_seconds, is_active, created_at
         FROM ads WHERE is_active = TRUE ORDER BY created_at LIMIT 1`,
	).Scan(&ad.AdID, &ad.Title, &ad.VideoFile, &ad.DurationSeconds, &ad.IsActive, &ad.CreatedAt)
	if err != nil {
		// No ads configured — skip obligation
		return nil, nil
	}
	return ad, fmt.Errorf("must watch ad before playing (preB0)")
}

// PreB1_CopyrightConsent checks/records first-time copyright consent for a user.
func PreB1_CopyrightConsent(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) error {
	var consentedAt *time.Time
	_ = db.QueryRow(ctx,
		`SELECT copyright_consented_at FROM users WHERE user_id = $1`,
		userID,
	).Scan(&consentedAt)

	if consentedAt != nil {
		return nil // already consented
	}
	// Record consent
	_, err := db.Exec(ctx,
		`UPDATE users SET copyright_consented_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
		userID,
	)
	return err
}

// PreB1_MockPayment always succeeds (mock). Records the transaction for UCON audit.
func PreB1_MockPayment(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID, txType string, targetID uuid.UUID, amountVND int) (*models.PaymentTransaction, error) {
	tx := &models.PaymentTransaction{}
	err := db.QueryRow(ctx,
		`INSERT INTO payment_transactions (user_id, transaction_type, target_id, amount_vnd, status)
         VALUES ($1, $2, $3, $4, 'success')
         RETURNING transaction_id, user_id, transaction_type, target_id, amount_vnd, status, created_at`,
		userID, txType, targetID, amountVND,
	).Scan(
		&tx.TransactionID, &tx.UserID, &tx.TransactionType,
		&tx.TargetID, &tx.AmountVND, &tx.Status, &tx.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to record payment: %w", err)
	}
	return tx, nil
}

// PreB1_TwoFactorAuth validates mock 2FA code. Accepts any non-empty code.
// Production systems would validate TOTP against a user secret.
func PreB1_TwoFactorAuth(code string) error {
	if code == "" {
		return errors.New("2FA code required (header X-2FA-Code: MOCK_2FA_123456)")
	}
	return nil // accept any non-empty code in mock mode
}

// ── Authorization (A) — on, post-update (onA3) ───────────────────────────────

// OnA3_WriteWatchHistory creates a watch_history record from a completed session.
func OnA3_WriteWatchHistory(ctx context.Context, db *pgxpool.Pool, session *models.Session) error {
	watchEnd := time.Now()
	if session.EndedAt != nil {
		watchEnd = *session.EndedAt
	}
	_, err := db.Exec(ctx,
		`INSERT INTO watch_history (user_id, movie_id, watch_start, watch_end, device_info)
         VALUES ($1, $2, $3, $4, $5)`,
		session.UserID, session.MovieID, session.StartedAt, watchEnd, session.DeviceInfo,
	)
	return err
}

// OnA3_DecrementDeviceCount decrements active_device_count for a subscription.
func OnA3_DecrementDeviceCount(ctx context.Context, db *pgxpool.Pool, subID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`UPDATE subscriptions SET active_device_count = GREATEST(0, active_device_count - 1),
         updated_at = NOW() WHERE subscription_id = $1`,
		subID,
	)
	return err
}

// OnA3_DecrementOfflineCount decrements offline_count on the user record.
func OnA3_DecrementOfflineCount(ctx context.Context, db *pgxpool.Pool, userID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`UPDATE users SET offline_count = GREATEST(0, offline_count - 1), updated_at = NOW()
         WHERE user_id = $1`,
		userID,
	)
	return err
}

// OnA3_WriteAuditLog records an admin action.
func OnA3_WriteAuditLog(ctx context.Context, db *pgxpool.Pool, adminID uuid.UUID, action, targetType, targetID, reason string) error {
	_, err := db.Exec(ctx,
		`INSERT INTO audit_log (admin_id, action, target_type, target_id, reason)
         VALUES ($1, $2, $3, $4, $5)`,
		adminID, action, targetType, targetID, reason,
	)
	return err
}

// ── Geo location helpers ──────────────────────────────────────────────────────

// BigDataCloudResponse is the response shape from api-bdc.io reverse-geocode.
// Nominatim (nominatim.openstreetmap.org) is served by Fastly CDN and blocks
// Go's crypto/tls via JA3 fingerprinting; BigDataCloud uses a different CDN
// and is reachable from both the host and Docker containers in this environment.
type BigDataCloudResponse struct {
	CountryCode string `json:"countryCode"`
}

// FetchCountryCode reverse-geocodes lat/lon to an ISO 3166-1 alpha-2 country
// code using the BigDataCloud free reverse-geocode API (no API key required).
func FetchCountryCode(lat, lon float64) (string, error) {
	apiURL := fmt.Sprintf(
		"https://api-bdc.io/data/reverse-geocode-client?latitude=%f&longitude=%f&localityLanguage=en",
		lat, lon,
	)

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, apiURL, nil)
	if err != nil {
		return "XX", fmt.Errorf("failed to build geocode request: %w", err)
	}
	req.Header.Set("User-Agent", "ucon-movie-platform/1.0")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "XX", fmt.Errorf("geocode request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "XX", fmt.Errorf("geocode API returned status %d", resp.StatusCode)
	}

	var r BigDataCloudResponse
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return "XX", fmt.Errorf("failed to decode geocode response: %w", err)
	}

	code := strings.ToUpper(strings.TrimSpace(r.CountryCode))
	if len(code) != 2 {
		return "XX", fmt.Errorf("unexpected country code %q from geocode API", code)
	}
	return code, nil
}
