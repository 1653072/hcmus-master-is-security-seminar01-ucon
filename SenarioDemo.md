# Demo

---

## Mục lục

- [Phần A — Kịch bản Demo](#phần-a---kịch-bản-demo-liệt-kê-trước-khi-vào-chi-tiết)
  - [A.1. Danh sách đầy đủ (~23 phút)](#a1-danh-sách-đầy-đủ-bản-dựng-sẵn-của-nhóm-23-phút-nếu-chạy-hết)
  - [A.2. Bản rút gọn 6 kịch bản (~12–14 phút)](#a2-nếu-chỉ-có-1214-phút-cho-phần-demo--chọn-6-kịch-bản-này)
- [Phần B — Giải thích 6 kịch bản chính](#phần-b--giải-thích-thêm-cho-6-kịch-bản-chính-ở-mục-a2)
- [Phần C — Hướng dẫn thao tác](#phần-c--hướng-dẫn-thao-tác-chạy-demo)
  - [C.1. Trước buổi](#c1-trước-buổi-chuẩn-bị-ở-nhà--trước-giờ-lên-lớp)
  - [C.2. Tài khoản demo](#c2-tài-khoản-demo)
  - [C.3. Ngay trước khi trình bày](#c3-ngay-trước-khi-trình-bày-làm-trên-lớp-23-phút)
  - [C.4. Cheat-sheet lệnh](#c4-lệnh-cho-từng-kịch-bản-đã-chọn-phần-d)
  - [C.5. Dọn dữ liệu khi tập dượt](#c5-dọn-dữ-liệu-giữa-các-lần-chạy-thử-không-chạy-trên-lớp-chỉ-khi-tập-dượt-nhiều-lần)
  - [C.6. Dự phòng bằng API](#c6-nếu-giao-diện-lỗi-giữa-chừng-trên-lớp--phương-án-dự-phòng-bằng-api)
  - [C.7. Khôi phục sau demo](#c7-sau-khi-demo-xong--nhớ-khôi-phục-nếu-định-demo-lại-hoặc-nhóm-khác-dùng-chung-máy)
- [Phần D — Chi tiết từng bước (6 kịch bản A.2)](#phần-d--chi-tiết-từng-bước-6-kịch-bản-a2)
  - [D.0. Hằng số & đăng nhập](#d0-hằng-số--đăng-nhập-dùng-chung)
  - [D.1. #1 Thuê phim lẻ](#d1-kịch-bản-1--thuê-phim-lẻ-prea0--preb1--prea1)
  - [D.2. #2 Quảng cáo bắt buộc](#d2-kịch-bản-2--quảng-cáo-bắt-buộc-preb0)
  - [D.3. #6 Thu hồi giữa phiên](#d3-kịch-bản-6--thu-hồi-giữa-phiên-ona0)
  - [D.4. #4 Giới hạn vùng địa lý](#d4-kịch-bản-4--giới-hạn-vùng-địa-lý-prec0)
  - [D.5. #9 Offline tự thu hồi](#d5-kịch-bản-9--offline-tự-thu-hồi-ona0)
  - [D.6. #5 Chặn thiết bị thứ 4](#d6-kịch-bản-5--chặn-thiết-bị-thứ-4-prea1)

---

## Phần A - Kịch bản Demo (liệt kê trước khi vào chi tiết)

Đây là danh sách đã **chạy kiểm chứng thực tế** trên ứng dụng —
Hệ thống hiện thực **7 mô hình cơ sở**: `preA0, preA1, preB0, preB1, preC0, onA0, onA3`.

### A.1. Danh sách đầy đủ (bản dựng sẵn của nhóm, ~23 phút nếu chạy hết)


| #   | Kịch bản                  | Mô hình minh chứng      | Thời lượng | Thông điệp                                                               |
| --- | ------------------------- | ----------------------- | ---------- | ------------------------------------------------------------------------ |
| 1   | Thuê phim lẻ              | `preA0 → preB1 → preA1` | 2 phút     | Nghĩa vụ phải hoàn thành **trước khi** được cấp quyền                    |
| 2   | Quảng cáo bắt buộc        | `preB0`                 | 2 phút     | RBAC không có khái niệm "nghĩa vụ"                                       |
| 3   | Hết lượt xem (view thứ 4) | `preA1 → preA0`         | 2 phút     | Thuộc tính khả biến — chính việc dùng làm thay đổi quyền dùng tiếp       |
| 4   | Giới hạn vùng địa lý      | `preC0`                 | 3 phút     | Điều kiện môi trường — không thuộc S cũng không thuộc O                  |
| 5   | Chặn thiết bị thứ 4       | `preA1`                 | 2 phút     | Bộ đếm hai chiều, chống chia sẻ tài khoản                                |
| 6   | **Thu hồi giữa phiên** ⭐  | `onA0`                  | 4 phút     | **Continuity of Decisions — cao trào của bài, không được cắt**           |
| 7   | Admin + 2FA + audit log   | `preA0 → preB1 → onA3`  | 3 phút     | Đúng vai trò vẫn chưa đủ; audit không thể xoá                            |
| 8   | Lịch sử xem — read-only   | `preA0` (denial)        | 1 phút     | Quyền `delete` **không tồn tại** trong chính sách, không phải chỉ ẩn nút |
| 9   | Offline tự thu hồi        | `onA0`                  | 2 phút     | Cùng cơ chế `onA0`, áp dụng cho tài nguyên **không có kết nối sống**     |
| 10  | Gia hạn / nâng cấp gói    | `preB1 → preA1`         | 2 phút     | Nghĩa vụ (thanh toán) đứng **trước** khi thuộc tính đổi                  |


### A.2. Nếu chỉ có ~12–14 phút cho phần demo — chọn 6 kịch bản này

Ưu tiên theo mạch **"RBAC làm được → RBAC đuối → RBAC bó tay hẳn"**:


| Thứ tự | Kịch bản                             | Vì sao giữ lại                                                                                                      |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1      | **#1 — Thuê phim**                   | Mở màn tự nhiên, giới thiệu app + nghĩa vụ `preB1`                                                                  |
| 2      | **#2 — Quảng cáo bắt buộc**          | Ví dụ dễ hiểu nhất về `oBligations` — thứ RBAC hoàn toàn không có                                                   |
| 3      | **#6 — Thu hồi giữa phiên** ⭐        | **Bắt buộc phải có** — đây là bằng chứng trực quan nhất cho Continuity of Decisions, luận điểm trung tâm của cả bài |
| 4      | **#4 — Geo (rút gọn còn ~1–2 phút)** | Ví dụ **duy nhất** về Conditions (C) trong toàn bộ demo                                                             |
| 5      | **#9 — Offline tự thu hồi**          | Cùng `onA0` nhưng tài nguyên **đã rời máy chủ** — RBAC không có cơ chế thu hồi sau khi tải về                       |
| 6      | **#5 — Chặn thiết bị thứ 4**         | Bộ đếm hai chiều `preA1` — RBAC không theo dõi số phiên đồng thời, không chống được chia sẻ tài khoản               |


Các kịch bản còn lại (#3, #7, #8, #10) **giữ làm dự phòng cho phần Hỏi & Đáp** — nếu có câu hỏi
"UCON còn kiểm soát được gì nữa", demo trực tiếp ngay thay vì chỉ trả lời bằng lời.

---

## PHẦN B — Giải thích thêm cho 6 kịch bản chính ở mục A.2

### #1 — Thuê phim lẻ (`preA0 → preB1 → preA1`)

Bấm **Rent** → hệ thống kiểm tra `account_type = basic` và phim còn khả dụng (`preA0`) → yêu cầu
đồng ý điều khoản bản quyền (`preB1`, chỉ hỏi **lần đầu** — lần thuê thứ hai sẽ không hỏi lại vì
`copyright_consented_at` đã có giá trị) → tạo `rental` với 3 lượt xem, hạn 72 giờ (`preA1`).
**Điểm nhấn:** nghĩa vụ làm thay đổi thuộc tính của subject, và thuộc tính đó chi phối các lần
dùng sau — đây chính là mutability level 1.

### #2 — Quảng cáo bắt buộc (`preB0`)

Bấm **Play** → server trả về **403** kèm `"ucon":"preB0"`, chuyển sang trang quảng cáo, đếm
`0s/15s`. **Điểm ăn tiền:** dùng `curl` giả lập client gian lận, khai đã xem 10 giây — server vẫn
từ chối (`"error":"ad watch duration must be at least 15 seconds"`). Điều này chứng minh **quyết
định nằm ở server, không phải ở giao diện** — khác hẳn cách RBAC thường chỉ ẩn/hiện nút ở frontend.

### #6 — Thu hồi giữa phiên (`onA0`) ⭐ trọng tâm

Cho phim đang phát, giữ nguyên tab. Chạy lệnh SQL ép `rental_expiry` về quá khứ — trong vòng
**15 giây** (chu kỳ giám sát SSE), trình duyệt nhận sự kiện `REVOKED` và phim tự dừng, đồng thời
`onA3` ghi lại lịch sử xem. **Câu chốt nên nói:** *"RBAC kiểm tra quyền một lần lúc mở phim. Từ
giây đó trở đi nó không còn biết gì nữa. UCON vẫn đang kiểm tra, mỗi 15 giây một lần, cho tới khi
phiên kết thúc."*

### #4 — Giới hạn vùng địa lý (`preC0`, bản rút gọn)

Xoá vị trí đã lưu → Play phim có giới hạn vùng (**Elephant Dream**: `VN, US, GB`) → bị chặn
`"content not available in your region (XX)"`. Chèn tay vị trí VN → Play lại → thành công.
**Điểm nhấn:** cùng một người dùng, cùng vai trò, cùng thời điểm — nhưng kết quả khác nhau tuỳ
từng bộ phim và tuỳ vị trí. Đây là ví dụ **duy nhất** cho Conditions vì `user_region` là trạng
thái môi trường lúc chạy, không phải thuộc tính lưu trữ của S hay O.

### #9 — Offline tự thu hồi (`onA0`)

Đăng nhập `premium_demo` → mở một phim → **Download** (lần đầu sẽ hỏi cam kết không chia sẻ file,
`preB1`) → vào trang **Offline**, thấy file `status = active`. Chạy SQL ép `subscription_expiry`
về quá khứ → **refresh trang Offline**. PDP chạy `onA0` ngay khi mở thư viện: file đổi sang
`revoked`, `offline_count` giảm tương ứng, danh sách active trống. **Điểm nhấn:** không có SSE,
không có phiên sống — file đã nằm trên "thiết bị" người dùng. UCON vẫn thu hồi khi gói hết hạn.
RBAC cấp quyền tải một lần rồi thôi; sau đó không còn biết file còn được phép dùng hay không.

### #5 — Chặn thiết bị thứ 4 (`preA1`)

Đăng nhập `premium_demo` trên **3 tab** (hoặc 3 cửa sổ), mỗi tab **Play** một phim và **để nguyên
không Stop**. Tab thứ 4 bấm Play → server trả **403** `"ucon":"preA1"`
(`"maximum device limit (3) reached for this subscription"`). Đóng/Stop một tab → Play lại ở tab
thứ 4 **thành công**, vì `onA3` đã giảm `active_device_count`. **Điểm nhấn:** bộ đếm hai chiều
(tăng lúc mở phiên, giảm lúc đóng) — cùng một vai trò `premium_user`, lần thứ 4 bị từ chối. RBAC
chỉ biết "có quyền xem", không biết đang có bao nhiêu luồng đồng thời.

---

## PHẦN C — Hướng dẫn thao tác chạy Demo

### C.1. Trước buổi (chuẩn bị ở nhà / trước giờ lên lớp)

```bash
cd 02.Project/Seminar01/Demo/hcmus-master-is-security-seminar01-ucon
docker compose down -v
docker compose up -d --build
docker compose ps        # cả 3 container phải "Up" (backend/frontend/postgres)
```

- Build lần đầu mất 2–4 phút — **làm việc này trước, không làm ngay trên lớp**.
- Kiểm tra 3 cổng **3000 / 8080 / 5434** không bị chiếm trước khi chạy (`netstat -ano | findstr ":3000 :8080 :5434"`).
- Truy cập thử [http://localhost:3000](http://localhost:3000), đăng nhập `basic_demo` (mật khẩu chung `Password123!`) để
chắc chắn hệ thống sống.

### C.2. Tài khoản demo


| Username       | Vai trò      | Dùng để                                                    |
| -------------- | ------------ | ---------------------------------------------------------- |
| `basic_demo`   | basic_user   | #1 thuê phim, #2 quảng cáo, #6 thu hồi giữa phiên, #4 geo  |
| `premium_demo` | premium_user | #9 offline tự thu hồi, #5 chặn thiết bị thứ 4              |
| `admin_demo`   | admin        | Dự phòng Q&A: quản trị, 2FA (`MOCK_2FA_123456`), audit log |


### C.3. Ngay trước khi trình bày (làm trên lớp, 2–3 phút)

1. Đăng nhập `basic_demo` → **bấm Allow** khi trình duyệt hỏi vị trí (bắt buộc cho `preC0`, nếu bỏ
  qua mọi phim giới hạn vùng sẽ bị chặn oan). Sau khi xong #1–#4+#6, đăng nhập `premium_demo` (cũng
   **Allow** vị trí) cho #9 và #5.
2. Mở sẵn **2 cửa sổ phụ**: Terminal (chạy lệnh `psql` ép hết hạn) + DevTools (F12) → tab
  **Network** (cho lớp thấy response `403` kèm `"ucon":"preB0"`/`"preA1"` — bằng chứng trực quan
   luật được thực thi ở server). Với #5, chuẩn bị thêm **3 tab** cùng `premium_demo` (chưa Play).
3. Nếu không có mạng để gọi Nominatim (đổi toạ độ → mã quốc gia), chèn tay:
  ```bash
   docker exec ucon_postgres psql -U ucon -d ucon_db -c "INSERT INTO user_locations (user_id, country_code, latitude, longitude) VALUES ('00000000-0000-0000-0000-000000000001','VN',10.7769,106.7009), ('00000000-0000-0000-0000-000000000002','VN',10.7769,106.7009);"
  ```

### C.4. Lệnh cho từng kịch bản đã chọn (PHẦN D)

> Chi tiết từng bước (UI + `curl` + `psql`): xem **[Phần D](#phần-d--chi-tiết-từng-bước-6-kịch-bản-a2)**.
> Mục này chỉ là cheat-sheet copy/paste khi đang đứng trên lớp.

**#2 — giả lập gian lận quảng cáo** (chạy sau khi đã bấm Play và thấy trang quảng cáo, cần `$TOKEN`
và `$RID` lấy từ Network tab):

```bash
curl -s -X POST http://localhost:8080/api/ads/complete \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"rental_id\":\"$RID\",\"ad_id\":\"00000000-0000-0000-0000-000000000201\",\"watch_duration_seconds\":10}"
```

**#6 — thu hồi giữa phiên** (chạy khi phim đang phát, đếm to 15 giây sau khi Enter):

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c "UPDATE rentals SET rental_expiry = NOW() - INTERVAL '1 minute';"
```

**#4 — reset vị trí để demo geo-block:**

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c "DELETE FROM user_locations WHERE user_id='00000000-0000-0000-0000-000000000001';"
```

Sau đó Play **Elephant Dream** để thấy bị chặn, rồi chèn lại vị trí VN (lệnh ở mục C.3, ý 3) để thấy
xem được.

**#9 — offline tự thu hồi** (chạy sau khi `premium_demo` đã Download ít nhất 1 phim, đang đứng ở
trang `/offline` thấy file `active`):

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c "UPDATE subscriptions SET subscription_expiry = NOW() - INTERVAL '1 minute' WHERE user_id='00000000-0000-0000-0000-000000000002';"
```

Refresh `/offline` — file biến mất khỏi danh sách active (`status = revoked`). **Khôi phục gói ngay
sau khi lớp đã thấy kết quả**, kẻo #5 (cần subscription còn hạn) bị chặn `preA0`:

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c "UPDATE subscriptions SET subscription_expiry = NOW() + INTERVAL '30 days' WHERE user_id='00000000-0000-0000-0000-000000000002';"
```

**#5 — chặn thiết bị thứ 4** (nếu `active_device_count` còn sót từ lần tập trước, reset trước khi
Play 3 tab):

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c "UPDATE sessions SET is_active=FALSE, ended_at=NOW() WHERE user_id='00000000-0000-0000-0000-000000000002' AND is_active=TRUE; UPDATE subscriptions SET active_device_count=0 WHERE user_id='00000000-0000-0000-0000-000000000002';"
```

Sau đó Play trên 3 tab, để nguyên không Stop; tab thứ 4 Play → **403** `"ucon":"preA1"`. Stop 1 tab
rồi Play lại tab 4 → thành công.

### C.5. Dọn dữ liệu giữa các lần **chạy thử** (không chạy trên lớp, chỉ khi tập dượt nhiều lần)

> ⚠️ Nếu buổi tập dượt trước đó có chạy **kịch bản #10** (nâng cấp `basic_demo` lên premium), lệnh
> dưới đây **không tự đưa `account_type` về lại `basic`** — kịch bản #1 ở lần tập tiếp theo sẽ báo
> lỗi `"requires account type 'basic'"`. Đã kiểm chứng thực tế lỗi này. Câu `UPDATE users` cần thêm
> `account_type = 'basic'` cho user đó, hoặc dùng lệnh dưới đây (đã sửa):

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c "TRUNCATE sessions, watch_history, rentals, ads_history, offline_downloads, payment_transactions, audit_log, user_locations CASCADE; UPDATE users SET status='active', offline_count=0, copyright_consented_at=NULL, offline_consent_at=NULL, account_type='basic' WHERE username='basic_demo'; UPDATE users SET status='active', offline_count=0, copyright_consented_at=NULL, offline_consent_at=NULL WHERE username <> 'basic_demo'; UPDATE subscriptions SET active_device_count=0, subscription_expiry=NOW()+INTERVAL '30 days'; UPDATE movies SET is_available=TRUE; DELETE FROM movies WHERE title NOT IN ('Big Buck Bunny','Elephant Dream','Tears of Steel','Cosmos Laundromat','Sintel');"
```

> Câu `DELETE FROM movies WHERE title NOT IN (...)` dọn luôn phim admin tạo thử ở **kịch bản #7**
> (nếu không, danh mục phim sẽ phình ra thêm 1 dòng mỗi lần tập dượt — đã quan sát thấy 6 phim thay
> vì 5 sau một lượt chạy hết #1→#10).
>
> Nếu không chắc trạng thái đang ở đâu, cách chắc ăn nhất vẫn là `docker compose down -v && docker compose up -d` như mục C.1 — chậm hơn nhưng luôn về đúng seed ban đầu.

### C.6. Nếu giao diện lỗi giữa chừng trên lớp — phương án dự phòng bằng API

Toàn bộ 6 kịch bản A.2 có thể chạy thuần bằng `curl` / `psql` — copy lệnh từ **Phần D** (mỗi mục
có khối *Phương án API*). Nên **thử trước ít nhất 1 lần** luồng D.1 + D.2 để quen; không cần học
thuộc, chỉ cần biết file này có sẵn nếu UI gặp sự cố trước mặt lớp.

### C.7. Sau khi demo xong — nhớ khôi phục (nếu định demo lại hoặc nhóm khác dùng chung máy)

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c "UPDATE users SET status='active' WHERE username='basic_demo';"
docker exec ucon_postgres psql -U ucon -d ucon_db -c "UPDATE subscriptions SET subscription_expiry = NOW() + INTERVAL '30 days', active_device_count=0;"
docker exec ucon_postgres psql -U ucon -d ucon_db -c "UPDATE sessions SET is_active=FALSE, ended_at=NOW() WHERE is_active=TRUE;"
docker exec ucon_postgres psql -U ucon -d ucon_db -c "UPDATE offline_downloads SET status='revoked' WHERE status='active'; UPDATE users SET offline_count=0 WHERE username='premium_demo';"
```

---

## Phần D — Chi tiết từng bước (6 kịch bản A.2)

Thứ tự chạy trên lớp: **D.1 → D.2 → D.3 → D.4 → D.5 → D.6** (đúng bảng A.2).
D.1–D.4 dùng `basic_demo`. D.5–D.6 dùng `premium_demo`.

### D.0. Hằng số & đăng nhập (dùng chung)

| Phim | `movie_id` | `geo_restriction` | Dùng cho |
| --- | --- | --- | --- |
| Big Buck Bunny | `00000000-0000-0000-0000-000000000101` | `{}` (không giới hạn) | #1, #2, #6, #5, #9 |
| Elephant Dream | `00000000-0000-0000-0000-000000000102` | `VN, US, GB` | #4 |
| Ad demo | `00000000-0000-0000-0000-000000000201` | — | #2 |

| User | `user_id` |
| --- | --- |
| `basic_demo` | `00000000-0000-0000-0000-000000000001` |
| `premium_demo` | `00000000-0000-0000-0000-000000000002` |

Mật khẩu chung: `Password123!` · API: `http://localhost:8080` · UI: `http://localhost:3000`

**Đăng nhập lấy JWT** (chạy 1 lần cho `basic_demo`, lại 1 lần khi sang `premium_demo`):

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"basic_demo","password":"Password123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "$TOKEN"
```

Đổi `"basic_demo"` → `"premium_demo"` khi sang D.5 / D.6.

---

### D.1. Kịch bản #1 — Thuê phim lẻ (`preA0 → preB1 → preA1`)

**Mục tiêu:** nghĩa vụ (đồng ý điều khoản + thanh toán mock) phải xong **trước khi** tạo `rental`.

**UI**

1. Mở http://localhost:3000 → login `basic_demo` / `Password123!` → **Allow** vị trí.
2. Vào **Big Buck Bunny** (không geo-restriction, tránh lẫn với #4).
3. Bấm **Rent**. Lần đầu: checkbox điều khoản bản quyền (`preB1`) → xác nhận.
4. Thành công: rental 3 lượt xem, hạn 72 giờ.

**Kết quả mong đợi:** trang phim hiện nút Play; `copyright_consented_at` đã có giá trị.

**Phương án API**

```bash
# (TOKEN từ D.0, user basic_demo)
RENT_JSON=$(curl -s -X POST http://localhost:8080/api/rentals \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"movie_id":"00000000-0000-0000-0000-000000000101"}')
echo "$RENT_JSON"
# Kỳ vọng: 201  "ucon":["preA0","preB1","preA1"] + rental.rental_id

RID=$(echo "$RENT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['rental']['rental_id'])")
echo "RID=$RID"
```

Kiểm tra DB:

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "SELECT rental_id, rental_views_remaining, rental_expiry FROM rentals WHERE user_id='00000000-0000-0000-0000-000000000001' ORDER BY created_at DESC LIMIT 1;
   SELECT username, copyright_consented_at IS NOT NULL AS consented FROM users WHERE username='basic_demo';"
```

---

### D.2. Kịch bản #2 — Quảng cáo bắt buộc (`preB0`)

**Mục tiêu:** Play bị chặn cho đến khi xem đủ 15 giây quảng cáo. Quyết định nằm ở **server**.

**UI**

1. Tiếp tục rental Big Buck Bunny vừa tạo ở D.1.
2. Bấm **Play** → UI chuyển trang quảng cáo, đếm `0s/15s`. Mở DevTools → Network: `POST /api/rentals/:id/play` trả **403** `"ucon":"preB0"`.
3. Chạy `curl` gian lận (bước dưới) **trước khi** đợi đủ 15 giây — cho lớp thấy server từ chối.
4. Đợi đủ 15 giây trên UI (hoặc `curl` với `watch_duration_seconds: 15`) → **Start Movie**.

**Phương án API — Play lần 1 (bị chặn preB0)**

```bash
curl -s -X POST "http://localhost:8080/api/rentals/$RID/play" \
  -H "Authorization: Bearer $TOKEN"
# Kỳ vọng: 403  {"error":"...","ucon":"preB0"}
```

**Gian lận: khai đã xem 10 giây**

```bash
curl -s -X POST http://localhost:8080/api/ads/complete \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"rental_id\":\"$RID\",\"ad_id\":\"00000000-0000-0000-0000-000000000201\",\"watch_duration_seconds\":10}"
# Kỳ vọng: 400  {"error":"ad watch duration must be at least 15 seconds","ucon":"preB0","watched":10,"required":15}
```

**Hoàn thành nghĩa vụ đúng 15 giây, rồi Play**

```bash
curl -s -X POST http://localhost:8080/api/ads/complete \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"rental_id\":\"$RID\",\"ad_id\":\"00000000-0000-0000-0000-000000000201\",\"watch_duration_seconds\":15}"

SID_JSON=$(curl -s -X POST "http://localhost:8080/api/rentals/$RID/play" \
  -H "Authorization: Bearer $TOKEN")
echo "$SID_JSON"
# Kỳ vọng: 200  session_id + "ucon":["preA0","preC0","preB0","preA1"]
SID=$(echo "$SID_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")
echo "SID=$SID"
```

> Nếu Play đã thành công trên UI: **đừng** gọi Play lần nữa (mỗi lần thành công trừ 1 lượt xem). Lấy `$RID` / `$SID` từ Network tab.

---

### D.3. Kịch bản #6 — Thu hồi giữa phiên (`onA0`) ⭐

**Mục tiêu:** phim đang phát bị ngắt khi `rental_expiry` hết hạn — Continuity of Decisions.

**UI**

1. Giữ tab đang phát phim (sau D.2). Không bấm Stop.
2. Chạy lệnh SQL dưới đây → **đếm to 15 giây**.
3. Trình duyệt nhận SSE `REVOKED` → player dừng. `/history` có bản ghi (`onA3`).

**Lệnh ép hết hạn**

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "UPDATE rentals SET rental_expiry = NOW() - INTERVAL '1 minute' WHERE rental_id='$RID';"
```

Nếu không có `$RID` (đang demo UI), ép **mọi** rental của `basic_demo`:

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "UPDATE rentals SET rental_expiry = NOW() - INTERVAL '1 minute' WHERE user_id='00000000-0000-0000-0000-000000000001';"
```

**Phương án API — theo dõi SSE** (terminal thứ 2, trong lúc phim / curl stream đang chạy):

```bash
curl -N "http://localhost:8080/api/sessions/$SID/events?token=$TOKEN"
# Sau lệnh UPDATE: trong ~15s xuất hiện event REVOKED
```

Kiểm tra session đã đóng:

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "SELECT session_id, is_active, ended_at FROM sessions WHERE user_id='00000000-0000-0000-0000-000000000001' ORDER BY started_at DESC LIMIT 3;
   SELECT history_id, watch_start, watch_end FROM watch_history WHERE user_id='00000000-0000-0000-0000-000000000001' ORDER BY created_at DESC LIMIT 3;"
```

**Câu chốt:** *"RBAC kiểm tra quyền một lần lúc mở phim. UCON vẫn kiểm tra mỗi 15 giây cho tới khi phiên kết thúc."*

---

### D.4. Kịch bản #4 — Giới hạn vùng địa lý (`preC0`)

**Mục tiêu:** cùng user, cùng role — Play **Elephant Dream** thất bại khi không có `country_code`, thành công khi là `VN`.

> D.3 đã hết hạn rental cũ. **Thuê mới** Elephant Dream cho bước này.

**UI**

1. Xoá vị trí đã lưu (lệnh dưới).
2. Vào **Elephant Dream** → Rent (nếu chưa thuê) → Play → **403** `"ucon":"preC0"`, `"content not available in your region (XX)"`.
3. Chèn vị trí VN → Play lại → thành công (vẫn phải xem ad `preB0` như mọi rental basic).

**Reset vị trí**

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "DELETE FROM user_locations WHERE user_id='00000000-0000-0000-0000-000000000001';"
```

**Chèn VN** (sau khi lớp đã thấy bị chặn):

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "INSERT INTO user_locations (user_id, country_code, latitude, longitude) VALUES ('00000000-0000-0000-0000-000000000001','VN',10.7769,106.7009);"
```

**Phương án API**

```bash
# Thuê Elephant Dream
RID_GEO=$(curl -s -X POST http://localhost:8080/api/rentals \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"movie_id":"00000000-0000-0000-0000-000000000102"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['rental']['rental_id'])")

# Xoá geo → Play (chưa cần ad vì preC0 chạy trước preB0)
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "DELETE FROM user_locations WHERE user_id='00000000-0000-0000-0000-000000000001';"

curl -s -X POST "http://localhost:8080/api/rentals/$RID_GEO/play" \
  -H "Authorization: Bearer $TOKEN"
# Kỳ vọng: 403  {"error":"content not available in your region (XX)","ucon":"preC0"}

# Chèn VN → Play lại (lúc này mới tới preB0 nếu chưa xem ad)
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "INSERT INTO user_locations (user_id, country_code, latitude, longitude) VALUES ('00000000-0000-0000-0000-000000000001','VN',10.7769,106.7009);"

curl -s -X POST "http://localhost:8080/api/rentals/$RID_GEO/play" \
  -H "Authorization: Bearer $TOKEN"
# Kỳ vọng: 403 preB0 (chưa xem ad) — không còn preC0. Đó là thành công của bước geo.
```

---

### D.5. Kịch bản #9 — Offline tự thu hồi (`onA0`)

**Mục tiêu:** file offline `active` bị `revoked` khi gói hết hạn — **không cần SSE**.

**UI**

1. Logout `basic_demo` → login `premium_demo` / `Password123!` → **Allow** vị trí.
2. Vào **Big Buck Bunny** → **Download**. Lần đầu: cam kết không chia sẻ file (`preB1`).
3. Vào **/offline** — thấy 1 file `active`.
4. Chạy SQL ép hết hạn gói → **refresh `/offline`**.
5. Danh sách active trống. Cho lớp xem DB `status = revoked`.
6. **Khôi phục hạn gói ngay** (bắt buộc trước D.6).

**Phương án API**

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"premium_demo","password":"Password123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Đảm bảo có vị trí VN (Elephant/Sintel có geo; Big Buck Bunny thì không bắt buộc)
curl -s -X POST http://localhost:8080/api/users/location \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"latitude":10.7769,"longitude":106.7009}'

curl -s -X POST http://localhost:8080/api/offline/download/00000000-0000-0000-0000-000000000101 \
  -H "Authorization: Bearer $TOKEN"
# Kỳ vọng: 201  {"ucon":["preA0","preC0","preA1","preB1"],"download":{"status":"active",...}}

curl -s http://localhost:8080/api/offline -H "Authorization: Bearer $TOKEN"
# Kỳ vọng: 1 phần tử status=active
```

**Ép hết hạn gói + thu hồi**

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "UPDATE subscriptions SET subscription_expiry = NOW() - INTERVAL '1 minute' WHERE user_id='00000000-0000-0000-0000-000000000002';"

# onA0 chạy khi GET /api/offline (mở thư viện)
curl -s http://localhost:8080/api/offline -H "Authorization: Bearer $TOKEN"
# Kỳ vọng: []  (không còn bản active)

docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "SELECT status, movie_id FROM offline_downloads WHERE user_id='00000000-0000-0000-0000-000000000002';
   SELECT username, offline_count FROM users WHERE username='premium_demo';
   SELECT subscription_expiry FROM subscriptions WHERE user_id='00000000-0000-0000-0000-000000000002';"
# Kỳ vọng: status=revoked, offline_count=0
```

**Khôi phục gói trước D.6**

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "UPDATE subscriptions SET subscription_expiry = NOW() + INTERVAL '30 days' WHERE user_id='00000000-0000-0000-0000-000000000002';"
```

---

### D.6. Kịch bản #5 — Chặn thiết bị thứ 4 (`preA1`)

**Mục tiêu:** `active_device_count < 3` là bộ đếm hai chiều. Tab 4 bị 403; Stop 1 tab thì tab 4 xem được.

**Chuẩn bị** (tránh count sót từ lần tập trước):

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "UPDATE sessions SET is_active=FALSE, ended_at=NOW() WHERE user_id='00000000-0000-0000-0000-000000000002' AND is_active=TRUE;
   UPDATE subscriptions SET active_device_count=0, subscription_expiry=NOW()+INTERVAL '30 days' WHERE user_id='00000000-0000-0000-0000-000000000002';"
```

**UI**

1. Vẫn `premium_demo`. Mở **4 tab** (cùng login).
2. Tab 1, 2, 3: Play **Big Buck Bunny**, **không Stop**.
3. Tab 4: Play → **403** `"ucon":"preA1"` `"maximum device limit (3) reached for this subscription"`.
4. Tab 1: **Stop** → Tab 4 Play lại → thành công (`onA3` đã −1).

**Phương án API** (3 Play giữ phiên, Play thứ 4 thất bại):

```bash
# TOKEN premium_demo từ D.5 (đăng nhập lại nếu JWT hết hạn)
play() {
  curl -s -w "\nHTTP %{http_code}\n" -X POST \
    http://localhost:8080/api/subscriptions/play/00000000-0000-0000-0000-000000000101 \
    -H "Authorization: Bearer $TOKEN"
}

play   # 200 — device 1
play   # 200 — device 2
play   # 200 — device 3
play   # 403 preA1 — device 4 bị chặn
```

Xem bộ đếm:

```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c \
  "SELECT active_device_count FROM subscriptions WHERE user_id='00000000-0000-0000-0000-000000000002';
   SELECT session_id, is_active FROM sessions WHERE user_id='00000000-0000-0000-0000-000000000002' AND is_active=TRUE;"
# Kỳ vọng: active_device_count = 3, 3 session is_active=TRUE
```

**Giải phóng 1 phiên rồi Play lại** (lấy `session_id` từ một trong 3 response 200):

```bash
curl -s -X POST "http://localhost:8080/api/sessions/$SID/stop" \
  -H "Authorization: Bearer $TOKEN"

play   # 200 — thiết bị thứ 4 được cấp sau khi counter giảm
```

---

