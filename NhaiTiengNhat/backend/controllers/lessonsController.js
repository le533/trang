const { pool } = require('../config/database');
const { refreshLearningStats } = require('../utils/learningStats');
const { getPagination } = require('../utils/pagination');
const { createVideoPlaybackUrl } = require('../utils/videoAccess');

function lessonContent(row, progress = 'not_started', user = null) {
  const locked = Boolean(row.course_id && Number(row.price_vnd) > 0 && !row.has_access);
  const videoUrl = locked ? '' : row.video_url || '';
  return {
    id: String(row.id),
    title: row.title,
    level: row.level,
    duration: row.duration || '',
    summary: row.summary,
    objectives: locked ? '' : row.objectives || '',
    content: locked ? '' : row.content || '',
    videoUrl,
    playbackUrl: locked ? '' : createVideoPlaybackUrl(videoUrl, row, user),
    progress,
    courseId: row.course_id ? String(row.course_id) : '',
    courseTitle: row.course_title || '',
    priceVnd: Number(row.price_vnd || 0),
    locked,
  };
}

// GET /api/lessons
async function list(req, res, next) {
  const { page, limit, offset } = getPagination(req.query, { defaultLimit: 12, maxLimit: 50 });
  const { level, search } = req.query;
  try {
    let where = ['l.is_deleted = 0'];
    const params = [];
    if (level && ['N5','N4','N3','N2','N1'].includes(level)) { where.push('l.level = ?'); params.push(level); }
    if (search) { where.push('(l.title LIKE ? OR l.summary LIKE ?)'); const q = `%${search}%`; params.push(q, q); }
    const whereSQL = 'WHERE ' + where.join(' AND ');
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM lessons l ${whereSQL}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.query(
      `SELECT l.id, l.title, l.level, l.duration, l.summary, l.objectives, l.content,
              l.video_url, l.course_id, c.title AS course_title, c.price_vnd,
              CASE WHEN c.price_vnd=0 OR c.id IS NULL OR ?='admin' THEN 1
                WHEN EXISTS (
                  SELECT 1 FROM course_subscriptions s WHERE s.course_id=c.id AND s.user_id=?
                    AND s.status='active' AND (s.ends_at IS NULL OR s.ends_at>NOW())
                ) THEN 1 ELSE 0 END AS has_access
       FROM lessons l LEFT JOIN courses c ON c.id=l.course_id
       ${whereSQL} ORDER BY l.level, l.id LIMIT ? OFFSET ?`,
      [req.user?.role || 'user', req.user?.id || 0, ...params, limit, offset]
    );

    let progressMap = {};
    if (req.user) {
      const ids = rows.map(r => r.id);
      if (ids.length) {
        const [progress] = await pool.query(
          'SELECT lesson_id, status FROM lesson_progress WHERE user_id=? AND lesson_id IN (?)', [req.user.id, ids]);
        progress.forEach(p => { progressMap[p.lesson_id] = p.status; });
      }
    }

    const data = rows.map(l => lessonContent(l, progressMap[l.id] || 'not_started', req.user));
    return res.json({ success: true, data, total, page, limit });
  } catch (err) { next(err); }
}

// GET /api/lessons/:id
async function getOne(req, res, next) {
  const id = parseInt(req.params.id, 10);
  try {
    const [rows] = await pool.query(
      `SELECT l.*, c.title AS course_title, c.price_vnd,
              CASE WHEN c.price_vnd=0 OR c.id IS NULL OR ?='admin' THEN 1
                WHEN EXISTS (
                  SELECT 1 FROM course_subscriptions s WHERE s.course_id=c.id AND s.user_id=?
                    AND s.status='active' AND (s.ends_at IS NULL OR s.ends_at>NOW())
                ) THEN 1 ELSE 0 END AS has_access
       FROM lessons l LEFT JOIN courses c ON c.id=l.course_id
       WHERE l.id=? AND l.is_deleted=0 LIMIT 1`,
      [req.user?.role || 'user', req.user?.id || 0, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy bài học.' });
    const l = rows[0];
    let progress = 'not_started';
    if (req.user) {
      const [p] = await pool.query('SELECT status FROM lesson_progress WHERE user_id=? AND lesson_id=?', [req.user.id, id]);
      if (p.length) progress = p[0].status;
    }
    return res.json({ success: true, data: lessonContent(l, progress, req.user) });
  } catch (err) { next(err); }
}

// POST /api/lessons (admin)
async function create(req, res, next) {
  const { title, level, duration, summary, objectives, content, videoUrl, courseId } = req.body;
  try {
    const [r] = await pool.query(
      'INSERT INTO lessons (title, level, duration, summary, objectives, content, video_url, course_id) VALUES (?,?,?,?,?,?,?,?)',
      [title.trim(), level, duration?.trim() || null, summary.trim(), objectives?.trim() || null,
        content?.trim() || null, videoUrl?.trim() || null, courseId || null]
    );
    return res.status(201).json({ success: true, id: r.insertId, message: 'Thêm bài học thành công.' });
  } catch (err) { next(err); }
}

// PUT /api/lessons/:id (admin)
async function update(req, res, next) {
  const id = parseInt(req.params.id, 10);
  const { title, level, duration, summary, objectives, content, videoUrl, courseId } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE lessons SET title=?, level=?, duration=?, summary=?, objectives=?, content=?, video_url=?, course_id=? WHERE id=? AND is_deleted=0',
      [title.trim(), level, duration?.trim() || null, summary.trim(), objectives?.trim() || null,
        content?.trim() || null, videoUrl?.trim() || null, courseId || null, id]
    );
    if (!result.affectedRows) {
      const [existing] = await pool.query('SELECT id FROM lessons WHERE id=? AND is_deleted=0', [id]);
      if (!existing.length) return res.status(404).json({ success: false, message: 'Không tìm thấy bài học.' });
    }
    return res.json({ success: true, message: 'Cập nhật bài học thành công.' });
  } catch (err) { next(err); }
}

// DELETE /api/lessons/:id (admin)
async function remove(req, res, next) {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('UPDATE lessons SET is_deleted=1 WHERE id=?', [id]);
    return res.json({ success: true, message: 'Đã xóa bài học.' });
  } catch (err) { next(err); }
}

// POST /api/lessons/:id/progress (auth required)
async function updateProgress(req, res, next) {
  const lessonId = Number(req.params.id);
  const { status } = req.body;
  const userId = req.user.id;
  try {
    const validStatuses = ['not_started', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [lessons] = await conn.query(
        `SELECT l.id, l.course_id, c.price_vnd,
                CASE WHEN c.price_vnd=0 OR c.id IS NULL OR ?='admin' THEN 1
                  WHEN EXISTS (
                    SELECT 1 FROM course_subscriptions s WHERE s.course_id=c.id AND s.user_id=?
                      AND s.status='active' AND (s.ends_at IS NULL OR s.ends_at>NOW())
                  ) THEN 1 ELSE 0 END AS has_access
         FROM lessons l LEFT JOIN courses c ON c.id=l.course_id
         WHERE l.id=? AND l.is_deleted=0 FOR UPDATE`,
        [req.user.role, userId, lessonId]
      );
      if (!lessons.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Không tìm thấy bài học.' });
      }
      if (!lessons[0].has_access) {
        await conn.rollback();
        return res.status(403).json({ success: false, message: 'Hãy mua khóa học để lưu tiến độ bài học này.' });
      }

      await conn.query(
        `INSERT INTO lesson_progress (user_id, lesson_id, status, started_at, completed_at)
         VALUES (?, ?, ?, IF(? = 'not_started', NULL, NOW()), IF(? = 'completed', NOW(), NULL))
         ON DUPLICATE KEY UPDATE
           started_at = IF(VALUES(status) = 'not_started', NULL, COALESCE(started_at, NOW())),
           completed_at = IF(VALUES(status) = 'completed', COALESCE(completed_at, NOW()), NULL),
           status = VALUES(status)`,
        [userId, lessonId, status, status, status]
      );
      await refreshLearningStats(conn, userId);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return res.json({ success: true, message: 'Cập nhật tiến độ thành công.', status });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, create, update, remove, updateProgress };
