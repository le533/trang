/**
 * mockPaymentController.js
 * Giả lập thanh toán nội bộ — dùng cho môi trường dev/demo.
 * KHÔNG dùng tiền thật. Toàn bộ logic mở khóa khóa học giữ nguyên
 * như VNPAY thật, chỉ bỏ bước gọi ra cổng bên ngoài.
 */
const crypto = require('crypto');
const { pool } = require('../config/database');
const { hasCourseAccess } = require('../utils/courseAccess');

/** Tạo đơn hàng giả lập, trả về orderRef + thông tin khóa học */
async function createMockOrder(req, res, next) {
  const courseId = Number(req.body.courseId);
  if (!Number.isSafeInteger(courseId) || courseId < 1) {
    return res.status(400).json({ success: false, message: 'Khóa học không hợp lệ.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [courses] = await connection.query(
      'SELECT id, title, level, price_vnd, duration_days FROM courses WHERE id=? AND is_published=1 LIMIT 1 FOR UPDATE',
      [courseId]
    );
    if (!courses.length || Number(courses[0].price_vnd) <= 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học trả phí.' });
    }
    if (await hasCourseAccess(connection, req.user.id, courseId, req.user.role)) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Tài khoản đã có quyền học khóa này.' });
    }

    const course = courses[0];
    const orderRef = `MOCK${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await connection.query(
      `INSERT INTO payment_orders (order_ref, user_id, course_id, amount_vnd, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [orderRef, req.user.id, courseId, course.price_vnd, expires]
    );
    await connection.commit();

    return res.status(201).json({
      success: true,
      orderRef,
      course: {
        id: course.id,
        title: course.title,
        level: course.level,
        priceVnd: Number(course.price_vnd),
        durationDays: course.duration_days,
      },
      expiresAt: expires.toISOString(),
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
}

/** Xác nhận thanh toán giả lập — mở khóa khóa học ngay */
async function confirmMockPayment(req, res, next) {
  const orderRef = String(req.params.orderRef || '').trim().slice(0, 64);
  if (!orderRef) {
    return res.status(400).json({ success: false, message: 'Thiếu mã đơn hàng.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [orders] = await connection.query(
      'SELECT * FROM payment_orders WHERE order_ref=? LIMIT 1 FOR UPDATE',
      [orderRef]
    );
    if (!orders.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }
    const order = orders[0];

    // Chỉ cho phép chủ đơn hàng xác nhận
    if (Number(order.user_id) !== Number(req.user.id)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Không có quyền xác nhận đơn hàng này.' });
    }
    if (order.status === 'paid') {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Đơn hàng đã được thanh toán trước đó.' });
    }
    if (new Date(order.expires_at) < new Date()) {
      await connection.rollback();
      return res.status(410).json({ success: false, message: 'Đơn hàng đã hết hạn. Vui lòng tạo lại.' });
    }

    // Đánh dấu đã thanh toán
    await connection.query(
      `UPDATE payment_orders
       SET status='paid', gateway_response='mock', paid_at=NOW()
       WHERE id=?`,
      [order.id]
    );

    // Mở khóa khóa học
    const [courseRows] = await connection.query(
      'SELECT duration_days FROM courses WHERE id=?',
      [order.course_id]
    );
    const durationDays = courseRows[0]?.duration_days;
    const endsAt = durationDays ? new Date(Date.now() + Number(durationDays) * 86400000) : null;

    await connection.query(
      `INSERT INTO course_subscriptions (user_id, course_id, payment_order_id, status, starts_at, ends_at)
       VALUES (?, ?, ?, 'active', NOW(), ?)
       ON DUPLICATE KEY UPDATE
         payment_order_id = VALUES(payment_order_id),
         status = 'active',
         starts_at = NOW(),
         ends_at = VALUES(ends_at)`,
      [order.user_id, order.course_id, order.id, endsAt]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: 'Thanh toán thành công. Khóa học đã được mở.',
      orderRef,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
}

module.exports = { createMockOrder, confirmMockPayment };
