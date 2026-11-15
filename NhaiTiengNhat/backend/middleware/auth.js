const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

function readBearerToken(req) {
  const header = req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.slice(7) : null;
}

function verifyToken(token) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET chưa được cấu hình.');
  return jwt.verify(token, process.env.JWT_SECRET);
}

async function loadActiveUser(decoded) {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.email, u.status, r.name AS role
     FROM users u JOIN roles r ON r.id=u.role_id
     WHERE u.id=? LIMIT 1`,
    [decoded.id]
  );
  return rows[0] && rows[0].status === 'active' ? rows[0] : null;
}

async function authMiddleware(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập hoặc token không hợp lệ.' });
  }
  try {
    const decoded = verifyToken(token);
    const user = await loadActiveUser(decoded);
    if (!user) return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.' });
    req.user = user;
    return next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token hết hạn hoặc không hợp lệ.' });
    }
    return next(err);
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập trang này.' });
    }
    next();
  });
}

async function optionalAuth(req, res, next) {
  const token = readBearerToken(req);
  if (token) {
    try {
      const decoded = verifyToken(token);
      req.user = await loadActiveUser(decoded);
    } catch (err) {
      if (err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError') return next(err);
      req.user = null;
    }
  } else {
    req.user = null;
  }
  return next();
}

module.exports = { authMiddleware, adminMiddleware, optionalAuth };
