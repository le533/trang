const RESULT_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const orderRef = params.get('order');
  const title = document.querySelector('#payment-result-title');
  const message = document.querySelector('#payment-result-message');
  if (!orderRef || params.get('status') !== 'checking') {
    title.textContent = 'Giao dịch chưa hoàn tất';
    message.textContent = 'VNPay chưa xác nhận thanh toán thành công. Nếu bạn đã thanh toán, hãy chờ IPN hoặc kiểm tra lại sau.';
    return;
  }
  const token = getToken();
  if (!token) {
    title.textContent = 'Cần đăng nhập để xem kết quả';
    message.textContent = 'Giao dịch đang được kiểm tra. Hãy đăng nhập đúng tài khoản đã khởi tạo đơn hàng để xem trạng thái.';
    return;
  }
  try {
    const response = await fetch(`${RESULT_API_BASE}/payments/orders/${encodeURIComponent(orderRef)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Không thể kiểm tra đơn hàng.');
    if (result.data.status === 'paid') {
      title.textContent = 'Thanh toán thành công';
      message.textContent = `Khóa học “${result.data.course_title}” đã được mở.`;
    } else if (result.data.status === 'pending') {
      title.textContent = 'Đang chờ VNPay xác nhận';
      message.textContent = 'Chưa nhận được IPN từ VNPay. Quyền học sẽ tự động mở sau khi giao dịch được xác nhận.';
    } else {
      title.textContent = 'Thanh toán không thành công';
      message.textContent = 'Đơn hàng chưa được thanh toán. Bạn có thể quay lại trang khóa học để thử lại.';
    }
  } catch (error) {
    title.textContent = 'Không thể kiểm tra giao dịch';
    message.textContent = error.message;
  }
}, { once: true });
