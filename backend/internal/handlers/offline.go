package handlers

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/ucon-movie/backend/internal/database"
	"github.com/ucon-movie/backend/internal/middleware"
	"github.com/ucon-movie/backend/internal/models"
	"github.com/ucon-movie/backend/internal/ucon"
)

func ListOfflineDownloads(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	// onA0: opening the offline library is the checkpoint that revokes any
	// downloads left over from a subscription that has since expired.
	_ = ucon.OnA0_RevokeExpiredOfflineDownloads(context.Background(), database.Pool, userID)

	// Deliberately includes 'revoked' rows (not just 'active'): if this filtered
	// them out, the row - and its Play button - would vanish from under the user
	// the instant onA0 revokes it, making it impossible to demonstrate that a
	// SECOND playback attempt is correctly denied (D.5's whole point). 'deleted'
	// rows stay excluded since those were intentionally removed by the user, not
	// revoked by policy.
	rows, err := database.Pool.Query(context.Background(),
		`SELECT od.download_id, od.user_id, od.movie_id, od.downloaded_at, od.status, od.created_at, od.updated_at,
                m.title, m.genre, m.duration_minutes
         FROM offline_downloads od JOIN movies m ON od.movie_id = m.movie_id
         WHERE od.user_id = $1 AND od.status IN ('active', 'revoked') ORDER BY od.created_at DESC`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch downloads"})
		return
	}
	defer rows.Close()

	type DownloadWithMovie struct {
		models.OfflineDownload
		MovieTitle    string `json:"movie_title"`
		MovieGenre    string `json:"movie_genre"`
		MovieDuration int    `json:"movie_duration_minutes"`
	}
	downloads := make([]DownloadWithMovie, 0)
	for rows.Next() {
		var d DownloadWithMovie
		if err := rows.Scan(&d.DownloadID, &d.UserID, &d.MovieID, &d.DownloadedAt, &d.Status, &d.CreatedAt, &d.UpdatedAt,
			&d.MovieTitle, &d.MovieGenre, &d.MovieDuration); err != nil {
			continue
		}
		downloads = append(downloads, d)
	}
	c.JSON(http.StatusOK, downloads)
}

func DownloadMovie(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	movieID, err := uuid.Parse(c.Param("movie_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid movie id"})
		return
	}

	// preA0: subscription valid
	var sub models.Subscription
	err = database.Pool.QueryRow(context.Background(),
		`SELECT subscription_id, user_id, subscription_expiry, active_device_count, created_at, updated_at
         FROM subscriptions WHERE user_id = $1`, userID,
	).Scan(&sub.SubscriptionID, &sub.UserID, &sub.SubscriptionExpiry,
		&sub.ActiveDeviceCount, &sub.CreatedAt, &sub.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "no active subscription", "ucon": "preA0"})
		return
	}
	if err := ucon.PreA0_SubscriptionExpiry(&sub); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preA0"})
		return
	}

	// preC0: geo restriction
	var movie models.Movie
	_ = database.Pool.QueryRow(context.Background(),
		`SELECT movie_id, title, genre, duration_minutes, geo_restriction, is_available, video_file, created_at, updated_at
         FROM movies WHERE movie_id = $1`, movieID,
	).Scan(&movie.MovieID, &movie.Title, &movie.Genre, &movie.DurationMinutes,
		&movie.GeoRestriction, &movie.IsAvailable, &movie.VideoFile, &movie.CreatedAt, &movie.UpdatedAt)

	countryCode := ucon.GetUserCountryCode(context.Background(), database.Pool, userID)
	if err := ucon.PreC0_GeoRestriction(&movie, countryCode); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preC0"})
		return
	}

	// Check user offline_count < 5
	var offlineCount int
	_ = database.Pool.QueryRow(context.Background(),
		`SELECT offline_count FROM users WHERE user_id = $1`, userID,
	).Scan(&offlineCount)
	if offlineCount >= 5 {
		c.JSON(http.StatusForbidden, gin.H{"error": "maximum offline storage limit (5 movies) reached", "ucon": "preA1"})
		return
	}

	// preB1: must commit to not sharing the downloaded file before it's granted
	if err := ucon.PreB1_OfflineConsent(context.Background(), database.Pool, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record consent"})
		return
	}

	// preA1: increment offline_count (atomic)
	if err := ucon.PreA1_IncrementOfflineCount(context.Background(), database.Pool, userID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "ucon": "preA1"})
		return
	}

	var download models.OfflineDownload
	err = database.Pool.QueryRow(context.Background(),
		`INSERT INTO offline_downloads (user_id, movie_id) VALUES ($1, $2)
         RETURNING download_id, user_id, movie_id, downloaded_at, status, created_at, updated_at`,
		userID, movieID,
	).Scan(&download.DownloadID, &download.UserID, &download.MovieID, &download.DownloadedAt, &download.Status, &download.CreatedAt, &download.UpdatedAt)
	if err != nil {
		_ = ucon.OnA3_DecrementOfflineCount(context.Background(), database.Pool, userID)
		c.JSON(http.StatusConflict, gin.H{"error": "this movie is already stored offline", "ucon": "preA1"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"download": download,
		"ucon":     []string{"preA0", "preC0", "preA1", "preB1"},
	})
}

func DeleteDownload(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	downloadID, err := uuid.Parse(c.Param("download_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid download id"})
		return
	}

	var download models.OfflineDownload
	err = database.Pool.QueryRow(context.Background(),
		`UPDATE offline_downloads SET status = 'deleted', updated_at = NOW()
         WHERE download_id = $1 AND user_id = $2 AND status = 'active'
         RETURNING download_id, user_id, movie_id, downloaded_at, status, created_at, updated_at`,
		downloadID, userID,
	).Scan(&download.DownloadID, &download.UserID, &download.MovieID, &download.DownloadedAt, &download.Status, &download.CreatedAt, &download.UpdatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "active download not found"})
		return
	}

	// onA3: decrement offline_count
	_ = ucon.OnA3_DecrementOfflineCount(context.Background(), database.Pool, userID)

	c.JSON(http.StatusOK, gin.H{"message": "download deleted", "download": download, "ucon": []string{"onA3"}})
}

// ServeOfflineFile streams the raw movie bytes for an ACTIVE offline download so
// the client can cache them locally (e.g. IndexedDB) - this is the one-time step
// where the resource genuinely leaves server custody. Once cached, the client
// never needs this endpoint again; only VerifyOfflineLicense stands between the
// cached bytes and playback from then on.
func ServeOfflineFile(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	downloadID, err := uuid.Parse(c.Param("download_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid download id"})
		return
	}

	var status, videoFile string
	err = database.Pool.QueryRow(context.Background(),
		`SELECT od.status, m.video_file FROM offline_downloads od
         JOIN movies m ON od.movie_id = m.movie_id
         WHERE od.download_id = $1 AND od.user_id = $2`,
		downloadID, userID,
	).Scan(&status, &videoFile)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "download not found"})
		return
	}
	if status != "active" {
		c.JSON(http.StatusForbidden, gin.H{"error": "usage right no longer active (status=" + status + ")", "ucon": "onA0"})
		return
	}

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "./static"
	}
	filePath := filepath.Join(staticDir, "videos", videoFile)

	f, err := os.Open(filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "video file not found"})
		return
	}
	defer f.Close()

	fi, _ := f.Stat()
	http.ServeContent(c.Writer, c.Request, videoFile, fi.ModTime(), f)
}

// VerifyOfflineLicense is the "ask for license" checkpoint an offline player must
// call before decrypting/playing a file it already holds locally. It re-runs the
// same onA0 checkpoint as opening the offline library (revoking downloads whose
// subscription has since expired), then reports whether THIS SPECIFIC download's
// usage right is still active. This is what makes the demo a genuine usage-control
// scenario instead of a one-time authorization: the byte stream may already be
// sitting in the browser's IndexedDB, entirely outside server custody, yet the
// decision to grant playback is still made fresh on every play - and can flip
// from allow to deny between two plays of the exact same cached file.
func VerifyOfflineLicense(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	downloadID, err := uuid.Parse(c.Param("download_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid download id"})
		return
	}

	// onA0: same checkpoint as ListOfflineDownloads - re-evaluated on every
	// license request, not just once when the library page happens to be opened.
	_ = ucon.OnA0_RevokeExpiredOfflineDownloads(context.Background(), database.Pool, userID)

	var status string
	err = database.Pool.QueryRow(context.Background(),
		`SELECT status FROM offline_downloads WHERE download_id = $1 AND user_id = $2`,
		downloadID, userID,
	).Scan(&status)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"valid": false, "error": "download not found", "ucon": "onA0"})
		return
	}
	if status != "active" {
		c.JSON(http.StatusForbidden, gin.H{"valid": false, "error": "usage right revoked (status=" + status + ")", "ucon": "onA0"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"valid": true, "ucon": []string{"onA0"}})
}

// ── D.5.1 — cryptographic enforcement layer on top of D.5's decision layer ───
//
// D.5 proves UCON keeps making the RIGHT decision even after a resource leaves
// the server. What D.5 does NOT prove is that the decision is unbypassable: the
// bytes it hands over are plain, undecrypted video - a technically sophisticated
// user can pull them straight out of IndexedDB (DevTools > Network > "Save
// response as") and play them forever in VLC/ffmpeg/anything, no server involved.
//
// D.5.1 closes that gap the same way real DRM does: the client only ever caches
// CIPHERTEXT, and the decryption key is requested fresh from the server on every
// playback (re-running the exact same onA0 checkpoint as D.5). Revoke the usage
// right and the key stops being issued - the cached ciphertext becomes
// permanently unreadable, even fully offline, even by someone who has the raw
// bytes in hand. This is "usage control enforced by encryption" (the UCON
// literature pairs this with attribute-based encryption for cloud/IoT
// dissemination; here it's simplified to AES-256-GCM for a class demo).

const offlineEncSecretEnv = "OFFLINE_ENC_SECRET"
const offlineEncDefaultSecret = "ucon-demo-insecure-default-secret-change-me"

func offlineEncSecret() string {
	if s := os.Getenv(offlineEncSecretEnv); s != "" {
		return s
	}
	return offlineEncDefaultSecret
}

// deriveOfflineKey/deriveOfflineNonce compute an AES-256 key and GCM nonce
// purely from download_id + a server-side secret - no key ever touches the
// database, so revocation needs no key-storage cleanup, just the existing
// offline_downloads.status flip that D.5 already does.
//
// Reusing the same (key, nonce) pair across every request for a given
// download_id is safe ONLY because the plaintext (that download's movie file)
// never changes - this is deterministic/convergent encryption for a static
// asset, not a general-purpose nonce-reuse pattern. Do not copy this approach
// for content that can change under the same key.
func deriveOfflineKey(downloadID string) []byte {
	h := sha256.Sum256([]byte(offlineEncSecret() + ":key:" + downloadID))
	return h[:]
}

func deriveOfflineNonce(downloadID string) []byte {
	h := sha256.Sum256([]byte(offlineEncSecret() + ":nonce:" + downloadID))
	return h[:12]
}

// ServeOfflineFileEncrypted streams AES-256-GCM ciphertext of the movie for a
// download owned by the caller. Unlike ServeOfflineFile, this does NOT require
// status='active' - caching ciphertext is harmless by itself, since it is
// mathematically unreadable without a key from VerifyOfflineKey.
func ServeOfflineFileEncrypted(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	downloadID, err := uuid.Parse(c.Param("download_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid download id"})
		return
	}

	var videoFile string
	err = database.Pool.QueryRow(context.Background(),
		`SELECT m.video_file FROM offline_downloads od JOIN movies m ON od.movie_id = m.movie_id
         WHERE od.download_id = $1 AND od.user_id = $2`,
		downloadID, userID,
	).Scan(&videoFile)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "download not found"})
		return
	}

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "./static"
	}
	plaintext, err := os.ReadFile(filepath.Join(staticDir, "videos", videoFile))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "video file not found"})
		return
	}

	block, err := aes.NewCipher(deriveOfflineKey(downloadID.String()))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "encryption setup failed"})
		return
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "encryption setup failed"})
		return
	}
	ciphertext := gcm.Seal(nil, deriveOfflineNonce(downloadID.String()), plaintext, nil)

	// c.Data() alone leaves Content-Length unset, so Go falls back to chunked
	// transfer for a body this large (~64MB) - some browsers/proxies abort a
	// long chunked fetch() with a bare "Failed to fetch" for no visible reason.
	// ServeOfflineFile (the plaintext D.5 endpoint) never has this problem
	// because http.ServeContent sets Content-Length from the start; setting it
	// explicitly here gets the encrypted endpoint the same reliability.
	// application/octet-stream reads as "generic binary download" to some
	// antivirus/network-inspection software, which can intercept and stall a
	// ~64MB transfer of it (this endpoint's actual failure mode on at least one
	// real browser, even though curl and headless Chrome both complete it
	// reliably against this same server). video/mp4 is what ServeOfflineFile
	// (D.5's plaintext endpoint, which never has this problem) already uses -
	// the ciphertext bytes underneath are unaffected either way, only this
	// header changes.
	c.Header("Content-Length", strconv.Itoa(len(ciphertext)))
	c.Data(http.StatusOK, "video/mp4", ciphertext)
}

// VerifyOfflineKey is the cryptographic "license" for D.5.1: same onA0
// checkpoint as VerifyOfflineLicense, but instead of a plain valid/denied
// boolean, it hands out (or withholds) the actual AES key + nonce needed to
// decrypt the cached ciphertext. A revoked usage right means the key is never
// issued again - the file the client already has becomes permanently opaque.
func VerifyOfflineKey(c *gin.Context) {
	claims := middleware.GetClaims(c)
	userID, _ := uuid.Parse(claims.UserID)

	downloadID, err := uuid.Parse(c.Param("download_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid download id"})
		return
	}

	// onA0: the exact same checkpoint D.5 uses - here it gates a cryptographic
	// key instead of a yes/no answer, which is what makes the decision
	// unbypassable once bytes have left the server.
	_ = ucon.OnA0_RevokeExpiredOfflineDownloads(context.Background(), database.Pool, userID)

	var status string
	err = database.Pool.QueryRow(context.Background(),
		`SELECT status FROM offline_downloads WHERE download_id = $1 AND user_id = $2`,
		downloadID, userID,
	).Scan(&status)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"valid": false, "error": "download not found", "ucon": "onA0"})
		return
	}
	if status != "active" {
		c.JSON(http.StatusForbidden, gin.H{"valid": false, "error": "decryption key withheld (status=" + status + ")", "ucon": "onA0"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid": true,
		"key":   base64.StdEncoding.EncodeToString(deriveOfflineKey(downloadID.String())),
		"iv":    base64.StdEncoding.EncodeToString(deriveOfflineNonce(downloadID.String())),
		"ucon":  []string{"onA0"},
	})
}
