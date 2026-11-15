const { pool } = require('../config/database');
const { getPagination } = require('../utils/pagination');

// GET /api/admin/users
async function listUsers(req, res, next) {
  const { page, limit, offset } = getPagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const { search, status, role } = req.query;
  try {
    let where = [];
    const params = [];
    if (search) {
      where.push('(u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?)');
      const q = `%${search}%`; params.push(q, q, q);
    }
    if (status) { where.push('u.status = ?'); params.push(status); }
    if (role) { where.push('r.name = ?'); params.push(role); }
    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u JOIN roles r ON u.role_id=r.id ${whereSQL}`, params);
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.username, u.email, r.name AS role, u.status, u.created_at,
              uls.level, uls.completed_lessons, uls.accuracy, uls.streak_days, uls.last_active_at
       FROM users u JOIN roles r ON u.role_id=r.id
       LEFT JOIN user_learning_stats uls ON uls.user_id=u.id
       ${whereSQL} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return res.json({ success: true, data: rows.map(u => ({
      id: String(u.id), fullName: u.full_name, username: u.username, email: u.email,
      role: u.role, status: u.status, createdAt: u.created_at,
      stats: { level: u.level || 'N5', completedLessons: u.completed_lessons || 0, accuracy: parseFloat(u.accuracy || 0), streakDays: u.streak_days || 0, lastActiveAt: u.last_active_at }
    })), total: countRows[0].total, page, limit });
  } catch (err) { next(err); }
}

// PUT /api/admin/users/:id/status
async function setUserStatus(req, res, next) {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (id === req.user.id) return res.status(400).json({ success: false, message: 'Không thể thay đổi trạng thái của chính mình.' });
  if (!['active', 'disabled'].includes(status)) return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });
  try {
    const [result] = await pool.query('UPDATE users SET status=? WHERE id=?', [status, id]);
    if (!result.affectedRows) {
      const [existing] = await pool.query('SELECT id FROM users WHERE id=? LIMIT 1', [id]);
      if (!existing.length) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }
    return res.json({ success: true, message: `Đã ${status === 'active' ? 'kích hoạt' : 'vô hiệu hóa'} tài khoản.` });
  } catch (err) { next(err); }
}

// PUT /api/admin/users/:id/role
async function setUserRole(req, res, next) {
  const id = parseInt(req.params.id, 10);
  const { role } = req.body;
  if (id === req.user.id) return res.status(400).json({ success: false, message: 'Không thể thay đổi role của chính mình.' });
  try {
    const [roleRows] = await pool.query('SELECT id FROM roles WHERE name=? LIMIT 1', [role]);
    if (!roleRows.length) return res.status(400).json({ success: false, message: 'Role không tồn tại.' });
    const [result] = await pool.query('UPDATE users SET role_id=? WHERE id=?', [roleRows[0].id, id]);
    if (!result.affectedRows) {
      const [existing] = await pool.query('SELECT id FROM users WHERE id=? LIMIT 1', [id]);
      if (!existing.length) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }
    return res.json({ success: true, message: 'Cập nhật role thành công.' });
  } catch (err) { next(err); }
}

// DELETE /api/admin/users/:id
async function deleteUser(req, res, next) {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản của chính mình.' });
  try {
    const [result] = await pool.query('UPDATE users SET status=? WHERE id=?', ['disabled', id]);
    if (!result.affectedRows) {
      const [existing] = await pool.query('SELECT id FROM users WHERE id=? LIMIT 1', [id]);
      if (!existing.length) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }
    return res.json({ success: true, message: 'Đã vô hiệu hóa tài khoản người dùng.' });
  } catch (err) { next(err); }
}

// GET /api/admin/reports
async function reports(req, res, next) {
  try {
    const [userCount] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE status='active'");
    const [adminCount] = await pool.query(
      "SELECT COUNT(*) AS total FROM users u JOIN roles r ON u.role_id=r.id WHERE u.status='active' AND r.name='admin'"
    );
    const [newThisWeek] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
    const [learningStats] = await pool.query(
      `SELECT COALESCE(AVG(uls.accuracy), 0) AS average_accuracy,
              SUM(uls.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS active_learners
       FROM user_learning_stats uls
       JOIN users u ON u.id=uls.user_id
       WHERE u.status='active'`
    );
    const [lessonCount] = await pool.query("SELECT COUNT(*) AS total FROM lessons WHERE is_deleted=0");
    const [vocabCount] = await pool.query("SELECT COUNT(*) AS total FROM vocabulary WHERE is_deleted=0");
    const [kanjiCount] = await pool.query("SELECT COUNT(*) AS total FROM kanji WHERE is_deleted=0");
    const [grammarCount] = await pool.query("SELECT COUNT(*) AS total FROM grammar_points WHERE is_deleted=0");
    const [exerciseCount] = await pool.query("SELECT COUNT(*) AS total FROM exercises WHERE is_deleted=0");
    const [attemptCount] = await pool.query("SELECT COUNT(*) AS total, AVG(score) AS avg_score FROM exercise_attempts WHERE completed_at IS NOT NULL");
    const [completedLessons] = await pool.query("SELECT COUNT(*) AS total FROM lesson_progress WHERE status='completed'");
    const [topUsers] = await pool.query(
      `SELECT u.username, u.full_name, uls.level, uls.completed_lessons, uls.accuracy, uls.streak_days
       FROM user_learning_stats uls JOIN users u ON uls.user_id=u.id
       WHERE u.status='active' ORDER BY uls.completed_lessons DESC LIMIT 5`);
    const [recentActivity] = await pool.query(
      `SELECT u.username, ea.score, ea.completed_at, e.title AS exercise_title
       FROM exercise_attempts ea JOIN users u ON ea.user_id=u.id JOIN exercises e ON ea.exercise_id=e.id
       WHERE ea.completed_at IS NOT NULL ORDER BY ea.completed_at DESC LIMIT 10`);

    return res.json({ success: true, data: {
      users: {
        total: userCount[0].total,
        admins: adminCount[0].total,
        newThisWeek: newThisWeek[0].total,
        activeLearners: Number(learningStats[0].active_learners || 0),
      },
      learning: { averageAccuracy: Number(learningStats[0].average_accuracy || 0) },
      content: { lessons: lessonCount[0].total, vocabulary: vocabCount[0].total, kanji: kanjiCount[0].total, grammar: grammarCount[0].total, exercises: exerciseCount[0].total },
      activity: { totalAttempts: attemptCount[0].total, avgScore: parseFloat(attemptCount[0].avg_score || 0).toFixed(1), completedLessons: completedLessons[0].total },
      topUsers: topUsers.map(u => ({ username: u.username, fullName: u.full_name, level: u.level, completedLessons: u.completed_lessons, accuracy: parseFloat(u.accuracy), streakDays: u.streak_days })),
      recentActivity: recentActivity.map(a => ({ username: a.username, exerciseTitle: a.exercise_title, score: parseFloat(a.score), completedAt: a.completed_at })),
    }});
  } catch (err) { next(err); }
}

module.exports = { listUsers, setUserStatus, setUserRole, deleteUser, reports };
