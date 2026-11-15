const express = require('express');
const { body } = require('express-validator');
const { list, moderate, moderationQueue, submit } = require('../controllers/feedbackController');
const { adminMiddleware, authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
router.get('/', list);
router.post('/', authMiddleware,
  body('rating').isInt({ min: 1, max: 5 }),
  body('message').isString().isLength({ min: 10, max: 1200 }),
  body('courseId').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
  validate, submit);
router.get('/moderation', adminMiddleware, moderationQueue);
router.put('/:id/moderation', adminMiddleware,
  body('approved').isBoolean(),
  validate, moderate);

module.exports = router;
