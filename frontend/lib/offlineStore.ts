// Lưu bytes video thật vào IndexedDB của trình duyệt - đây là bước tài nguyên
// THỰC SỰ rời khỏi server (khác với bản demo cũ chỉ ghi 1 dòng DB). Sau bước
// này, việc có phát được hay không hoàn toàn phụ thuộc vào 1 lệnh gọi "xin
// license" riêng (xem api.offline.verify) - không phụ thuộc file có còn hay
// không, vì file lúc này luôn còn.
const DB_NAME = 'ucon_offline_store'
const STORE_NAME = 'video_blobs'
// D.5.1: ciphertext cache, separate store from the plaintext one above - keeping
// them apart makes it obvious in DevTools which download used which scenario.
const ENCRYPTED_STORE_NAME = 'encrypted_blobs'
// D.5.2: signed offline licenses (small JSON objects, not blobs) - stored
// separately from the ciphertext on purpose, mirroring the reference
// architecture (Movie.enc and License are 2 different artifacts). Shares the
// same encrypted_blobs ciphertext D.5.1 already cached for a given download_id.
const LICENSE_STORE_NAME = 'licenses'
const DB_VERSION = 3

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
      if (!req.result.objectStoreNames.contains(ENCRYPTED_STORE_NAME)) {
        req.result.createObjectStore(ENCRYPTED_STORE_NAME)
      }
      if (!req.result.objectStoreNames.contains(LICENSE_STORE_NAME)) {
        req.result.createObjectStore(LICENSE_STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveOfflineBlob(downloadId: string, blob: Blob): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(blob, downloadId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getOfflineBlob(downloadId: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(downloadId)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteOfflineBlob(downloadId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(downloadId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function hasOfflineBlob(downloadId: string): Promise<boolean> {
  try {
    return (await getOfflineBlob(downloadId)) !== null
  } catch {
    return false
  }
}

// ── D.5.1 — ciphertext cache (AES-256-GCM bytes, useless without a fresh key) ──

export async function saveEncryptedBlob(downloadId: string, blob: Blob): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENCRYPTED_STORE_NAME, 'readwrite')
    tx.objectStore(ENCRYPTED_STORE_NAME).put(blob, downloadId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getEncryptedBlob(downloadId: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENCRYPTED_STORE_NAME, 'readonly')
    const req = tx.objectStore(ENCRYPTED_STORE_NAME).get(downloadId)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function hasEncryptedBlob(downloadId: string): Promise<boolean> {
  try {
    return (await getEncryptedBlob(downloadId)) !== null
  } catch {
    return false
  }
}

// ── D.5.2 — signed offline license (JSON, not a blob) ─────────────────────────
// Stored as a plain object, not a Blob - IndexedDB structured-clones JS objects
// natively, and keeping it human-readable here is deliberate: the whole point
// of D.5.2 is that TAMPERING with these visible fields (e.g. expires_at) is
// harmless, because the signature over them won't match anymore.

export async function saveLicense(downloadId: string, license: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LICENSE_STORE_NAME, 'readwrite')
    tx.objectStore(LICENSE_STORE_NAME).put(license, downloadId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getLicense<T = unknown>(downloadId: string): Promise<T | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LICENSE_STORE_NAME, 'readonly')
    const req = tx.objectStore(LICENSE_STORE_NAME).get(downloadId)
    req.onsuccess = () => resolve((req.result as T) ?? null)
    req.onerror = () => reject(req.error)
  })
}
