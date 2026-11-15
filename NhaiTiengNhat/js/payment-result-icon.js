/* payment-result-icon.js — Cập nhật icon kết quả thanh toán */
(function () {
  'use strict';
  var iconEl  = document.getElementById('payment-result-icon');
  var titleEl = document.getElementById('payment-result-title');
  var refEl   = document.getElementById('payment-order-ref');

  var params = new URLSearchParams(window.location.search);
  var order  = params.get('order')  || '';
  var status = params.get('status') || '';

  if (order && refEl) refEl.textContent = 'Mã đơn: ' + order;

  function syncIcon() {
    if (!iconEl || !titleEl) return;
    var title = titleEl.textContent || '';
    if (title.includes('thành công') || title.includes('hoàn tất')) {
      iconEl.textContent = '✅';
      iconEl.className   = 'payment-result-icon icon-success';
    } else if (
      title.includes('thất bại') || title.includes('không') ||
      title.includes('lỗi') || status === 'failed'
    ) {
      iconEl.textContent = '❌';
      iconEl.className   = 'payment-result-icon icon-fail';
    }
  }

  if (typeof MutationObserver !== 'undefined' && titleEl) {
    new MutationObserver(syncIcon).observe(titleEl, {
      childList: true, subtree: true, characterData: true
    });
  }
  setTimeout(syncIcon, 3000);
})();
