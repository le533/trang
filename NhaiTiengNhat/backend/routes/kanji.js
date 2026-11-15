const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const { list, getOne, listRadicals, create, update, remove } = require('../controllers/kanjiController');
const { adminMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const LEVELS = ['N5','N4','N3','N2','N1'];

router.get('/radicals', listRadicals);
router.get('/', query('strokes').optional().isInt({ min: 1 }), validate, list);
router.get('/:id', getOne);

router.post('/', adminMiddleware,
  body('character').trim().notEmpty(),
  body('meaning').trim().notEmpty(),
  body('jlpt').isIn(LEVELS),
  body('strokes').isInt({ min: 1 }),
  body('kun').optional().isArray({ max: 30 }),
  body('kun.*').isString().trim().notEmpty(),
  body('on').optional().isArray({ max: 30 }),
  body('on.*').isString().trim().notEmpty(),
  body('radicals').optional().isArray({ max: 20 }),
  body('radicals.*').isString().trim().notEmpty(),
  validate, create);

router.put('/:id', adminMiddleware,
  body('character').trim().notEmpty(),
  body('meaning').trim().notEmpty(),
  body('jlpt').isIn(LEVELS),
  body('strokes').isInt({ min: 1 }),
  body('kun').optional().isArray({ max: 30 }),
  body('kun.*').isString().trim().notEmpty(),
  body('on').optional().isArray({ max: 30 }),
  body('on.*').isString().trim().notEmpty(),
  body('radicals').optional().isArray({ max: 20 }),
  body('radicals.*').isString().trim().notEmpty(),
  validate, update);

router.delete('/:id', adminMiddleware, remove);

module.exports = router;
