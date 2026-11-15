const ADMIN_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);
const ADMIN_PAGE_SIZE = 50;

async function adminRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${ADMIN_API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({
    success: false,
    message: 'Phản hồi không hợp lệ từ máy chủ.',
  }));
  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function showAdminError(message) {
  let notice = document.querySelector('[data-admin-error]');
  if (!notice) {
    notice = document.createElement('p');
    notice.className = 'form-notice is-error';
    notice.dataset.adminError = '';
    notice.setAttribute('role', 'alert');
    document.querySelector('.admin-main')?.prepend(notice);
  }
  notice.textContent = message;
  notice.hidden = false;
}

function clearAdminError() {
  const notice = document.querySelector('[data-admin-error]');
  if (notice) {
    notice.textContent = '';
    notice.hidden = true;
  }
}

function createCell(value, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = value == null ? '' : String(value);
  return cell;
}

function setTableMessage(tableBody, message, columnCount) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = columnCount;
  cell.className = 'empty-state';
  cell.textContent = message;
  row.append(cell);
  tableBody.replaceChildren(row);
}

function formatRole(role) {
  return role === 'admin' ? 'Quản trị' : 'Người dùng';
}

function formatDate(value) {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa cập nhật' : date.toLocaleDateString('vi-VN');
}

function setStat(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = String(value);
}

async function renderOverview() {
  const tableBody = document.querySelector('#overview-progress-body');
  if (!tableBody) return;
  const { data } = await adminRequest('/admin/reports');
  setStat('[data-stat-total-users]', data.users.total);
  setStat('[data-stat-admin-users]', data.users.admins);
  setStat('[data-stat-avg-accuracy]', `${Number(data.learning.averageAccuracy).toFixed(1)}%`);
  setStat('[data-stat-active-users]', data.users.activeLearners);

  const rows = data.topUsers || [];
  if (!rows.length) {
    setTableMessage(tableBody, 'Chưa có dữ liệu tiến độ nào.', 5);
    return;
  }
  tableBody.replaceChildren(...rows.map((user) => {
    const row = document.createElement('tr');
    row.append(
      createCell(user.fullName || user.username),
      createCell(user.level || 'N5'),
      createCell(`${user.completedLessons || 0} bài`),
      createCell(`${Number(user.accuracy || 0).toFixed(1)}%`),
      createCell(`${user.streakDays || 0} ngày`),
    );
    return row;
  }));
}

function renderUserRow(user, currentUserId, onChange) {
  const row = document.createElement('tr');
  row.append(
    createCell(user.fullName || user.username),
    createCell(user.username),
    createCell(user.email),
  );

  const roleCell = document.createElement('td');
  const roleSelect = document.createElement('select');
  roleSelect.setAttribute('aria-label', `Vai trò của ${user.username}`);
  for (const [value, label] of [['user', 'Người dùng'], ['admin', 'Quản trị']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    roleSelect.append(option);
  }
  roleSelect.value = user.role;
  roleSelect.disabled = String(user.id) === String(currentUserId);
  roleSelect.addEventListener('change', async () => {
    const nextRole = roleSelect.value;
    roleSelect.disabled = true;
    try {
      await adminRequest(`/admin/users/${encodeURIComponent(user.id)}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: nextRole }),
      });
      user.role = nextRole;
      clearAdminError();
    } catch (error) {
      roleSelect.value = user.role;
      showAdminError(error.message);
    } finally {
      roleSelect.disabled = String(user.id) === String(currentUserId);
    }
  });
  roleCell.append(roleSelect);
  row.append(roleCell, createCell(formatDate(user.createdAt)));

  const statusCell = document.createElement('td');
  const statusButton = document.createElement('button');
  statusButton.type = 'button';
  statusButton.className = 'button button-secondary';
  statusButton.textContent = user.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt';
  statusButton.disabled = String(user.id) === String(currentUserId);
  statusButton.addEventListener('click', async () => {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    statusButton.disabled = true;
    try {
      await adminRequest(`/admin/users/${encodeURIComponent(user.id)}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      user.status = nextStatus;
      await onChange();
      clearAdminError();
    } catch (error) {
      showAdminError(error.message);
    } finally {
      statusButton.disabled = String(user.id) === String(currentUserId);
    }
  });
  statusCell.append(statusButton);
  row.append(statusCell);
  return row;
}

async function renderUsersTable() {
  const tableBody = document.querySelector('#admin-users-body');
  if (!tableBody) return;
  const searchInput = document.querySelector('#admin-user-search');
  const query = searchInput?.value.trim() || '';
  const params = new URLSearchParams({ limit: String(ADMIN_PAGE_SIZE) });
  if (query) params.set('search', query);
  const { data: users } = await adminRequest(`/admin/users?${params}`);
  const currentUserId = getCurrentUser()?.id;
  if (!users.length) {
    setTableMessage(tableBody, 'Không tìm thấy người dùng nào.', 6);
    return;
  }
  tableBody.replaceChildren(...users.map(user =>
    renderUserRow(user, currentUserId, renderUsersTable)
  ));
}

async function renderProgressTable() {
  const tableBody = document.querySelector('#admin-progress-body');
  if (!tableBody) return;
  const { data: users } = await adminRequest(`/admin/users?limit=${ADMIN_PAGE_SIZE}`);
  const sortedUsers = [...users].sort((a, b) =>
    Number(b.stats.completedLessons) - Number(a.stats.completedLessons)
  );
  if (!sortedUsers.length) {
    setTableMessage(tableBody, 'Chưa có dữ liệu tiến độ.', 7);
    return;
  }
  tableBody.replaceChildren(...sortedUsers.map((user) => {
    const row = document.createElement('tr');
    const lastActive = user.stats.lastActiveAt;
    const activityStatus = user.status !== 'active'
      ? 'Tài khoản vô hiệu hóa'
      : lastActive ? 'Đã học' : 'Chưa hoạt động';
    row.append(
      createCell(user.fullName || user.username),
      createCell(user.stats.level || 'N5'),
      createCell(`${user.stats.completedLessons || 0} bài`),
      createCell(`${Number(user.stats.accuracy || 0).toFixed(1)}%`),
      createCell(`${user.stats.streakDays || 0} ngày`),
      createCell(activityStatus),
      createCell(formatDate(lastActive)),
    );
    return row;
  }));
}

async function renderReports() {
  if (!document.querySelector('[data-report-total-lessons]')) return;
  const { data } = await adminRequest('/admin/reports');
  setStat('[data-report-total-lessons]', data.activity.completedLessons);
  setStat('[data-report-average-accuracy]', `${Number(data.learning.averageAccuracy).toFixed(1)}%`);
  setStat('[data-report-active-learners]', data.users.activeLearners);
}

async function renderFeedback() {
  const tableBody = document.querySelector('#admin-feedback-body');
  if (!tableBody) return;
  const { data: feedback } = await adminRequest('/feedback/moderation');
  if (!feedback.length) {
    setTableMessage(tableBody, 'Không có nhận xét nào đang chờ duyệt.', 5);
    return;
  }

  tableBody.replaceChildren(...feedback.map((item) => {
    const row = document.createElement('tr');
    row.append(
      createCell(item.full_name || `Học viên #${item.user_id}`),
      createCell(item.course_title || 'Nhận xét chung'),
      createCell(`${item.rating}/5`),
      createCell(item.message, 'feedback-message-cell'),
      createCell(formatDate(item.created_at)),
    );

    const actions = document.createElement('td');
    actions.className = 'feedback-actions';
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'button button-primary';
    approve.textContent = item.is_verified ? 'Duyệt' : 'Chưa xác minh';
    approve.disabled = !item.is_verified;
    approve.setAttribute('aria-label', `Duyệt nhận xét của ${item.full_name || 'học viên'}`);
    approve.addEventListener('click', () => moderateFeedback(item.id, true));

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'button button-secondary';
    reject.textContent = 'Từ chối';
    reject.setAttribute('aria-label', `Từ chối nhận xét của ${item.full_name || 'học viên'}`);
    reject.addEventListener('click', () => moderateFeedback(item.id, false));
    actions.append(approve, reject);
    row.append(actions);
    return row;
  }));
}

async function moderateFeedback(id, approved) {
  try {
    await adminRequest(`/feedback/${encodeURIComponent(id)}/moderation`, {
      method: 'PUT',
      body: JSON.stringify({ approved }),
    });
    clearAdminError();
    await renderFeedback();
  } catch (error) {
    showAdminError(error.message);
  }
}

async function initAdminPage() {
  const currentUser = await refreshCurrentUser();
  if (!currentUser) {
    if (!getToken()) {
      requireAdmin();
      return;
    }
    showAdminError('Không thể xác minh phiên quản trị. Hãy kiểm tra kết nối máy chủ rồi tải lại trang.');
    return;
  }
  if (currentUser.role !== 'admin') {
    requireAdmin();
    return;
  }
  document.querySelectorAll('[data-admin-user-name]').forEach((node) => {
    node.textContent = currentUser.fullName || currentUser.username || 'Quản trị viên';
  });

  const tasks = [
    renderOverview(),
    renderUsersTable(),
    renderProgressTable(),
    renderReports(),
    renderFeedback(),
  ];
  const results = await Promise.allSettled(tasks);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) showAdminError(failure.reason?.message || 'Không thể tải dữ liệu quản trị.');

  const searchInput = document.querySelector('#admin-user-search');
  if (searchInput) {
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        renderUsersTable().catch(error => showAdminError(error.message));
      }, 250);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initAdminPage().catch(error => showAdminError(error.message));
}, { once: true });
