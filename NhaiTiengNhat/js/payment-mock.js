/**
 * payment-mock.js — Trang thanh toán giả lập
 * Tách ra file riêng để tuân thủ Content Security Policy (không dùng inline script).
 */
(function () {
  'use strict';

  var API_BASE = window.NIHONGO_API_BASE || (
    window.location.port === '5500'
      ? window.location.protocol + '//' + window.location.hostname + ':3000/api'
      : window.location.origin + '/api'
  );

  var params    = new URLSearchParams(window.location.search);
  var orderRef  = params.get('order')    || '';
  var expiresAt = params.get('expires')  ? new Date(params.get('expires')) : null;
  var title     = params.get('title')    || '';
  var level     = params.get('level')    || '';
  var price     = params.get('price')    || '';
  var duration  = params.get('duration') || '';

  var confirmed     = false;
  var timerInterval = null;

  /* ── Hiển thị thông tin đơn hàng ───────────────────────────────── */
  function showOrderDetails() {
    var skeleton = document.getElementById('order-skeleton');
    var details  = document.getElementById('order-details');
    if (skeleton) skeleton.hidden = true;
    if (details)  details.hidden  = false;

    setText('order-course-title', title    || 'Đang tải…');
    setText('order-course-level', level    || '—');
    setText('order-ref',          orderRef || '—');
    setText('order-price',
      price ? Number(price).toLocaleString('vi-VN') + ' ₫' : '—');
    setText('order-duration',
      duration ? duration + ' ngày' : 'Không giới hạn');
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ── Đếm ngược ─────────────────────────────────────────────────── */
  function startTimer() {
    if (!expiresAt) return;
    var timerEl   = document.getElementById('mock-timer');
    var displayEl = document.getElementById('timer-display');
    if (!timerEl || !displayEl) return;

    timerInterval = setInterval(function () {
      var remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      var m = Math.floor(remaining / 60);
      var s = remaining % 60;
      displayEl.textContent = m + ':' + String(s).padStart(2, '0');

      if (remaining <= 60) timerEl.classList.add('is-urgent');
      if (remaining === 0) {
        clearInterval(timerInterval);
        setStatus('Đơn hàng đã hết hạn. Vui lòng quay lại và chọn lại khóa học.', 'error');
        var btn = document.getElementById('confirm-btn');
        if (btn) btn.disabled = true;
      }
    }, 1000);
  }

  /* ── Trạng thái ─────────────────────────────────────────────────── */
  function setStatus(msg, type) {
    var el = document.getElementById('mock-status');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'mock-status is-' + type;
  }

  /* ── Xác nhận thanh toán ─────────────────────────────────────────── */
  function handleConfirm() {
    if (confirmed) return;
    if (!orderRef) {
      setStatus('Không tìm thấy mã đơn hàng. Vui lòng quay lại trang khóa học.', 'error');
      return;
    }

    var btn = document.getElementById('confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang xử lý…'; }
    setStatus('Đang xác nhận thanh toán…', 'loading');

    var token = localStorage.getItem('nihongo_token')
             || sessionStorage.getItem('nihongo_token')
             || '';

    if (!token) {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Xác nhận đã thanh toán'; }
      setStatus('Phiên đăng nhập hết hạn. Đang chuyển tới trang đăng nhập…', 'error');
      setTimeout(function () {
        window.location.assign('auth/login.html?returnTo=' + encodeURIComponent(window.location.href));
      }, 1500);
      return;
    }

    fetch(API_BASE + '/payments/mock/' + encodeURIComponent(orderRef) + '/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    })
    .then(function (r) {
      if (r.status === 401) throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      return r.json();
    })
    .then(function (data) {
      if (data.success) {
        confirmed = true;
        clearInterval(timerInterval);
        setStatus('🎉 Thanh toán thành công! Khóa học đã được mở. Đang chuyển trang…', 'success');
        if (btn) btn.textContent = '✓ Đã thanh toán';
        setTimeout(function () {
          window.location.assign('lessons/index.html?level=' + encodeURIComponent(level || ''));
        }, 1800);
      } else {
        if (btn) { btn.disabled = false; btn.textContent = '✓ Xác nhận đã thanh toán'; }
        setStatus(data.message || 'Xác nhận thất bại. Vui lòng thử lại.', 'error');
      }
    })
    .catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Xác nhận đã thanh toán'; }
      setStatus(err.message || 'Không kết nối được máy chủ. Kiểm tra server và thử lại.', 'error');
    });
  }

  /* ── Khởi động ───────────────────────────────────────────────────── */
  function init() {
    var btn = document.getElementById('confirm-btn');

    if (!orderRef) {
      var skeleton = document.getElementById('order-skeleton');
      if (skeleton) skeleton.textContent = 'Không tìm thấy thông tin đơn hàng. Vui lòng quay lại trang khóa học.';
      if (btn) btn.disabled = true;
      return;
    }

    showOrderDetails();
    startTimer();
    if (btn) btn.addEventListener('click', handleConfirm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
