/**
 * api.js — Nihongo Learning API client
 * Centralises all fetch calls to the backend.
 * Uses the MySQL-backed API as the source of truth.
 */

const API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);
const TOKEN_KEY = 'nihongo_token';
const USER_KEY  = 'nihongo_user';

// ─── Token helpers ────────────────────────────────────────────────────────────
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
}

export function setToken(token, remember = false) {
  clearToken();
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setStoredUser(user, remember = false) {
  clearStoredUser();
  (remember ? localStorage : sessionStorage).setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(USER_KEY);
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
async function request(method, path, body = null, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const fetchOptions = {
    method,
    headers,
    signal: options.signal,
  };
  if (body !== null) fetchOptions.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, fetchOptions);
  const data = await res.json().catch(() => ({ success: false, message: 'Phản hồi không hợp lệ từ server.' }));

  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const api = {
  get:    (path, options) => request('GET',    path, null, options),
  post:   (path, body,  options) => request('POST',   path, body, options),
  put:    (path, body,  options) => request('PUT',    path, body, options),
  delete: (path, options) => request('DELETE', path, null, options),
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const Auth = {
  async register(payload) {
    return api.post('/auth/register', payload);
  },
  async login(identifier, password, remember = false) {
    const data = await api.post('/auth/login', { identifier, password, remember });
    if (data.success) {
      setToken(data.token, remember);
      setStoredUser(data.user, remember);
    }
    return data;
  },
  async me() {
    return api.get('/auth/me');
  },
  async updateProfile(payload) {
    const data = await api.put('/auth/profile', payload);
    if (data.success) {
      const remembered = Boolean(localStorage.getItem(TOKEN_KEY));
      setStoredUser(data.user, remembered);
    }
    return data;
  },
  async changePassword(payload) {
    return api.put('/auth/password', payload);
  },
  logout() {
    clearToken();
    clearStoredUser();
  },
};

// ─── Vocabulary ───────────────────────────────────────────────────────────────
export const Vocabulary = {
  async list(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/vocabulary${q ? '?' + q : ''}`);
  },
  async get(id) {
    return api.get(`/vocabulary/${id}`);
  },
  async create(payload) {
    return api.post('/vocabulary', payload);
  },
  async update(id, payload) {
    return api.put(`/vocabulary/${id}`, payload);
  },
  async remove(id) {
    return api.delete(`/vocabulary/${id}`);
  },
};

// ─── Kanji ────────────────────────────────────────────────────────────────────
export const Kanji = {
  async list(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/kanji${q ? '?' + q : ''}`);
  },
  async get(id) {
    return api.get(`/kanji/${id}`);
  },
  async radicals() {
    return api.get('/kanji/radicals');
  },
  async create(payload) {
    return api.post('/kanji', payload);
  },
  async update(id, payload) {
    return api.put(`/kanji/${id}`, payload);
  },
  async remove(id) {
    return api.delete(`/kanji/${id}`);
  },
};

// ─── Grammar ──────────────────────────────────────────────────────────────────
export const Grammar = {
  async list(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/grammar${q ? '?' + q : ''}`);
  },
  async get(id) {
    return api.get(`/grammar/${id}`);
  },
  async create(payload) {
    return api.post('/grammar', payload);
  },
  async update(id, payload) {
    return api.put(`/grammar/${id}`, payload);
  },
  async remove(id) {
    return api.delete(`/grammar/${id}`);
  },
};

// ─── Lessons ──────────────────────────────────────────────────────────────────
export const Lessons = {
  async list(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/lessons${q ? '?' + q : ''}`);
  },
  async get(id) {
    return api.get(`/lessons/${id}`);
  },
  async updateProgress(id, status) {
    return api.post(`/lessons/${id}/progress`, { status });
  },
  async create(payload) {
    return api.post('/lessons', payload);
  },
  async update(id, payload) {
    return api.put(`/lessons/${id}`, payload);
  },
  async remove(id) {
    return api.delete(`/lessons/${id}`);
  },
};

// ─── Exercises ────────────────────────────────────────────────────────────────
export const Exercises = {
  async list(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/exercises${q ? '?' + q : ''}`);
  },
  async get(id) {
    return api.get(`/exercises/${id}`);
  },
  async submit(id, answers) {
    return api.post(`/exercises/${id}/submit`, { answers });
  },
  async attempts(id) {
    return api.get(`/exercises/${id}/attempts`);
  },
  async create(payload) {
    return api.post('/exercises', payload);
  },
  async remove(id) {
    return api.delete(`/exercises/${id}`);
  },
};

// ─── Stats ────────────────────────────────────────────────────────────────────
export const Stats = {
  async me() {
    return api.get('/stats/me');
  },
  async leaderboard() {
    return api.get('/stats/leaderboard');
  },
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const Admin = {
  async users(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/admin/users${q ? '?' + q : ''}`);
  },
  async setStatus(userId, status) {
    return api.put(`/admin/users/${userId}/status`, { status });
  },
  async setRole(userId, role) {
    return api.put(`/admin/users/${userId}/role`, { role });
  },
  async deleteUser(userId) {
    return api.delete(`/admin/users/${userId}`);
  },
  async reports() {
    return api.get('/admin/reports');
  },
};

export default { Auth, Vocabulary, Kanji, Grammar, Lessons, Exercises, Stats, Admin, getToken, getStoredUser };
