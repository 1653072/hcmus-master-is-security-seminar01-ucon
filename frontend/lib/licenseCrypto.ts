// D.5.2 - "Trusted Player" crypto: verify a signed offline license and decrypt
// the cached ciphertext, entirely client-side. Once the public key and a
// license are cached, none of this needs a network connection at all.
import { api, type OfflineLicense } from './api'

const DEVICE_ID_KEY = 'ucon_device_id'
const PUBLIC_KEY_CACHE_KEY = 'ucon_license_public_key'

// Self-asserted, persisted per browser profile - real device binding needs
// hardware attestation a browser can't provide, so this only demonstrates the
// SHAPE of the condition (license scoped to "a" device), not a hard boundary.
export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Fetch the server's public key once and cache it - after this, verifying a
// license needs no network call (a public key only verifies, it can't forge).
export async function getOrFetchPublicKey(): Promise<CryptoKey> {
  let b64 = localStorage.getItem(PUBLIC_KEY_CACHE_KEY)
  if (!b64) {
    const res = await api.offline.licensePublicKey()
    b64 = res.public_key
    localStorage.setItem(PUBLIC_KEY_CACHE_KEY, b64)
  }
  return crypto.subtle.importKey(
    'raw',
    base64ToBytes(b64) as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )
}

// MUST match licenseCanonicalString() in backend/internal/handlers/offline_license.go
function licenseCanonicalString(lic: OfflineLicense): string {
  return `${lic.download_id}|${lic.movie_key}|${lic.movie_iv}|${lic.device_id}|${lic.expires_at}`
}

export type LicenseCheckResult =
  | { ok: true }
  | { ok: false; reason: 'signature' | 'expired' | 'device' }

// The Trusted Player evaluating UCON conditions (expiry, device) with NO
// server contact. Only the underlying DATA is cryptographically protected
// (tamper the fields and the signature stops matching); the COMPARISON
// itself - "is now still before expires_at?" - trusts this device's own
// clock. That's a real, disclosed limitation of any client-side reference
// monitor (see SenarioDemo.md D.5.2), not a flaw specific to this demo.
export async function verifyLicenseLocally(lic: OfflineLicense, publicKey: CryptoKey): Promise<LicenseCheckResult> {
  const msg = new TextEncoder().encode(licenseCanonicalString(lic))
  const sig = base64ToBytes(lic.signature)
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    sig as BufferSource,
    msg as BufferSource
  )
  if (!valid) return { ok: false, reason: 'signature' }

  if (lic.device_id !== getOrCreateDeviceId()) return { ok: false, reason: 'device' }

  if (Date.now() / 1000 > lic.expires_at) return { ok: false, reason: 'expired' }

  return { ok: true }
}

// Decrypt cached ciphertext using the key/nonce embedded IN the (already
// signature-verified) license - same AES-256-GCM scheme as D.5.1, just
// sourced from the offline license instead of a live /key request.
export async function decryptWithLicense(lic: OfflineLicense, cipherBlob: Blob): Promise<Blob> {
  const keyBytes = base64ToBytes(lic.movie_key)
  const ivBytes = base64ToBytes(lic.movie_iv)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['decrypt'])
  const cipherBuf = await cipherBlob.arrayBuffer()
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes as BufferSource }, cryptoKey, cipherBuf)
  return new Blob([plainBuf], { type: 'video/mp4' })
}
