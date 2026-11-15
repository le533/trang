const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getOne, create, update, remove } = require('../controllers/grammarController');
const { adminMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const LEVELS = ['N5','N4','N3','N2','N1'];
function validVideoReference(value) {
  if (/^\/media\/videos\/[a-f0-9-]{36}$/i.test(value)) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

router.get('/', list);
router.get('/:id', getOne);

router.post('/', adminMiddleware,
  body('title').trim().notEmpty(),
  body('level').isIn(LEVELS),
  body('meaning').trim().notEmpty(),
  body('videoUrl').optional({ nullable: true, checkFalsy: true }).custom(validVideoReference),
  body('examples').optional().isArray({ max: 50 }),
  body('examples.*.japanese').trim().notEmpty(),
  body('examples.*.reading').optional({ nullable: true }).isString(),
  body('examples.*.vi').optional({ nullable: true }).isString(),
  body('examples.*.en').optional({ nullable: true }).isString(),
  validate, create);

router.put('/:id', adminMiddleware,
  body('title').trim().notEmpty(),
  body('level').isIn(LEVELS),
  body('meaning').trim().notEmpty(),
  body('videoUrl').optional({ nullable: true, checkFalsy: true }).custom(validVideoReference),
  body('examples').optional().isArray({ max: 50 }),
  body('examples.*.japanese').trim().notEmpty(),
  body('examples.*.reading').optional({ nullable: true }).isString(),
  body('examples.*.vi').optional({ nullable: true }).isString(),
  body('examples.*.en').optional({ nullable: true }).isString(),
  validate, update);

router.delete('/:id', adminMiddleware, remove);

module.exports = router;
