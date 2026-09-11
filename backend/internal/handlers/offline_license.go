package handlers

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/middleware"
)

// ── D.5.2 — offline-capable "Trusted Player" license ─────────────────────────
//
// D.5.1 proves usage rights survive a resource leaving the server, but every
// single playback still needs a live round-trip to /key - turn the network off
// entirely (airplane mode) and a still-subscribed user is wrongly denied. Real
// offline DRM (Widevine/FairPlay offline licenses) solves this differently:
// issue a small, cryptographically SIGNED license ONCE while online, embedding
// the conditions UCON cares about (expiry, device), and let the client verify
// + enforce those conditions itself on every later playback attempt - zero
// network required.
//
// This keeps every UCON property D.5.1 has: continuity (the license is
// re-evaluated on every play - checked fresh against the current local clock,
// never cached as a one-time "yes") and mutability (expiry is a condition
// whose truth value changes over time). What changes is WHERE that evaluation
// happens - client-side reference monitor instead of server-side - trading
// "always-current server truth" for "offline capability bounded by the
// license's validity window". That trade-off (delayed revocation, and a local
// clock the client could in principle roll back) is the same one every real
// offline-DRM deployment makes; it is not a UCON limitation. See
// SenarioDemo.md D.5.2 for the full write-up.
//
// Scope note: this demo implements the two conditions that are cheap to do
// correctly and to defend if questioned - expiry (cryptographically bound,
// only the local clock comparison is client-controlled) and device binding
// (self-asserted by the client, illustrative rather than a hard security
// boundary - real device binding needs hardware attestation browsers can't
// provide). usageCount/richer conditions from the reference architecture
// would follow the exact same pattern but are left undone to keep this scoped.

var (
	licenseKeyOnce sync.Once
	licensePrivKey *ecdsa.PrivateKey
)

func licenseSigningKey() *ecdsa.PrivateKey {
	licenseKeyOnce.Do(func() {
		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			panic("failed to generate D.5.2 license signing key: " + err.Error())
		}
		licensePrivKey = key
	})
	return licensePrivKey
}

// GetLicensePublicKey exposes the server's ECDSA P-256 public key - raw SEC1
// uncompressed point format, matching what the client's
// crypto.subtle.importKey('raw', ...) expects. Not sensitive: a public key
// only verifies signatures, it cannot forge new ones.
func GetLicensePublicKey(c *gin.Context) {
	pub := licenseSigningKey().PublicKey
	raw := elliptic.Marshal(elliptic.P256(), pub.X, pub.Y) //nolint:staticcheck // SEC1 uncompressed point is the raw format Web Crypto requires
	c.JSON(http.StatusOK, gin.H{"public_key": base64.StdEncoding.EncodeToString(raw)})
}

type licenseRequest struct {
	DeviceID   string `json:"device_id" binding:"required"`
	TTLSeconds int    `json:"ttl_seconds"`
}

// licenseCanonicalString builds the exact byte string that gets hashed and
// signed. The client reconstructs this SAME string from the license fields it
// receives to verify the signature - the format must stay in lockstep with
// the client-side implementation in
// app/offline/watch-license/[downloadId]/page.tsx.
func licenseCanonicalString(downloadID, movieKeyB64, movieIVB64, deviceID string, expiresAt int64) string {
	return fmt.Sprintf("%s|%s|%s|%s|%d", downloadID, movieKeyB64, movieIVB64, deviceID, expiresAt)
}

// IssueOfflineLicense mints a signed, time-bounded license for offline
// playback (D.5.2). Requires the SAME onA0-gated state D.5/D.5.1 require at
// issuance time (status must be active) - what differs is everything AFTER
// issuance: no further server contact is needed, or possible, until this
// license's validity window ends.
func IssueOfflineLicense(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	downloadID, err := uuid.Parse(c.Param("download_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid download id"})
		return
	}

	var req licenseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id required"})
		return
	}
	ttl := req.TTLSeconds
	if ttl <= 0 || ttl > 3600 {
		ttl = 30 // demo-friendly default: short enough to watch it expire live in class
	}

	var status string
	err = database.Pool.QueryRow(context.Background(),
		`SELECT status FROM offline_downloads WHERE download_id = $1 AND user_id = $2`,
		downloadID, userID,
	).Scan(&status)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "download not found"})
		return
	}
	if status != "active" {
		c.JSON(http.StatusForbidden, gin.H{"error": "usage right not active (status=" + status + ")", "ucon": "onA0"})
		return
	}

	// Same derived key/nonce as D.5.1's /encrypted endpoint - a D.5.2 license
	// can decrypt ciphertext already cached from D.5.1 for the same
	// download_id, no separate re-download needed.
	movieKeyB64 := base64.StdEncoding.EncodeToString(deriveOfflineKey(downloadID.String()))
	movieIVB64 := base64.StdEncoding.EncodeToString(deriveOfflineNonce(downloadID.String()))
	expiresAt := time.Now().Add(time.Duration(ttl) * time.Second).Unix()

	msg := licenseCanonicalString(downloadID.String(), movieKeyB64, movieIVB64, req.DeviceID, expiresAt)
	hash := sha256.Sum256([]byte(msg))

	r, s, err := ecdsa.Sign(rand.Reader, licenseSigningKey(), hash[:])
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sign license"})
		return
	}
	// Raw r||s, 32 bytes each (P-256 order size) - the signature format
	// Web Crypto's crypto.subtle.verify() expects for ECDSA, NOT ASN.1 DER.
	sig := make([]byte, 64)
	r.FillBytes(sig[0:32])
	s.FillBytes(sig[32:64])

	c.JSON(http.StatusOK, gin.H{
		"license": gin.H{
			"download_id": downloadID.String(),
			"movie_key":   movieKeyB64,
			"movie_iv":    movieIVB64,
			"device_id":   req.DeviceID,
			"expires_at":  expiresAt,
			"signature":   base64.StdEncoding.EncodeToString(sig),
		},
		"ucon": []string{"onA0", "preA0"},
	})
}
