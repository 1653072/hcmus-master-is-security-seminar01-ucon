'use client'
import { useEffect, useState } from 'react'
import { api, getToken, setToken, type User, type RentalWithMovie } from '@/lib/api'

const AD_ID = '00000000-0000-0000-0000-000000000201'
const MOVIE_BBB = '00000000-0000-0000-0000-000000000101'

const ACCOUNTS = [
  { username: 'basic_demo', label: 'basic_demo', usedIn: 'D.1 - D.4' },
  { username: 'premium_demo', label: 'premium_demo', usedIn: 'D.5 - D.6' },
  { username: 'admin_demo', label: 'admin_demo', usedIn: 'Dự phòng (D.7)' },
]

// Màu theo nhóm mô hình UCON - dùng thống nhất trên nút bấm lẫn nhật ký,
// để nhìn màu là nhận ra ngay đang minh chứng thành phần nào.
const MODEL_COLOR: Record<string, string> = {
  preA0: 'bg-blue-100 text-blue-800 border-blue-300',
  preA1: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  preB0: 'bg-amber-100 text-amber-800 border-amber-300',
  preB1: 'bg-orange-100 text-orange-800 border-orange-300',
  preC0: 'bg-teal-100 text-teal-800 border-teal-300',
  onA0: 'bg-red-100 text-red-800 border-red-300',
  onA3: 'bg-pink-100 text-pink-800 border-pink-300',
}

function ModelBadge({ model }: { model: string }) {
  const cls = MODEL_COLOR[model] ?? 'bg-gray-100 text-gray-700 border-gray-300'
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold border ${cls}`}>{model}</span>
}

type LogEntry = { time: string; label: string; models: string[]; ok: boolean; body: string }

export default function DemoPanelPage() {
  const [user, setUser] = useState<User | null>(null)
  const [rentals, setRentals] = useState<RentalWithMovie[]>([])
  const [selectedRentalId, setSelectedRentalId] = useState('')
  const [busy, setBusy] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])

  const refreshUser = async () => {
    if (!getToken()) { setUser(null); return }
    try { setUser(await api.auth.me()) } catch { setUser(null) }
  }

  const refreshRentals = async () => {
    if (!getToken()) { setRentals([]); return }
    try {
      const rs = await api.rentals.list()
      setRentals(rs)
      if (rs.length > 0 && !rs.find(r => r.rental_id === selectedRentalId)) {
        setSelectedRentalId(rs[0].rental_id)
      }
    } catch { setRentals([]) }
  }

  useEffect(() => {
    refreshUser().then(() => refreshRentals())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pushLog = (label: string, models: string[], ok: boolean, body: unknown) => {
    setLog(l => [{ time: new Date().toLocaleTimeString('vi-VN'), label, models, ok, body: JSON.stringify(body) }, ...l].slice(0, 20))
  }

  const run = async (label: string, models: string[], fn: () => Promise<unknown>, refetch?: 'user' | 'rentals' | 'both') => {
    setBusy(label)
    try {
      const res = await fn()
      pushLog(label, models, true, res)
      if (refetch === 'user' || refetch === 'both') await refreshUser()
      if (refetch === 'rentals' || refetch === 'both') await refreshRentals()
    } catch (err: unknown) {
      pushLog(label, models, false, err)
    } finally {
      setBusy('')
    }
  }

  const quickLogin = (username: string) =>
    run(`Đăng nhập ${username}`, [], async () => {
      const res = await api.auth.login({ username, password: 'Password123!' })
      setToken(res.token)
      return res.user
    }, 'both')

  const resetAll = () => {
    if (!window.confirm(
      'Xóa sạch TOÀN BỘ dữ liệu demo (rentals, sessions, watch history, offline, audit log, vị trí) ' +
      'và đưa users/subscriptions/movies về đúng trạng thái seed ban đầu?\n\n' +
      'Dùng khi tập dượt xong 1 lượt và muốn chạy lại từ đầu - không thể hoàn tác.'
    )) return
    run('Reset toàn bộ dữ liệu', [], () => api.demo.resetAll(), 'both')
  }

  const selectedRental = rentals.find(r => r.rental_id === selectedRentalId)

  return (
    <div className="min-h-screen bg-white text-gray-900 text-[15px]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-purple-700">Control Panel</h1>
          <button onClick={resetAll} disabled={!!busy}
            className="px-3 py-2 rounded border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 disabled:opacity-40 text-sm font-medium">
            🔄 Reset toàn bộ dữ liệu về trạng thái sạch
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Dùng nút Reset khi tập dượt xong 1 lượt và muốn chạy lại D.1 → D.6 từ đầu - tương đương
          <code className="mx-1 text-gray-600 bg-gray-100 px-1 rounded">docker compose down -v</code>
          nhưng không cần đợi build lại.
        </p>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
          {/* CỘT TRÁI: điều khiển */}
          <div>
            {/* Current user */}
            <div className="bg-gray-50 border border-gray-200 rounded p-3">
              {user ? (
                <span>
                  Đang đăng nhập: <strong className="text-gray-900">{user.username}</strong>
                  {' '}<span className="text-gray-500">({user.role}{user.account_type ? `/${user.account_type}` : ''})</span>
                </span>
              ) : (
                <span className="text-amber-600 font-medium">Chưa đăng nhập - bấm 1 trong 3 nút bên dưới</span>
              )}
            </div>

            {/* Quick login */}
            <div className="mt-3 flex gap-2 flex-wrap">
              {ACCOUNTS.map(a => (
                <button key={a.username} disabled={!!busy}
                  onClick={() => quickLogin(a.username)}
                  className={`px-3 py-2 rounded border ${
                    user?.username === a.username
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'bg-white border-gray-300 hover:border-purple-400 text-gray-800'
                  } disabled:opacity-50`}>
                  {a.label} <span className={`text-sm ${user?.username === a.username ? 'text-purple-100' : 'text-gray-500'}`}>- {a.usedIn}</span>
                </button>
              ))}
            </div>

            {/* D.1 */}
            <Section title="D.1 - Thuê phim"
              hint="Bấm nút Rent trên tab app thật (không có nút riêng ở đây vì thao tác Rent thuộc luồng UI chính, cần cho lớp thấy)."
              message={{ models: ['preA0', 'preB1', 'preA1'], text: 'Nghĩa vụ phải hoàn thành trước khi được cấp quyền' }} />

            {/* Rental picker */}
            <div className="mt-6 bg-gray-50 border border-gray-200 rounded p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-gray-900">Rental đang thao tác (dùng cho D.2 và D.3)</h2>
                <button onClick={() => refreshRentals()} className="text-sm text-purple-600 hover:text-purple-800">
                  ↻ Làm mới danh sách
                </button>
              </div>
              {rentals.length === 0 ? (
                <p className="text-gray-600">
                  Chưa có rental nào cho user này. Qua tab app thật, đăng nhập {user?.username ?? 'basic_demo'} → Rent Big Buck Bunny → quay lại đây bấm Làm mới.
                </p>
              ) : (
                <select value={selectedRentalId} onChange={e => setSelectedRentalId(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900">
                  {rentals.map(r => (
                    <option key={r.rental_id} value={r.rental_id}>
                      {r.movie_title} - còn {r.rental_views_remaining} lượt - hết hạn {new Date(r.rental_expiry).toLocaleString('vi-VN')} - {r.rental_id.slice(0, 8)}...
                    </option>
                  ))}
                </select>
              )}
              {selectedRental && (
                <p className="text-sm text-gray-500 mt-2">
                  rental_id = <code className="text-gray-700 bg-gray-100 px-1 rounded">{selectedRental.rental_id}</code>
                </p>
              )}
            </div>

            {/* D.2 */}
            <Section title="D.2 - Quảng cáo bắt buộc" hint="Chạy sau khi đã Rent và biểu diễn Play lần 1 trên UI (bị chặn preB0)."
              message={{ models: ['preB0'], text: 'Ví dụ về oBligations - thứ RBAC hoàn toàn không có' }}>
              <Btn busy={busy} label="GIAN LẬN: khai đã xem 10 giây (kỳ vọng 400)" models={['preB0']}
                onClick={() => run('GIAN LẬN (10s)', ['preB0'], () => api.ads.complete(selectedRentalId, AD_ID, 10))}
                disabled={!selectedRentalId} variant="danger" />
              <Btn busy={busy} label="Hoàn thành nghĩa vụ: xem đủ 15 giây (kỳ vọng 200)" models={['preB0']}
                onClick={() => run('Hoàn thành (15s)', ['preB0'], () => api.ads.complete(selectedRentalId, AD_ID, 15))}
                disabled={!selectedRentalId} />
            </Section>

            {/* D.3 */}
            <Section title="D.3 - Thu hồi giữa phiên ⭐" hint="Chạy khi phim (rental được chọn ở trên) đang phát trên tab app thật. Đếm to 15 giây sau khi bấm."
              message={{ models: ['onA0'], text: 'Trực quan cho Continuity of Decisions' }}>
              <Btn busy={busy} label="Ép rental hết hạn ngay bây giờ" models={['onA0']}
                onClick={() => run('Ép rental hết hạn', ['onA0'], () => api.demo.expireRental(selectedRentalId), 'rentals')}
                disabled={!selectedRentalId} variant="danger" />
            </Section>

            {/* D.4 */}
            <Section title="D.4 - Giới hạn vùng địa lý" hint="Thuê Elephant Dream trên UI trước, rồi bấm Play sau mỗi nút dưới để thấy kết quả đổi."
              message={{ models: ['preC0'], text: 'Conditions (C) (Điều kiện môi trường) - không thuộc S cũng không thuộc O' }}>
              <Btn busy={busy} label="Xóa vị trí đã lưu (Play sẽ bị chặn preC0)" models={['preC0']}
                onClick={() => run('Xóa vị trí', ['preC0'], () => api.demo.deleteLocation())} variant="danger" />
              <Btn busy={busy} label="Chèn lại vị trí VN (Play sẽ qua preC0)" models={['preC0']}
                onClick={() => run('Chèn vị trí VN', ['preC0'], () => api.geo.save(10.7769, 106.7009))} />
            </Section>

            {/* D.5 */}
            <Section title="D.5 - Offline tự thu hồi" hint="Dùng khi đang đăng nhập premium_demo, đã Download ở tab app thật. Sau khi ép hết hạn, refresh trang /offline ở tab app để thấy onA0 chạy."
              message={{ models: ['onA0'], text: 'Cùng onA0 nhưng tài nguyên đã rời máy chủ - RBAC không có cơ chế thu hồi sau khi tải về' }}>
              <Btn busy={busy} label="Ép subscription hết hạn" models={['onA0']}
                onClick={() => run('Ép subscription hết hạn', ['onA0'], () => api.demo.expireSubscription())} variant="danger" />
              <Btn busy={busy} label="Gia hạn lại subscription (+1 tháng)" models={['preB1', 'preA1']}
                onClick={() => run('Gia hạn subscription', ['preB1', 'preA1'], () => api.subscriptions.subscribe(1))} />
            </Section>

            {/* D.6 */}
            <Section title="D.6 - Chặn thiết bị thứ 4" hint="Bấm trước khi mở 4 tab Play trên UI, phòng khi còn sót active_device_count từ lần tập trước."
              message={{ models: ['preA1'], text: 'Bộ đếm hai chiều, chống chia sẻ tài khoản - RBAC không theo dõi số phiên đồng thời, không chống được chia sẻ tài khoản' }}>
              <Btn busy={busy} label="Reset session + device counter về 0" models={[]}
                onClick={() => run('Reset devices', [], () => api.demo.resetDevices())} />
              <Btn busy={busy} label="Rent lại Big Buck Bunny (nếu cần 1 rental mới)" models={['preA0', 'preB1', 'preA1']}
                onClick={() => run('Rent Big Buck Bunny', ['preA0', 'preB1', 'preA1'], () => api.rentals.rent(MOVIE_BBB), 'rentals')} />
            </Section>
          </div>

          {/* CỘT PHẢI: nhật ký, dính khi cuộn */}
          <div className="lg:sticky lg:top-6">
            <h2 className="font-semibold text-gray-900 mb-2">
              Nhật ký request
              {busy && <span className="ml-2 text-sm text-amber-600 font-normal">⏳ đang gọi: {busy}...</span>}
            </h2>
            <div className="bg-gray-50 rounded border border-gray-200 p-3 text-sm font-mono max-h-[calc(100vh-8rem)] overflow-y-auto space-y-2">
              {log.length === 0 && <p className="text-gray-400">Chưa có request nào. Bấm 1 nút bên trái để bắt đầu.</p>}
              {log.map((entry, i) => (
                <div key={i} className={`pb-2 ${i < log.length - 1 ? 'border-b border-gray-200' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="text-gray-400">[{entry.time}]</span>
                    <span className={entry.ok ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>{entry.label}</span>
                    {entry.models.map(m => <ModelBadge key={m} model={m} />)}
                  </div>
                  <div className={`break-all ${entry.ok ? 'text-gray-600' : 'text-red-600'}`}>{entry.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, hint, message, children }: {
  title: string; hint: string; message?: { models: string[]; text: string }; children?: React.ReactNode
}) {
  return (
    <div className="mt-6 bg-white border border-gray-200 rounded shadow-sm p-4">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500 mt-1 mb-3">{hint}</p>
      {message && (
        <div className="mb-3 bg-indigo-50 border border-indigo-200 rounded p-3">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-indigo-700 font-semibold text-sm">💡 Thông điệp:</span>
            {message.models.map(m => <ModelBadge key={m} model={m} />)}
          </div>
          <p className="text-sm text-indigo-900">{message.text}</p>
        </div>
      )}
      {children && <div className="flex flex-col gap-2">{children}</div>}
    </div>
  )
}

function Btn({ label, models, onClick, busy, disabled, variant }: {
  label: string; models: string[]; onClick: () => void; busy: string; disabled?: boolean; variant?: 'danger'
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || !!busy}
      className={`flex items-center justify-between gap-3 text-left px-3 py-2 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        variant === 'danger'
          ? 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100'
          : 'bg-gray-50 border-gray-300 text-gray-800 hover:border-purple-400 hover:bg-purple-50'
      }`}>
      <span>{label}</span>
      <span className="flex gap-1 shrink-0">
        {models.map(m => <ModelBadge key={m} model={m} />)}
      </span>
    </button>
  )
}
