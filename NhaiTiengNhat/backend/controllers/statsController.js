const { pool } = require('../config/database');

// GET /api/stats/me
async function myStats(req, res, next) {
  const userId = req.user.id;
  try {
    const [statsRows] = await pool.query('SELECT * FROM user_learning_stats WHERE user_id=? LIMIT 1', [userId]);
    const stats = statsRows[0] || {};

    const [lessonProgress] = await pool.query(
      `SELECT lp.lesson_id, lp.status, lp.started_at, lp.completed_at, l.title, l.level
       FROM lesson_progress lp JOIN lessons l ON lp.lesson_id=l.id
       WHERE lp.user_id=? ORDER BY lp.updated_at DESC LIMIT 10`, [userId]);

    const [recentAttempts] = await pool.query(
      `SELECT ea.id, ea.exercise_id, ea.attempt_number, ea.score, ea.correct_count, ea.total_questions,
              ea.completed_at, e.title AS exercise_title, e.level
       FROM exercise_attempts ea JOIN exercises e ON ea.exercise_id=e.id
       WHERE ea.user_id=? AND ea.completed_at IS NOT NULL ORDER BY ea.completed_at DESC LIMIT 5`, [userId]);

    const [completedCount] = await pool.query(
      'SELECT COUNT(*) AS total FROM lesson_progress WHERE user_id=? AND status=?', [userId, 'completed']);
    const [totalLessons] = await pool.query('SELECT COUNT(*) AS total FROM lessons WHERE is_deleted=0');
    const [exerciseCount] = await pool.query(
      'SELECT COUNT(DISTINCT exercise_id) AS total FROM exercise_attempts WHERE user_id=? AND completed_at IS NOT NULL', [userId]);

    // streak calculation
    const [streakRows] = await pool.query(
      `SELECT DATE(last_active_at) AS active_date FROM user_learning_stats WHERE user_id=? LIMIT 1`, [userId]);
    const streak = stats.streak_days || 0;

    return res.json({
      success: true,
      data: {
        level: stats.level || 'N5',
        completedLessons: completedCount[0].total,
        totalLessons: totalLessons[0].total,
        accuracy: parseFloat(stats.accuracy || 0).toFixed(1),
        streakDays: streak,
        exercisesAttempted: exerciseCount[0].total,
        lastActiveAt: stats.last_active_at,
        recentProgress: lessonProgress.map(p => ({
          lessonId: String(p.lesson_id), title: p.title, level: p.level,
          status: p.status, completedAt: p.completed_at,
        })),
        recentAttempts: recentAttempts.map(a => ({
          id: String(a.id), exerciseTitle: a.exercise_title, level: a.level,
          score: parseFloat(a.score), correctCount: a.correct_count,
          totalQuestions: a.total_questions, completedAt: a.completed_at,
        })),
      },
    });
  } catch (err) { next(err); }
}

// GET /api/stats/leaderboard
async function leaderboard(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.username, uls.level, uls.completed_lessons, uls.accuracy, uls.streak_days
       FROM user_learning_stats uls JOIN users u ON uls.user_id=u.id
       WHERE u.status='active'
       ORDER BY uls.completed_lessons DESC, uls.accuracy DESC LIMIT 20`);
    return res.json({ success: true, data: rows.map(r => ({
      id: String(r.id), fullName: r.full_name, username: r.username,
      level: r.level, completedLessons: r.completed_lessons,
      accuracy: parseFloat(r.accuracy), streakDays: r.streak_days,
    }))});
  } catch (err) { next(err); }
}

module.exports = { myStats, leaderboard };
