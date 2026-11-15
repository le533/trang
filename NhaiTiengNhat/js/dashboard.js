/* dashboard.js — Logic trang học của tôi */
(function () {
  'use strict';

  var API_BASE = window.NIHONGO_API_BASE || (
    window.location.port === '5500'
      ? window.location.protocol + '//' + window.location.hostname + ':3000/api'
      : window.location.origin + '/api'
  );

  /* ── Lời chào theo giờ ───────────────────────────────────────────── */
  var hour     = new Date().getHours();
  var greeting = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  var greetEl  = document.getElementById('dash-time-greeting');
  if (greetEl) greetEl.textContent = greeting;

  /* ── Chờ auth.js xong ────────────────────────────────────────────── */
  function waitForUser(cb, tries) {
    tries = tries || 0;
    var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user) return cb(user);
    if (tries > 50) return;
    setTimeout(function () { waitForUser(cb, tries + 1); }, 80);
  }

  waitForUser(function (user) {
    var displayName = user.fullName || user.username || 'bạn';

    var nameEl = document.getElementById('dash-user-name');
    if (nameEl) nameEl.textContent = displayName;

    var avatarEl = document.getElementById('dash-avatar');
    if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();

    var accEl = document.getElementById('dash-account-info');
    if (accEl) {
      accEl.innerHTML =
        '<strong style="display:block;font-size:14px;color:var(--color-ink);margin-bottom:4px;">' +
          escHtml(displayName) +
        '</strong>' +
        '<span>' + escHtml(user.email || '') + '</span><br>' +
        '<span style="margin-top:4px;display:inline-block;">Vai trò: <b>' +
          (user.role === 'admin' ? 'Quản trị viên' : 'Học viên') +
        '</b></span>';
    }

    if (user.role === 'admin') {
      var banner = document.getElementById('dash-admin-banner');
      if (banner) banner.hidden = false;
    }

    loadStats();
    loadCourses();
  });

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function getToken() {
    return localStorage.getItem('nihongo_token') || sessionStorage.getItem('nihongo_token') || '';
  }

  /* ── Thống kê học tập ────────────────────────────────────────────── */
  function loadStats() {
    var token = getToken();
    if (!token) return;

    fetch(API_BASE + '/stats/my', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.success) return;
      var s = data.data || {};
      setText('stat-lessons',      s.lessonsCompleted ?? 0);
      setText('stat-vocab',        s.vocabLearned     ?? 0);
      setText('stat-kanji',        s.kanjiLearned     ?? 0);
      setText('stat-exercises',    s.exercisesDone    ?? 0);
      setText('dash-streak-count', s.streakDays       ?? 0);

      var jlpt = s.jlptProgress || {};
      ['N5', 'N4', 'N3', 'N2', 'N1'].forEach(function (lvl) {
        var pct   = Math.min(100, Math.round(jlpt[lvl] || 0));
        var bar   = document.getElementById('bar-' + lvl.toLowerCase());
        var pctEl = document.getElementById('pct-' + lvl.toLowerCase());
        if (bar)   bar.style.width   = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';
      });
    })
    .catch(function () {
      ['stat-lessons','stat-vocab','stat-kanji','stat-exercises','dash-streak-count']
        .forEach(function (id) { setText(id, '0'); });
      ['n5','n4','n3','n2','n1'].forEach(function (lvl) {
        var el = document.getElementById('pct-' + lvl);
        if (el) el.textContent = '0%';
      });
    });
  }

  /* ── Khóa học đã đăng ký ─────────────────────────────────────────── */
  function loadCourses() {
    var token     = getToken();
    var container = document.getElementById('my-courses-list');
    if (!container) return;

    if (!token) {
      container.innerHTML = '<p style="padding:16px 0;font-size:13px;color:var(--color-muted);">Đăng nhập để xem khóa học của bạn.</p>';
      return;
    }

    fetch(API_BASE + '/courses/my', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.success || !data.data || !data.data.length) {
        container.innerHTML =
          '<div style="padding:16px 0;text-align:center;">' +
            '<p style="font-size:13px;color:var(--color-muted);margin:0 0 10px;">Bạn chưa đăng ký khóa học nào.</p>' +
            '<a href="training/index.html" class="button button-primary" style="font-size:12px;min-height:36px;padding:6px 14px;">Xem khóa học →</a>' +
          '</div>';
        return;
      }
      var html = '';
      data.data.slice(0, 5).forEach(function (c) {
        var lvl    = escHtml(c.level || 'N?');
        var title  = escHtml(c.title || 'Khóa học');
        var status = c.status === 'active' ? 'Đang học' : 'Hết hạn';
        var sColor = c.status === 'active' ? '' : 'background:#fdf0ee;color:#a54338;';
        html +=
          '<div class="my-course-item">' +
            '<span class="my-course-badge">' + lvl + '</span>' +
            '<div class="my-course-info"><strong>' + title + '</strong>' +
              '<span>' + (c.endsAt
                ? 'Hết hạn: ' + new Date(c.endsAt).toLocaleDateString('vi-VN')
                : 'Không giới hạn') + '</span>' +
            '</div>' +
            '<span class="my-course-status" style="' + sColor + '">' + status + '</span>' +
          '</div>';
      });
      container.innerHTML = html;
    })
    .catch(function () {
      container.innerHTML = '<p style="padding:14px 0;font-size:13px;color:var(--color-muted);">Không thể tải dữ liệu khóa học.</p>';
    });
  }
})();
