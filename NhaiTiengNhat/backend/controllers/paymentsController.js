const crypto = require('crypto');
const { pool } = require('../config/database');
const { hasCourseAccess } = require('../utils/courseAccess');
const { createSigningString, createVnpaySignature, formatVnpayDate, verifyVnpaySignature } = require('../utils/vnpay');

function getVnpayConfig() {
  const { VNPAY_TMN_CODE, VNPAY_HASH_SECRET, VNPAY_URL, APP_PUBLIC_URL, VNPAY_RETURN_URL } = process.env;
  if (!VNPAY_TMN_CODE || !VNPAY_HASH_SECRET || !VNPAY_URL) {
    return { error: 'Chưa cấu hình đầy đủ thông tin VNPay Sandbox.' };
  }
  if (!APP_PUBLIC_URL) {
    return { error: 'Cần cấu hình APP_PUBLIC_URL trong backend/.env.' };
  }
  let publicUrl;
  try {
    publicUrl = new URL(APP_PUBLIC_URL);
  } catch {
    return { error: 'APP_PUBLIC_URL không đúng định dạng URL.' };
  }
  const isDev = process.env.NODE_ENV !== 'production';
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(publicUrl.hostname);
  if (!isDev && (publicUrl.protocol !== 'https:' || isLocalhost)) {
    return { error: 'APP_PUBLIC_URL cần là địa chỉ HTTPS công khai khi chạy production.' };
  }

  // Return URL: ưu tiên VNPAY_RETURN_URL nếu có (khi dev dùng URL tĩnh của frontend),
  // còn không thì dùng route /api/payments/vnpay/return của server
  const returnUrl = VNPAY_RETURN_URL || `${publicUrl.origin}/api/payments/vnpay/return`;

  return {
    tmnCode: VNPAY_TMN_CODE,
    hashSecret: VNPAY_HASH_SECRET,
    paymentUrl: VNPAY_URL,
    publicUrl: publicUrl.origin,
    returnUrl,
  };
}

function responseCodeForIpn(code) {
  return { RspCode: code, Message: ({
    '00': 'Confirm Success',
    '01': 'Order not found',
    '04': 'Invalid amount',
    '97': 'Invalid signature',
    '99': 'Unknown error',
  })[code] || 'Unknown error' };
}

async function createCheckout(req, res, next) {
  const config = getVnpayConfig();
  if (config.error) return res.status(503).json({ success: false, message: config.error });
  const courseId = Number(req.body.courseId);
  if (!Number.isSafeInteger(courseId) || courseId < 1) {
    return res.status(400).json({ success: false, message: 'Khóa học không hợp lệ.' });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [courses] = await connection.query(
      'SELECT id, title, price_vnd, duration_days FROM courses WHERE id=? AND is_published=1 LIMIT 1 FOR UPDATE',
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
    const orderRef = `NL${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const now = new Date();
    const expires = new Date(now.getTime() + 15 * 60 * 1000);
    await connection.query(
      `INSERT INTO payment_orders (order_ref, user_id, course_id, amount_vnd, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [orderRef, req.user.id, courseId, course.price_vnd, expires]
    );
    await connection.commit();

    const parameters = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: config.tmnCode,
      vnp_Amount: String(Number(course.price_vnd) * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: orderRef,
      vnp_OrderInfo: `Thanh toan khoa hoc ${course.level}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: config.returnUrl,
      vnp_IpAddr: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
        .split(',')[0].trim().replace('::ffff:', '').slice(0, 45),
      vnp_CreateDate: formatVnpayDate(now),
      vnp_ExpireDate: formatVnpayDate(expires),
    };
    const signedQuery = createSigningString(parameters);
    const signature = createVnpaySignature(parameters, config.hashSecret);
    return res.status(201).json({
      success: true,
      orderRef,
      paymentUrl: `${config.paymentUrl}?${signedQuery}&vnp_SecureHash=${signature}`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
}

async function confirmIpn(req, res, next) {
  const config = getVnpayConfig();
  if (config.error) return res.status(503).json(responseCodeForIpn('99'));
  if (!verifyVnpaySignature(req.query, config.hashSecret)) {
    return res.json(responseCodeForIpn('97'));
  }
  const {
    vnp_TxnRef: orderRef,
    vnp_Amount: paymentAmount,
    vnp_ResponseCode: responseCode,
    vnp_TransactionNo: transactionNo,
    vnp_BankCode: bankCode,
    vnp_TmnCode: tmnCode,
  } = req.query;
  if (tmnCode !== config.tmnCode || !orderRef || !/^\d+$/.test(String(paymentAmount || ''))) {
    return res.json(responseCodeForIpn('04'));
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
      return res.json(responseCodeForIpn('01'));
    }
    const order = orders[0];
    if (Number(paymentAmount) !== Number(order.amount_vnd) * 100) {
      await connection.rollback();
      return res.json(responseCodeForIpn('04'));
    }
    if (order.status === 'paid') {
      await connection.rollback();
      return res.json(responseCodeForIpn('00'));
    }

    const paid = responseCode === '00';
    await connection.query(
      `UPDATE payment_orders SET status=?, vnp_transaction_no=?, vnp_bank_code=?,
       gateway_response=?, paid_at=IF(?='paid', NOW(), paid_at) WHERE id=?`,
      [paid ? 'paid' : 'failed', String(transactionNo || '').slice(0, 40) || null,
        String(bankCode || '').slice(0, 32) || null, String(responseCode || '').slice(0, 8), paid ? 'paid' : 'failed', order.id]
    );
    if (paid) {
      const [courses] = await connection.query('SELECT duration_days FROM courses WHERE id=?', [order.course_id]);
      const durationDays = courses[0]?.duration_days;
      const endsAt = durationDays ? new Date(Date.now() + Number(durationDays) * 86400000) : null;
      await connection.query(
        `INSERT INTO course_subscriptions (user_id, course_id, payment_order_id, status, starts_at, ends_at)
         VALUES (?, ?, ?, 'active', NOW(), ?)
         ON DUPLICATE KEY UPDATE payment_order_id=VALUES(payment_order_id), status='active',
           starts_at=NOW(), ends_at=VALUES(ends_at)`,
        [order.user_id, order.course_id, order.id, endsAt]
      );
    }
    await connection.commit();
    return res.json(responseCodeForIpn('00'));
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
}

function receiveReturn(req, res) {
  const config = getVnpayConfig();
  const valid = !config.error && verifyVnpaySignature(req.query, config.hashSecret);
  const destination = new URL('/pages/payment-result.html', process.env.APP_PUBLIC_URL || 'http://127.0.0.1:3000');
  destination.searchParams.set('order', String(req.query.vnp_TxnRef || ''));
  destination.searchParams.set('status', valid && req.query.vnp_ResponseCode === '00' ? 'checking' : 'failed');
  return res.redirect(303, destination.href);
}

async function getOrder(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT o.order_ref, o.amount_vnd, o.status, o.created_at, o.paid_at, c.title AS course_title
       FROM payment_orders o JOIN courses c ON c.id=o.course_id
       WHERE o.order_ref=? AND o.user_id=? LIMIT 1`,
      [String(req.params.orderRef).slice(0, 64), req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch.' });
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
}

module.exports = { confirmIpn, createCheckout, getOrder, receiveReturn };
