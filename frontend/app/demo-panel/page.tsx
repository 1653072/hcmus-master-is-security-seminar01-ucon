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
              purpose={{ models: ['preA0', 'preB1', 'preA1'], text: 'Nghĩa vụ phải hoàn thành TRƯỚC KHI được cấp quyền - preB1 luôn đứng trước preA1, không phải ngược lại.' }}
              steps={[
                'Trên tab app thật: đăng nhập basic_demo, bấm Rent phim Big Buck Bunny.',
                'Lần đầu thuê, hệ thống tự ghi nhận đồng ý điều khoản bản quyền (preB1) trước khi tạo rental.',
              ]}
              expect="Rental được tạo với 3 lượt xem, hạn 72 giờ - nhưng chỉ SAU KHI nghĩa vụ preB1 (đồng ý điều khoản + thanh toán) đã hoàn tất." />

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
            <Section title="D.2 - Quảng cáo bắt buộc"
              purpose={{ models: ['preB0'], text: 'RBAC chỉ biết "có quyền hay không" - không có khái niệm "phải LÀM GÌ trước khi dùng quyền". UCON gọi đây là oBligation.' }}
              steps={[
                'Trên tab app thật: bấm Play - bị chặn, chuyển sang trang quảng cáo.',
                'Ở panel: bấm "GIAN LẬN" - giả lập gọi thẳng vào server, khai đã xem 10 giây (bỏ qua UI và bộ đếm).',
                'Ở panel: bấm "Hoàn thành nghĩa vụ" - khai đủ 15 giây.',
              ]}
              expect='Bước 2 bị server từ chối (400) dù không đi qua giao diện nào - chứng minh quyết định nằm ở SERVER, không phải ở đồng hồ đếm trên màn hình. Bước 3 mới được chấp nhận (200).'>
              <Btn busy={busy} step={2} label="GIAN LẬN: khai đã xem 10 giây (kỳ vọng 400)" models={['preB0']}
                onClick={() => run('GIAN LẬN (10s)', ['preB0'], () => api.ads.complete(selectedRentalId, AD_ID, 10))}
                disabled={!selectedRentalId} variant="danger" />
              <Btn busy={busy} step={3} label="Hoàn thành nghĩa vụ: xem đủ 15 giây (kỳ vọng 200)" models={['preB0']}
                onClick={() => run('Hoàn thành (15s)', ['preB0'], () => api.ads.complete(selectedRentalId, AD_ID, 15))}
                disabled={!selectedRentalId} />
            </Section>

            {/* D.3 */}
            <Section title="D.3 - Thu hồi giữa phiên ⭐"
              purpose={{ models: ['onA0'], text: 'RBAC kiểm tra quyền MỘT LẦN lúc mở khóa cửa, rồi thôi. UCON tiếp tục canh gác SUỐT quá trình sử dụng - đây gọi là Continuity of Decisions.' }}
              steps={[
                'Trên tab app thật: giữ nguyên tab đang phát phim, KHÔNG bấm Stop.',
                'Ở panel: bấm "Ép rental hết hạn ngay bây giờ".',
                'Đếm to 15 giây trước lớp.',
              ]}
              expect="Trong vòng 15 giây, phim TỰ DỪNG trên tab app thật - không ai bấm Stop cả. Đây là khoảnh khắc chứng minh hệ thống đang giám sát LIÊN TỤC, không phải chỉ kiểm tra một lần lúc vào.">
              <Btn busy={busy} step={2} label="Ép rental hết hạn ngay bây giờ" models={['onA0']}
                onClick={() => run('Ép rental hết hạn', ['onA0'], () => api.demo.expireRental(selectedRentalId), 'rentals')}
                disabled={!selectedRentalId} variant="danger" />
            </Section>

            {/* D.4 */}
            <Section title="D.4 - Giới hạn vùng địa lý"
              purpose={{ models: ['preC0'], text: 'Cùng 1 người dùng, cùng 1 vai trò, cùng 1 thời điểm - nhưng kết quả khác nhau tùy vị trí. RBAC không có khái niệm "điều kiện môi trường".' }}
              steps={[
                'Trên tab app thật: thuê phim Elephant Dream (có giới hạn vùng VN/US/GB).',
                'Ở panel: bấm "Xóa vị trí đã lưu".',
                'Trên tab app thật: bấm Play - bị chặn.',
                'Ở panel: bấm "Chèn lại vị trí VN".',
                'Trên tab app thật: bấm Play lại - được phép.',
              ]}
              expect="Cùng một request Play, cùng một tài khoản - nhưng kết quả đảo ngược hoàn toàn chỉ vì 1 điều kiện môi trường (vị trí) thay đổi.">
              <Btn busy={busy} step={2} label="Xóa vị trí đã lưu (Play sẽ bị chặn preC0)" models={['preC0']}
                onClick={() => run('Xóa vị trí', ['preC0'], () => api.demo.deleteLocation())} variant="danger" />
              <Btn busy={busy} step={4} label="Chèn lại vị trí VN (Play sẽ qua preC0)" models={['preC0']}
                onClick={() => run('Chèn vị trí VN', ['preC0'], () => api.geo.save(10.7769, 106.7009))} />
            </Section>

            {/* D.5 */}
            <Section title="D.5 - Offline tự thu hồi"
              purpose={{ models: ['onA0'], text: 'Ngay cả khi tài nguyên đã RỜI khỏi máy chủ (tải về máy), UCON vẫn thu hồi được quyền dùng. RBAC cấp quyền tải xong là hết trách nhiệm.' }}
              steps={[
                'Trên tab app thật (premium_demo): Download 1 phim, xem trang Offline thấy 1 file.',
                'Ở panel: bấm "Ép subscription hết hạn".',
                'Trên tab app thật: refresh lại trang Offline.',
              ]}
              expect="File offline biến mất khỏi danh sách dù chưa ai xóa nó thủ công - quyền dùng bị thu hồi từ xa dù dữ liệu vẫn còn nằm trên máy người dùng.">
              <Btn busy={busy} step={2} label="Ép subscription hết hạn" models={['onA0']}
                onClick={() => run('Ép subscription hết hạn', ['onA0'], () => api.demo.expireSubscription())} variant="danger" />
              <Btn busy={busy} label="Gia hạn lại subscription (+1 tháng, dùng khi cần phục hồi trước D.6)" models={['preB1', 'preA1']}
                onClick={() => run('Gia hạn subscription', ['preB1', 'preA1'], () => api.subscriptions.subscribe(1))} />
            </Section>

            {/* D.6 */}
            <Section title="D.6 - Chặn thiết bị thứ 4"
              purpose={{ models: ['preA1'], text: 'RBAC không đếm được có bao nhiêu phiên đang dùng CÙNG 1 tài khoản - không chống được việc chia sẻ tài khoản cho nhiều người.' }}
              steps={[
                'Ở panel: bấm "Reset session + device counter" để dọn sạch trước khi bắt đầu.',
                'Trên tab app thật: mở 4 tab, Play cùng 1 phim ở cả 4 tab.',
              ]}
              expect='3 tab đầu phát được bình thường. Tab thứ 4 bị chặn 403 - dù dùng CÙNG một tài khoản hợp lệ, chỉ vì đã có 3 thiết bị đang hoạt động.'>
              <Btn busy={busy} step={1} label="Reset session + device counter về 0" models={[]}
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

function Section({ title, purpose, steps, expect, children }: {
  title: string
  purpose: { models: string[]; text: string }
  steps: string[]
  expect: string
  children?: React.ReactNode
}) {
  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-100 border-b border-gray-200">
        <h2 className="font-bold text-gray-900">{title}</h2>
      </div>
      <div className="p-4 space-y-3">
        {/* Mục đích - đọc trước, để lớp biết đang chờ xem gì */}
        <div className="border-l-4 border-indigo-400 bg-indigo-50 rounded-r p-3">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-xs font-bold text-indigo-600 tracking-wide">🎯 MỤC ĐÍCH</span>
            {purpose.models.map(m => <ModelBadge key={m} model={m} />)}
          </div>
          <p className="text-indigo-900 font-medium">{purpose.text}</p>
        </div>

        {/* Cách làm - kịch bản đánh số, gộp cả thao tác UI lẫn nút trong panel */}
        <div>
          <span className="text-xs font-bold text-gray-500 tracking-wide">📋 CÁCH LÀM</span>
          <ol className="mt-1.5 space-y-1 text-gray-700 list-decimal list-outside ml-5">
            {steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>

        {/* Nút bấm trong panel */}
        {children && <div className="flex flex-col gap-2 pt-1">{children}</div>}

        {/* Kết quả mong đợi - đọc sau khi bấm, để đối chiếu với thực tế trên tab app thật */}
        <div className="border-l-4 border-green-400 bg-green-50 rounded-r p-3">
          <span className="text-xs font-bold text-green-700 tracking-wide">✅ KẾT QUẢ MONG ĐỢI</span>
          <p className="text-green-900 mt-1">{expect}</p>
        </div>
      </div>
    </div>
  )
}

function Btn({ label, models, onClick, busy, disabled, variant, step }: {
  label: string; models: string[]; onClick: () => void; busy: string; disabled?: boolean; variant?: 'danger'; step?: number
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
      <span>{step && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-700 text-white text-xs font-bold mr-2 align-middle">{step}</span>}{label}</span>
      <span className="flex gap-1 shrink-0">
        {models.map(m => <ModelBadge key={m} model={m} />)}
      </span>
    </button>
  )
}
