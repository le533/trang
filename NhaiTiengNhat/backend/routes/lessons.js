const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getOne, create, update, remove, updateProgress } = require('../controllers/lessonsController');
const { authMiddleware, adminMiddleware, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const LEVELS = ['N5','N4','N3','N2','N1'];
const STATUSES = ['not_started','in_progress','completed'];
function validVideoReference(value) {
  if (/^\/media\/videos\/[a-f0-9-]{36}$/i.test(value)) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

router.get('/', optionalAuth, list);
router.get('/:id', optionalAuth, getOne);

router.post('/:id/progress', authMiddleware,
  body('status').isIn(STATUSES).withMessage('Trạng thái không hợp lệ.'),
  validate, updateProgress);

router.post('/', adminMiddleware,
  body('title').trim().notEmpty(),
  body('level').isIn(LEVELS),
  body('summary').trim().notEmpty(),
  body('content').optional({ nullable: true }).isString().isLength({ max: 500000 }),
  body('courseId').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
  body('videoUrl').optional({ nullable: true, checkFalsy: true }).custom(validVideoReference),
  validate, create);

router.put('/:id', adminMiddleware,
  body('title').trim().notEmpty(),
  body('level').isIn(LEVELS),
  body('summary').trim().notEmpty(),
  body('content').optional({ nullable: true }).isString().isLength({ max: 500000 }),
  body('courseId').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
  body('videoUrl').optional({ nullable: true, checkFalsy: true }).custom(validVideoReference),
  validate, update);

router.delete('/:id', adminMiddleware, remove);

module.exports = router;
