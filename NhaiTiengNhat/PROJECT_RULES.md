# PROJECT RULES — NIHONGO LEARNING

## 1. Mục tiêu

Đây là website học tiếng Nhật dành cho sinh viên/người học tiếng Nhật.

Website lấy cảm hứng từ:
https://nhaikanji.com/

Mục tiêu là xây dựng một phiên bản riêng có:

- giao diện hiện đại
- dễ sử dụng
- bố cục rõ ràng
- dễ mở rộng
- phù hợp cho việc học tiếng Nhật

Không sao chép nguyên mã nguồn hoặc nội dung của website tham khảo.

## 2. Công nghệ

Frontend sử dụng HTML5, CSS3 và JavaScript ES6+, không dùng framework UI.
Backend hiện tại sử dụng Node.js + Express; dữ liệu ứng dụng lưu trong MySQL 8.x.
JSON trong `data/` là dữ liệu nguồn để nhập vào MySQL bằng script backend.

Không sử dụng React, Vue, Angular, Bootstrap, Tailwind, jQuery hoặc thư viện UI
bên ngoài nếu không cần thiết. LocalStorage chỉ dùng cho tùy chọn giao diện không
nhạy cảm; tài khoản, nội dung, bài làm và tiến độ phải được xử lý qua backend.

## 3. Đối tượng thiết kế

ƯU TIÊN DUY NHẤT:

- Laptop
- Desktop

Kích thước cần ưu tiên kiểm tra:

- 1280px
- 1366px
- 1440px
- 1536px
- 1920px

Không cần tối ưu cho:

- điện thoại
- màn hình 320px
- màn hình 375px
- màn hình 390px
- màn hình 430px

Không cần xây dựng mobile-first.

Không cần hamburger menu.

Không cần mobile navigation.

Không cần thiết kế giao diện mobile.

Nếu có responsive CSS hiện tại dành riêng cho mobile thì có thể loại bỏ hoặc vô hiệu hóa nếu nó làm ảnh hưởng đến giao diện desktop.

## 4. Desktop Layout

Website phải có bố cục desktop rõ ràng.

Header:

Logo | Navigation | Authentication

Main:

Nội dung nằm trong container có max-width hợp lý.

Footer:

Footer đầy đủ chiều rộng.

Không để nội dung bị kéo quá rộng trên màn hình lớn.

Ưu tiên container khoảng 1100px–1400px tùy nội dung.

## 5. Thiết kế

Phong cách:

- hiện đại
- sạch
- tối giản
- phù hợp website giáo dục
- dễ đọc
- khoảng trắng hợp lý
- typography rõ ràng
- màu sắc thống nhất

Có thể tham khảo bố cục và cảm giác tổng thể của nhaikanji.com nhưng phải xây dựng giao diện riêng.

## 6. Code

Ưu tiên:

- semantic HTML
- CSS variables
- class rõ nghĩa
- CSS dễ đọc
- JavaScript đơn giản
- tránh code dư thừa
- tránh tạo file không cần thiết

Không tạo nhiều file chỉ để chia nhỏ code một cách không cần thiết.

## 7. Quy tắc thay đổi project

Trước khi sửa:

1. Đọc PROJECT_RULES.md.
2. Đọc cấu trúc project.
3. Kiểm tra file hiện tại.
4. Tái sử dụng code nếu hợp lý.
5. Không tự ý thay đổi kiến trúc project.
6. Không tự ý thêm framework.
7. Không tự ý thêm mobile layout.

Mọi giao diện mới phải tuân theo các quy tắc trên.

## 8. Authentication và dữ liệu người dùng

- Đăng ký, đăng nhập, hồ sơ, đổi mật khẩu và phân quyền phải đi qua backend.
- Mật khẩu được hash tại server; token được giữ trong `sessionStorage` hoặc
  `localStorage` tùy lựa chọn ghi nhớ đăng nhập.
- `isAdmin()` chỉ điều khiển hiển thị tiện ích quản trị trên giao diện. Mọi thao
  tác quản trị phải tiếp tục được xác thực và phân quyền ở backend.
- Không đưa mật khẩu, token hoặc dữ liệu cá nhân vào các tệp JSON tĩnh.
