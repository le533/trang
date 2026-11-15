/**
 * auth.js — Nihongo Learning
 * Authentication module backed by the real REST API (backend/server.js).
 * Keeps the same public surface as the old LocalStorage version so every
 * existing page continues to work without modification.
 */

// ─── API config ───────────────────────────────────────────────────────────────
const AUTH_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);
const TOKEN_KEY = 'nihongo_token';
const USER_KEY  = 'nihongo_user';
let verifiedCurrentUser = null;
let authVerificationComplete = false;

// ─── Storage helpers ──────────────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
}

function _setToken(token, remember) {
  _clearToken();
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

function _clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

function _setUser(user, remember) {
  _clearUser();
  (remember ? localStorage : sessionStorage).setItem(USER_KEY, JSON.stringify(user));
}

function _clearUser() {
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(USER_KEY);
}

// ─── Public API (same surface as old auth.js) ─────────────────────────────────
function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function isLoggedIn() { return getCurrentUser() !== null; }
function isAdmin()    { return getCurrentUser()?.role === 'admin'; }

// ─── Core fetch ───────────────────────────────────────────────────────────────
async function _apiFetch(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(`${AUTH_API_BASE}${path}`, opts);
  const data = await res.json().catch(() => ({ success: false, message: 'Server không phản hồi.' }));
  if (!res.ok && res.status !== 409 && res.status !== 422) {
    const err  = new Error(data.message || `HTTP ${res.status}`);
    err.data   = data;
    err.status = res.status;
    throw err;
  }
  return { status: res.status, ...data };
}

// ─── Auth actions ─────────────────────────────────────────────────────────────
async function loginUser(identifier, password, remember = false) {
  try {
    const data = await _apiFetch('POST', '/auth/login', { identifier, password, remember });
    if (!data.success) return { success: false, message: data.message };
    _setToken(data.token, remember);
    _setUser(data.user, remember);
    updateAuthUI();
    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, message: err.message || 'Đăng nhập thất bại.' };
  }
}

async function registerUser(userData) {
  try {
    const data = await _apiFetch('POST', '/auth/register', {
      fullName: userData.fullName,
      username: userData.username,
      email:    userData.email,
      password: userData.password,
    });
    if (!data.success) return { success: false, field: data.field, message: data.message };
    return { success: true };
  } catch (err) {
    if (err.data?.field) return { success: false, field: err.data.field, message: err.data.message };
    return { success: false, field: 'form', message: err.message || 'Đăng ký thất bại.' };
  }
}

async function updateUserProfile(userData) {
  try {
    const data = await _apiFetch('PUT', '/auth/profile', { fullName: userData.fullName, email: userData.email });
    if (!data.success) return { success: false, field: data.field, message: data.message };
    const remembered = Boolean(localStorage.getItem(TOKEN_KEY));
    _setUser(data.user, remembered);
    updateAuthUI();
    return { success: true, user: data.user };
  } catch (err) {
    if (err.data?.field) return { success: false, field: err.data.field, message: err.data.message };
    return { success: false, message: err.message };
  }
}

async function changePassword(currentPassword, newPassword) {
  try {
    const data = await _apiFetch('PUT', '/auth/password', { currentPassword, newPassword });
    return data.success ? { success: true } : { success: false, field: data.field, message: data.message };
  } catch (err) {
    if (err.data?.field) return { success: false, field: err.data.field, message: err.data.message };
    return { success: false, message: err.message };
  }
}

function logout() {
  _clearToken();
  _clearUser();
  verifiedCurrentUser = null;
  authVerificationComplete = true;
  updateAuthUI();
  const homeHref =
    document.querySelector('[data-auth-ui]')?.dataset.homeHref ||
    document.body.dataset.homeHref ||
    '../../index.html';
  window.location.assign(homeHref);
}

function requireLogin() {
  if (isLoggedIn()) return true;
  const loginHref =
    document.querySelector('[data-auth-ui]')?.dataset.loginHref ||
    document.body.dataset.loginHref ||
    'auth/login.html';
  window.location.replace(loginHref);
  return false;
}

function requireAdmin() {
  const user = authVerificationComplete ? verifiedCurrentUser : getCurrentUser();
  if (!getToken() || !user) {
    const loginHref = document.querySelector('[data-auth-ui]')?.dataset.loginHref || 'auth/login.html';
    window.location.replace(loginHref);
    return false;
  }
  if (user.role !== 'admin') {
    const dash = document.querySelector('[data-auth-ui]')?.dataset.dashboardHref || '../dashboard.html';
    window.location.replace(dash);
    return false;
  }
  return true;
}

// ─── Refresh user from API ────────────────────────────────────────────────────
async function refreshCurrentUser() {
  const token = getToken();
  if (!token) {
    verifiedCurrentUser = null;
    authVerificationComplete = true;
    return null;
  }
  try {
    const data = await _apiFetch('GET', '/auth/me');
    if (data.success) {
      const remembered = Boolean(localStorage.getItem(TOKEN_KEY));
      _setUser(data.user, remembered);
      verifiedCurrentUser = data.user;
      authVerificationComplete = true;
      return data.user;
    }
    // token invalid / expired
    _clearToken(); _clearUser();
    verifiedCurrentUser = null;
    authVerificationComplete = true;
    return null;
  } catch {
    verifiedCurrentUser = null;
    authVerificationComplete = true;
    return null;
  }
}

// ─── UI rendering ─────────────────────────────────────────────────────────────
function _createLink(label, href, className) {
  const a = document.createElement('a');
  a.className = className;
  a.href = href;
  a.textContent = label;
  return a;
}

function updateAuthUI() {
  const user = getCurrentUser();
  document.querySelectorAll('[data-auth-ui]').forEach(container => {
    container.replaceChildren();
    container.dataset.authState = user ? 'logged-in' : 'logged-out';

    if (!user) {
      container.append(
        _createLink('Đăng nhập',  container.dataset.loginHref,    'button button-login account-action'),
        _createLink('Đăng ký',    container.dataset.registerHref,  'button button-register account-action'),
      );
      return;
    }

    const greeting = document.createElement('span');
    greeting.className = 'account-greeting';
    greeting.textContent = `Xin chào, ${user.fullName || user.username}`;

    const dashHref = user.role === 'admin'
      ? (container.dataset.adminDashboardHref || container.dataset.dashboardHref || '../admin/index.html')
      : (container.dataset.dashboardHref || '../dashboard.html');
    const dashLabel = user.role === 'admin' ? 'Quản trị' : 'Trang học';

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'button button-secondary account-action account-logout';
    logoutBtn.type = 'button';
    logoutBtn.dataset.authLogout = 'true';
    logoutBtn.textContent = 'Đăng xuất';

    container.append(
      greeting,
      _createLink(dashLabel, dashHref, 'account-nav-link'),
      _createLink('Hồ sơ',  container.dataset.profileHref, 'account-nav-link'),
      logoutBtn,
    );
  });
}

// ─── Form helpers (unchanged from old auth.js) ───────────────────────────────
function clearFormErrors(form) {
  form.querySelectorAll('[data-error-for]').forEach(el => { el.textContent = ''; });
  form.querySelectorAll('[aria-invalid="true"]').forEach(el => el.setAttribute('aria-invalid', 'false'));
  const notice = form.querySelector('.form-notice');
  if (notice) { notice.textContent = ''; notice.className = 'form-notice'; }
}

function setFieldError(form, field, message) {
  const input = form.elements.namedItem(field);
  const err   = form.querySelector(`[data-error-for="${field}"]`);
  if (input) input.setAttribute('aria-invalid', 'true');
  if (err)   err.textContent = message;
}

function setFormNotice(form, message, type) {
  const notice = form.querySelector('.form-notice');
  if (!notice) return;
  notice.textContent = message;
  notice.className   = `form-notice is-${type}`;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRegistration(form) {
  clearFormErrors(form);
  const v = new FormData(form);
  const fullName        = String(v.get('fullName')        || '').trim();
  const username        = String(v.get('username')        || '').trim();
  const email           = String(v.get('email')           || '').trim();
  const password        = String(v.get('password')        || '');
  const confirmPassword = String(v.get('confirmPassword') || '');
  let valid = true;
  if (!fullName)   { setFieldError(form, 'fullName',  'Vui lòng nhập họ và tên.'); valid = false; }
  if (!username)   { setFieldError(form, 'username',  'Vui lòng nhập tên đăng nhập.'); valid = false; }
  else if (username.length < 3 || username.length > 30 || /\s/.test(username)) {
    setFieldError(form, 'username', 'Tên đăng nhập cần 3–30 ký tự và không có khoảng trắng.'); valid = false;
  }
  if (!email)                   { setFieldError(form, 'email',    'Vui lòng nhập email.'); valid = false; }
  else if (!validateEmail(email)) { setFieldError(form, 'email', 'Email chưa đúng định dạng.'); valid = false; }
  if (password.length < 6)      { setFieldError(form, 'password', 'Mật khẩu cần ít nhất 6 ký tự.'); valid = false; }
  if (confirmPassword !== password || !confirmPassword) {
    setFieldError(form, 'confirmPassword', 'Mật khẩu xác nhận chưa khớp.'); valid = false;
  }
  if (!v.get('terms'))          { setFieldError(form, 'terms', 'Bạn cần đồng ý với điều khoản sử dụng.'); valid = false; }
  return { valid, values: { fullName, username, email, password } };
}

// ─── Form setups ──────────────────────────────────────────────────────────────
function setupLoginForm() {
  const form = document.querySelector('#login-form');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormErrors(form);
    const identifier = String(form.elements.identifier.value || '').trim();
    const password   = String(form.elements.password.value   || '');
    let valid = true;
    if (!identifier) { setFieldError(form, 'identifier', 'Vui lòng nhập email hoặc tên đăng nhập.'); valid = false; }
    if (!password)   { setFieldError(form, 'password',   'Vui lòng nhập mật khẩu.'); valid = false; }
    if (!valid) return;

    const btn = form.querySelector('[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang đăng nhập…'; }

    const result = await loginUser(identifier, password, Boolean(form.elements.remember?.checked));
    if (btn)  { btn.disabled = false; btn.textContent = 'Đăng nhập'; }

    if (!result.success) { setFormNotice(form, result.message, 'error'); return; }

    setFormNotice(form, 'Đăng nhập thành công.', 'success');
    setTimeout(() => {
      const dest = result.user.role === 'admin'
        ? (document.body.dataset.adminDashboardHref || '../admin/index.html')
        : (document.body.dataset.dashboardHref      || '../dashboard.html');
      window.location.assign(dest);
    }, 350);
  });
}

function setupRegisterForm() {
  const form = document.querySelector('#register-form');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const { valid, values } = validateRegistration(form);
    if (!valid) return;

    const btn = form.querySelector('[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang đăng ký…'; }

    const result = await registerUser(values);
    if (btn) { btn.disabled = false; btn.textContent = 'Đăng ký'; }

    if (!result.success) {
      if (result.field && result.field !== 'form') setFieldError(form, result.field, result.message);
      else setFormNotice(form, result.message, 'error');
      return;
    }
    setFormNotice(form, 'Đăng ký tài khoản thành công.', 'success');
    form.reset();
    setTimeout(() => window.location.assign(document.body.dataset.loginHref || 'login.html'), 900);
  });
}

function setupProfilePage() {
  const profileForm = document.querySelector('#profile-edit-form');
  const user = getCurrentUser();
  if (!profileForm || !user) return;

  // Fill display fields
  const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val || ''; };
  set('#profile-full-name',  user.fullName);
  set('#profile-username',   user.username);
  set('#profile-email',      user.email);
  set('#profile-role',       user.role);
  set('#profile-created-at', user.createdAt ? new Date(user.createdAt).toLocaleString('vi-VN') : '');

  const editBtn    = document.querySelector('#edit-profile-button');
  const cancelBtn  = document.querySelector('#cancel-profile-edit');
  const fullNameIn = profileForm.elements.fullName;
  const emailIn    = profileForm.elements.email;
  if (fullNameIn) fullNameIn.value = user.fullName;
  if (emailIn)    emailIn.value    = user.email;

  editBtn?.addEventListener('click', () => { profileForm.hidden = false; editBtn.hidden = true; fullNameIn?.focus(); });
  cancelBtn?.addEventListener('click', () => {
    profileForm.reset();
    if (fullNameIn) fullNameIn.value = getCurrentUser().fullName;
    if (emailIn)    emailIn.value    = getCurrentUser().email;
    clearFormErrors(profileForm);
    profileForm.hidden = true; editBtn && (editBtn.hidden = false);
  });

  profileForm.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormErrors(profileForm);
    const fullName = fullNameIn?.value.trim();
    const email    = emailIn?.value.trim();
    if (!fullName) { setFieldError(profileForm, 'fullName', 'Vui lòng nhập họ và tên.'); return; }

    const result = await updateUserProfile({ fullName, email });
    if (!result.success) {
      if (result.field) setFieldError(profileForm, result.field, result.message);
      else setFormNotice(profileForm, result.message, 'error');
      return;
    }
    set('#profile-full-name', result.user.fullName);
    set('#profile-email',     result.user.email);
    setFormNotice(profileForm, 'Đã cập nhật hồ sơ.', 'success');
    profileForm.hidden = true; editBtn && (editBtn.hidden = false);
  });

  // Change password form
  const pwForm = document.querySelector('#change-password-form');
  if (pwForm) {
    pwForm.addEventListener('submit', async e => {
      e.preventDefault();
      clearFormErrors(pwForm);
      const cur = String(pwForm.elements.currentPassword?.value || '');
      const nw  = String(pwForm.elements.newPassword?.value     || '');
      const cnf = String(pwForm.elements.confirmNewPassword?.value || '');
      if (!cur) { setFieldError(pwForm, 'currentPassword', 'Vui lòng nhập mật khẩu hiện tại.'); return; }
      if (nw.length < 6) { setFieldError(pwForm, 'newPassword', 'Mật khẩu mới tối thiểu 6 ký tự.'); return; }
      if (nw !== cnf)   { setFieldError(pwForm, 'confirmNewPassword', 'Mật khẩu xác nhận chưa khớp.'); return; }
      const result = await changePassword(cur, nw);
      if (!result.success) { setFieldError(pwForm, result.field || 'currentPassword', result.message); return; }
      setFormNotice(pwForm, 'Đổi mật khẩu thành công.', 'success');
      pwForm.reset();
    });
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function initializeAuth() {
  // Silently refresh user data from API if token exists
  if (getToken()) {
    await refreshCurrentUser();
  } else {
    verifiedCurrentUser = null;
    authVerificationComplete = true;
  }

  updateAuthUI();

  // Phát event để các JS trang biết auth đã verify xong với server
  document.dispatchEvent(new CustomEvent('nihongo:auth-ready', {
    detail: {
      user: verifiedCurrentUser,
      isAdmin: verifiedCurrentUser?.role === 'admin',
      verified: authVerificationComplete,
    }
  }));

  // Global click delegation: logout + password-toggle
  document.addEventListener('click', e => {
    if (e.target.closest('[data-auth-logout]')) { logout(); return; }

    const toggleBtn = e.target.closest('[data-toggle-target]');
    if (toggleBtn) {
      const input = document.getElementById(toggleBtn.dataset.toggleTarget);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggleBtn.setAttribute('aria-pressed', String(show));
      toggleBtn.setAttribute('aria-label',   show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      const lbl = toggleBtn.querySelector('.password-toggle-label');
      if (lbl) lbl.textContent = show ? 'Ẩn' : 'Hiện';
    }
  });

  // Page-level guards
  if (document.body.dataset.requireAdmin === 'true') {
    if (!requireAdmin()) return;
  } else if (document.body.dataset.requireLogin === 'true' && !requireLogin()) {
    return;
  }

  setupLoginForm();
  setupRegisterForm();
  setupProfilePage();

  // Misc UI hooks
  const dashName = document.querySelector('#dashboard-user-name');
  if (dashName) {
    const u = getCurrentUser();
    dashName.textContent = u?.fullName || u?.username || '';
  }

  const adminQuick = document.querySelector('#admin-dashboard-quick-access');
  if (adminQuick) adminQuick.hidden = !isAdmin();

  const adminUserName = document.querySelector('[data-admin-user-name]');
  if (adminUserName) {
    const u = getCurrentUser();
    adminUserName.textContent = u?.fullName || u?.username || 'Quản trị viên';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAuth, { once: true });
} else {
  initializeAuth();
}
