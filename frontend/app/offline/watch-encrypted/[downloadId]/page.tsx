'use client'
import { useEffect, useRef, useState } from 'react'
import { api, type User } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { getEncryptedBlob } from '@/lib/offlineStore'
import Navbar from '@/components/Navbar'
import { useRouter, useParams, useSearchParams } from 'next/navigation'

type PlayerStatus = 'checking' | 'denied' | 'missing' | 'decrypting' | 'ready' | 'decrypt_failed'

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// D.5.1 - Offline Player mã hoá. Khác D.5 (app/offline/watch/[downloadId]) ở
// chỗ: file cache trong IndexedDB là CIPHERTEXT (AES-256-GCM), không phải video
// thật. Muốn phát phải xin KEY từ server (chạy lại đúng checkpoint onA0) rồi tự
// giải mã bằng Web Crypto - key KHÔNG BAO GIỜ được lưu, chỉ tồn tại trong RAM
// trong lúc giải mã. Nếu bị thu hồi, ciphertext vẫn còn nguyên nhưng vĩnh viễn
// không giải mã được nữa - kể cả bằng VLC, kể cả offline hoàn toàn.
export default function OfflineWatchEncryptedPage() {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('checking')
  const [denyReason, setDenyReason] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const objectUrlRef = useRef('')

  const router = useRouter()
  const params = useParams()
  const search = useSearchParams()
  const downloadId = params.downloadId as string
  const movieTitle = search.get('title') || 'phim đã tải offline'

  useEffect(() => {
    getCurrentUser().then(setUser)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function run() {
      setStatus('checking')

      // 1) Đọc ciphertext từ IndexedDB trước - có hay không cũng không tiết lộ
      //    gì, vì nó vô dụng nếu không có key.
      const cipherBlob = await getEncryptedBlob(downloadId).catch(() => null)
      if (cancelled) return
      if (!cipherBlob) {
        setStatus('missing')
        return
      }

      // 2) Xin KEY - đây là checkpoint onA0 thật sự, chạy MỌI LẦN, key không
      //    bao giờ được cache.
      let keyRes: { valid: boolean; key?: string; iv?: string; error?: string }
      try {
        keyRes = await api.offline.key(downloadId)
        if (!keyRes.valid || !keyRes.key || !keyRes.iv) throw new Error(keyRes.error || 'key withheld')
      } catch (err: unknown) {
        if (cancelled) return
        const e = err as Record<string, string>
        setDenyReason(e.error || 'Decryption key withheld')
        setStatus('denied')
        return
      }

      // 3) Có key - giải mã bằng Web Crypto (AES-256-GCM), toàn bộ diễn ra
      //    trong RAM của tab này, key bị vứt bỏ ngay sau khi dùng xong.
      setStatus('decrypting')
      try {
        const keyBytes = base64ToBytes(keyRes.key)
        const ivBytes = base64ToBytes(keyRes.iv)
        const cryptoKey = await crypto.subtle.importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['decrypt'])
        const cipherBuf = await cipherBlob.arrayBuffer()
        const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes as BufferSource }, cryptoKey, cipherBuf)
        if (cancelled) return
        const url = URL.createObjectURL(new Blob([plainBuf], { type: 'video/mp4' }))
        objectUrlRef.current = url
        setVideoUrl(url)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('decrypt_failed')
      }
    }
    run()

    return () => {
      cancelled = true
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [downloadId])

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Navbar user={user} />

      {(status === 'checking' || status === 'decrypting') && (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          {status === 'checking' ? 'Đang xin key giải mã (onA0)...' : 'Đang giải mã bằng Web Crypto (AES-256-GCM)...'}
        </div>
      )}

      {status === 'denied' && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-lg">
            <div className="text-6xl mb-4">🔐</div>
            <h2 className="text-2xl font-bold text-red-400 mb-3">Khoá giải mã bị từ chối</h2>
            <p className="text-gray-300 mb-3">
              <strong className="text-purple-400">UCON onA0:</strong> {denyReason}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Ciphertext của &quot;{movieTitle}&quot; vẫn còn NGUYÊN trong IndexedDB — mở DevTools →
              Application → IndexedDB → <code>ucon_offline_store</code> → <code>encrypted_blobs</code> để
              kiểm chứng — nhưng đó chỉ là chuỗi byte vô nghĩa nếu không có key. Server đã ngừng cấp
              lại key. <strong>Không có cách nào khác</strong> để đọc được video này nữa, kể cả bằng
              VLC hay bất kỳ phần mềm nào — đây chính là điểm D.5 (không mã hoá) không làm được.
            </p>
            <button onClick={() => router.push('/offline')}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded font-medium">
              Quay lại Offline Downloads
            </button>
          </div>
        </div>
      )}

      {status === 'missing' && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-lg">
            <div className="text-6xl mb-4">📭</div>
            <h2 className="text-2xl font-bold text-yellow-400 mb-3">Không tìm thấy ciphertext trên máy này</h2>
            <p className="text-gray-400 mb-6 text-sm">
              Trình duyệt này chưa cache bản mã hoá của phim này. Quay lại trang phim và bấm
              &quot;🔒 Save Offline (mã hoá - D5.1)&quot;.
            </p>
            <button onClick={() => router.push('/offline')}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded font-medium">
              Quay lại Offline Downloads
            </button>
          </div>
        </div>
      )}

      {status === 'decrypt_failed' && (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-red-400">
          Giải mã thất bại (key/ciphertext không khớp) - thử tải lại "Save Offline (mã hoá)".
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="flex-1 flex items-center justify-center bg-black">
            <div className="w-full max-w-5xl px-4">
              <video src={videoUrl} className="w-full rounded-lg shadow-2xl" controls autoPlay />
            </div>
          </div>
          <div className="bg-gray-900 border-t border-gray-800 px-6 py-4">
            <div className="max-w-5xl mx-auto text-xs text-gray-500 space-y-1">
              <p>
                <strong className="text-purple-400">D.5.1:</strong> nguồn phát là plaintext vừa giải mã
                trong RAM (AES-256-GCM, key xin mới mỗi lần) — ciphertext gốc trong IndexedDB không hề
                đổi. <strong className="text-purple-400">UCON onA0:</strong> key vừa được server xác
                nhận usage right còn hiệu lực trước khi trang này giải mã được gì cả.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
