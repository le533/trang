const COURSE_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);
async function courseRequest(path, options = {}) {
  const headers = { ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${COURSE_API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({ message: 'Phản hồi không hợp lệ từ máy chủ.' }));
  if (!response.ok) throw new Error(data.message || `Máy chủ trả về lỗi ${response.status}.`);
  return data;
}

function renderCourseCard(course) {
  const card = document.createElement('article');
  card.className = `course-card${course.isFree ? ' is-free' : ''}`;
  const image = document.createElement('img');
  image.className = 'course-card-image';
  image.src = course.imageUrl || '../../assets/images/course-n5.jpg';
  image.alt = `Minh họa học tiếng Nhật cấp độ ${course.level}`;
  image.loading = 'lazy';
  image.decoding = 'async';
  const body = document.createElement('div');
  body.className = 'course-card-body';
  const badge = document.createElement('span');
  badge.className = 'learning-level-badge';
  badge.textContent = course.level;
  const title = document.createElement('h2');
  title.textContent = course.title;
  const description = document.createElement('p');
  description.textContent = course.description;
  const details = document.createElement('p');
  details.className = 'course-card-details';
  details.textContent = `${course.lessonCount} bài học · ${course.durationDays ? `${course.durationDays} ngày` : 'Truy cập không thời hạn'}`;
  const price = document.createElement('strong');
  price.className = 'course-price';
  price.textContent = course.isFree ? 'Miễn phí' : `${course.priceVnd.toLocaleString('vi-VN')} ₫`;
  const action = document.createElement('button');
  action.type = 'button';
  action.className = `button ${course.hasAccess ? 'button-secondary' : 'button-primary'}`;
  action.textContent = course.hasAccess ? 'Vào học' : 'Mua khóa học';
  action.addEventListener('click', async () => {
    if (course.hasAccess) {
      window.location.assign(`../lessons/index.html?level=${encodeURIComponent(course.level)}`);
      return;
    }
    if (!getToken()) {
      window.location.assign(`../auth/login.html?returnTo=${encodeURIComponent('../training/index.html')}`);
      return;
    }
    action.disabled = true;
    setCourseMessage('Đang khởi tạo đơn hàng…');
    try {
      const { orderRef, course: courseInfo, expiresAt } = await courseRequest('/payments/mock', {
        method: 'POST',
        body: JSON.stringify({ courseId: course.id }),
      });
      // Chuyển sang trang thanh toán giả lập với đầy đủ thông tin
      const url = new URL('../payment-mock.html', window.location.href);
      url.searchParams.set('order',    orderRef);
      url.searchParams.set('title',    courseInfo?.title    || course.title);
      url.searchParams.set('level',    courseInfo?.level    || course.level);
      url.searchParams.set('price',    String(courseInfo?.priceVnd ?? course.priceVnd));
      url.searchParams.set('duration', String(courseInfo?.durationDays ?? course.durationDays ?? ''));
      url.searchParams.set('expires',  expiresAt || '');
      window.location.assign(url.href);
    } catch (error) {
      setCourseMessage(error.message, 'error');
    } finally {
      action.disabled = false;
    }
  });
  body.append(badge, title, description, details, price, action);
  card.append(image, body);
  return card;
}

function setCourseMessage(message, type = '') {
  const region = document.querySelector('#courses-message');
  if (region) {
    region.textContent = message;
    region.className = `form-notice${type ? ` is-${type}` : ''}`;
  }
}

async function initCoursesPage() {
  try {
    const result = await courseRequest('/courses');
    const grid = document.querySelector('#course-grid');
    grid.replaceChildren(...result.data.map(renderCourseCard));
    const requestedLevel = new URLSearchParams(window.location.search).get('level');
    if (['N5', 'N4', 'N3', 'N2', 'N1'].includes(requestedLevel)) {
      const target = [...grid.children].find(card => card.querySelector('.learning-level-badge')?.textContent === requestedLevel);
      if (target) {
        target.classList.add('is-highlighted');
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        target.scrollIntoView({ behavior, block: 'center' });
        target.querySelector('button')?.focus({ preventScroll: true });
      }
    }
  } catch (error) {
    const region = document.querySelector('#courses-error');
    region.textContent = `Không thể tải khóa học: ${error.message}`;
    region.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', initCoursesPage, { once: true });
