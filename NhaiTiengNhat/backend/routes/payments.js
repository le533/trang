const express = require('express');
const { confirmIpn, createCheckout, getOrder, receiveReturn } = require('../controllers/paymentsController');
const { createMockOrder, confirmMockPayment } = require('../controllers/mockPaymentController');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// ── Giả lập thanh toán nội bộ (không cần cổng bên ngoài) ──────────────
router.post('/mock', authMiddleware, createMockOrder);
router.post('/mock/:orderRef/confirm', authMiddleware, confirmMockPayment);

// ── VNPAY (giữ lại để dùng sau khi có tài khoản thật) ─────────────────
router.post('/vnpay', authMiddleware, createCheckout);
router.get('/vnpay/ipn', confirmIpn);
router.get('/vnpay/return', receiveReturn);

// ── Tra cứu đơn hàng ──────────────────────────────────────────────────
router.get('/orders/:orderRef', authMiddleware, getOrder);

module.exports = router;
