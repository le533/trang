const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const configuredRounds = Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const ROUNDS = Number.isInteger(configuredRounds) ? Math.min(15, Math.max(10, configuredRounds)) : 12;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function signToken(user) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET phải được cấu hình với ít nhất 32 ký tự.');
  }
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role_name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function safeUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    username: user.username,
    email: user.email,
    role: user.role_name,
    status: user.status,
    createdAt: user.created_at,
  };
}

// POST /api/auth/register
async function register(req, res, next) {
  const { fullName, username, email, password } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await conn.query(
      'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
      [normalizedUsername, normalizedEmail]
    );
    if (existing.length) {
      await conn.rollback();
      const [byUser] = await conn.query('SELECT id FROM users WHERE username = ? LIMIT 1', [normalizedUsername]);
      if (byUser.length) return res.status(409).json({ success: false, field: 'username', message: 'Tên đăng nhập đã tồn tại.' });
      return res.status(409).json({ success: false, field: 'email', message: 'Email này đã được đăng ký.' });
    }

    const hash = await bcrypt.hash(password, ROUNDS);
    const [roleRows] = await conn.query('SELECT id FROM roles WHERE name = ? LIMIT 1', ['user']);
    if (!roleRows.length) throw new Error('Chưa khởi tạo role user. Hãy chạy database/seed.sql.');

    const [result] = await conn.query(
      'INSERT INTO users (role_id, full_name, username, email, password_hash) VALUES (?, ?, ?, ?, ?)',
      [roleRows[0].id, fullName.trim(), normalizedUsername, normalizedEmail, hash]
    );

    await conn.query('INSERT INTO user_learning_stats (user_id) VALUES (?)', [result.insertId]);
    await conn.commit();

    return res.status(201).json({ success: true, message: 'Đăng ký tài khoản thành công.' });
  } catch (err) {
    if (conn) await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      const field = err.message.includes('username') ? 'username' : 'email';
      return res.status(409).json({
        success: false,
        field,
        message: field === 'username' ? 'Tên đăng nhập đã tồn tại.' : 'Email này đã được đăng ký.',
      });
    }
    next(err);
  } finally { conn?.release(); }
}

// POST /api/auth/login
async function login(req, res, next) {
  const { identifier, password, remember } = req.body;
  try {
    const [rows] = await pool.query(
      `SELECT u.*, r.name AS role_name
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE (u.username = ? OR u.email = ?) AND u.status = 'active' LIMIT 1`,
      [identifier.trim(), identifier.trim().toLowerCase()]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Email/tên đăng nhập hoặc mật khẩu không chính xác.' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Email/tên đăng nhập hoặc mật khẩu không chính xác.' });
    }

    // update last active
    await pool.query(
      'UPDATE user_learning_stats SET last_active_at = NOW() WHERE user_id = ?',
      [user.id]
    );

    const token = signToken(user);
    return res.json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me
async function me(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT u.*, r.name AS role_name
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.id = ? AND u.status = 'active' LIMIT 1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
    return res.json({ success: true, user: safeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
}

// PUT /api/auth/profile
async function updateProfile(req, res, next) {
  const { fullName, email } = req.body;
  try {
    const [conflict] = await pool.query(
      'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
      [email.trim().toLowerCase(), req.user.id]
    );
    if (conflict.length) return res.status(409).json({ success: false, field: 'email', message: 'Email này đã được sử dụng.' });

    await pool.query('UPDATE users SET full_name = ?, email = ? WHERE id = ?',
      [fullName.trim(), email.trim().toLowerCase(), req.user.id]);

    const [rows] = await pool.query(
      `SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ? LIMIT 1`,
      [req.user.id]
    );
    return res.json({ success: true, user: safeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
}

// PUT /api/auth/password
async function changePassword(req, res, next) {
  const { currentPassword, newPassword } = req.body;
  try {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) return res.status(400).json({ success: false, field: 'currentPassword', message: 'Mật khẩu hiện tại không đúng.' });
    const hash = await bcrypt.hash(newPassword, ROUNDS);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    return res.json({ success: true, message: 'Đổi mật khẩu thành công.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, updateProfile, changePassword };
