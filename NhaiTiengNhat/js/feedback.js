const FEEDBACK_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);

async function feedbackRequest(path, options = {}) {
  const headers = { ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${FEEDBACK_API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({ message: 'Phản hồi không hợp lệ từ máy chủ.' }));
  if (!response.ok) throw new Error(data.message || `Máy chủ trả về lỗi ${response.status}.`);
  return data;
}

document.addEventListener('DOMContentLoaded', async () => {
  const list = document.querySelector('#feedback-list');
  if (!list) return;
  const status = document.querySelector('#feedback-status');
  const form = document.querySelector('#feedback-form');
  const loginNote = document.querySelector('#feedback-login-note');
  const user = getCurrentUser();
  form.hidden = !user;
  loginNote.hidden = Boolean(user);

  async function loadApprovedReviews() {
    const { data } = await feedbackRequest('/feedback');
    const verifiedReviews = data.filter(review => review.verified);
    if (!verifiedReviews.length) {
      const empty = document.createElement('p');
      empty.className = 'feedback-empty';
      empty.textContent = 'Chưa có nhận xét học viên đã xác minh được duyệt. Khi có phản hồi thật, nội dung sẽ xuất hiện tại đây.';
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...verifiedReviews.map(review => {
      const card = document.createElement('article');
      card.className = 'feedback-card';
      const header = document.createElement('div');
      header.className = 'feedback-card-header';
      const name = document.createElement('strong');
      name.textContent = review.displayName;
      const rating = document.createElement('span');
      rating.className = 'feedback-rating';
      rating.setAttribute('aria-label', `${review.rating} trên 5 sao`);
      rating.textContent = `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;
      const content = document.createElement('p');
      content.textContent = review.message;
      const course = document.createElement('span');
      course.className = 'feedback-course';
      course.textContent = review.courseTitle;
      header.append(name, rating);
      card.append(header, content, course);
      return card;
    }));
  }

  if (user) {
    try {
      const { data: courses } = await feedbackRequest('/courses');
      const selector = form.elements.courseId;
      for (const course of courses) {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = course.title;
        selector.append(option);
      }
    } catch (error) {
      status.textContent = `Không tải được danh sách khóa học: ${error.message}`;
      status.classList.add('is-error');
    }
  }

  await loadApprovedReviews().catch(error => {
    status.textContent = `Không tải được nhận xét: ${error.message}`;
    status.classList.add('is-error');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const payload = {
      rating: Number(form.elements.rating.value),
      message: form.elements.message.value.trim(),
      courseId: form.elements.courseId.value || null,
    };
    submit.disabled = true;
    status.textContent = 'Đang gửi nhận xét…';
    status.classList.remove('is-error');
    try {
      const result = await feedbackRequest('/feedback', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      status.textContent = result.message;
      form.reset();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('is-error');
    } finally {
      submit.disabled = false;
    }
  });

  const moderationPanel = document.querySelector('#feedback-moderation-panel');
  if (user?.role === 'admin' && moderationPanel) {
    const moderationList = document.querySelector('#feedback-moderation-list');
    const moderationStatus = document.querySelector('#feedback-moderation-status');
    moderationPanel.hidden = false;

    async function loadModerationQueue() {
      const { data } = await feedbackRequest('/feedback/moderation');
      if (!data.length) {
        const empty = document.createElement('p');
        empty.className = 'feedback-empty';
        empty.textContent = 'Không có nhận xét nào đang chờ duyệt.';
        moderationList.replaceChildren(empty);
        return;
      }
      moderationList.replaceChildren(...data.map(review => {
        const card = document.createElement('article');
        card.className = 'feedback-moderation-card';
        const author = document.createElement('strong');
        author.textContent = review.full_name;
        const verify = document.createElement('span');
        verify.className = review.is_verified ? 'feedback-verification is-verified' : 'feedback-verification';
        verify.textContent = review.is_verified ? 'Đã xác minh hoạt động học' : 'Chưa xác minh hoạt động học';
        const message = document.createElement('p');
        message.textContent = review.message;
        const controls = document.createElement('div');
        controls.className = 'feedback-moderation-actions';
        const approve = document.createElement('button');
        approve.className = 'button button-primary';
        approve.type = 'button';
        approve.textContent = 'Duyệt';
        approve.disabled = !review.is_verified;
        approve.title = approve.disabled ? 'Chỉ duyệt nhận xét của học viên đã xác minh.' : '';
        const reject = document.createElement('button');
        reject.className = 'button button-secondary';
        reject.type = 'button';
        reject.textContent = 'Từ chối';
        async function moderate(approved) {
          approve.disabled = true;
          reject.disabled = true;
          try {
            const result = await feedbackRequest(`/feedback/${encodeURIComponent(review.id)}/moderation`, {
              method: 'PUT',
              body: JSON.stringify({ approved }),
            });
            moderationStatus.textContent = result.message;
            card.remove();
            await loadModerationQueue();
            if (approved) await loadApprovedReviews();
          } catch (error) {
            moderationStatus.textContent = error.message;
            moderationStatus.classList.add('is-error');
            approve.disabled = !review.is_verified;
            reject.disabled = false;
          }
        }
        approve.addEventListener('click', () => moderate(true));
        reject.addEventListener('click', () => moderate(false));
        controls.append(approve, reject);
        card.append(author, verify, message, controls);
        if (review.course_title) {
          const course = document.createElement('span');
          course.className = 'feedback-course';
          course.textContent = review.course_title;
          card.append(course);
        }
        return card;
      }));
    }

    loadModerationQueue().catch(error => {
      moderationStatus.textContent = `Không tải được hàng chờ duyệt: ${error.message}`;
      moderationStatus.classList.add('is-error');
    });
  }
}, { once: true });
