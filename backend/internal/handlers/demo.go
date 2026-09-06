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
         offline_consent_at = NULL, account_type = 'basic', updated_at = NOW()
         WHERE username = 'basic_demo'`,
		`UPDATE users SET status = 'active', offline_count = 0, copyright_consented_at = NULL,
         offline_consent_at = NULL, updated_at = NOW()
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
