/* slideshow.js — Điều khiển slideshow ngoại khóa tiếng Nhật trên trang chủ */
(function () {
  'use strict';
  var track = document.getElementById('slideshow-track');
  var dots  = document.querySelectorAll('.slideshow-dot');
  var prev  = document.getElementById('slide-prev');
  var next  = document.getElementById('slide-next');
  if (!track) return;

  var CARD_COUNT    = 10;
  var BASE_DURATION = 42;
  var duration      = BASE_DURATION;

  function getProgress() {
    var style  = getComputedStyle(track);
    var matrix = new DOMMatrix(style.transform);
    var totalW = track.scrollWidth / 2;
    var offset = Math.abs(matrix.m41) % totalW;
    return offset / totalW;
  }

  function applySpeed(newDuration) {
    var progress = getProgress();
    duration = Math.max(10, Math.min(120, newDuration));
    var delay = -(progress * duration);
    track.style.animationDuration  = duration + 's';
    track.style.animationDelay     = delay + 's';
    track.style.animationPlayState = 'running';
  }

  if (prev) prev.addEventListener('click', function () { applySpeed(duration + 10); });
  if (next) next.addEventListener('click', function () { applySpeed(duration - 10); });

  function updateDots() {
    var style  = getComputedStyle(track);
    var matrix = new DOMMatrix(style.transform);
    var totalW = track.scrollWidth / 2;
    var offset = Math.abs(matrix.m41) % totalW;
    var cardW  = totalW / CARD_COUNT;
    var idx    = Math.round(offset / cardW) % CARD_COUNT;
    dots.forEach(function (d, i) { d.classList.toggle('is-active', i === idx); });
    requestAnimationFrame(updateDots);
  }
  requestAnimationFrame(updateDots);

  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () {
      var totalW = track.scrollWidth / 2;
      var cardW  = totalW / CARD_COUNT;
      var target = i * cardW;
      var delay  = -(target / totalW) * duration;
      track.style.animationDuration = duration + 's';
      track.style.animationDelay    = delay + 's';
    });
  });

  track.addEventListener('mouseleave', function () { applySpeed(duration); });
})();
