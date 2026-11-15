/**
 * grammar.js — Nihongo Learning
 * Loads grammar points from API (falls back to local JSON),
 * Rich detail dialog with browser pronunciation and configurable video playback.
 */

const GRAMMAR_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);

// ─── TTS helper ───────────────────────────────────────────────────────────────
function speak(text, lang = 'ja-JP') {
  if (!window.speechSynthesis || !text) return null;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.85;
  window.speechSynthesis.speak(utter);
  return utter;
}

function getGrammarToken() {
  return localStorage.getItem('nihongo_token') || sessionStorage.getItem('nihongo_token');
}

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getGrammarToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${GRAMMAR_API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({ message: 'Phản hồi không hợp lệ từ máy chủ.' }));
  if (!response.ok) throw new Error(data.message || `Máy chủ trả về lỗi ${response.status}.`);
  return data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const grammarGrid    = document.querySelector('#grammar-grid');
if (!grammarGrid) { /* not on grammar page */ throw new Error('skip'); }

const totalCountEl   = document.querySelector('#grammar-total');
const gridCountEl    = document.querySelector('#grammar-grid-count');
const loadErrorEl    = document.querySelector('#grammar-load-error');
const emptyStateEl   = document.querySelector('#grammar-empty-state');
const searchForm     = document.querySelector('#grammar-search-form');
const searchInput    = document.querySelector('#grammar-search-input');
const levelButtons   = [...document.querySelectorAll('.level-pill[data-level]')];
const clearBtn       = document.querySelector('#clear-grammar-filters');
const retryBtn       = document.querySelector('#retry-grammar-load');
const paginationEl   = document.querySelector('#grammar-pagination');
const prevPageBtn    = document.querySelector('#grammar-prev-page');
const nextPageBtn    = document.querySelector('#grammar-next-page');
const pageStatusEl   = document.querySelector('#grammar-page-status');

const dialog         = document.querySelector('#grammar-dialog');
const dBadges        = document.querySelector('#grammar-dialog-badges');
const dTitle         = document.querySelector('#grammar-dialog-title');
const dStructure     = document.querySelector('#grammar-dialog-structure');
const dMeaning       = document.querySelector('#grammar-dialog-meaning');
const dExamplesList  = document.querySelector('#grammar-examples-list');
const dVideoSection  = document.querySelector('#grammar-video-section');
const dVideoToggle   = document.querySelector('#grammar-video-toggle');
const dVideoWrap     = document.querySelector('#grammar-video-wrap');
const dVideoBox      = document.querySelector('#grammar-video-player-box');
const dVideoPlaceholder = document.querySelector('#grammar-video-placeholder');
const dVideoControls = document.querySelector('#grammar-video-controls');
const dTtsBtn        = document.querySelector('#grammar-tts-btn');
const dTtsWave       = document.querySelector('#grammar-tts-wave');

const closeBtn       = document.querySelector('#close-grammar-detail');
const closeFooterBtn = document.querySelector('#close-grammar-detail-footer');

const PAGE_SIZE      = 15;
let allGrammar       = [];
let activeLevel      = 'all';
let currentPage      = 1;
let currentQuery     = '';
let currentItem      = null;

const videoPlayer = document.createElement('video');
const videoErrorMessage = document.createElement('p');
videoErrorMessage.className = 'video-error-message';
videoErrorMessage.setAttribute('role', 'alert');
videoErrorMessage.textContent = 'Không thể phát video. Hãy kiểm tra URL hoặc định dạng tệp.';
videoErrorMessage.hidden = true;
videoPlayer.controls = true;
videoPlayer.preload = 'metadata';
videoPlayer.playsInline = true;
videoPlayer.setAttribute('aria-label', 'Video giải thích ngữ pháp');
videoPlayer.className = 'grammar-native-video';
videoPlayer.addEventListener('timeupdate', updateVideoControls);
videoPlayer.addEventListener('loadedmetadata', updateVideoControls);
videoPlayer.addEventListener('play', updateVideoControls);
videoPlayer.addEventListener('pause', updateVideoControls);
videoPlayer.addEventListener('ended', updateVideoControls);
videoPlayer.addEventListener('error', () => {
  videoErrorMessage.hidden = false;
  if (!dVideoBox.contains(videoPlayer)) dVideoBox.prepend(videoPlayer);
  dVideoControls.hidden = true;
});

function updateVideoControls() {
  const duration = Number.isFinite(videoPlayer.duration) ? videoPlayer.duration : 0;
  const current = videoPlayer.currentTime || 0;
  const progress = document.querySelector('#vc-progress');
  const time = document.querySelector('#vc-time');
  const playIcon = document.querySelector('#vc-play-pause .icon-play');
  const pauseIcon = document.querySelector('#vc-play-pause .icon-pause');
  if (progress) progress.value = duration ? (current / duration) * 100 : 0;
  if (time) time.textContent = `${fmtTime(current)} / ${fmtTime(duration)}`;
  if (playIcon) playIcon.hidden = !videoPlayer.paused;
  if (pauseIcon) pauseIcon.hidden = videoPlayer.paused;
}

function seekVideo(offset) {
  if (Number.isFinite(videoPlayer.duration)) {
    videoPlayer.currentTime = Math.max(0, Math.min(videoPlayer.duration, videoPlayer.currentTime + offset));
  }
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

document.querySelector('#vc-play-pause')?.addEventListener('click', async () => {
  if (videoPlayer.paused) {
    try { await videoPlayer.play(); }
    catch { dVideoPlaceholder.textContent = 'Trình duyệt không thể phát video này.'; }
  } else {
    videoPlayer.pause();
  }
});

document.querySelector('#vc-seek-back')?.addEventListener('click', () => seekVideo(-10));
document.querySelector('#vc-seek-fwd')?.addEventListener('click', () => seekVideo(10));

document.querySelector('#vc-mute')?.addEventListener('click', () => {
  videoPlayer.muted = !videoPlayer.muted;
});

document.querySelector('#vc-progress')?.addEventListener('input', e => {
  if (Number.isFinite(videoPlayer.duration)) {
    videoPlayer.currentTime = (Number(e.target.value) / 100) * videoPlayer.duration;
  }
});

// ─── TTS ──────────────────────────────────────────────────────────────────────
function triggerTTS(text) {
  if (!text) return;
  dTtsBtn.classList.add('is-speaking');
  dTtsWave.classList.add('is-active');
  const utter = speak(text, 'ja-JP');
  const stopWave = () => {
    dTtsBtn.classList.remove('is-speaking');
    dTtsWave.classList.remove('is-active');
  };
  if (!utter) { stopWave(); return; }
  utter.onend = stopWave;
  utter.onerror = stopWave;
}

dTtsBtn?.addEventListener('click', () => {
  if (!currentItem) return;
  const text = currentItem.form || currentItem.title;
  triggerTTS(text);
});

// ─── Normalise ────────────────────────────────────────────────────────────────
function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function badgeEl(level) {
  const span = document.createElement('span');
  span.className = `grammar-level-badge badge-${level}`;
  span.textContent = level;
  return span;
}

function createCard(item) {
  const card = document.createElement('article');
  card.className = 'grammar-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${item.title}, ${item.level}`);

  const meta = document.createElement('div');
  meta.className = 'grammar-card-meta';
  meta.append(badgeEl(item.level));
  if (item.form) {
    const form = document.createElement('span');
    form.className = 'grammar-card-form';
    form.textContent = item.form;
    meta.append(form);
  }

  const title   = document.createElement('h3');
  title.className = 'grammar-card-title';
  title.textContent = item.title;

  const meaning = document.createElement('p');
  meaning.className = 'grammar-card-meaning';
  meaning.textContent = item.meaning;

  const cta = document.createElement('span');
  cta.className = 'grammar-card-cta';
  cta.innerHTML = 'Xem chi tiết <span aria-hidden="true">→</span>';

  card.append(meta, title, meaning);

  if (item.example || item.examples?.[0]?.japanese) {
    const ex = document.createElement('p');
    ex.className = 'grammar-card-example';
    ex.textContent = item.example || item.examples[0].japanese;
    card.append(ex);
  }

  card.append(cta);

  // Admin controls — chỉ hiện sau khi auth verify xong
  const adminRow = document.createElement('div');
  adminRow.className = 'grammar-admin-row';
  adminRow.hidden = true;
  const editBtn = document.createElement('button');
  editBtn.type = 'button'; editBtn.className = 'button button-secondary'; editBtn.textContent = 'Sửa';
  editBtn.addEventListener('click', ev => { ev.stopPropagation(); showAdminDialog(item); });
  const delBtn = document.createElement('button');
  delBtn.type = 'button'; delBtn.className = 'button button-secondary'; delBtn.textContent = 'Xóa';
  delBtn.addEventListener('click', ev => { ev.stopPropagation(); deleteItem(item.id); });
  adminRow.append(editBtn, delBtn);
  card.append(adminRow);
  if (typeof onAuthReady === 'function') {
    onAuthReady(function (isAdminVerified) { adminRow.hidden = !isAdminVerified; });
  }

  card.addEventListener('click', () => openDetail(item));
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(item); } });
  return card;
}

function getFiltered() {
  return allGrammar.filter(item => {
    if (activeLevel !== 'all' && item.level !== activeLevel) return false;
    if (!currentQuery) return true;
    return [item.title, item.form, item.meaning, item.example].some(f => norm(f).includes(currentQuery));
  });
}

function renderPage() {
  const filtered  = getFiltered();
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage     = Math.min(currentPage, pageCount);
  const start     = (currentPage - 1) * PAGE_SIZE;
  const slice     = filtered.slice(start, start + PAGE_SIZE);

  const frag = document.createDocumentFragment();
  slice.forEach(item => frag.append(createCard(item)));
  grammarGrid.replaceChildren(frag);

  const from = filtered.length ? start + 1 : 0;
  const to   = Math.min(start + PAGE_SIZE, filtered.length);
  gridCountEl.textContent = `${from}–${to} / ${filtered.length} mẫu`;
  emptyStateEl.hidden     = filtered.length > 0;

  paginationEl.hidden     = pageCount <= 1;
  pageStatusEl.textContent= `Trang ${currentPage} / ${pageCount}`;
  prevPageBtn.disabled    = currentPage <= 1;
  nextPageBtn.disabled    = currentPage >= pageCount;
}

// ─── Detail dialog ────────────────────────────────────────────────────────────
function openDetail(item) {
  currentItem = item;
  window.speechSynthesis?.cancel();
  dTtsBtn.classList.remove('is-speaking');
  dTtsWave.classList.remove('is-active');

  // Reset the previous lesson's media before opening another item.
  dVideoWrap.hidden = true;
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  videoPlayer.load();
  videoErrorMessage.hidden = true;
  if (!dVideoBox.contains(dVideoPlaceholder)) dVideoBox.replaceChildren(dVideoPlaceholder);
  dVideoControls.hidden = true;

  // Header
  dBadges.replaceChildren(badgeEl(item.level));
  dTitle.textContent     = item.title;
  dStructure.textContent = item.form || item.structure || '';
  dMeaning.textContent   = item.meaning;

  // Examples
  dExamplesList.replaceChildren();
  const examples = item.examples?.length ? item.examples : (item.example ? [{ japanese: item.example }] : []);
  examples.forEach(ex => {
    const wrap = document.createElement('div');
    wrap.className = 'grammar-example-item';

    const jp = document.createElement('p');
    jp.className = 'example-japanese';
    jp.textContent = ex.japanese || ex.japanese_text || '';
    wrap.append(jp);

    if (ex.reading) {
      const rd = document.createElement('p');
      rd.className = 'example-reading';
      rd.textContent = ex.reading;
      wrap.append(rd);
    }
    if (ex.vi) {
      const vt = document.createElement('p');
      vt.className = 'example-vi';
      vt.textContent = ex.vi;
      wrap.append(vt);
    }
    if (ex.en) {
      const en = document.createElement('p');
      en.className = 'example-en';
      en.textContent = ex.en;
      wrap.append(en);
    }

    // Per-example TTS
    const ttsBtn = document.createElement('button');
    ttsBtn.type = 'button';
    ttsBtn.className = 'example-tts-btn';
    ttsBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor"/>
      <path d="M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg> Nghe`;
    ttsBtn.addEventListener('click', () => speak(jp.textContent, 'ja-JP'));
    wrap.append(ttsBtn);

    dExamplesList.append(wrap);
  });

  // Video
  const videoUrl = item.videoUrl || item.video_url || '';
  dVideoToggle.disabled = !videoUrl;
  if (videoUrl) {
    dVideoPlaceholder.hidden = true;
    dVideoToggle.textContent = 'Xem video';
    dVideoSection.hidden = false;
  } else {
    dVideoPlaceholder.hidden = false;
    dVideoPlaceholder.querySelector('p').textContent = 'Quản trị viên chưa thêm video cho mẫu ngữ pháp này.';
    dVideoToggle.textContent = 'Chưa có video';
    dVideoSection.hidden = false;
  }

  dialog.showModal();
}

dVideoToggle?.addEventListener('click', () => {
  if (!currentItem) return;
  const videoUrl = currentItem.videoUrl || currentItem.video_url || '';
  if (!videoUrl) return;
  if (dVideoWrap.hidden) {
    dVideoWrap.hidden = false;
    dVideoToggle.textContent = 'Ẩn video';
    const resolvedVideoUrl = resolveLearningMediaUrl(videoUrl);
    if (videoPlayer.src !== resolvedVideoUrl) {
      videoPlayer.src = resolvedVideoUrl;
      videoPlayer.load();
    }
    videoErrorMessage.hidden = true;
    dVideoBox.replaceChildren(videoPlayer, videoErrorMessage);
    dVideoControls.hidden = false;
    updateVideoControls();
  } else {
    dVideoWrap.hidden = true;
    dVideoToggle.textContent = 'Xem video';
    videoPlayer.pause();
  }
});

function closeDialog() {
  window.speechSynthesis?.cancel();
  videoPlayer.pause();
  dVideoWrap.hidden = true;
  dialog.close();
}
closeBtn?.addEventListener('click', closeDialog);
closeFooterBtn?.addEventListener('click', closeDialog);
dialog?.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });
dialog?.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeDialog(); } });

// ─── Level buttons ────────────────────────────────────────────────────────────
levelButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    activeLevel = btn.dataset.level;
    levelButtons.forEach(b => { b.classList.toggle('is-current', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
    currentPage = 1;
    renderPage();
  });
});

searchInput?.addEventListener('input', () => {
  currentQuery = norm(searchInput.value.trim());
  currentPage  = 1;
  renderPage();
});

searchForm?.addEventListener('submit', e => { e.preventDefault(); currentQuery = norm(searchInput.value.trim()); currentPage = 1; renderPage(); });

clearBtn?.addEventListener('click', () => {
  searchInput.value = '';
  currentQuery = '';
  activeLevel  = 'all';
  currentPage  = 1;
  levelButtons.forEach(b => { b.classList.toggle('is-current', b.dataset.level === 'all'); b.setAttribute('aria-pressed', String(b.dataset.level === 'all')); });
  renderPage();
  searchInput.focus();
});

prevPageBtn?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
nextPageBtn?.addEventListener('click', () => { currentPage++; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
retryBtn?.addEventListener('click', loadGrammar);

// ─── Admin dialog ─────────────────────────────────────────────────────────────
function showAdminDialog(item) {
  const d = document.createElement('dialog');
  d.className = 'learning-dialog';
  d.innerHTML = `
    <form method="dialog" class="learning-dialog-body grammar-admin-form">
      <h3>${item ? 'Sửa ngữ pháp' : 'Thêm ngữ pháp'}</h3>
      <label>Tiêu đề<input name="title" required maxlength="255"></label>
      <label>Cấp độ<select name="level">${['N5','N4','N3','N2','N1'].map(level => `<option>${level}</option>`).join('')}</select></label>
      <label>Cấu trúc<input name="form" maxlength="255"></label>
      <label>Ý nghĩa<textarea name="meaning" required maxlength="1000"></textarea></label>
      <label>Video ngữ pháp (MP4/WebM)<input name="videoFile" type="file" accept="video/mp4,video/webm">
        <small>Chọn tệp video trên máy tính (tối đa 500 MB).</small>
      </label>
      ${item?.videoUrl ? '<label><input name="clearVideo" type="checkbox"> Gỡ video hiện tại</label>' : ''}
      <progress data-video-upload-progress max="100" value="0" hidden></progress>
      <p data-video-upload-status role="status" aria-live="polite"></p>
      <label>Ví dụ tiếng Nhật<textarea name="example"></textarea></label>
      <p class="learning-load-error" data-admin-error hidden></p>
      <div class="learning-dialog-actions">
        <button type="button" class="button button-secondary" data-close>Hủy</button>
        <button type="submit" class="button button-primary">Lưu</button>
      </div>
    </form>`;
  const form = d.querySelector('form');
  form.elements.title.value = item?.title || '';
  form.elements.level.value = item?.level || 'N5';
  form.elements.form.value = item?.form || '';
  form.elements.meaning.value = item?.meaning || '';
  form.elements.example.value = item?.example || item?.examples?.[0]?.japanese || '';
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const example = form.elements.example.value.trim();
    const payload = {
      title: form.elements.title.value.trim(),
      level: form.elements.level.value,
      form: form.elements.form.value.trim(),
      meaning: form.elements.meaning.value.trim(),
    };
    if (!item && example) payload.examples = [{ japanese: example }];
    const submitButton = form.querySelector('[type="submit"]');
    const progress = form.querySelector('[data-video-upload-progress]');
    const uploadStatus = form.querySelector('[data-video-upload-status]');
    submitButton.disabled = true;
    try {
      let videoUrl = item?.videoUrl || '';
      const videoFile = form.elements.videoFile.files[0];
      if (form.elements.clearVideo?.checked) videoUrl = '';
      if (videoFile) {
        progress.hidden = false;
        uploadStatus.textContent = 'Đang tải video lên... 0%';
        videoUrl = await uploadLearningVideo(videoFile, percent => {
          progress.value = percent;
          uploadStatus.textContent = `Đang tải video lên... ${percent}%`;
        });
      }
      payload.videoUrl = videoUrl;
      await apiRequest(item ? `/grammar/${encodeURIComponent(item.id)}` : '/grammar', {
        method: item ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      d.close();
      await loadGrammar();
    } catch (error) {
      d.querySelector('[data-admin-error]').textContent = error.message;
      d.querySelector('[data-admin-error]').hidden = false;
    } finally {
      submitButton.disabled = false;
      progress.hidden = true;
    }
  });
  document.body.append(d); d.showModal();
  d.addEventListener('close', () => d.remove(), { once: true });
}

async function deleteItem(id) {
  if (!confirm('Xóa ngữ pháp này?')) return;
  try {
    await apiRequest(`/grammar/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadGrammar();
  } catch (error) {
    window.alert(`Không thể xóa ngữ pháp: ${error.message}`);
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────
async function loadGrammar() {
  loadErrorEl.hidden = true;
  gridCountEl.textContent = 'Đang tải…';

  try {
    const first = await apiRequest('/grammar?page=1&limit=100');
    allGrammar = first.data || [];
    for (let page = 2; allGrammar.length < first.total; page++) {
      const next = await apiRequest(`/grammar?page=${page}&limit=100`);
      allGrammar.push(...(next.data || []));
      if (!next.data?.length) break;
    }
  } catch (error) {
    allGrammar = [];
    loadErrorEl.hidden = false;
    loadErrorEl.firstChild.textContent = `Không thể tải dữ liệu ngữ pháp: ${error.message} `;
  }
  totalCountEl.textContent = allGrammar.length;

  if (typeof onAuthReady === 'function') {
    onAuthReady(function (isAdminVerified) {
      if (!isAdminVerified) return;
      const toolbar = document.querySelector('.learning-toolbar');
      if (toolbar && !toolbar.querySelector('.btn-add-grammar')) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button'; addBtn.className = 'button button-primary btn-add-grammar';
        addBtn.textContent = '+ Thêm ngữ pháp';
        addBtn.addEventListener('click', () => showAdminDialog(null));
        toolbar.append(addBtn);
      }
    });
  }

  renderPage();
  if (!allGrammar.length) { loadErrorEl.hidden = false; }
}

loadGrammar();
