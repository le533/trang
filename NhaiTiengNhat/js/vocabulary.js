/**
 * vocabulary.js — Nihongo Learning
 * Loads from API, falls back to local JSON.
 * Features: TTS pronunciation, animated cards, detail dialog with examples.
 */

const VOCABULARY_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);
const PAGE_SIZE = 24;

const grid          = document.querySelector('#vocabulary-grid');
if (!grid) throw new Error('skip');

const totalCountEl  = document.querySelector('#vocabulary-total');
const gridCountEl   = document.querySelector('#vocabulary-grid-count');
const loadErrorEl   = document.querySelector('#vocabulary-load-error');
const emptyEl       = document.querySelector('#vocabulary-empty-state');
const searchForm    = document.querySelector('#vocabulary-search-form');
const searchInput   = document.querySelector('#vocabulary-search-input');
const levelButtons  = [...document.querySelectorAll('.vocabulary-level[data-level]')];
const typeFilter    = document.querySelector('#vocabulary-type-filter');
const clearBtn      = document.querySelector('#clear-vocabulary-filters');
const retryBtn      = document.querySelector('#retry-vocabulary-load');
const paginationEl  = document.querySelector('#vocabulary-pagination');
const prevPageBtn   = document.querySelector('#vocabulary-previous-page');
const nextPageBtn   = document.querySelector('#vocabulary-next-page');
const pageStatusEl  = document.querySelector('#vocabulary-page-status');

const dialog        = document.querySelector('#vocabulary-dialog');
const dWordEl       = document.querySelector('#vocab-dialog-title');
const dReadingEl    = document.querySelector('#vocab-dialog-reading');
const dRomajiEl     = document.querySelector('#vocab-dialog-romaji');
const dBadgesEl     = document.querySelector('#vocab-dialog-badges');
const dContentEl    = document.querySelector('#vocabulary-detail-content');
const ttsJpBtn      = document.querySelector('#vocab-tts-jp');
const ttsWaveEl     = document.querySelector('#vocab-tts-wave');
const closeBtn      = document.querySelector('#close-vocabulary-detail');
const closeFooterBtn= document.querySelector('#close-vocabulary-detail-footer');

let allWords    = [];
let activeLevel = 'all';
let activeType  = 'all';
let currentPage = 1;
let currentQuery= '';
let activeWord  = null;

function getVocabularyToken() {
  return localStorage.getItem('nihongo_token') || sessionStorage.getItem('nihongo_token');
}

async function vocabularyRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getVocabularyToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${VOCABULARY_API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({ message: 'Phản hồi không hợp lệ từ máy chủ.' }));
  if (!response.ok) throw new Error(data.message || `Máy chủ trả về lỗi ${response.status}.`);
  return data;
}

// ─── TTS ──────────────────────────────────────────────────────────────────────
function speak(text, lang = 'ja-JP') {
  if (!window.speechSynthesis) return null;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.82;
  window.speechSynthesis.speak(utter);
  return utter;
}

ttsJpBtn?.addEventListener('click', () => {
  if (!activeWord) return;
  ttsJpBtn.classList.add('is-speaking');
  ttsWaveEl.classList.add('is-active');
  const utter = speak(activeWord.word, 'ja-JP');
  if (!utter) return;
  utter.onend = () => {
    ttsJpBtn.classList.remove('is-speaking');
    ttsWaveEl.classList.remove('is-active');
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function badgeEl(level) {
  return el('span', `vocabulary-level-badge badge-${level}`, level);
}

function getMeanings(word, field) {
  const v = word[field];
  return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [];
}

function getTypeLabelStr(word) {
  return (word.part_of_speech || []).join(' · ');
}

function appendRubyText(container, text, furigana) {
  if (!furigana) { container.append(document.createTextNode(text)); return; }
  const pattern = /\{([^|{}]+)\|([^|{}]+)\}/g;
  let idx = 0, match;
  while ((match = pattern.exec(furigana)) !== null) {
    container.append(document.createTextNode(furigana.slice(idx, match.index)));
    const ruby = document.createElement('ruby');
    ruby.append(document.createTextNode(match[1]), el('rt', '', match[2]));
    container.append(ruby);
    idx = match.index + match[0].length;
  }
  container.append(document.createTextNode(furigana.slice(idx)));
}

// ─── Type filter population ───────────────────────────────────────────────────
function populateTypeFilter(words) {
  const existing = new Set([...typeFilter.options].map(o => o.value));
  const labels = [...new Set(words.flatMap(w => w.part_of_speech || []))].sort();
  labels.forEach(label => {
    if (!existing.has(label)) {
      const opt = document.createElement('option');
      opt.value = label; opt.textContent = label;
      typeFilter.appendChild(opt);
    }
  });
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function createCard(word) {
  const card = document.createElement('article');
  card.className = 'vocabulary-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${word.word}, ${word.reading}, ${word.level}`);

  const meta = document.createElement('div');
  meta.className = 'vocabulary-card-meta';
  meta.append(badgeEl(word.level));
  const typeStr = getTypeLabelStr(word);
  if (typeStr) meta.append(el('span', 'vocabulary-type-label', typeStr));

  const wordEl    = el('span', 'vocabulary-word', word.word);
  const readingEl = el('span', 'vocabulary-reading', word.reading);

  const meanVI = getMeanings(word, 'meaning_vi');
  const meanEN = getMeanings(word, 'meaning_en');
  const meaning = meanVI.length ? meanVI : meanEN;
  const meaningEl = el('span', 'vocabulary-meaning', meaning.join('; '));

  const detailEl = el('span', 'vocabulary-card-detail', 'Xem chi tiết →');

  card.append(meta, wordEl, readingEl, meaningEl);

  const firstEx = word.examples?.find(e => e.ja || e.japanese_text);
  if (firstEx) {
    const exEl = el('p', 'vocabulary-card-example', firstEx.ja || firstEx.japanese_text);
    card.append(exEl);
  }

  card.append(detailEl);

  // Admin controls — chỉ hiện sau khi auth verify xong
  const adminRow = el('div', 'vocabulary-admin-actions');
  adminRow.hidden = true;
  const editBtn = el('button', 'button button-secondary', 'Sửa');
  editBtn.type = 'button';
  editBtn.addEventListener('click', ev => { ev.stopPropagation(); showAdminDialog(word); });
  const delBtn = el('button', 'button button-secondary', 'Xóa');
  delBtn.type = 'button';
  delBtn.addEventListener('click', ev => { ev.stopPropagation(); deleteWord(word.id); });
  adminRow.append(editBtn, delBtn);
  card.append(adminRow);
  if (typeof onAuthReady === 'function') {
    onAuthReady(function (isAdminVerified) { adminRow.hidden = !isAdminVerified; });
  }

  card.addEventListener('click', () => openDetail(word));
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(word); } });
  return card;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function getFiltered() {
  return allWords.filter(w => {
    if (activeLevel !== 'all' && w.level !== activeLevel) return false;
    if (activeType  !== 'all' && !(w.part_of_speech || []).includes(activeType)) return false;
    if (!currentQuery) return true;
    const fields = [w.word, w.reading, w.romaji, ...getMeanings(w,'meaning_vi'), ...getMeanings(w,'meaning_en'), ...(w.other_forms||[])];
    return fields.some(f => norm(f).includes(currentQuery));
  });
}

function renderPage() {
  const filtered  = getFiltered();
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage     = Math.min(currentPage, pageCount);
  const start     = (currentPage - 1) * PAGE_SIZE;
  const slice     = filtered.slice(start, start + PAGE_SIZE);

  const frag = document.createDocumentFragment();
  slice.forEach(w => frag.append(createCard(w)));
  grid.replaceChildren(frag);

  const from = filtered.length ? start + 1 : 0;
  const to   = Math.min(start + PAGE_SIZE, filtered.length);
  gridCountEl.textContent = `${from}–${to} / ${filtered.length} từ`;
  emptyEl.hidden = filtered.length > 0;

  paginationEl.hidden      = pageCount <= 1;
  pageStatusEl.textContent = `Trang ${currentPage} / ${pageCount}`;
  prevPageBtn.disabled     = currentPage <= 1;
  nextPageBtn.disabled     = currentPage >= pageCount;
}

// ─── Detail dialog ────────────────────────────────────────────────────────────
function appendSection(title, content) {
  const sec = document.createElement('section');
  sec.className = 'vocabulary-detail-section';
  sec.append(el('h3', '', title), content);
  dContentEl.append(sec);
}

function openDetail(word) {
  activeWord = word;
  window.speechSynthesis?.cancel();
  ttsJpBtn.classList.remove('is-speaking');
  ttsWaveEl.classList.remove('is-active');

  dWordEl.textContent    = word.word;
  dReadingEl.textContent = word.reading;
  dRomajiEl.textContent  = word.romaji ? `(${word.romaji})` : '';
  dBadgesEl.replaceChildren(badgeEl(word.level));
  if (word.part_of_speech?.length) {
    const pos = el('span', 'vocabulary-detail-pos', word.part_of_speech.join(' · '));
    dBadgesEl.append(pos);
  }

  dContentEl.replaceChildren();

  // Vietnamese meanings
  const vi = getMeanings(word, 'meaning_vi');
  if (vi.length) {
    const ul = document.createElement('ul');
    ul.className = 'vocabulary-meaning-list';
    vi.forEach(m => ul.append(el('li', '', m)));
    appendSection('Nghĩa tiếng Việt', ul);
  } else {
    appendSection('Nghĩa tiếng Việt', el('p', 'vocabulary-translation-note', 'Chưa có nghĩa tiếng Việt cho từ này.'));
  }

  // English meanings
  const en = getMeanings(word, 'meaning_en');
  if (en.length) {
    const ul = document.createElement('ul');
    ul.className = 'vocabulary-meaning-list';
    en.forEach(m => ul.append(el('li', '', m)));
    appendSection('Nghĩa tiếng Anh', ul);
  }

  // Other forms
  const forms = [...(word.other_forms||[]), ...(word.other_readings||[])].filter(Boolean);
  if (forms.length) {
    appendSection('Dạng khác / cách đọc khác', el('p', 'vocabulary-detail-forms', forms.join(' · ')));
  }

  // Examples
  const examples = Array.isArray(word.examples) ? word.examples : [];
  if (examples.length) {
    const exList = el('div', 'vocabulary-example-list');
    examples.forEach(ex => {
      if (!ex.ja && !ex.japanese_text) return;
      const item   = el('div', 'vocabulary-example-item');
      const jpText = ex.ja || ex.japanese_text;
      const jp = document.createElement('p');
      jp.className = 'vocabulary-example-japanese';
      appendRubyText(jp, jpText, ex.furigana);
      item.append(jp);
      if (ex.vi || ex.meaning_vi) item.append(el('p', 'vocabulary-example-vietnamese', ex.vi || ex.meaning_vi));
      if (ex.en || ex.meaning_en) item.append(el('p', 'vocabulary-example-english',    ex.en || ex.meaning_en));

      const ttsEx = document.createElement('button');
      ttsEx.type = 'button'; ttsEx.className = 'example-tts-btn';
      ttsEx.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor"/>
        <path d="M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg> Nghe`;
      ttsEx.addEventListener('click', () => speak(jpText, 'ja-JP'));
      item.append(ttsEx);
      exList.append(item);
    });
    if (exList.childElementCount) appendSection('Ví dụ', exList);
  }

  dialog.showModal();
}

function closeDialog() {
  window.speechSynthesis?.cancel();
  dialog.close();
}

closeBtn?.addEventListener('click', closeDialog);
closeFooterBtn?.addEventListener('click', closeDialog);
dialog?.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });
dialog?.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeDialog(); } });

// ─── Filters / search ─────────────────────────────────────────────────────────
levelButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    activeLevel = btn.dataset.level;
    levelButtons.forEach(b => { b.classList.toggle('is-current', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
    currentPage = 1; renderPage();
  });
});

typeFilter?.addEventListener('change', () => { activeType = typeFilter.value; currentPage = 1; renderPage(); });

searchInput?.addEventListener('input', () => { currentQuery = norm(searchInput.value.trim()); currentPage = 1; renderPage(); });
searchForm?.addEventListener('submit', e => { e.preventDefault(); currentQuery = norm(searchInput.value.trim()); currentPage = 1; renderPage(); });

clearBtn?.addEventListener('click', () => {
  searchInput.value = ''; currentQuery = ''; activeLevel = 'all'; activeType = 'all'; currentPage = 1;
  if (typeFilter) typeFilter.value = 'all';
  levelButtons.forEach(b => { b.classList.toggle('is-current', b.dataset.level === 'all'); b.setAttribute('aria-pressed', String(b.dataset.level === 'all')); });
  renderPage(); searchInput.focus();
});

prevPageBtn?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPage(); scrollTo({ top: 0, behavior: 'smooth' }); } });
nextPageBtn?.addEventListener('click', () => { currentPage++; renderPage(); scrollTo({ top: 0, behavior: 'smooth' }); });
retryBtn?.addEventListener('click', loadVocabulary);

// ─── Admin ────────────────────────────────────────────────────────────────────
function showAdminDialog(word) {
  const d = document.createElement('dialog');
  d.className = 'learning-dialog';
  d.innerHTML = `
  <form class="learning-dialog-body vocabulary-admin-form">
    <h2>${word ? 'Sửa từ vựng' : 'Thêm từ vựng'}</h2>
    <div class="lesson-admin-grid">
      <label>Từ<input name="word" maxlength="255" required></label>
      <label>Cách đọc<input name="reading" maxlength="255" required></label>
      <label>Romaji<input name="romaji" maxlength="255"></label>
      <label>Cấp độ<select name="level">${['N5','N4','N3','N2','N1'].map(level => `<option>${level}</option>`).join('')}</select></label>
      <label class="lesson-admin-wide">Nghĩa tiếng Việt (mỗi dòng một nghĩa)<textarea name="meaning_vi"></textarea></label>
      <label class="lesson-admin-wide">Nghĩa tiếng Anh (mỗi dòng một nghĩa)<textarea name="meaning_en"></textarea></label>
    </div>
    <p class="learning-load-error" data-admin-error role="alert" hidden></p>
    <div class="learning-dialog-actions">
      <button type="button" class="button button-secondary" data-close>Hủy</button>
      <button type="submit" class="button button-primary">Lưu</button>
    </div>
  </form>`;
  const form = d.querySelector('form');
  form.elements.word.value = word?.word || '';
  form.elements.reading.value = word?.reading || '';
  form.elements.romaji.value = word?.romaji || '';
  form.elements.level.value = word?.level || 'N5';
  form.elements.meaning_vi.value = (word?.meaning_vi || []).join('\n');
  form.elements.meaning_en.value = (word?.meaning_en || []).join('\n');
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const payload = {
      word: form.elements.word.value.trim(),
      reading: form.elements.reading.value.trim(),
      romaji: form.elements.romaji.value.trim(),
      level: form.elements.level.value,
      meaning_vi: form.elements.meaning_vi.value.split('\n').map(value => value.trim()).filter(Boolean),
      meaning_en: form.elements.meaning_en.value.split('\n').map(value => value.trim()).filter(Boolean),
      part_of_speech: word?.part_of_speech || [], examples: word?.examples || [],
    };
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await vocabularyRequest(word ? `/vocabulary/${encodeURIComponent(word.id)}` : '/vocabulary', {
        method: word ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      d.close();
      await loadVocabulary();
    } catch (error) {
      d.querySelector('[data-admin-error]').textContent = error.message;
      d.querySelector('[data-admin-error]').hidden = false;
    } finally {
      button.disabled = false;
    }
  });
  document.body.append(d); d.showModal();
  d.addEventListener('close', () => d.remove(), { once: true });
}

async function deleteWord(id) {
  if (!confirm('Xóa từ vựng này?')) return;
  try {
    await vocabularyRequest(`/vocabulary/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadVocabulary();
  } catch (error) {
    window.alert(`Không thể xóa từ vựng: ${error.message}`);
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────
async function loadVocabulary() {
  loadErrorEl.hidden = true;
  gridCountEl.textContent = 'Đang tải…';

  try {
    const first = await vocabularyRequest('/vocabulary?page=1&limit=100');
    allWords = first.data || [];
    for (let page = 2; allWords.length < first.total; page++) {
      const next = await vocabularyRequest(`/vocabulary?page=${page}&limit=100`);
      allWords.push(...(next.data || []));
      if (!next.data?.length) break;
    }
  } catch (error) {
    allWords = [];
    loadErrorEl.hidden = false;
    loadErrorEl.firstChild.textContent = `Không thể tải dữ liệu từ vựng: ${error.message} `;
  }
  totalCountEl.textContent = allWords.length;

  if (typeof onAuthReady === 'function') {
    onAuthReady(function (isAdminVerified) {
      if (!isAdminVerified) return;
      const toolbar = document.querySelector('.vocabulary-toolbar');
      if (toolbar && !toolbar.querySelector('.btn-add-vocab')) {
        const addBtn  = document.createElement('button');
        addBtn.type   = 'button';
        addBtn.className = 'button button-primary btn-add-vocab';
        addBtn.textContent = '+ Thêm từ vựng';
        addBtn.addEventListener('click', () => showAdminDialog(null));
        toolbar.append(addBtn);
      }
    });
  }

  populateTypeFilter(allWords);
  renderPage();
  if (!allWords.length && loadErrorEl.hidden) loadErrorEl.hidden = false;
}

loadVocabulary();
