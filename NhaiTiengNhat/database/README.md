# Nihongo Learning database

Schema mục tiêu: MySQL 8.x, InnoDB, `utf8mb4`. Các tệp này chỉ là thiết kế; không có lệnh nào tự chạy trên server.

## Các bảng

- `roles`, `users`: tài khoản và vai trò. `users.password_hash` chỉ nhận hash do backend tạo; không chép mật khẩu demo LocalStorage vào đây.
- `vocabulary`: từ, cách đọc, romaji, cấp JLPT và ID từ nguồn. `vocabulary_meanings`, `vocabulary_parts_of_speech`, `vocabulary_forms`, `vocabulary_examples` chứa những mảng/lặp trong JSON thành từng dòng để dễ truy vấn.
- `kanji`: chữ, Hán Việt, nghĩa, cấp JLPT, số nét. `kanji_readings` lưu Kun/On; `radicals` và `kanji_radicals` biểu diễn quan hệ nhiều-nhiều; `kanji_vocabulary` liên kết Kanji với từ vựng.
- `lessons`: tiêu đề, cấp độ, thời lượng, tóm tắt, mục tiêu. `lesson_progress` ghi trạng thái học của từng người dùng cho từng bài.
- `grammar_points`, `grammar_examples`: điểm ngữ pháp và ví dụ được seed từ bộ dữ liệu học tập trong backend.
- `exercises`, `exercise_questions`, `exercise_choices`: bài tập, câu hỏi, lựa chọn được seed đồng bộ; cấu trúc câu hỏi hỗ trợ chấm và lưu lịch sử làm bài.
- `exercise_attempts`, `exercise_attempt_answers`: từng lần làm bài và câu trả lời. Một người có thể làm cùng bài nhiều lần; `attempt_number` đánh số lần làm của người đó.
- `user_learning_stats`: số liệu tổng hợp cho dashboard (cấp độ, bài hoàn thành, độ chính xác, chuỗi ngày học, lần hoạt động cuối). Có thể tính từ tiến độ/lịch sử làm bài; bảng này lưu snapshot để đọc nhanh.
- `data_sources`: thông tin nguồn, phiên bản và giấy phép của bộ dữ liệu như OpenJLPT.
- `courses`, `course_subscriptions`, `payment_orders`: khóa học JLPT, quyền học sau thanh toán và trạng thái giao dịch VNPay.
- `video_assets`: thông tin video đầy đủ và bản xem thử giới hạn tối đa 300 giây; tệp được lưu trong `backend/uploads/videos`.
- `learning_documents`, `document_progress`: PDF/DOCX/TXT do quản trị viên tải lên và vị trí đọc của từng tài khoản.
- `learner_feedback`: nhận xét chờ kiểm duyệt cùng trạng thái xác minh hoạt động học.

## Quan hệ chính

- Một role có nhiều user; mỗi user có một role.
- Một từ vựng có nhiều nghĩa, nhãn từ loại, dạng thay thế và ví dụ.
- Một Kanji có nhiều cách đọc và bộ thủ; một bộ thủ có thể thuộc nhiều Kanji.
- Kanji và từ vựng liên kết nhiều-nhiều.
- User và lesson liên kết qua `lesson_progress`.
- User và exercise liên kết qua `exercise_attempts`; mỗi lần làm có các câu trả lời riêng. Lịch sử không bị ghi đè bởi lần sau.
- User có một hàng thống kê tổng hợp trong `user_learning_stats`.
- Bài học và tài liệu có thể gắn với một khóa học; `course_subscriptions` quyết định quyền truy cập nội dung trả phí ở backend.
- `payment_orders` được cập nhật theo IPN VNPay có chữ ký hợp lệ; trang return của trình duyệt không tự cấp quyền học.
- Nhận xét chỉ hiển thị công khai khi hoạt động học đã xác minh và quản trị viên duyệt.

## Thiết lập bằng MySQL Workbench

1. Kết nối tới MySQL Server đang chạy.
2. Mở `schema.sql` trong một tab SQL và chạy toàn bộ script để tạo database/bảng.
3. Mở `seed.sql` trong tab khác và chạy script để nạp role, 5 khóa học, toàn bộ 674 từ vựng và 118 Kanji từ nguồn, các bảng nghĩa/ví dụ/liên kết tương ứng, cùng 21 điểm ngữ pháp, 21 bài học và 21 bài tập (mỗi bài 4 lựa chọn). Các chuỗi Nhật/Việt được gửi theo UTF-8.
4. Trong Navigator, nhấn Refresh cạnh mục Schemas để xem `nihongo_learning` và các bảng.
5. Từ terminal tại thư mục project, chạy `npm run db:migrate` rồi `npm run seed` trong `backend` để hoàn tất migration, gắn bài học theo JLPT và đồng bộ lại dữ liệu theo JSON. Hai cách nạp (SQL và Node) dùng cùng mã nguồn và có thể chạy lặp.

Các script schema/seed chỉ dùng `CREATE TABLE IF NOT EXISTS` và upsert dữ liệu mẫu; không xóa database/bảng hiện có. Đọc kỹ SQL trước khi chạy trên database đã có dữ liệu.

## Cách kiểm tra trước khi thực thi

1. Kiểm tra các ký tự Nhật/Việt trong script hiển thị chính xác.
2. `seed.sql` tạo dữ liệu mẫu tổng hợp; tài khoản `.invalid` có hash placeholder nên không thể đăng nhập.
3. Để tạo tài khoản quản trị, đăng ký người dùng bình thường trước, rồi chỉ định role `admin` cho đúng tài khoản đó bằng MySQL. Không bật quyền admin bằng LocalStorage.
4. Xác minh trong môi trường thử nghiệm bằng danh sách bảng, số dòng dữ liệu, và việc có thể đăng ký/đăng nhập, làm bài và lưu tiến độ.

Ví dụ chạy trong Windows Command Prompt từ thư mục gốc project:

```bat
mysql --default-character-set=utf8mb4 -u YOUR_MYSQL_USER -p < database\schema.sql
mysql --default-character-set=utf8mb4 -u YOUR_MYSQL_USER -p nihongo_learning < database\seed.sql
cd backend
copy .env.example .env
npm install
npm run seed
```

Thay `YOUR_MYSQL_USER`, cập nhật thông tin kết nối trong `.env`, và đặt `JWT_SECRET` riêng dài ít nhất 32 ký tự trước khi chạy API.

Đây chỉ là hướng dẫn. Không có SQL nào được chạy trong quá trình tạo các tệp này.

## Ghi chú triển khai

- Backend xác thực quyền truy cập và role trên mỗi API cần đăng nhập; giá trị trong giao diện chỉ phục vụ hiển thị.
- Hash password tại server bằng thuật toán password-hashing được hỗ trợ và lưu kết quả vào `password_hash`.
- `seed.sql` chứa trực tiếp 674 từ vựng, 118 Kanji và dữ liệu học tập mẫu để có thể xem/chạy độc lập trong MySQL Workbench; `npm run seed` đồng bộ lại cùng bộ dữ liệu từ JSON. Nội dung từ vựng/Kanji giữ nguyên ý nghĩa và ví dụ tiếng Anh từ nguồn, không tạo bản dịch tiếng Việt tự động. Một số bảng không thể hoặc không nên ép có 21 dòng: `roles` chỉ có hai role ứng dụng hỗ trợ; bảng liên kết phụ thuộc vào dữ liệu cha; bảng tiến độ/phản hồi/phương thức thanh toán cần phát sinh từ hoạt động thật; bảng video/tài liệu chỉ được tạo khi có tệp hợp lệ.
- Ảnh khóa học được lưu trong `assets/images/`, còn `courses.image_url` lưu đường dẫn tương đối để MySQL không phải chứa binary ảnh.
- Bài học và ngữ pháp hỗ trợ `video_url`; bài học còn có nội dung văn bản. Quản trị viên tải video MP4/WebM trực tiếp từ máy tính lên backend (tối đa 500 MB), không cần dịch vụ hoặc URL video bên ngoài.
- `lesson_progress` là trạng thái hiện tại theo bài. `exercise_attempts` là lịch sử từng lần; không thay thế hai lần thử bằng một hàng duy nhất.
