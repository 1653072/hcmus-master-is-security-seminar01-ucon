'use client'
import { useEffect, useState } from 'react'
import { api, getToken, type Movie, type User, type RentalWithMovie } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { captureAndSendGeo } from '@/lib/geo'
import { saveOfflineBlob } from '@/lib/offlineStore'
import Navbar from '@/components/Navbar'
import { useRouter, useParams } from 'next/navigation'

export default function MovieDetailPage() {
  const [user, setUser] = useState<User | null>(null)
  const [movie, setMovie] = useState<Movie | null>(null)
  const [rentals, setRentals] = useState<RentalWithMovie[]>([])
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const [renting, setRenting] = useState(false)
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const router = useRouter()
  const params = useParams()
  const movieId = params.id as string

  useEffect(() => {
    async function init() {
      const u = await getCurrentUser()
      if (!u) { router.push('/login'); return }
      setUser(u)
      captureAndSendGeo() // ensure location is up to date for preC0
      const m = await api.movies.get(movieId).catch(() => null)
      setMovie(m)
      if (u.role === 'user' && u.account_type === 'basic') {
        const rs = await api.rentals.list().catch(() => [])
        setRentals(rs.filter(r => r.movie_id === movieId))
      }
      setLoading(false)
    }
    init()
  }, [movieId, router])

  const handleRent = async () => {
    setRenting(true)
    setActionMsg('')
    try {
      await api.rentals.rent(movieId)
      setActionMsg('Rental created! You can now play the movie.')
      const rs = await api.rentals.list()
      setRentals(rs.filter(r => r.movie_id === movieId))
      // Cập nhật cục bộ ngay - lần Rent tiếp theo (phim khác) sẽ không hiện lại
      // popup nữa, khớp đúng logic server (PreB1_CopyrightConsent chỉ hỏi 1 lần).
      setUser(u => u ? { ...u, copyright_consented_at: u.copyright_consented_at ?? new Date().toISOString() } : u)
    } catch (err: unknown) {
      const e = err as Record<string, string>
      setActionMsg(`Error: ${e.error || 'Failed to rent'}`)
    } finally {
      setRenting(false)
    }
  }

  // preB1 (nghĩa vụ đồng ý điều khoản bản quyền) trước đây được server tự ghi
  // nhận NGẦM ngay khi gọi POST /rentals - không có UI nào chặn lại để người
  // dùng THỰC SỰ xác nhận, nên D.1 nhìn không giống "nghĩa vụ" chút nào. Thêm
  // bước chặn ở CLIENT: lần đầu (copyright_consented_at null) bắt buộc tick
  // checkbox trong modal rồi mới gọi API Rent; các lần sau (đã có giá trị) gọi
  // thẳng như cũ. Endpoint backend không đổi gì - vẫn tự ghi timestamp khi được
  // gọi tới, chỉ là giờ chắc chắn có 1 hành động người dùng thật đứng trước nó.
  const handleRentClick = () => {
    if (user?.copyright_consented_at) {
      handleRent()
    } else {
      setConsentChecked(false)
      setShowConsentModal(true)
    }
  }

  const handleConfirmConsent = async () => {
    setShowConsentModal(false)
    await handleRent()
  }

  const handlePlay = async (rentalId: string) => {
    setActionMsg('')
    try {
      const res = await api.rentals.play(rentalId)
      router.push(`/watch/${res.session_id}`)
    } catch (err: unknown) {
      const e = err as Record<string, string | number>
      if (e.ucon === 'preB0' && e.ad_id) {
        router.push(
          `/watch/ad/${rentalId}?ad_id=${e.ad_id}&ad_title=${encodeURIComponent(String(e.ad_title))}&ad_duration=${e.ad_duration_seconds}`
        )
      } else {
        setActionMsg(`Cannot play: ${e.error}`)
      }
    }
  }

  const handleSubscriptionPlay = async () => {
    setActionMsg('')
    try {
      const res = await api.subscriptions.play(movieId)
      router.push(`/watch/${res.session_id}`)
    } catch (err: unknown) {
      const e = err as Record<string, string>
      setActionMsg(`Cannot play: ${e.error}`)
    }
  }

  const handleDownload = async () => {
    setActionMsg('')
    setDownloading(true)
    try {
      const { download } = await api.offline.download(movieId)

      // Tài nguyên THỰC SỰ rời khỏi server tại đây: fetch bytes thật (cần header
      // Authorization nên không thể dùng thẻ <a href> thông thường) và cache vào
      // IndexedDB. Từ giờ, việc phát hay không không còn phụ thuộc server còn
      // giữ file hay không - chỉ phụ thuộc kết quả "xin license" mỗi lần Play.
      const res = await fetch(api.offline.fileUrl(download.download_id), {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error('failed to fetch video bytes')
      const blob = await res.blob()
      await saveOfflineBlob(download.download_id, blob)

      setActionMsg(`Movie saved for offline viewing! (${(blob.size / 1024 / 1024).toFixed(1)} MB cached in this browser's IndexedDB)`)
    } catch (err: unknown) {
      const e = err as Record<string, string>
      setActionMsg(`Download failed: ${e.error || e.message || 'unknown error'}`)
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>
  if (!movie) return <div className="flex items-center justify-center h-screen text-gray-400">Movie not found</div>

  const validRentals = rentals.filter(
    r => r.rental_views_remaining > 0 && new Date(r.rental_expiry) > new Date()
  )

  return (
    <div>
      <Navbar user={user} />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white mb-4 text-sm">
          ← Back
        </button>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-full sm:w-48 aspect-video bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
              <span className="text-6xl">🎬</span>
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold">{movie.title}</h1>
              <p className="text-gray-400 mt-2">{movie.genre} · {movie.duration_minutes} min</p>

              {movie.geo_restriction.length > 0 && (
                <p className="text-yellow-500 text-sm mt-2">
                  Available in: {movie.geo_restriction.join(', ')}
                </p>
              )}
              {!movie.is_available && (
                <p className="text-red-400 mt-2 font-medium">This movie is currently unavailable</p>
              )}

              {actionMsg && (
                <div className={`mt-4 p-3 rounded text-sm ${
                  actionMsg.startsWith('Error') || actionMsg.startsWith('Cannot') || actionMsg.startsWith('Download failed')
                    ? 'bg-red-900/30 text-red-300'
                    : 'bg-green-900/30 text-green-300'
                }`}>
                  {actionMsg}
                </div>
              )}

              <div className="mt-6 space-y-3">
                {user?.account_type === 'basic' && movie.is_available && (
                  <>
                    <button onClick={handleRentClick} disabled={renting}
                      className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-6 py-2 rounded font-medium transition-colors">
                      {renting ? 'Renting...' : 'Rent — ₫45,000 (3 views, 72 hours)'}
                    </button>
                    {validRentals.map(r => (
                      <div key={r.rental_id} className="flex items-center gap-3 flex-wrap">
                        <button onClick={() => handlePlay(r.rental_id)}
                          className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded font-medium">
                          ▶ Play ({r.rental_views_remaining} view{r.rental_views_remaining !== 1 ? 's' : ''} left)
                        </button>
                        <span className="text-xs text-gray-400">
                          Expires {new Date(r.rental_expiry).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </>
                )}

                {user?.account_type === 'premium' && movie.is_available && (
                  <div className="flex gap-3 flex-wrap">
                    <button onClick={handleSubscriptionPlay}
                      className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded font-medium">
                      ▶ Play with Subscription
                    </button>
                    <button onClick={handleDownload} disabled={downloading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded font-medium">
                      {downloading ? 'Downloading...' : '↓ Save Offline'}
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-6 p-3 bg-gray-900 rounded text-xs text-gray-500 space-y-1">
                <p><strong className="text-purple-400">UCON (basic_user play):</strong> preA0 → preC0 → preB0 (ad 15s) → preA1 (decrement views) → onA0 (SSE monitoring) → onA3 (watch_histories)</p>
                <p><strong className="text-purple-400">UCON (premium_user play):</strong> preA0 → preC0 → preA1 (device_count++) → onA0 (SSE) → onA3</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showConsentModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold mb-3">Điều khoản bản quyền nội dung</h2>
            <div className="text-sm text-gray-300 mb-4 space-y-2 max-h-48 overflow-y-auto bg-gray-900 rounded p-3 border border-gray-700">
              <p>
                Phim thuê chỉ dành cho mục đích xem cá nhân trong thời hạn thuê (72 giờ) và giới hạn
                số lượt xem đã mua. Bạn không được sao chép, phát tán, chia sẻ tài khoản, hoặc dùng
                lại nội dung ngoài phạm vi cá nhân dưới bất kỳ hình thức nào.
              </p>
              <p>
                Vi phạm điều khoản có thể dẫn đến khoá tài khoản vĩnh viễn (xem D.7 - Admin block user).
              </p>
            </div>
            <label className="flex items-start gap-2 mb-5 cursor-pointer">
              <input type="checkbox" checked={consentChecked}
                onChange={e => setConsentChecked(e.target.checked)}
                className="mt-1 w-4 h-4" />
              <span className="text-sm text-gray-200">
                Tôi đã đọc và đồng ý với điều khoản bản quyền nội dung ở trên.
              </span>
            </label>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowConsentModal(false)}
                className="px-4 py-2 rounded text-sm text-gray-300 hover:text-white">
                Huỷ
              </button>
              <button onClick={handleConfirmConsent} disabled={!consentChecked || renting}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded text-sm font-medium transition-colors">
                {renting ? 'Đang xử lý...' : 'Đồng ý & Thuê phim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
