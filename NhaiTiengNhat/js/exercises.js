const EXERCISES_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);
const exercisesGrid = document.querySelector('#exercises-grid');

if (exercisesGrid) {
  const totalCount = document.querySelector('#exercises-total');
  const gridCount = document.querySelector('#exercises-grid-count');
  const loadError = document.querySelector('#exercises-load-error');
  const emptyState = document.querySelector('#exercises-empty-state');
  const searchForm = document.querySelector('#exercises-search-form');
  const searchInput = document.querySelector('#exercises-search-input');
  const levelButtons = [...document.querySelectorAll('[data-level]')];
  const addButton = document.querySelector('#add-exercise-button');
  const dialog = document.querySelector('#exercises-dialog');
  const detailContent = document.querySelector('#exercises-detail-content');
  const closeButton = document.querySelector('#close-exercises-detail');
  let allExercises = [];
  let activeLevel = 'all';

  function getToken() {
    return localStorage.getItem('nihongo_token') || sessionStorage.getItem('nihongo_token');
  }

  async function apiRequest(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${EXERCISES_API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({ message: 'Phản hồi không hợp lệ từ máy chủ.' }));
    if (!response.ok) throw new Error(data.message || `Máy chủ trả về lỗi ${response.status}.`);
    return data;
  }

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function normalize(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi');
  }

  function setLevelButtons() {
    levelButtons.forEach(button => {
      const selected = button.dataset.level === activeLevel;
      button.classList.toggle('is-current', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function updateAdminButton() {
    if (addButton) addButton.hidden = true;
    if (typeof onAuthReady === 'function') {
      onAuthReady(function (isAdminVerified) {
        if (addButton) addButton.hidden = !isAdminVerified;
      });
    }
  }

  function createExerciseAdminDialog() {
    const adminDialog = document.createElement('dialog');
    adminDialog.className = 'learning-dialog';
    adminDialog.innerHTML = `
      <form class="learning-dialog-body exercise-admin-form">
        <h2>Tạo bài tập</h2>
        <div class="lesson-admin-grid">
          <label>Tên bài tập<input name="title" maxlength="255" required></label>
          <label>Cấp độ<select name="level">${['N5','N4','N3','N2','N1'].map(level => `<option>${level}</option>`).join('')}</select></label>
          <label>Chủ đề<input name="topic" maxlength="255"></label>
          <label class="lesson-admin-wide">Mô tả<textarea name="description" required></textarea></label>
          <label class="lesson-admin-wide">Câu hỏi (JSON)
            <textarea name="questions" rows="11" required spellcheck="false"></textarea>
          </label>
        </div>
        <p class="exercise-json-help">Ví dụ: [{"text":"日本 có nghĩa là gì?","type":"multiple_choice","explanation":"日本 là Nhật Bản.","choices":[{"text":"Nhật Bản","isCorrect":true},{"text":"Việt Nam","isCorrect":false}]}]</p>
        <p class="learning-load-error" data-admin-error role="alert" hidden></p>
        <div class="learning-dialog-actions">
          <button type="button" class="button button-secondary" data-cancel>Hủy</button>
          <button type="submit" class="button button-primary">Tạo bài tập</button>
        </div>
      </form>`;
    const form = adminDialog.querySelector('form');
    form.elements.questions.value = JSON.stringify([{
      text: '',
      type: 'multiple_choice',
      explanation: '',
      choices: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }],
    }], null, 2);
    adminDialog.querySelector('[data-cancel]').addEventListener('click', () => adminDialog.close());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      let questions;
      try {
        questions = JSON.parse(form.elements.questions.value);
      } catch {
        adminDialog.querySelector('[data-admin-error]').textContent = 'JSON câu hỏi chưa đúng định dạng.';
        adminDialog.querySelector('[data-admin-error]').hidden = false;
        return;
      }
      const payload = {
        title: form.elements.title.value.trim(),
        level: form.elements.level.value,
        topic: form.elements.topic.value.trim(),
        description: form.elements.description.value.trim(),
        questions,
      };
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await apiRequest('/exercises', { method: 'POST', body: JSON.stringify(payload) });
        adminDialog.close();
        await loadExercises();
      } catch (error) {
        const errorElement = adminDialog.querySelector('[data-admin-error]');
        errorElement.textContent = error.message;
        errorElement.hidden = false;
      } finally {
        submit.disabled = false;
      }
    });
    document.body.append(adminDialog);
    adminDialog.showModal();
    adminDialog.addEventListener('close', () => adminDialog.remove(), { once: true });
  }

  async function deleteExercise(item) {
    if (!window.confirm(`Xóa bài tập “${item.title}”?`)) return;
    try {
      await apiRequest(`/exercises/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      await loadExercises();
    } catch (error) {
      window.alert(`Không thể xóa bài tập: ${error.message}`);
    }
  }

  function createCard(item) {
    const card = el('article', 'learning-card exercise-card');
    const meta = el('div', 'learning-card-meta');
    meta.append(
      el('span', 'learning-level-badge', item.level),
      el('span', '', `${item.questionCount || 0} câu`),
    );
    card.append(
      meta,
      el('h3', 'learning-card-title', item.title),
      el('p', 'learning-card-subtitle', item.topic || 'Luyện tập'),
      el('p', 'learning-card-summary', item.description),
    );
    if (item.bestScore !== null && item.bestScore !== undefined) {
      card.append(el('span', 'exercise-best-score', `Điểm cao nhất ${item.bestScore}% · ${item.attemptCount} lần làm`));
    }
    const start = el('button', 'learning-card-detail lesson-open-button', 'Bắt đầu luyện tập →');
    start.type = 'button';
    start.addEventListener('click', () => openExercise(item));
    card.append(start);

    if (typeof isAdmin === 'function' && isAdmin()) {
      const actions = el('div', 'learning-admin-actions');
      actions.hidden = true;
      const remove = el('button', 'button button-secondary', 'Xóa');
      remove.type = 'button';
      remove.addEventListener('click', () => deleteExercise(item));
      actions.append(remove);
      card.append(actions);
      if (typeof onAuthReady === 'function') {
        onAuthReady(function (isAdminVerified) { actions.hidden = !isAdminVerified; });
      }
    }
    return card;
  }

  function renderExercises() {
    const query = normalize(searchInput.value.trim());
    const filtered = allExercises.filter(item => {
      if (activeLevel !== 'all' && item.level !== activeLevel) return false;
      return !query || [item.title, item.topic, item.description].some(value => normalize(value).includes(query));
    });
    exercisesGrid.replaceChildren(...filtered.map(createCard));
    totalCount.textContent = String(allExercises.length);
    gridCount.textContent = `${filtered.length} / ${allExercises.length} bài tập`;
    emptyState.hidden = filtered.length !== 0;
  }

  async function loadAttempts(exerciseId, parent) {
    const history = el('section', 'exercise-attempt-history');
    history.append(el('h3', '', 'Lịch sử làm bài'));
    parent.append(history);
    if (!getToken()) {
      history.append(el('p', '', 'Đăng nhập để lưu và xem lịch sử làm bài.'));
      return;
    }
    try {
      const response = await apiRequest(`/exercises/${encodeURIComponent(exerciseId)}/attempts`);
      if (!response.data?.length) {
        history.append(el('p', '', 'Bạn chưa có lần làm bài nào.'));
        return;
      }
      response.data.forEach(attempt => {
        history.append(el('p', 'exercise-history-item',
          `Lần ${attempt.attemptNumber}: ${attempt.score}% (${attempt.correctCount}/${attempt.totalQuestions} câu)`));
      });
    } catch (error) {
      history.append(el('p', 'learning-load-error', `Không tải được lịch sử: ${error.message}`));
    }
  }

  async function submitQuiz(exercise, questionList, form, resultRegion, submitButton) {
    const answers = questionList.map(question => {
      const selected = form.querySelector(`[data-question-id="${question.id}"]:checked`);
      const shortAnswer = form.querySelector(`[data-answer-id="${question.id}"]`);
      return {
        questionId: question.id,
        ...(selected ? { choiceId: selected.value } : {}),
        ...(shortAnswer ? { answerText: shortAnswer.value.trim() } : {}),
      };
    });
    submitButton.disabled = true;
    resultRegion.replaceChildren(el('p', '', 'Đang chấm bài...'));
    try {
      const result = await apiRequest(`/exercises/${encodeURIComponent(exercise.id)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      resultRegion.replaceChildren();
      const score = el('p', 'exercise-score', `Kết quả: ${result.score}% · ${result.correctCount}/${result.totalQuestions} câu đúng`);
      resultRegion.append(score);
      result.results.forEach((answer, index) => {
        const item = el('article', `exercise-answer-result ${answer.isCorrect ? 'is-correct' : 'is-incorrect'}`);
        item.append(
          el('strong', '', `Câu ${index + 1}: ${answer.isCorrect ? 'Chính xác' : 'Chưa đúng'}`),
          el('p', '', answer.correctAnswer ? `Đáp án: ${answer.correctAnswer}` : ''),
        );
        if (answer.explanation) item.append(el('p', '', answer.explanation));
        resultRegion.append(item);
      });
      form.querySelectorAll('input').forEach(input => { input.disabled = true; });
      submitButton.hidden = true;
      await loadAttempts(exercise.id, resultRegion);
    } catch (error) {
      resultRegion.replaceChildren(el('p', 'learning-load-error', error.message));
      submitButton.disabled = false;
    }
  }

  async function openExercise(item) {
    detailContent.replaceChildren(el('p', '', 'Đang tải câu hỏi...'));
    dialog.showModal();
    try {
      const response = await apiRequest(`/exercises/${encodeURIComponent(item.id)}`);
      const exercise = response.data;
      detailContent.replaceChildren(
        el('h2', 'lesson-detail-title', exercise.title),
        el('p', 'lesson-detail-meta', `${exercise.level} · ${exercise.questionCount} câu · ${exercise.topic || 'Luyện tập'}`),
        el('p', 'lesson-detail-summary', exercise.description),
      );
      const form = document.createElement('form');
      form.className = 'exercise-quiz-form';
      const resultRegion = el('section', 'exercise-result-region');
      exercise.questions.forEach((question, index) => {
        const questionCard = el('fieldset', 'exercise-question');
        questionCard.append(el('legend', '', `${index + 1}. ${question.text}`));
        if (question.type === 'short_answer') {
          const input = document.createElement('input');
          input.type = 'text';
          input.autocomplete = 'off';
          input.dataset.answerId = question.id;
          input.setAttribute('aria-label', `Câu trả lời câu ${index + 1}`);
          questionCard.append(input);
        } else {
          question.choices.forEach(choice => {
            const label = el('label', 'exercise-choice');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = `question-${question.id}`;
            input.value = choice.id;
            input.dataset.questionId = question.id;
            label.append(input, document.createTextNode(choice.text));
            questionCard.append(label);
          });
        }
        form.append(questionCard);
      });
      const submitButton = el('button', 'button button-primary', 'Nộp bài');
      submitButton.type = 'submit';
      form.append(submitButton);
      form.addEventListener('submit', event => {
        event.preventDefault();
        submitQuiz(exercise, exercise.questions, form, resultRegion, submitButton);
      });
      detailContent.append(form, resultRegion);
      await loadAttempts(exercise.id, detailContent);
    } catch (error) {
      detailContent.replaceChildren(el('p', 'learning-load-error', `Không thể mở bài tập: ${error.message}`));
    }
  }

  async function loadExercises() {
    loadError.hidden = true;
    gridCount.textContent = 'Đang tải danh sách...';
    try {
      const first = await apiRequest('/exercises?page=1&limit=50');
      allExercises = first.data || [];
      for (let page = 2; allExercises.length < first.total; page++) {
        const next = await apiRequest(`/exercises?page=${page}&limit=50`);
        allExercises.push(...(next.data || []));
        if (!next.data?.length) break;
      }
      updateAdminButton();
      renderExercises();
    } catch (error) {
      allExercises = [];
      exercisesGrid.replaceChildren();
      totalCount.textContent = '0';
      gridCount.textContent = 'Không tải được dữ liệu';
      emptyState.hidden = true;
      loadError.hidden = false;
      loadError.querySelector('[data-load-error-message]').textContent = error.message;
    }
  }

  searchInput.addEventListener('input', renderExercises);
  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    renderExercises();
  });
  levelButtons.forEach(button => button.addEventListener('click', () => {
    activeLevel = button.dataset.level;
    setLevelButtons();
    renderExercises();
  }));
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  addButton?.addEventListener('click', createExerciseAdminDialog);
  document.querySelector('#retry-exercises-load')?.addEventListener('click', loadExercises);
  setLevelButtons();
  updateAdminButton();
  loadExercises();
}
