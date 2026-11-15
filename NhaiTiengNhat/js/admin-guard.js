/**
 * admin-guard.js
 * Cung cấp hàm onAuthReady(callback) — chạy callback SAU KHI auth.js
 * đã verify token với server xong. Tránh tình trạng JS trang đọc
 * isAdmin() từ localStorage cache trước khi server confirm.
 *
 * Cách dùng trong các trang JS:
 *   onAuthReady(function(isAdminVerified) {
 *     if (isAdminVerified) showAdminControls();
 *   });
 */

// Lưu kết quả sau khi verify để các call sau event không bị bỏ lỡ
var _authReadyResult = null;
var _authReadyCallbacks = [];

document.addEventListener('nihongo:auth-ready', function (e) {
  _authReadyResult = e.detail;
  // Chạy tất cả callbacks đã đăng ký
  _authReadyCallbacks.forEach(function (cb) {
    try { cb(_authReadyResult.isAdmin, _authReadyResult.user); } catch (_) {}
  });
  _authReadyCallbacks = [];
});

/**
 * @param {function(isAdmin: boolean, user: object|null): void} callback
 */
function onAuthReady(callback) {
  if (_authReadyResult !== null) {
    // Event đã fire rồi — chạy luôn
    try { callback(_authReadyResult.isAdmin, _authReadyResult.user); } catch (_) {}
  } else {
    _authReadyCallbacks.push(callback);
  }
}
