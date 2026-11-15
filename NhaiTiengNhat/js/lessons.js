const LESSONS_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);
const lessonsGrid = document.querySelector('#lessons-grid');

if (lessonsGrid) {
  const totalCount = document.querySelector('#lessons-total');
  const gridCount = document.querySelector('#lessons-grid-count');
  const loadError = document.querySelector('#lessons-load-error');
  const emptyState = document.querySelector('#lessons-empty-state');
  const searchForm = document.querySelector('#lessons-search-form');
  const searchInput = document.querySelector('#lessons-search-input');
  const levelButtons = [...document.querySelectorAll('[data-level]')];
  const adminAddButton = document.querySelector('#add-lesson-button');
  const detailDialog = document.querySelector('#lessons-dialog');
  const detailContent = document.querySelector('#lessons-detail-content');
  const closeDetailButton = document.querySelector('#close-lessons-detail');
  let allLessons = [];
  let activeLevel = 'all';
  let activeVideo = null;

  function getLessonsToken() {
    return localStorage.getItem('nihongo_token') || sessionStorage.getItem('nihongo_token');
  }

  async function apiRequest(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = getLessonsToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${LESSONS_API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({ message: 'Phản hồi không hợp lệ từ máy chủ.' }));
    if (!response.ok) throw new Error(data.message || `Máy chủ trả về lỗi ${response.status}.`);
    return data;
  }

  function textElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text || '';
    return element;
  }

  function setLevelButtons() {
    levelButtons.forEach(button => {
      const selected = button.dataset.level === activeLevel;
      button.classList.toggle('is-current', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  async function createLessonAdminDialog(item) {
    const dialog = document.createElement('dialog');
    dialog.className = 'learning-dialog';
    dialog.innerHTML = `
      <form class="learning-dialog-body lesson-admin-form">
        <h2>${item ? 'Cập nhật bài học' : 'Tạo bài học mới'}</h2>
        <div class="lesson-admin-grid">
          <label>Tiêu đề<input name="title" maxlength="255" required></label>
          <label>Cấp độ<select name="level">${['N5', 'N4', 'N3', 'N2', 'N1'].map(level => `<option>${level}</option>`).join('')}</select></label>
          <label class="lesson-admin-wide">Khóa học liên kết
            <select name="courseId"><option value="">Bài học miễn phí / chưa gán khóa học</option></select>
          </label>
          <label>Thời lượng<input name="duration" maxlength="80" placeholder="15 phút"></label>
          <label class="lesson-admin-wide">Video bài học (MP4/WebM)
            <input name="videoFile" type="file" accept="video/mp4,video/webm">
            <small>Chọn tệp video trên máy tính (tối đa 500 MB).</small>
          </label>
          ${item?.videoUrl ? '<label class="lesson-admin-wide"><input name="clearVideo" type="checkbox"> Gỡ video hiện tại</label>' : ''}
          <progress class="lesson-admin-wide" data-video-upload-progress max="100" value="0" hidden></progress>
          <p class="lesson-admin-wide" data-video-upload-status role="status" aria-live="polite"></p>
          <label class="lesson-admin-wide">Tóm tắt<textarea name="summary" required></textarea></label>
          <label class="lesson-admin-wide">Mục tiêu<textarea name="objectives"></textarea></label>
          <label class="lesson-admin-wide">Nội dung bài học<textarea name="content" rows="8"></textarea></label>
        </div>
        <p class="learning-load-error" data-admin-error role="alert" hidden></p>
        <div class="learning-dialog-actions">
          <button type="button" class="button button-secondary" data-cancel>Hủy</button>
          <button type="submit" class="button button-primary">Lưu bài học</button>
        </div>
      </form>`;

    const form = dialog.querySelector('form');
    for (const field of ['title', 'level', 'duration', 'summary', 'objectives', 'content']) {
      form.elements[field].value = item?.[field] || '';
    }
    try {
      const { data: courses } = await apiRequest('/courses');
      const courseSelector = form.elements.courseId;
      for (const course of courses) {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = `${course.title}${course.isFree ? ' · miễn phí' : ' · trả phí'}`;
        courseSelector.append(option);
      }
      courseSelector.value = item?.courseId || '';
    } catch (error) {
      const errorElement = dialog.querySelector('[data-admin-error]');
      errorElement.textContent = `Không tải được khóa học: ${error.message}`;
      errorElement.hidden = false;
      form.querySelector('[type="submit"]').disabled = true;
    }

    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      const progress = form.querySelector('[data-video-upload-progress]');
      const uploadStatus = form.querySelector('[data-video-upload-status]');
      submit.disabled = true;
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
        const payload = Object.fromEntries(
          ['title', 'level', 'duration', 'summary', 'objectives', 'content']
            .map(field => [field, form.elements[field].value.trim()])
        );
        payload.videoUrl = videoUrl;
        payload.courseId = form.elements.courseId.value || null;
        await apiRequest(item ? `/lessons/${encodeURIComponent(item.id)}` : '/lessons', {
          method: item ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        });
        dialog.close();
        await loadLessons();
      } catch (error) {
        const errorElement = dialog.querySelector('[data-admin-error]');
        errorElement.textContent = error.message;
        errorElement.hidden = false;
      } finally {
        submit.disabled = false;
        progress.hidden = true;
      }
    });

    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
  }

  async function deleteLesson(item) {
    if (!window.confirm(`Xóa bài học “${item.title}”?`)) return;
    try {
      await apiRequest(`/lessons/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      await loadLessons();
    } catch (error) {
      window.alert(`Không thể xóa bài học: ${error.message}`);
    }
  }

  function createLessonCard(item) {
    const card = document.createElement('article');
    card.className = 'learning-card lesson-card';

    const meta = document.createElement('div');
    meta.className = 'learning-card-meta';
    meta.append(
      textElement('span', 'learning-level-badge', item.level),
      textElement('span', 'lesson-duration', item.duration || 'Bài học'),
    );
    const title = textElement('h3', 'learning-card-title', item.title);
    const summary = textElement('p', 'learning-card-summary', item.summary);
    const status = textElement('span', 'lesson-progress-badge', {
      completed: 'Đã hoàn thành',
      in_progress: 'Đang học',
    }[item.progress] || 'Chưa bắt đầu');
    const detail = document.createElement('button');
    detail.type = 'button';
    detail.className = 'learning-card-detail lesson-open-button';
    detail.textContent = item.locked
      ? 'Mở khóa khóa học →'
      : item.videoUrl ? 'Mở bài học · có video →' : 'Mở bài học →';
    detail.addEventListener('click', () => {
      if (item.locked) {
        const trainingUrl = new URL('../training/index.html', window.location.href);
        trainingUrl.searchParams.set('level', item.level);
        window.location.assign(trainingUrl.href);
        return;
      }
      openLessonDetail(item);
    });
    card.append(meta, title, summary, status, detail);
    if (item.locked) {
      card.append(textElement('span', 'lesson-locked-badge', `Nội dung nâng cao · ${item.courseTitle || 'cần đăng ký khóa học'}`));
    }

    if (typeof isAdmin === 'function' && isAdmin()) {
      const actions = document.createElement('div');
      actions.className = 'learning-admin-actions';
      actions.dataset.adminOnly = 'true';
      actions.hidden = true;
      const edit = textElement('button', 'button button-secondary', 'Sửa');
      edit.type = 'button';
      edit.addEventListener('click', () => createLessonAdminDialog(item));
      const remove = textElement('button', 'button button-secondary', 'Xóa');
      remove.type = 'button';
      remove.addEventListener('click', () => deleteLesson(item));
      actions.append(edit, remove);
      card.append(actions);
      if (typeof onAuthReady === 'function') {
        onAuthReady(function (isAdminVerified) { actions.hidden = !isAdminVerified; });
      }
    }
    return card;
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
  }

  async function updateProgress(item, status, message) {
    const statusElement = detailContent.querySelector('[data-progress-message]');
    try {
      await apiRequest(`/lessons/${encodeURIComponent(item.id)}/progress`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      item.progress = status;
      statusElement.textContent = message;
      renderLessons();
    } catch (error) {
      statusElement.textContent = error.message;
    }
  }

  function openLessonDetail(item) {
    activeVideo?.pause();
    detailContent.replaceChildren();

    const heading = textElement('h2', 'lesson-detail-title', item.title);
    const metadata = textElement('p', 'lesson-detail-meta', `${item.level} · ${item.duration || 'Tự học theo tốc độ của bạn'}`);
    const summary = textElement('p', 'lesson-detail-summary', item.summary);
    detailContent.append(heading, metadata, summary);

    if (item.videoUrl) {
      const video = document.createElement('video');
      video.className = 'lesson-video';
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.src = resolveLearningMediaUrl(item.playbackUrl || item.videoUrl);
      video.setAttribute('aria-label', `Video bài học: ${item.title}`);
      activeVideo = video;

      const seekControls = document.createElement('div');
      seekControls.className = 'lesson-video-seek';
      for (const [label, offset] of [['↶ 10 giây', -10], ['10 giây ↷', 10]]) {
        const button = textElement('button', 'button button-secondary', label);
        button.type = 'button';
        button.setAttribute('aria-label', offset < 0 ? 'Tua lùi 10 giây' : 'Tua tới 10 giây');
        button.addEventListener('click', () => {
          if (Number.isFinite(video.duration)) {
            video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + offset));
          }
        });
        seekControls.append(button);
      }
      detailContent.append(video, seekControls);
    } else {
      detailContent.append(textElement('p', 'lesson-video-notice', 'Bài học này chưa được gắn video.'));
      activeVideo = null;
    }

    if (item.content) {
      const contentHeading = textElement('h3', 'lesson-content-heading', 'Nội dung bài học');
      const content = textElement('div', 'lesson-content-text', item.content);
      detailContent.append(contentHeading, content);
    }
    if (item.objectives) {
      detailContent.append(textElement('h3', 'lesson-content-heading', 'Mục tiêu'), textElement('p', '', item.objectives));
    }

    const progressActions = document.createElement('div');
    progressActions.className = 'lesson-progress-actions';
    const statusMessage = textElement('p', 'lesson-progress-message', '');
    statusMessage.dataset.progressMessage = '';
    const begin = textElement('button', 'button button-secondary', 'Đánh dấu đang học');
    begin.type = 'button';
    begin.addEventListener('click', () => updateProgress(item, 'in_progress', 'Đã lưu tiến độ: đang học.'));
    const complete = textElement('button', 'button button-primary', 'Hoàn thành bài học');
    complete.type = 'button';
    complete.addEventListener('click', () => updateProgress(item, 'completed', 'Chúc mừng! Bài học đã hoàn thành.'));
    progressActions.append(begin, complete, statusMessage);
    detailContent.append(progressActions);
    detailDialog.showModal();
  }

  function normalizeSearchText(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi');
  }

  function renderLessons() {
    const query = normalizeSearchText(searchInput.value.trim());
    const filtered = allLessons.filter(item => {
      if (activeLevel !== 'all' && item.level !== activeLevel) return false;
      return !query || [item.title, item.summary, item.objectives, item.duration]
        .some(value => normalizeSearchText(value).includes(query));
    });
    lessonsGrid.replaceChildren(...filtered.map(createLessonCard));
    totalCount.textContent = String(allLessons.length);
    gridCount.textContent = `${filtered.length} / ${allLessons.length} bài học`;
    emptyState.hidden = filtered.length !== 0;
  }

  async function loadLessons() {
    loadError.hidden = true;
    gridCount.textContent = 'Đang tải danh sách...';
    try {
      const first = await apiRequest('/lessons?page=1&limit=50');
      allLessons = first.data || [];
      for (let page = 2; allLessons.length < first.total; page++) {
        const next = await apiRequest(`/lessons?page=${page}&limit=50`);
        allLessons.push(...(next.data || []));
        if (!next.data?.length) break;
      }
      renderLessons();
    } catch (error) {
      allLessons = [];
      lessonsGrid.replaceChildren();
      totalCount.textContent = '0';
      gridCount.textContent = 'Không tải được dữ liệu';
      emptyState.hidden = true;
      loadError.hidden = false;
      loadError.querySelector('[data-load-error-message]').textContent = error.message;
    }
  }

  searchInput.addEventListener('input', renderLessons);
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    renderLessons();
  });
  levelButtons.forEach(button => button.addEventListener('click', () => {
    activeLevel = button.dataset.level;
    setLevelButtons();
    renderLessons();
  }));
  closeDetailButton.addEventListener('click', () => detailDialog.close());
  detailDialog.addEventListener('click', event => {
    if (event.target === detailDialog) detailDialog.close();
  });
  detailDialog.addEventListener('close', () => {
    activeVideo?.pause();
    activeVideo = null;
  });
  adminAddButton?.addEventListener('click', () => createLessonAdminDialog(null));
  document.querySelector('#retry-lessons-load')?.addEventListener('click', loadLessons);
  if (adminAddButton) adminAddButton.hidden = true;
  if (typeof onAuthReady === 'function') {
    onAuthReady(function (isAdminVerified) {
      if (adminAddButton) adminAddButton.hidden = !isAdminVerified;
    });
  }

  const requestedLevel = new URLSearchParams(window.location.search).get('level');
  if (['N5', 'N4', 'N3', 'N2', 'N1'].includes(requestedLevel)) activeLevel = requestedLevel;
  setLevelButtons();
  loadLessons();
}
