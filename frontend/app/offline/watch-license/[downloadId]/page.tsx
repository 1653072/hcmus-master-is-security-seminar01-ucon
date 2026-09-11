'use client'
import { useEffect, useRef, useState } from 'react'
import { api, type User, type OfflineLicense } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { getEncryptedBlob, getLicense } from '@/lib/offlineStore'
import { getOrFetchPublicKey, verifyLicenseLocally, decryptWithLicense, type LicenseCheckResult } from '@/lib/licenseCrypto'
import Navbar from '@/components/Navbar'
import { useRouter, useParams, useSearchParams } from 'next/navigation'

type PlayerStatus = 'checking' | 'denied' | 'missing' | 'decrypting' | 'ready' | 'error'

const DENY_TEXT: Record<Exclude<LicenseCheckResult, { ok: true }>['reason'], { title: string; body: string }> = {
  expired: {
    title: 'License đã hết hạn',
    body: 'Đồng hồ của máy này đã qua thời điểm expires_at ghi trong license - kiểm tra HOÀN TOÀN cục bộ, không có request nào gửi lên server. Muốn xem tiếp phải xin license mới (cần có mạng tại thời điểm xin).',
  },
  signature: {
    title: 'Chữ ký license không hợp lệ',
    body: 'Nội dung license (expires_at/device_id/khoá) không khớp với chữ ký ECDSA server đã ký - tức là license đã bị SỬA sau khi cấp (ví dụ ai đó chỉnh tay expires_at trong IndexedDB). Không có server nào ký lại cho bản đã sửa, nên bị từ chối vĩnh viễn dù dữ liệu "trông" còn hạn.',
  },
  device: {
    title: 'License không thuộc thiết bị này',
    body: 'device_id trong license không khớp với thiết bị đang yêu cầu phát.',
  },
}

// D.5.2 - "Trusted Player": xác minh chữ ký + kiểm tra hạn dùng NGAY TRÊN THIẾT
// BỊ, không gọi server ở đây (khác D.5.1 luôn phải gọi /key). Tắt hẳn mạng vẫn
// phát được, miễn license còn hạn - đúng kiến trúc offline DRM thật.
export default function OfflineWatchLicensePage() {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('checking')
  const [denyReason, setDenyReason] = useState<Exclude<LicenseCheckResult, { ok: true }>['reason'] | null>(null)
  const [license, setLicense] = useState<OfflineLicense | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const objectUrlRef = useRef('')

  const router = useRouter()
  const params = useParams()
  const search = useSearchParams()
  const downloadId = params.downloadId as string
  const movieTitle = search.get('title') || 'phim đã tải offline'

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false

    async function run() {
      setStatus('checking')

      // Đọc CẢ ciphertext lẫn license từ IndexedDB - cả 2 đều đã có sẵn trên
      // máy, không đợi mạng.
      const [cipherBlob, lic] = await Promise.all([
        getEncryptedBlob(downloadId).catch(() => null),
        getLicense<OfflineLicense>(downloadId).catch(() => null),
      ])
      if (cancelled) return
      if (!cipherBlob || !lic) {
        setStatus('missing')
        return
      }
      setLicense(lic)

      // Public key: dùng bản đã cache lúc Save Offline. Nếu vì lý do gì đó
      // chưa có (vd bấm thẳng vào link này), bước fetch dưới đây MỚI cần mạng
      // - toàn bộ phần verify/decrypt phía sau thì không.
      let publicKey
      try {
        publicKey = await getOrFetchPublicKey()
      } catch {
        if (!cancelled) setStatus('error')
        return
      }

      // ── Trusted Player tự quyết định, KHÔNG hỏi server ──────────────────
      const check = await verifyLicenseLocally(lic, publicKey)
      if (!check.ok) {
        if (cancelled) return
        setDenyReason(check.reason)
        setStatus('denied')
        return
      }

      setStatus('decrypting')
      try {
        const plainBlob = await decryptWithLicense(lic, cipherBlob)
        if (cancelled) return
        const url = URL.createObjectURL(plainBlob)
        objectUrlRef.current = url
        setVideoUrl(url)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    run()

    return () => {
      cancelled = true
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [downloadId])

  const secondsLeft = license ? Math.max(0, Math.floor(license.expires_at - Date.now() / 1000)) : 0

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Navbar user={user} />

      {(status === 'checking' || status === 'decrypting') && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-center px-4">
          {status === 'checking'
            ? 'Đang xác minh license CỤC BỘ (chữ ký + hạn dùng) - không gọi server...'
            : 'Đang giải mã bằng Web Crypto (AES-256-GCM)...'}
        </div>
      )}

      {status === 'denied' && denyReason && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-lg">
            <div className="text-6xl mb-4">🔐📴</div>
            <h2 className="text-2xl font-bold text-red-400 mb-3">{DENY_TEXT[denyReason].title}</h2>
            <p className="text-gray-300 mb-3">
              <strong className="text-purple-400">UCON (client-side reference monitor):</strong> {DENY_TEXT[denyReason].body}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Quyết định này chạy 100% trên máy bạn, kể cả khi tắt hẳn mạng - phim &quot;{movieTitle}&quot;
              vẫn còn nguyên trong IndexedDB, chỉ là license không cho phép đọc nó nữa.
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
            <h2 className="text-2xl font-bold text-yellow-400 mb-3">Chưa có ciphertext hoặc license trên máy này</h2>
            <p className="text-gray-400 mb-6 text-sm">
              Quay lại trang phim và bấm &quot;🔐📴 Save Offline (license - D5.2)&quot; trước (cần mạng đúng 1 lần
              lúc cấp license).
            </p>
            <button onClick={() => router.push('/offline')}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded font-medium">
              Quay lại Offline Downloads
            </button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-red-400 text-sm max-w-md mx-auto">
          Không lấy được public key (cần mạng ít nhất 1 lần để cache) hoặc giải mã thất bại. Nếu đang test chế độ
          offline hoàn toàn, hãy đảm bảo đã bấm Save Offline (license) trong lúc còn mạng trước.
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
                <strong className="text-purple-400">D.5.2:</strong> license còn hiệu lực khoảng {secondsLeft}s nữa -
                toàn bộ bước xác minh chữ ký + kiểm tra hạn + giải mã vừa chạy KHÔNG có request mạng nào (thử tắt
                wifi và reload trang này trong {secondsLeft}s để kiểm chứng).
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
