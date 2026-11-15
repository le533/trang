const { pool } = require('../config/database');

async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT f.id, f.course_id, f.rating, f.message, f.is_verified, f.created_at,
              LEFT(SUBSTRING_INDEX(u.full_name, ' ', 1), 1) AS name_initial,
              c.title AS course_title
       FROM learner_feedback f JOIN users u ON u.id=f.user_id
       LEFT JOIN courses c ON c.id=f.course_id
       WHERE f.status='approved' AND f.is_verified=1 ORDER BY f.created_at DESC LIMIT 12`
    );
    return res.json({
      success: true,
      data: rows.map(row => ({
        id: String(row.id),
        displayName: `${row.name_initial}***`,
        rating: row.rating,
        message: row.message,
        verified: Boolean(row.is_verified),
        courseTitle: row.course_title || 'Nihongo Learning',
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function submit(req, res, next) {
  const rating = Number(req.body.rating);
  const message = String(req.body.message || '').trim();
  const courseId = req.body.courseId ? Number(req.body.courseId) : null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 ||
      message.length < 10 || message.length > 1200 ||
      (courseId !== null && (!Number.isSafeInteger(courseId) || courseId < 1))) {
    return res.status(400).json({ success: false, message: 'Hãy chọn số sao và nhập nhận xét từ 10 đến 1.200 ký tự.' });
  }
  try {
    let verified = false;
    if (courseId) {
      const [courses] = await pool.query(
        'SELECT id, price_vnd FROM courses WHERE id=? AND is_published=1 LIMIT 1',
        [courseId]
      );
      if (!courses.length) return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học.' });
      if (Number(courses[0].price_vnd) > 0) {
        const [purchases] = await pool.query(
          `SELECT 1 FROM course_subscriptions s
           JOIN payment_orders o ON o.id=s.payment_order_id
           WHERE s.user_id=? AND s.course_id=? AND s.status IN ('active','expired')
             AND o.status='paid' LIMIT 1`,
          [req.user.id, courseId]
        );
        verified = purchases.length > 0;
        if (!verified) return res.status(403).json({ success: false, message: 'Chỉ học viên đã thanh toán khóa học mới có thể đánh giá khóa này.' });
      } else {
        const [activity] = await pool.query(
          `SELECT EXISTS(
             SELECT 1 FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id
             WHERE p.user_id=? AND l.course_id=? AND p.status IN ('in_progress','completed')
           ) AS learned`,
          [req.user.id, courseId]
        );
        verified = Boolean(activity[0].learned);
        if (!verified) return res.status(403).json({ success: false, message: 'Hãy bắt đầu ít nhất một bài học trong khóa này trước khi đánh giá.' });
      }
    } else {
      const [activity] = await pool.query(
        `SELECT EXISTS(SELECT 1 FROM exercise_attempts WHERE user_id=? AND completed_at IS NOT NULL)
           OR EXISTS(SELECT 1 FROM lesson_progress WHERE user_id=? AND status='completed') AS learned`,
        [req.user.id, req.user.id]
      );
      verified = Boolean(activity[0].learned);
    }

    await pool.query(
      'INSERT INTO learner_feedback (user_id, course_id, rating, message, is_verified) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, courseId, rating, message, verified]
    );
    return res.status(201).json({
      success: true,
      message: 'Cảm ơn bạn! Nhận xét sẽ hiển thị sau khi được duyệt.',
      verified,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Bạn đã gửi nhận xét cho nội dung này.' });
    }
    next(error);
  }
}

async function moderationQueue(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT f.id, f.user_id, f.course_id, f.rating, f.message, f.is_verified, f.created_at,
              u.full_name, c.title AS course_title
       FROM learner_feedback f JOIN users u ON u.id=f.user_id
       LEFT JOIN courses c ON c.id=f.course_id
       WHERE f.status='pending' ORDER BY f.created_at LIMIT 100`
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
}

async function moderate(req, res, next) {
  const approved = req.body.approved;
  if (typeof approved !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Trạng thái duyệt không hợp lệ.' });
  }
  try {
    const [feedback] = await pool.query(
      'SELECT id, is_verified, status FROM learner_feedback WHERE id=? LIMIT 1',
      [req.params.id]
    );
    if (!feedback.length) return res.status(404).json({ success: false, message: 'Không tìm thấy nhận xét.' });
    if (feedback[0].status !== 'pending') {
      return res.status(409).json({ success: false, message: 'Nhận xét này đã được xử lý.' });
    }
    if (approved && !feedback[0].is_verified) {
      return res.status(409).json({ success: false, message: 'Chỉ có thể công khai nhận xét từ học viên đã xác minh.' });
    }
    const [result] = await pool.query(
      "UPDATE learner_feedback SET status=? WHERE id=? AND status='pending' AND (is_verified=1 OR ?=0)",
      [approved ? 'approved' : 'rejected', req.params.id, approved ? 1 : 0]
    );
    if (!result.affectedRows) {
      return res.status(409).json({ success: false, message: 'Nhận xét đã được xử lý hoặc chưa thể công khai.' });
    }
    return res.json({ success: true, message: approved ? 'Đã duyệt nhận xét.' : 'Đã từ chối nhận xét.' });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, moderate, moderationQueue, submit };
