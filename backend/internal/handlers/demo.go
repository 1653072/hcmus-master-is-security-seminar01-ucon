package handlers

// Demo-only endpoints that replace the "docker exec ucon_postgres psql ..." steps
// used throughout SenarioDemo.md (force-expire rental/subscription, reset location,
// reset device counters). They exist purely to let a live presenter trigger UCON's
// on-access / continuous-monitoring checks (onA0) from the browser instead of a
// separate terminal. Every action is scoped to the calling user's own JWT identity
// (ownership-checked), so at worst a user can only reset their own demo state.
//
// Gated by DEMO_MODE (default enabled) so these can be disabled outside local demo
// use by setting DEMO_MODE=false.

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/middleware"
)

// DemoExpireRental force-expires one of the caller's own rentals, standing in for
// the "UPDATE rentals SET rental_expiry = NOW() - INTERVAL '1 minute' WHERE ..."
// terminal command used to trigger onA0 in D.3.
func DemoExpireRental(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	var req struct {
		RentalID uuid.UUID `json:"rental_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tag, err := database.Pool.Exec(context.Background(),
		`UPDATE rentals SET rental_expiry = NOW() - INTERVAL '1 minute', updated_at = NOW()
         WHERE rental_id = $1 AND user_id = $2`,
		req.RentalID, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to expire rental"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "rental not found or not owned by you"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "rental_expiry set to the past — onA0 will revoke any active session within 15s"})
}

// DemoExpireSubscription force-expires the caller's own subscription, standing in
// for the SQL used to trigger onA0 in D.5 (offline auto-revoke) and D.3-equivalent
// for premium sessions.
func DemoExpireSubscription(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	tag, err := database.Pool.Exec(context.Background(),
		`UPDATE subscriptions SET subscription_expiry = NOW() - INTERVAL '1 minute', updated_at = NOW()
         WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to expire subscription"})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no subscription found for this user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "subscription_expiry set to the past — onA0 will revoke on next check"})
}

// DemoLocationStatus is a READ-ONLY view of the caller's latest user_locations
// row, so the Demo Panel can show a real before/after diff around D.4's
// "Xóa vị trí" / "Chèn vị trí" buttons instead of only a client-side flag.
// Mirrors GetUserCountryCode's own query (engine.go) - the same value preC0
// actually reads.
func DemoLocationStatus(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	var countryCode *string
	var capturedAt *time.Time
	_ = database.Pool.QueryRow(context.Background(),
		`SELECT country_code, captured_at FROM user_locations
         WHERE user_id = $1 ORDER BY captured_at DESC LIMIT 1`,
		userID,
	).Scan(&countryCode, &capturedAt)

	c.JSON(http.StatusOK, gin.H{
		"country_code": countryCode,
		"captured_at":  capturedAt,
	})
}

// DemoDeleteLocation clears the caller's saved location(s), standing in for the
// "DELETE FROM user_locations WHERE ..." step used to force a preC0 block in D.4.
func DemoDeleteLocation(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	_, err := database.Pool.Exec(context.Background(),
		`DELETE FROM user_locations WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear location"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "location cleared — next preC0 check will see country_code=XX"})
}

// DemoResetDevices closes all of the caller's active sessions and zeroes their
// subscription's active_device_count, standing in for the reset SQL run before D.6
// to clear stray state left over from previous rehearsals.
func DemoResetDevices(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	ctx := context.Background()
	if _, err := database.Pool.Exec(ctx,
		`UPDATE sessions SET is_active = FALSE, ended_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND is_active = TRUE`,
		userID,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to close sessions"})
		return
	}
	if _, err := database.Pool.Exec(ctx,
		`UPDATE subscriptions SET active_device_count = 0, updated_at = NOW() WHERE user_id = $1`,
		userID,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset device count"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "all active sessions closed, active_device_count reset to 0"})
}

// DemoAdObligationStatus is a READ-ONLY debug view into ads_histories, so a
// presenter can prove that D.2's "GIAN LẬN" (cheat) attempt is NOT a no-op:
// CompleteAd (see handlers/ads.go) inserts a row into ads_histories even when
// the obligation is rejected (completed=false). What makes preB0 the "no
// attribute update" obligation model (vs preB1, which sets a durable
// attribute like users.copyright_consented_at once and reuses it forever) is
// that PreB0_AdObligation never consults a persisted attribute — it re-derives
// "is the obligation satisfied right now" from raw ads_histories rows within a
// rolling 5-minute window on every single check. This endpoint exposes that
// same query plus the latest row, so both halves of the distinction (a DB
// write happens, but no reusable attribute exists) are visible in one call.
func DemoAdObligationStatus(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	rentalID, err := uuid.Parse(c.Param("rental_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rental id"})
		return
	}

	ctx := context.Background()

	var totalAttempts int
	if err := database.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM ads_histories WHERE user_id = $1 AND rental_id = $2`,
		userID, rentalID,
	).Scan(&totalAttempts); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to count ads_histories"})
		return
	}

	// Mirrors PreB0_AdObligation's own query exactly (engine.go) - this is the
	// live predicate preB0 evaluates, not a cached/stored attribute.
	var satisfiedWithin5Min bool
	if err := database.Pool.QueryRow(ctx,
		`SELECT COUNT(*) > 0 FROM ads_histories
         WHERE user_id = $1 AND rental_id = $2 AND completed = TRUE
         AND created_at > NOW() - INTERVAL '5 minutes'`,
		userID, rentalID,
	).Scan(&satisfiedWithin5Min); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check obligation window"})
		return
	}

	var latestWatchDuration *int
	var latestCompleted *bool
	var latestCreatedAt *time.Time
	_ = database.Pool.QueryRow(ctx,
		`SELECT watch_duration_seconds, completed, created_at FROM ads_histories
         WHERE user_id = $1 AND rental_id = $2 ORDER BY created_at DESC LIMIT 1`,
		userID, rentalID,
	).Scan(&latestWatchDuration, &latestCompleted, &latestCreatedAt)

	c.JSON(http.StatusOK, gin.H{
		"total_attempts_all_time":        totalAttempts,
		"satisfied_within_5min":          satisfiedWithin5Min,
		"latest_watch_duration_seconds":  latestWatchDuration,
		"latest_completed":               latestCompleted,
		"latest_created_at":              latestCreatedAt,
	})
}

// DemoResetAll wipes every rehearsal side-effect and puts the whole demo dataset
// back to the seed baseline from db/001_init.sql — the browser-triggered equivalent
// of the "docker compose down -v && up -d" reset described in SenarioDemo.md's C.1,
// without the ~1 minute rebuild wait. Unlike the other /api/demo endpoints this is
// NOT scoped to the caller: it resets state for all three demo accounts at once,
// since a presenter rehearsing needs every account back to a known-good state
// together, not just their own.
func DemoResetAll(c *gin.Context) {
	ctx := context.Background()

	statements := []string{
		`TRUNCATE sessions, watch_histories, rentals, ads_histories, offline_downloads,
         payment_transactions, audit_logs, user_locations CASCADE`,
		`UPDATE users SET status = 'active', offline_count = 0, copyright_consented_at = NULL,
         offline_consented_at = NULL, account_type = 'basic', updated_at = NOW()
         WHERE username = 'basic_demo'`,
		`UPDATE users SET status = 'active', offline_count = 0, copyright_consented_at = NULL,
         offline_consented_at = NULL, updated_at = NOW()
         WHERE username <> 'basic_demo'`,
		`UPDATE subscriptions SET active_device_count = 0,
         subscription_expiry = NOW() + INTERVAL '30 days', updated_at = NOW()`,
		`UPDATE movies SET is_available = TRUE, updated_at = NOW()`,
		`DELETE FROM movies WHERE title NOT IN
         ('Big Buck Bunny', 'Elephant Dream', 'Tears of Steel', 'Cosmos Laundromat', 'Sintel')`,
	}

	for _, stmt := range statements {
		if _, err := database.Pool.Exec(ctx, stmt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "reset failed partway through: " + err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Đã reset xong: rentals/sessions/watch_histories/offline/audit_logs/user_locations đã xóa sạch; users/subscriptions/movies đã về đúng trạng thái seed ban đầu",
	})
}
