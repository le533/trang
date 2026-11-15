require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { testConnection } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const vocabularyRoutes = require('./routes/vocabulary');
const kanjiRoutes = require('./routes/kanji');
const grammarRoutes = require('./routes/grammar');
const lessonsRoutes = require('./routes/lessons');
const exercisesRoutes = require('./routes/exercises');
const statsRoutes = require('./routes/stats');
const adminRoutes = require('./routes/admin');
const uploadsRoutes = require('./routes/uploads');
const coursesRoutes = require('./routes/courses');
const paymentsRoutes = require('./routes/payments');
const { streamVideo } = require('./controllers/mediaController');
const { optionalAuth } = require('./middleware/auth');
const documentsRoutes = require('./routes/documents');
const feedbackRoutes = require('./routes/feedback');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Logging ───────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:', 'https://images.unsplash.com'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'", 'data:'],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

const deploymentOrigins = [
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
]
  .filter(Boolean)
  .map(host => `https://${host}`);
const allowedOrigins = new Set([
  ...(process.env.CORS_ORIGIN || 'http://127.0.0.1:5500,http://localhost:5500')
    .split(',')
    .map(origin => origin.trim()),
  ...deploymentOrigins,
]);

app.use(cors({
  origin(origin, callback) {
    // allow requests with no origin (curl, Postman) or matching origins
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('CORS: Origin not allowed'));
  },
  credentials: true,
}));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev', {
    skip: req => req.path === '/media/videos' || req.path.startsWith('/media/videos/'),
  }));
}

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.get('/media/videos/:assetId', optionalAuth, streamVideo);

// ─── Rate limiting ────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production';

// Brute-force protection cho register/login — chỉ bật production
const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10_000 : 20,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau 15 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// /api/auth/me gọi mỗi lần load trang — cần thoáng
const authReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 10_000 : 120,
  message: { success: false, message: 'Quá nhiều yêu cầu.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 10_000 : 300,
  message: { success: false, message: 'Quá nhiều yêu cầu.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Nihongo Learning API is running.', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api/auth/register', authWriteLimiter);
app.use('/api/auth/login', authWriteLimiter);
app.use('/api/auth/password', authWriteLimiter);
app.use('/api/auth', authReadLimiter, authRoutes);
app.use('/api/vocabulary', vocabularyRoutes);
app.use('/api/kanji', kanjiRoutes);
app.use('/api/grammar', grammarRoutes);
app.use('/api/lessons', lessonsRoutes);
app.use('/api/exercises', exercisesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/vendor/pdfjs', express.static(path.resolve(__dirname, 'node_modules/pdfjs-dist/build'), {
  dotfiles: 'deny',
  maxAge: '7d',
}));

const privateStaticDirectories = new Set([
  'api', 'backend', 'database', 'node_modules', '.git', 'scripts',
  'index.js', 'package.json', 'package-lock.json', 'vercel.json',
]);
app.use((req, res, next) => {
  const firstPathSegment = decodeURIComponent(req.path.split('/')[1] || '').toLowerCase();
  if (privateStaticDirectories.has(firstPathSegment)) {
    return res.status(404).end();
  }
  return next();
});
app.use(express.static(path.resolve(__dirname, '..'), {
  dotfiles: 'deny',
  index: ['index.html'],
}));

// ─── 404 & Error handler ──────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Cấu hình JWT_SECRET trong backend/.env (tối thiểu 32 ký tự) trước khi chạy server.');
  }
  await testConnection();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   DB:  ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
  });
}

if (require.main === module) {
  start().catch(err => {
    console.error('❌ Không thể khởi động API:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { app, start };
