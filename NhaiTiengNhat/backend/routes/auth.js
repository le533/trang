const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { register, login, me, updateProfile, changePassword } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

router.post('/register',
  body('fullName').trim().notEmpty().withMessage('Họ và tên không được để trống.'),
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^\S+$/).withMessage('Tên đăng nhập cần 3–30 ký tự, không có khoảng trắng.'),
  body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ.'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu tối thiểu 6 ký tự.'),
  validate, register);

router.post('/login',
  body('identifier').trim().notEmpty().withMessage('Vui lòng nhập email hoặc tên đăng nhập.'),
  body('password').notEmpty().withMessage('Vui lòng nhập mật khẩu.'),
  validate, login);

router.get('/me', authMiddleware, me);

router.put('/profile', authMiddleware,
  body('fullName').trim().notEmpty().withMessage('Họ và tên không được để trống.'),
  body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ.'),
  validate, updateProfile);

router.put('/password', authMiddleware,
  body('currentPassword').notEmpty().withMessage('Vui lòng nhập mật khẩu hiện tại.'),
  body('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới tối thiểu 6 ký tự.'),
  validate, changePassword);

module.exports = router;
