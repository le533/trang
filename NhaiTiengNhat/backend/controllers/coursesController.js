const { pool } = require('../config/database');

async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.slug, c.title, c.description, c.level, c.image_url, c.price_vnd, c.duration_days,
              EXISTS(
                SELECT 1 FROM course_subscriptions s
                WHERE s.user_id=? AND s.course_id=c.id AND s.status='active'
                  AND (s.ends_at IS NULL OR s.ends_at > NOW())
              ) AS enrolled,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id AND l.is_deleted=0) AS lesson_count
       FROM courses c WHERE c.is_published=1 ORDER BY c.level`,
      [req.user?.id || 0]
    );
    return res.json({
      success: true,
      data: rows.map(course => ({
        id: String(course.id),
        slug: course.slug,
        title: course.title,
        description: course.description,
        level: course.level,
        imageUrl: course.image_url || '',
        priceVnd: Number(course.price_vnd),
        durationDays: course.duration_days,
        lessonCount: Number(course.lesson_count),
        isFree: Number(course.price_vnd) === 0,
        enrolled: Boolean(course.enrolled),
        hasAccess: Number(course.price_vnd) === 0 || Boolean(course.enrolled) || req.user?.role === 'admin',
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function enrollments(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.slug, c.title, c.level, c.price_vnd, s.starts_at, s.ends_at
       FROM course_subscriptions s JOIN courses c ON c.id=s.course_id
       WHERE s.user_id=? AND s.status='active' AND (s.ends_at IS NULL OR s.ends_at > NOW())
       ORDER BY c.level`,
      [req.user.id]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, enrollments };
