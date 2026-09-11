'use client'
import { useEffect, useState } from 'react'
import { api, getToken, setToken, type User, type RentalWithMovie, type Subscription, type OfflineDownloadWithMovie, type AdObligationStatus, type LocationStatus } from '@/lib/api'

const AD_ID = '00000000-0000-0000-0000-000000000201'
const MOVIE_BBB = '00000000-0000-0000-0000-000000000101'

const ACCOUNTS = [
  { username: 'basic_demo', label: 'basic_demo', usedIn: 'D.1 - D.4' },
  { username: 'premium_demo', label: 'premium_demo', usedIn: 'D.5 - D.6' },
  // { username: 'admin_demo', label: 'admin_demo', usedIn: 'Dự phòng (D.7)' },
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

// Ảnh chụp giá trị thuộc tính mutable tại 1 thời điểm - dùng để in "trước → sau"
// trong nhật ký, làm bằng chứng trực quan rằng UCON đổi attribute do hệ quả sử dụng
// (điều mà RBAC/ABAC/MAC không có), xem DiemHayUCON.md.
type AttrSnapshot = Record<string, string | number>
type LogEntry = {
  time: string; label: string; models: string[]; ok: boolean; body: string
  entity?: string; attrsBefore?: AttrSnapshot; attrsAfter?: AttrSnapshot
}

const fmtTime = (iso: string) => new Date(iso).toLocaleString('vi-VN')

const rentalAttrs = (r?: RentalWithMovie | { rental_views_remaining: number; rental_expiry: string } | null): AttrSnapshot =>
  r ? { 'rental_views_remaining': r.rental_views_remaining, 'rental_expiry': fmtTime(r.rental_expiry) } : { '(rental)': 'không tìm thấy' }

// D.1 - Rent xảy ra ở tab app thật (không có nút tương ứng trong panel), nên
// đây KHÔNG phải before/after của 1 mutation do panel gây ra - đây là "trước"
// = trạng thái panel biết TRƯỚC KHI bạn bấm Rent bên tab kia (do 2 tab không tự
// đồng bộ React state), "sau" = đọc lại thật từ server SAU KHI bấm nút này.
// preA0 cố tình KHÔNG có cột nào ở đây - nó là kiểm tra bất biến (account_type,
// movie.is_available), không ghi gì vào DB, khác hẳn preB1/preA1 (mutable).
const d1Attrs = (user: User | null, rental?: RentalWithMovie): AttrSnapshot => ({
  'users.copyright_consented_at (preB1)': user?.copyright_consented_at ? fmtTime(user.copyright_consented_at) : '(chưa đồng ý)',
  'rentals.rental_views_remaining (preA1)': rental ? rental.rental_views_remaining : '(chưa có rental)',
  'rentals.rental_expiry (preA1)': rental ? fmtTime(rental.rental_expiry) : '(chưa có rental)',
})

const subAttrs = (s?: Subscription | null): AttrSnapshot =>
  s ? { 'active_device_count': s.active_device_count, 'subscription_expiry': fmtTime(s.subscription_expiry) } : { '(subscription)': 'không có' }

// D.2 bằng chứng cho preB0 - CỐ TÌNH show cả 2 nửa: total_attempts_all_time
// (chứng minh CompleteAd CÓ ghi DB, kể cả lần GIAN LẬN bị 400) VÀ
// satisfied_within_5min (chính là predicate PreB0_AdObligation dùng để quyết
// định - luôn tính lại từ ads_histories thô, KHÔNG đọc từ 1 thuộc tính đã lưu
// sẵn nào). "0" trong preB0 nghĩa là "không có thuộc tính bền vững nào được
// cập nhật/tham chiếu", không phải "không ghi gì vào DB" - xem ghi chú ở
// handlers/demo.go#DemoAdObligationStatus.
const adAttrs = (s?: AdObligationStatus | null): AttrSnapshot =>
  s ? {
    'ads_histories.total_attempts_all_time': s.total_attempts_all_time,
    'satisfied_within_5min (preB0 predicate)': s.satisfied_within_5min ? 'true' : 'false',
    'ads_histories.latest (giây / completed)': s.latest_watch_duration_seconds == null
      ? '(chưa có lần nào)'
      : `${s.latest_watch_duration_seconds}s / ${s.latest_completed ? 'completed' : 'KHÔNG completed'}`,
  } : { '(ads_histories)': 'chưa có lần nào' }

// D.2 chỉ chứng minh preA1 (giảm lượt) - CỐ TÌNH bỏ rental_expiry ra khỏi diff
// này dù rentalAttrs() có cả 2 cột, vì PlayRental chỉ UPDATE rental_views_remaining
// (xem PreA1_DecrementViews, engine.go) - rental_expiry chỉ đổi ở D.3. Show cả 2
// cột ở đây sẽ khiến rental_expiry luôn "giống hệt nhau trước/sau", trông như lỗi.
const rentalViewsAttrs = (r?: RentalWithMovie | { rental_views_remaining: number } | null): AttrSnapshot =>
  r ? { 'rental_views_remaining': r.rental_views_remaining } : { '(rental)': 'không tìm thấy' }

// D.4 - đọc thẳng cùng 1 giá trị mà GetUserCountryCode/preC0 thật sự dùng
// (bản mới nhất trong user_locations), không phải chỉ 1 cờ hiển thị ở client.
const locationAttrs = (s?: LocationStatus | null): AttrSnapshot =>
  s ? { 'user_locations.country_code': s.country_code ?? '(chưa có - preC0 sẽ coi là XX)' } : { '(user_locations)': 'không tìm thấy' }

// api.offline.list() giờ trả cả 'active' lẫn 'revoked' (để nút Play không biến
// mất ngay khi bị thu hồi - xem ListOfflineDownloads), nên đếm riêng từng trạng
// thái thay vì gộp chung.
const offlineAttrs = (list: OfflineDownloadWithMovie[]): AttrSnapshot => ({
  'offline_downloads (active)': list.filter(d => d.status === 'active').length,
  'offline_downloads (revoked)': list.filter(d => d.status === 'revoked').length,
})

export default function DemoPanelPage() {
  const [user, setUser] = useState<User | null>(null)
  const [rentals, setRentals] = useState<RentalWithMovie[]>([])
  const [selectedRentalId, setSelectedRentalId] = useState('')
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [offlineList, setOfflineList] = useState<OfflineDownloadWithMovie[]>([])
  const [busy, setBusy] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])
  // Mốc "trước" của D.2/D.3 - chụp riêng bằng nút ① để bấm đúng thứ tự khi demo
  // trước lớp, khỏi phải nhớ giá trị cũ nằm ở đâu khi bấm nút "sau" ở cuối.
  const [d2Before, setD2Before] = useState<AttrSnapshot | undefined>(undefined)
  const [d3Before, setD3Before] = useState<AttrSnapshot | undefined>(undefined)
  const [adStatus, setAdStatus] = useState<AdObligationStatus | null>(null)
  const [d6Before, setD6Before] = useState<AttrSnapshot | undefined>(undefined)
  const [d1Before, setD1Before] = useState<AttrSnapshot | undefined>(undefined)
  const [locationStatus, setLocationStatus] = useState<LocationStatus | null>(null)

  const refreshUser = async () => {
    if (!getToken()) { setUser(null); return null }
    try { const u = await api.auth.me(); setUser(u); return u } catch { setUser(null); return null }
  }

  const refreshRentals = async () => {
    if (!getToken()) { setRentals([]); return [] }
    try {
      const rs = await api.rentals.list()
      setRentals(rs)
      // LUÔN nhảy về rental MỚI NHẤT (rs[0], backend đã ORDER BY created_at DESC)
      // mỗi lần làm mới - không chỉ khi rental đang chọn biến mất. Trước đây chỉ
      // tự chọn lại khi ID cũ "biến mất" khỏi danh sách, nên nếu rental cũ (từ
      // buổi tập trước) vẫn còn tồn tại, dropdown cứ dính vào nó mãi dù người
      // dùng vừa Rent phim MỚI và đang phát rental đó trên tab thật - hệ quả là
      // "Ép rental hết hạn" ở D.3 âm thầm sửa nhầm rental KHÔNG đang phát, phim
      // trên tab thật không bao giờ dừng dù bấm nút đúng cách.
      if (rs.length > 0) {
        setSelectedRentalId(rs[0].rental_id)
      }
      return rs
    } catch { setRentals([]); return [] }
  }

  // subscription/offline chỉ tồn tại cho premium_demo - basic_demo sẽ nhận null/[] (bình thường, không phải lỗi)
  const refreshSubscription = async () => {
    if (!getToken()) { setSubscription(null); return null }
    try { const s = await api.subscriptions.get(); setSubscription(s); return s } catch { setSubscription(null); return null }
  }

  const refreshOfflineList = async () => {
    if (!getToken()) { setOfflineList([]); return [] }
    try { const l = await api.offline.list(); setOfflineList(l); return l } catch { setOfflineList([]); return [] }
  }

  const refreshLocationStatus = async () => {
    if (!getToken()) { setLocationStatus(null); return null }
    try { const s = await api.demo.locationStatus(); setLocationStatus(s); return s } catch { setLocationStatus(null); return null }
  }

  useEffect(() => {
    refreshUser().then(() => { refreshRentals(); refreshSubscription(); refreshOfflineList(); refreshLocationStatus() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pushLog = (label: string, models: string[], ok: boolean, body: unknown, entity?: string, attrsBefore?: AttrSnapshot, attrsAfter?: AttrSnapshot) => {
    setLog(l => [{ time: new Date().toLocaleTimeString('vi-VN'), label, models, ok, body: JSON.stringify(body), entity, attrsBefore, attrsAfter }, ...l].slice(0, 20))
  }

  const run = async (label: string, models: string[], fn: () => Promise<unknown>, refetch?: 'user' | 'rentals' | 'subscription' | 'offline' | 'all') => {
    setBusy(label)
    try {
      const res = await fn()
      pushLog(label, models, true, res)
      if (refetch === 'user' || refetch === 'all') await refreshUser()
      if (refetch === 'rentals' || refetch === 'all') await refreshRentals()
      if (refetch === 'subscription' || refetch === 'all') await refreshSubscription()
      if (refetch === 'offline' || refetch === 'all') await refreshOfflineList()
    } catch (err: unknown) {
      pushLog(label, models, false, err)
    } finally {
      setBusy('')
    }
  }

  // Biến thể của run() dành riêng cho các nút MUTATE một thuộc tính (attribute) -
  // chụp giá trị TRƯỚC bằng closure hiện tại, gọi API, rồi chụp giá trị SAU bằng
  // dữ liệu vừa fetch lại (tránh đọc nhầm state cũ do setState là bất đồng bộ).
  const runAttrDiff = async (
    label: string, models: string[], entity: string, fn: () => Promise<unknown>,
    before: () => AttrSnapshot, afterFetch: () => Promise<AttrSnapshot>
  ) => {
    setBusy(label)
    const b = before()
    try {
      const res = await fn()
      const a = await afterFetch()
      pushLog(label, models, true, res, entity, b, a)
    } catch (err: unknown) {
      pushLog(label, models, false, err, entity)
    } finally {
      setBusy('')
    }
  }

  const quickLogin = (username: string) =>
    run(`Đăng nhập ${username}`, [], async () => {
      const res = await api.auth.login({ username, password: 'Password123!' })
      setToken(res.token)
      return res.user
    }, 'all')

  const resetAll = () => {
    if (!window.confirm(
      'Xóa sạch TOÀN BỘ dữ liệu demo (rentals, sessions, watch history, offline, audit log, vị trí) ' +
      'và đưa users/subscriptions/movies về đúng trạng thái seed ban đầu?\n\n' +
      'Dùng khi tập dượt xong 1 lượt và muốn chạy lại từ đầu - không thể hoàn tác.'
    )) return
    run('Reset toàn bộ dữ liệu', [], () => api.demo.resetAll(), 'all')
  }

  const selectedRental = rentals.find(r => r.rental_id === selectedRentalId)

  return (
    <div className="min-h-screen bg-white text-gray-900 text-[15px]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-purple-700">Control Panel</h1>
          <button onClick={resetAll} disabled={!!busy}
            className="px-3 py-2 rounded border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 disabled:opacity-40 text-sm font-medium">
            🔄 Reset toàn bộ dữ liệu về trạng thái sạch
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_560px] gap-6 items-start">
          {/* CỘT TRÁI: điều khiển */}
          <div>
            {/* Panel đăng nhập - sticky để dù cuộn xuống tới D.5/D.6 vẫn thấy và
                bấm đổi tài khoản (premium_demo) được, không cần cuộn ngược lên đầu. */}
            <div className="sticky top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-md p-3">
              <div className="text-sm">
                {user ? (
                  <span>
                    Đang đăng nhập: <strong className="text-gray-900">{user.username}</strong>
                    {' '}<span className="text-gray-500">({user.role}{user.account_type ? `/${user.account_type}` : ''})</span>
                  </span>
                ) : (
                  <span className="text-amber-600 font-medium">Chưa đăng nhập - bấm 1 trong 3 nút bên dưới</span>
                )}
              </div>
              <div className="mt-2 flex gap-2 flex-wrap">
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
            </div>

            {/* D.1 */}
            <Section title="D.1 - Thuê phim"
              purpose={{ models: ['preA0', 'preB1', 'preA1'], text: 'Nghĩa vụ phải hoàn thành TRƯỚC KHI được cấp quyền - preB1 luôn đứng trước preA1, không phải ngược lại.' }}
              steps={[
                // 'Trên tab app thật: đăng nhập basic_demo, bấm Rent phim Big Buck Bunny.',
                // 'Lần đầu thuê, hệ thống tự ghi nhận đồng ý điều khoản bản quyền (preB1) trước khi tạo rental.',
                // 'Quay lại đây, bấm "🔍 Kiểm tra bằng chứng" bên dưới để xem đúng cột nào trong DB vừa đổi.',
              ]}
              expect="Rental được tạo với 3 lượt xem, hạn 72 giờ - sau khi nghĩa vụ preB1 (đồng ý điều khoản + thanh toán) đã hoàn tất.">
              <Btn busy={busy} step={1} label="① Chụp trạng thái TRƯỚC (bấm TRƯỚC khi qua tab thật Rent)" models={['preA0', 'preB1', 'preA1']}
                onClick={async () => {
                  setBusy('Chụp trạng thái TRƯỚC (D.1)')
                  try {
                    const [u, rs] = await Promise.all([refreshUser(), refreshRentals()])
                    const attrs = d1Attrs(u, rs.find(r => r.movie_id === MOVIE_BBB))
                    setD1Before(attrs)
                    pushLog('① Chụp trạng thái TRƯỚC (D.1)', ['preA0', 'preB1', 'preA1'], true, attrs, 'users + rentals', attrs, undefined)
                  } finally { setBusy('') }
                }} />
              <Btn busy={busy} step={2} label="② Kiểm tra bằng chứng SAU (bấm sau khi Rent + đồng ý điều khoản thành công)" models={['preA0', 'preB1', 'preA1']}
                onClick={() => runAttrDiff(
                  '② Kiểm tra bằng chứng D.1 (SAU)', ['preA0', 'preB1', 'preA1'], 'users + rentals',
                  async () => ({ }),
                  () => d1Before ?? d1Attrs(user, rentals.find(r => r.movie_id === MOVIE_BBB)),
                  async () => {
                    const [u, rs] = await Promise.all([refreshUser(), refreshRentals()])
                    return d1Attrs(u, rs.find(r => r.movie_id === MOVIE_BBB))
                  }
                )} />
              {/* <p className="text-xs text-purple-700">
                🧬 preA0 KHÔNG có cột nào ở đây vì nó là kiểm tra bất biến (account_type, movie.is_available) - không ghi gì vào DB, khác hẳn preB1/preA1
                (mutable, để lại dấu vết). Thứ tự: ① (ở đây) → qua tab thật Rent + tick đồng ý điều khoản → ② (ở đây) để thấy diff.
              </p> */}
            </Section>

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
              {/* <p className="text-xs text-purple-700 mt-2">
                🧬 "còn X lượt" và "hết hạn ..." ở trên chính là thuộc tính <strong>mutable</strong> (preA1) - RBAC/ABAC cấp quyền xong là xong,
                còn UCON tự giảm dần giá trị này mỗi lần Play (D.2) rồi tự khóa khi về 0.
              </p> */}
            </div>

            {/* D.2 */}
            <Section title="D.2 - Quảng cáo bắt buộc"
              purpose={{ models: ['preB0', 'preA1'], text: 'RBAC chỉ biết "có quyền hay không" - không có khái niệm "phải LÀM GÌ trước khi dùng quyền". UCON gọi đây là oBligation. preB0 = "0" nghĩa là KHÔNG có thuộc tính bền vững nào được cập nhật/tra cứu lại (server tự tính lại "đã xem đủ chưa" từ log thô mỗi lần) - khác preB1 (D.1), nơi hoàn thành nghĩa vụ ghi thẳng vào 1 thuộc tính dùng lại mãi mãi. Ngay sau khi nghĩa vụ xong, preA1 tự trừ 1 lượt xem TRƯỚC khi phiên phát bắt đầu.' }}
              steps={[
                // 'Ở panel: bấm "① Chụp trạng thái TRƯỚC" để lưu mốc số lượt xem hiện tại.',
                // 'Trên tab app thật: bấm Play - bị chặn, chuyển sang trang quảng cáo.',
                // 'Ở panel: bấm "② GIAN LẬN" - giả lập gọi thẳng vào server, khai đã xem 10 giây (bỏ qua UI và bộ đếm).',
                // 'Ở panel: bấm "🔍 Kiểm tra ads_histories" để lớp thấy: dù bị 400, server VẪN ghi 1 dòng mới (total_attempts tăng).',
                // 'Ở panel: bấm "③ Hoàn thành nghĩa vụ" - khai đủ 15 giây, rồi bấm lại "🔍 Kiểm tra ads_histories" để thấy satisfied_within_5min chuyển sang true.',
                // 'Trên tab app thật: bấm Play lại - phim phát được, và rental_views_remaining trừ 1 NGAY LÚC NÀY (preA1, trong PlayRental handler, trước khi session được tạo).',
                // 'Ở panel: bấm "④ Kiểm tra bằng chứng SAU" để lớp thấy số lượt đổi 3 → 2 trong DB.',
              ]}
              expect='Bước ② bị server từ chối (400) dù không đi qua giao diện nào - chứng minh quyết định nằm ở SERVER, không phải ở đồng hồ đếm trên màn hình. NHƯNG total_attempts_all_time ở ads_histories vẫn tăng - server có ghi log ngay cả khi từ chối, chỉ là không có THUỘC TÍNH nào (kiểu users.copyright_consented_at) được cập nhật để tái sử dụng, đó mới là ý nghĩa thật của "0" trong preB0. Bước "Hoàn thành nghĩa vụ" mới được chấp nhận (200). Nút ④ cho thấy rental_views_remaining giảm đúng 1 đơn vị so với mốc đã chụp ở nút ①.'>
              <Btn busy={busy} step={1} label="① Chụp trạng thái TRƯỚC (lưu mốc lượt xem hiện tại)" models={['preA1']}
                onClick={async () => {
                  setBusy('Chụp trạng thái TRƯỚC (D.2)')
                  try {
                    const rs = await refreshRentals()
                    const attrs = rentalViewsAttrs(rs.find(r => r.rental_id === selectedRentalId))
                    setD2Before(attrs)
                    pushLog('① Chụp trạng thái TRƯỚC (D.2)', ['preA1'], true, attrs, 'rentals', attrs, undefined)
                  } finally { setBusy('') }
                }}
                disabled={!selectedRentalId} />
              <Btn busy={busy} step={2} label="② GIAN LẬN: khai đã xem 10 giây (kỳ vọng 400)" models={['preB0']}
                onClick={() => run('GIAN LẬN (10s)', ['preB0'], () => api.ads.complete(selectedRentalId, AD_ID, 10))}
                disabled={!selectedRentalId} variant="danger" />
              <Btn busy={busy} label="🔍 Kiểm tra ads_histories (bấm lại được nhiều lần, không đổi gì)" models={['preB0']}
                onClick={() => runAttrDiff(
                  'Kiểm tra bằng chứng ads_histories (D.2)', ['preB0'], 'ads_histories',
                  async () => ({}),
                  () => adAttrs(adStatus),
                  async () => {
                    const s = await api.demo.adObligationStatus(selectedRentalId)
                    setAdStatus(s)
                    return adAttrs(s)
                  }
                )}
                disabled={!selectedRentalId} />
              <Btn busy={busy} step={3} label="③ Hoàn thành nghĩa vụ: xem đủ 15 giây (kỳ vọng 200)" models={['preB0']}
                onClick={() => run('Hoàn thành (15s)', ['preB0'], () => api.ads.complete(selectedRentalId, AD_ID, 15))}
                disabled={!selectedRentalId} />
              <Btn busy={busy} step={4} label="④ Kiểm tra TRƯỚC khi Play thật (kỳ vọng: CHƯA đổi)" models={['preA1']}
                onClick={() => runAttrDiff(
                  '④ Kiểm tra bằng chứng D.2 - trước khi Play thật', ['preA1'], 'rentals',
                  async () => ({}),
                  () => d2Before ?? rentalViewsAttrs(rentals.find(r => r.rental_id === selectedRentalId)),
                  async () => rentalViewsAttrs((await refreshRentals()).find(r => r.rental_id === selectedRentalId))
                )}
                disabled={!selectedRentalId} />
              <Btn busy={busy} step={5} label="⑤ Kiểm tra SAU khi đã bấm Play thật (kỳ vọng: đổi 3 → 2)" models={['preA1']}
                onClick={() => runAttrDiff(
                  '⑤ Kiểm tra bằng chứng D.2 - sau khi Play thật', ['preA1'], 'rentals',
                  async () => ({}),
                  () => d2Before ?? rentalViewsAttrs(rentals.find(r => r.rental_id === selectedRentalId)),
                  async () => rentalViewsAttrs((await refreshRentals()).find(r => r.rental_id === selectedRentalId))
                )}
                disabled={!selectedRentalId} />
              {/* <p className="text-xs text-purple-700">
                🧬 "🔍 Kiểm tra ads_histories" KHÔNG mutate gì cả - nó chỉ đọc lại bảng ads_histories mỗi lần bấm, nên bấm được
                bao nhiêu lần cũng an toàn. Đúng thứ tự đầy đủ: ① → ② → 🔍 → ③ → 🔍 (lại) → (Play thật) → ④.
              </p> */}
            </Section>

            {/* D.3 */}
            <Section title="D.3 - Thu hồi giữa phiên"
              purpose={{ models: ['preA0', 'onA0'], text: 'RBAC kiểm tra quyền MỘT LẦN lúc mở khóa cửa, rồi thôi. UCON đánh giá rental_expiry cả TRƯỚC phiên (preA0, lúc bấm Play) lẫn LIÊN TỤC trong phiên (onA0) - đây gọi là Continuity of Decisions.' }}
              steps={[
                // 'Ở panel: bấm "① Chụp trạng thái TRƯỚC" để lưu mốc rental_expiry hiện tại.',
                // 'Trên tab app thật: giữ nguyên tab đang phát phim, KHÔNG bấm Stop.',
                // 'Ở panel: bấm "② Ép rental hết hạn ngay bây giờ".',
                // 'Đếm to 15 giây trước lớp - phim tự dừng trên tab thật, không ai bấm Stop cả.',
                // 'Ở panel: bấm "③ Kiểm tra bằng chứng SAU" (bấm lại bao nhiêu lần cũng được) để lớp thấy rental_expiry nhảy về quá khứ trong DB.',
              ]}
              expect="Trong vòng 15 giây, phim TỰ DỪNG trên tab app thật - không ai bấm Stop cả. Nút ③ cho thấy rental_expiry đổi từ một mốc trong TƯƠNG LAI (mốc đã chụp ở bước ①) về một mốc trong QUÁ KHỨ - đó chính là thuộc tính mutable khiến onA0 tự thu hồi dù không ai đụng vào phiên đang phát.">
              <Btn busy={busy} step={1} label="① Chụp trạng thái TRƯỚC (rental_expiry hiện tại)" models={['onA0']}
                onClick={async () => {
                  setBusy('Chụp trạng thái TRƯỚC (D.3)')
                  try {
                    const rs = await refreshRentals()
                    const attrs = rentalAttrs(rs.find(r => r.rental_id === selectedRentalId))
                    setD3Before(attrs)
                    pushLog('① Chụp trạng thái TRƯỚC (D.3)', ['onA0'], true, attrs, 'rentals', attrs, undefined)
                  } finally { setBusy('') }
                }}
                disabled={!selectedRentalId} />
              <Btn busy={busy} step={2} label="② Ép rental hết hạn ngay bây giờ" models={['onA0']}
                onClick={() => run('② Ép rental hết hạn', ['onA0'], () => api.demo.expireRental(selectedRentalId))}
                disabled={!selectedRentalId} variant="danger" />
              <Btn busy={busy} step={3} label="③ Kiểm tra bằng chứng SAU (so với mốc ①)" models={['onA0']}
                onClick={() => runAttrDiff(
                  '③ Kiểm tra bằng chứng thu hồi D.3 (SAU)', ['onA0'], 'rentals',
                  async () => ({}),
                  () => d3Before ?? rentalAttrs(rentals.find(r => r.rental_id === selectedRentalId)),
                  async () => rentalAttrs((await refreshRentals()).find(r => r.rental_id === selectedRentalId))
                )}
                disabled={!selectedRentalId} />
              {/* <p className="text-xs text-purple-700">
                🧬 Bấm đúng thứ tự ① → ② → (đợi 15s) → ③ là đủ. Muốn xem lại log bất kỳ lúc nào cũng bấm lại ③ được,
                nó luôn so với đúng mốc đã lưu ở bước ①, không cần ép hết hạn lại từ đầu.
              </p> */}
            </Section>

            {/* D.4 */}
            <Section title="D.4 - Giới hạn vùng địa lý"
              purpose={{ models: ['preC0'], text: 'Cùng 1 người dùng, cùng 1 vai trò, cùng 1 thời điểm - nhưng kết quả khác nhau tùy vị trí. RBAC không có khái niệm "điều kiện môi trường".' }}
              steps={[
                // 'Trên tab app thật: thuê phim Elephant Dream (có giới hạn vùng VN/US/GB).',
                // 'Ở panel: bấm "Xóa vị trí đã lưu".',
                // 'Trên tab app thật: bấm Play - bị chặn.',
                // 'Ở panel: bấm "Chèn lại vị trí VN".',
                // 'Trên tab app thật: bấm Play lại - được phép.',
              ]}
              expect="Cùng một request Play, cùng một tài khoản - nhưng kết quả đảo ngược hoàn toàn chỉ vì 1 điều kiện môi trường (vị trí) thay đổi.">
              <AttrLine busy={!!busy} attrs={locationAttrs(locationStatus)} onRefresh={() => refreshLocationStatus()} />
              <Btn busy={busy} step={1} label="Xóa vị trí đã lưu (Play sẽ bị chặn preC0)" models={['preC0']}
                onClick={() => runAttrDiff(
                  'Xóa vị trí', ['preC0'], 'user_locations',
                  () => api.demo.deleteLocation(),
                  () => locationAttrs(locationStatus),
                  async () => locationAttrs(await refreshLocationStatus())
                )} variant="danger" />
              <Btn busy={busy} step={2} label="Chèn lại vị trí VN (Play sẽ qua preC0)" models={['preC0']}
                onClick={() => runAttrDiff(
                  'Chèn vị trí VN', ['preC0'], 'user_locations',
                  () => api.geo.save(10.7769, 106.7009),
                  () => locationAttrs(locationStatus),
                  async () => locationAttrs(await refreshLocationStatus())
                )} />
            </Section>

            {/* D.5 - chỉ giữ biến thể plaintext (không mã hoá, không license offline).
                D.5.1 (mã hoá AES-GCM) và D.5.2 (license ký ECDSA, offline thật) vẫn còn
                nguyên trong code (movies/[id]/page.tsx, offline/page.tsx, offline/watch-*,
                backend/internal/handlers/offline*.go) - chỉ rút khỏi demo-panel vì cả 2
                đều không đóng được lỗ hổng "analog hole" trong khi lại mở thêm câu hỏi khó
                riêng (D.5.1: "mã hoá để làm gì nếu vẫn quay màn hình được", D.5.2: "sao lại
                tin đồng hồ máy khách"). D.5 (plaintext) là bản SÁT nhất với đúng 1 claim UCON
                đang minh chứng: onA0 vẫn có hiệu lực dù tài nguyên đã rời máy chủ. */}
            <Section title="D.5 - Offline tự thu hồi"
              purpose={{ models: ['onA0'], text: 'Cùng onA0 như D.3, nhưng tài nguyên (file video) đã rời máy chủ, nằm sẵn trong IndexedDB của trình duyệt. RBAC không có cơ chế thu hồi sau khi tài nguyên đã tải về - còn ở đây, mỗi lần Play, Trusted Player vẫn phải hỏi lại server "còn hợp lệ không?" trước khi phát.' }}
              steps={[
                // 'Trên tab app thật: mở 1 phim, bấm "↓ Save Offline" (tải file về IndexedDB).',
                // 'Trên tab app thật: vào /offline, bấm "▶ Play offline" - phát được.',
                // 'Ở panel: bấm "Ép subscription hết hạn" bên dưới.',
                // 'Trên tab app thật: bấm "▶ Play offline" lần nữa - bị chặn dù file vẫn còn nguyên trên máy.',
              ]}
              expect='File offline vẫn còn y nguyên trong IndexedDB, không hề bị xoá - nhưng Play bị từ chối, vì Play không đọc thẳng từ cache mà luôn gọi GET /api/offline/:id/verify trước, và server trả về "revoked". Đây là bằng chứng trực quan cho onA0: quyết định được đánh giá lại tại MỌI điểm truy cập, kể cả sau khi tài nguyên đã rời khỏi vùng kiểm soát vật lý của máy chủ.'>
              <AttrLine busy={!!busy} onRefresh={() => { refreshSubscription(); refreshOfflineList() }}
                attrs={{ ...subAttrs(subscription), ...offlineAttrs(offlineList) }} />
              <Btn busy={busy} step={1} label="Ép subscription hết hạn (kỳ vọng Play offline sau đó bị chặn)" models={['onA0']}
                onClick={() => runAttrDiff(
                  'Ép subscription hết hạn', ['onA0'], 'subscriptions',
                  () => api.demo.expireSubscription(),
                  () => subAttrs(subscription),
                  async () => subAttrs(await refreshSubscription())
                )} variant="danger" />
              <Btn busy={busy} step={2} label="Kiểm tra thư viện Offline (checkpoint onA0, không bắt buộc)" models={['onA0']}
                onClick={() => runAttrDiff(
                  'Mở thư viện Offline (checkpoint onA0)', ['onA0'], 'offline_downloads',
                  () => api.offline.list(),
                  () => offlineAttrs(offlineList),
                  async () => offlineAttrs(await refreshOfflineList())
                )} />
              {/* <p className="text-xs text-amber-700">
                ⚠️ Giới hạn thành thật: nếu lớp hỏi "lấy bytes ra ngoài bằng DevTools (Network → Save response as) TRƯỚC
                khi bị thu hồi thì sao" - VLC vẫn mở được, mãi mãi. Đây là &quot;analog hole&quot; - giới hạn chung của MỌI
                hệ DRM/streaming thật (kể cả Netflix), không riêng gì UCON hay bản demo này: một khi nội dung đã hiển thị
                hợp lệ, việc sao chép bit-cho-bit nằm ngoài phạm vi mà bất kỳ reference monitor nào kiểm soát được.
              </p> */}
            </Section>

            {/* D.6 */}
            <Section title="D.6 - Chặn thiết bị thứ 4"
              purpose={{ models: ['preA1'], text: 'RBAC không đếm được có bao nhiêu phiên đang dùng CÙNG 1 tài khoản - không chống được việc chia sẻ tài khoản cho nhiều người.' }}
              steps={[
                // 'Ở panel: bấm "Reset session + device counter" để dọn sạch trước khi bắt đầu.',
                // 'Trên tab app thật: mở 4 tab, Play cùng 1 phim ở cả 4 tab.',
                // 'Ở panel: bấm ↻ làm mới ở dòng HIỆN TẠI sau mỗi tab để thấy active_device_count tăng dần 0→1→2→3.',
              ]}
              expect='3 tab đầu phát được bình thường (active_device_count tăng 0→1→2→3). Tab thứ 4 bị chặn 403 - dù dùng CÙNG một tài khoản hợp lệ, chỉ vì đã có 3 thiết bị đang hoạt động. "3" KHÔNG phải giá trị lưu trong DB để tra cứu - nó là điều kiện cứng active_device_count < 3 ngay trong câu UPDATE của PreA1_IncrementDeviceCount (engine.go). Bằng chứng duy nhất có thể show là HÀNH VI: bộ đếm leo 0→1→2→3 rồi DỪNG LẠI đúng ở 3 dù tab thứ 4 vẫn cố Play.'>
              <AttrLine busy={!!busy} attrs={subAttrs(subscription)} onRefresh={() => refreshSubscription()} />
              <Btn busy={busy} label="Gia hạn lại subscription (+1 tháng, bấm trước nếu subscription đã hết hạn từ D.5)" models={['preB1', 'preA1']}
                onClick={() => run('Gia hạn subscription', ['preB1', 'preA1'], () => api.subscriptions.subscribe(1), 'subscription')} />
              <Btn busy={busy} step={1} label="Reset session + device counter về 0" models={['preA1']}
                onClick={() => runAttrDiff(
                  'Reset devices', ['preA1'], 'subscriptions',
                  () => api.demo.resetDevices(),
                  () => subAttrs(subscription),
                  async () => {
                    const s = await refreshSubscription()
                    const attrs = subAttrs(s)
                    setD6Before(attrs)
                    return attrs
                  }
                )} />
              <Btn busy={busy} step={2} label="🔍 Kiểm tra bằng chứng active_device_count (bấm lại sau mỗi tab Play)" models={['preA1']}
                onClick={() => runAttrDiff(
                  'Kiểm tra bằng chứng device count (D.6)', ['preA1'], 'subscriptions',
                  async () => ({}),
                  () => d6Before ?? subAttrs(subscription),
                  async () => subAttrs(await refreshSubscription())
                )} />
              {/* <p className="text-xs text-purple-700">
                🧬 Thứ tự: ① Reset (đặt mốc = 0) → mở lần lượt 4 tab, mỗi tab Play xong quay lại đây bấm "🔍 Kiểm tra bằng
                chứng" (bấm lại được nhiều lần) → sẽ thấy 0→1, 1→2, 2→3, rồi tab thứ 4 vẫn báo "3 → 3" (không tăng, vì bị
                chặn 403 trước khi kịp UPDATE).
              </p> */}
            </Section>
          </div>

          {/* CỘT PHẢI: nhật ký, dính khi cuộn */}
          <div className="lg:sticky lg:top-6">
            <h2 className="font-semibold text-gray-900 mb-2">
              Nhật ký tác động DB
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
                  {(entry.attrsBefore || entry.attrsAfter) && (
                    <AttrDiff entity={entry.entity} before={entry.attrsBefore} after={entry.attrsAfter} />
                  )}
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
      className={`flex items-center justify-between gap-3 text-left px-3.5 py-2.5 rounded-lg border-2 shadow-sm font-medium
        transition-all active:scale-[0.98] active:shadow-none
        disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-sm ${
        variant === 'danger'
          ? 'bg-white border-red-400 text-red-700 hover:bg-red-600 hover:border-red-600 hover:text-white hover:shadow-md'
          : 'bg-white border-gray-300 text-gray-800 hover:bg-purple-600 hover:border-purple-600 hover:text-white hover:shadow-md'
      }`}>
      <span>{step && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-700 text-white text-xs font-bold mr-2 align-middle">{step}</span>}{label}</span>
      <span className="flex gap-1 shrink-0">
        {models.map(m => <ModelBadge key={m} model={m} />)}
      </span>
    </button>
  )
}

// In "thuộc tính mutable: trước → sau" ngay dưới 1 dòng nhật ký - bằng chứng
// trực quan rằng UCON tự đổi attribute như hệ quả của việc dùng tài nguyên,
// không phải chỉ trả về true/false như RBAC/ABAC. Xem DiemHayUCON.md.
function AttrDiff({ entity, before, after }: { entity?: string; before?: AttrSnapshot; after?: AttrSnapshot }) {
  const keys = Array.from(new Set([...(before ? Object.keys(before) : []), ...(after ? Object.keys(after) : [])]))
  if (keys.length === 0) return null
  return (
    <div className="mt-1.5 border border-dashed border-purple-300 bg-purple-50 rounded px-2 py-1.5">
      <div className="text-[11px] font-bold text-purple-700 tracking-wide mb-1">
        🧬 TÁC ĐỘNG DB{entity && <> · bảng <code className="bg-purple-100 px-1 rounded">{entity}</code></>}
      </div>
      <table className="w-full text-xs border-collapse table-fixed">
        <thead>
          <tr className="text-purple-600">
            <th className="text-left font-semibold pr-3 py-0.5 w-[46%]">Cột</th>
            <th className="text-left font-semibold pr-3 py-0.5 w-[27%]">Trước</th>
            <th className="text-left font-semibold py-0.5 w-[27%]">Sau</th>
          </tr>
        </thead>
        <tbody>
          {keys.map(k => {
            const b = before?.[k]; const a = after?.[k]
            const changed = before && after && b !== a
            return (
              <tr key={k} className="align-top">
                <td className="text-gray-600 font-mono pr-3 py-0.5 break-words">{k}</td>
                <td className="text-gray-500 pr-3 py-0.5 break-words">{before ? String(b) : '—'}</td>
                <td className={`py-0.5 break-words ${changed ? 'text-purple-800 font-bold' : 'text-gray-500'}`}>{after ? String(a) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Đọc nhanh giá trị attribute HIỆN TẠI ngay trong thân section (không cần đợi
// click nút mới thấy) - dùng cho D.5/D.6 nơi sự kiện thật xảy ra ở tab app khác.
function AttrLine({ attrs, onRefresh, busy }: { attrs: AttrSnapshot; onRefresh: () => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-sm bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5">
      <span className="text-xs font-bold text-gray-500 tracking-wide">🧬 HIỆN TẠI</span>
      {Object.entries(attrs).map(([k, v]) => (
        <span key={k} className="font-mono text-gray-700">{k}=<strong>{String(v)}</strong></span>
      ))}
      <button onClick={onRefresh} disabled={busy} className="ml-auto text-xs text-purple-600 hover:text-purple-800 disabled:opacity-40">
        ↻ làm mới
      </button>
    </div>
  )
}
