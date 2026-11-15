/**
 * nav-mobile.js — Mobile hamburger menu
 * Hoạt động bằng cách inject class "nav-mobile-active" vào <html>
 * khi viewport ≤ 920px, CSS dùng class đó để apply layout mới.
 * Không dùng !important — ưu tiên specificity cao hơn.
 */
(function () {
  'use strict';

  var BREAKPOINT = 920;
  var HTML = document.documentElement;

  /* ── Inject nút hamburger ─────────────────────────────────────── */
  function injectToggle() {
    var nav = document.querySelector('.site-navigation');
    var headerInner = document.querySelector('.header-inner');
    if (!nav || !headerInner) return;
    if (headerInner.querySelector('.nav-toggle')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-toggle';
    btn.setAttribute('aria-label', 'Mở menu điều hướng');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'site-nav');
    btn.innerHTML = '<span class="nav-toggle-icon" aria-hidden="true"></span>';
    nav.id = 'site-nav';
    headerInner.appendChild(btn);

    /* ── handlers ── */
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu điều hướng');
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) close();
    });

    document.addEventListener('click', function (e) {
      if (!headerInner.contains(e.target)) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    function close() {
      nav.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Mở menu điều hướng');
    }
  }

  /* ── Đánh dấu mobile/desktop lên <html> ───────────────────────── */
  function updateMode() {
    if (window.innerWidth <= BREAKPOINT) {
      HTML.classList.add('nav-mobile-active');
    } else {
      HTML.classList.remove('nav-mobile-active');
      /* đóng menu nếu đang mở khi resize về desktop */
      var nav = document.querySelector('.site-navigation');
      if (nav) nav.classList.remove('is-open');
      var btn = document.querySelector('.nav-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  }

  /* throttle resize */
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateMode, 60);
  });

  /* ── Khởi chạy ─────────────────────────────────────────────────── */
  function boot() {
    injectToggle();
    updateMode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
