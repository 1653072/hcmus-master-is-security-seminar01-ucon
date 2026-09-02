# Demo
---

## Phần A - Kịch bản Demo (liệt kê trước khi vào chi tiết)

Đây là danh sách đã **chạy kiểm chứng thực tế** trên ứng dụng —
Hệ thống hiện thực **7 mô hình cơ sở**: `preA0, preA1, preB0,
preB1, preC0, onA0, onA3`.

### A.1. Danh sách đầy đủ (bản dựng sẵn của nhóm, ~23 phút nếu chạy hết)

| # | Kịch bản | Mô hình minh chứng | Thời lượng | Thông điệp |
|---|---|---|---|---|
| 1 | Thuê phim lẻ | `preA0 → preB1 → preA1` | 2 phút | Nghĩa vụ phải hoàn thành **trước khi** được cấp quyền |
| 2 | Quảng cáo bắt buộc | `preB0` | 2 phút | RBAC không có khái niệm "nghĩa vụ" |
| 3 | Hết lượt xem (view thứ 4) | `preA1 → preA0` | 2 phút | Thuộc tính khả biến — chính việc dùng làm thay đổi quyền dùng tiếp |
| 4 | Giới hạn vùng địa lý | `preC0` | 3 phút | Điều kiện môi trường — không thuộc S cũng không thuộc O |
| 5 | Chặn thiết bị thứ 4 | `preA1` | 2 phút | Bộ đếm hai chiều, chống chia sẻ tài khoản |
| 6 | **Thu hồi giữa phiên** ⭐ | `onA0` | 4 phút | **Continuity of Decisions — cao trào của bài, không được cắt** |
| 7 | Admin + 2FA + audit log | `preA0 → preB1 → onA3` | 3 phút | Đúng vai trò vẫn chưa đủ; audit không thể xoá |
| 8 | Lịch sử xem — read-only | `preA0` (denial) | 1 phút | Quyền `delete` **không tồn tại** trong chính sách, không phải chỉ ẩn nút |
| 9 | Offline tự thu hồi | `onA0` | 2 phút | Cùng cơ chế `onA0`, áp dụng cho tài nguyên **không có kết nối sống** |
| 10 | Gia hạn / nâng cấp gói | `preB1 → preA1` | 2 phút | Nghĩa vụ (thanh toán) đứng **trước** khi thuộc tính đổi |

### A.2. Nếu chỉ có ~8–10 phút cho phần demo — chọn 4 kịch bản này

Ưu tiên theo mạch **"RBAC làm được → RBAC đuối → RBAC bó tay hẳn"**:

| Thứ tự | Kịch bản | Vì sao giữ lại |
|---|---|---|
| 1 | **#1 — Thuê phim** | Mở màn tự nhiên, giới thiệu app + nghĩa vụ `preB1` |
| 2 | **#2 — Quảng cáo bắt buộc** | Ví dụ dễ hiểu nhất về `oBligations` — thứ RBAC hoàn toàn không có |
| 3 | **#6 — Thu hồi giữa phiên** ⭐ | **Bắt buộc phải có** — đây là bằng chứng trực quan nhất cho Continuity of Decisions, luận điểm trung tâm của cả bài |
| 4 | **#4 — Geo (rút gọn còn ~1–2 phút)** | Ví dụ **duy nhất** về Conditions (C) trong toàn bộ demo |

Các kịch bản còn lại (#3, #5, #7–#10) **giữ làm dự phòng cho phần Hỏi & Đáp** — nếu có câu hỏi
"UCON còn kiểm soát được gì nữa", demo trực tiếp ngay thay vì chỉ trả lời bằng lời.

---

## PHẦN B — Giải thích thêm cho 4 kịch bản chính

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
- Kiểm tra 3 cổng **3000 / 8080 / 5434** không bị chiếm trước khi chạy (`netstat -ano | findstr
  ":3000 :8080 :5434"`).
- Truy cập thử http://localhost:3000, đăng nhập `basic_demo` (mật khẩu chung `Password123!`) để
  chắc chắn hệ thống sống.

### C.2. Tài khoản demo

| Username | Vai trò | Dùng để |
|---|---|---|
| `basic_demo` | basic_user | Thuê phim, quảng cáo, giới hạn 3 lượt xem |
| `premium_demo` | premium_user | Gói tháng, 3 thiết bị, tải offline |
| `admin_demo` | admin | Quản trị, 2FA (`MOCK_2FA_123456`), audit log |

### C.3. Ngay trước khi trình bày (làm trên lớp, 2–3 phút)

1. Đăng nhập `basic_demo` → **bấm Allow** khi trình duyệt hỏi vị trí (bắt buộc cho `preC0`, nếu bỏ
   qua mọi phim giới hạn vùng sẽ bị chặn oan).
2. Mở sẵn **2 cửa sổ phụ**: Terminal (chạy lệnh `psql` ép hết hạn) + DevTools (F12) → tab
   **Network** (cho lớp thấy response `403` kèm `"ucon":"preB0"`/`"preA1"` — bằng chứng trực quan
   luật được thực thi ở server).
3. Nếu không có mạng để gọi Nominatim (đổi toạ độ → mã quốc gia), chèn tay:
   ```bash
   docker exec ucon_postgres psql -U ucon -d ucon_db -c "INSERT INTO user_locations (user_id, country_code, latitude, longitude) VALUES ('00000000-0000-0000-0000-000000000001','VN',10.7769,106.7009), ('00000000-0000-0000-0000-000000000002','VN',10.7769,106.7009);"
   ```

### C.4. Lệnh cho từng kịch bản đã chọn (PHẦN D)

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
> Nếu không chắc trạng thái đang ở đâu, cách chắc ăn nhất vẫn là `docker compose down -v && docker
> compose up -d` như mục C.1 — chậm hơn nhưng luôn về đúng seed ban đầu.

### C.6. Nếu giao diện lỗi giữa chừng trên lớp — phương án dự phòng bằng API
Toàn bộ luồng #1+#2 có thể chạy thuần bằng `curl` (đã kiểm chứng, xem `RunInstruction.md` mục 5) —
đăng nhập lấy token, POST `/api/rentals`, POST `/api/rentals/:id/play`, POST `/api/ads/complete`.
Nên **thử trước ít nhất 1 lần** để quen; không cần học thuộc, chỉ cần biết file này có sẵn nếu UI
gặp sự cố trước mặt lớp.

### C.7. Sau khi demo xong — nhớ khôi phục (nếu định demo lại hoặc nhóm khác dùng chung máy)
```bash
docker exec ucon_postgres psql -U ucon -d ucon_db -c "UPDATE users SET status='active' WHERE username='basic_demo';"
docker exec ucon_postgres psql -U ucon -d ucon_db -c "UPDATE subscriptions SET subscription_expiry = NOW() + INTERVAL '30 days';"
```

---

