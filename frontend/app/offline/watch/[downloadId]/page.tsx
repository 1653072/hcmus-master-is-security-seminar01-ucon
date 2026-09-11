'use client'
import { useEffect, useRef, useState } from 'react'
import { api, type User } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { getOfflineBlob } from '@/lib/offlineStore'
import Navbar from '@/components/Navbar'
import { useRouter, useParams, useSearchParams } from 'next/navigation'

type PlayerStatus = 'checking' | 'denied' | 'missing' | 'ready'

// Offline Player - phát file đã cache trong IndexedDB (rời server thật sự, xem
// handleDownload ở app/movies/[id]/page.tsx). Trước khi phát, LUÔN xin license
// (onA0) bất kể file có sẵn hay không - đây là điểm khác với 1 file .mp4 tải về
// bình thường: quyền phát không gắn liền với việc sở hữu bytes.
export default function OfflineWatchPage() {
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

      // 1) Xin license - checkpoint onA0, chạy MỌI LẦN, không cache kết quả.
      try {
        const res = await api.offline.verify(downloadId)
        if (!res.valid) throw new Error(res.error || 'revoked')
      } catch (err: unknown) {
        if (cancelled) return
        const e = err as Record<string, string>
        setDenyReason(e.error || 'Usage right revoked')
        setStatus('denied')
        return
      }

      // 2) License hợp lệ - giờ mới đọc bytes từ IndexedDB (nếu có trên máy này).
      const blob = await getOfflineBlob(downloadId).catch(() => null)
      if (cancelled) return
      if (!blob) {
        setStatus('missing')
        return
      }
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      setVideoUrl(url)
      setStatus('ready')
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

      {status === 'checking' && (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Đang xin license (onA0)...
        </div>
      )}

      {status === 'denied' && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-lg">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-2xl font-bold text-red-400 mb-3">License bị từ chối</h2>
            <p className="text-gray-300 mb-3">
              <strong className="text-purple-400">UCON onA0:</strong> {denyReason}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              File video của &quot;{movieTitle}&quot; vẫn còn NGUYÊN trong IndexedDB của trình duyệt này
              (mở DevTools → Application → IndexedDB → ucon_offline_store để kiểm chứng) — nhưng
              server từ chối cấp lại quyền phát vì usage right đã bị thu hồi.
              Đây chính là điểm RBAC/ABAC/MAC không làm được: quyền dùng được đánh giá lại
              MỖI LẦN phát, độc lập với việc dữ liệu có còn nằm trên máy hay không.
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
            <h2 className="text-2xl font-bold text-yellow-400 mb-3">Không tìm thấy file cache trên máy này</h2>
            <p className="text-gray-400 mb-6 text-sm">
              License vẫn hợp lệ, nhưng trình duyệt này chưa có bytes trong IndexedDB
              (có thể do tải trên máy/trình duyệt khác, hoặc đã bị xoá site data). Hãy quay lại
              trang phim và bấm &quot;Save Offline&quot; lại.
            </p>
            <button onClick={() => router.push('/offline')}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded font-medium">
              Quay lại Offline Downloads
            </button>
          </div>
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
                <strong className="text-purple-400">Nguồn phát:</strong> blob: URL từ IndexedDB (100% cục bộ,
                không stream qua server) — <strong className="text-purple-400">UCON onA0:</strong> license vừa được
                server xác nhận còn hiệu lực trước khi trang này cho phép tạo blob URL.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
