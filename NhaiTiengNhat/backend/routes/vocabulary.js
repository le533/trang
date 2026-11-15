const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getOne, create, update, remove } = require('../controllers/vocabularyController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const LEVELS = ['N5','N4','N3','N2','N1'];
const optionalTextArray = field => body(field).optional().isArray({ max: 30 });

router.get('/', list);
router.get('/:id', getOne);

router.post('/', adminMiddleware,
  body('word').trim().notEmpty(),
  body('reading').trim().notEmpty(),
  body('level').isIn(LEVELS),
  optionalTextArray('meaning_vi'),
  body('meaning_vi.*').isString().trim().notEmpty(),
  optionalTextArray('meaning_en'),
  body('meaning_en.*').isString().trim().notEmpty(),
  optionalTextArray('part_of_speech'),
  body('part_of_speech.*').isString().trim().notEmpty(),
  optionalTextArray('part_of_speech_codes'),
  optionalTextArray('other_forms'),
  optionalTextArray('other_readings'),
  body('examples').optional().isArray({ max: 30 }),
  body('examples.*.ja').trim().notEmpty(),
  body('examples.*.furigana').optional({ nullable: true }).isString(),
  body('examples.*.vi').optional({ nullable: true }).isString(),
  body('examples.*.en').optional({ nullable: true }).isString(),
  validate, create);

router.put('/:id', adminMiddleware,
  body('word').trim().notEmpty(),
  body('reading').trim().notEmpty(),
  body('level').isIn(LEVELS),
  optionalTextArray('meaning_vi'),
  body('meaning_vi.*').isString().trim().notEmpty(),
  optionalTextArray('meaning_en'),
  body('meaning_en.*').isString().trim().notEmpty(),
  optionalTextArray('part_of_speech'),
  body('part_of_speech.*').isString().trim().notEmpty(),
  optionalTextArray('part_of_speech_codes'),
  optionalTextArray('other_forms'),
  optionalTextArray('other_readings'),
  body('examples').optional().isArray({ max: 30 }),
  body('examples.*.ja').trim().notEmpty(),
  body('examples.*.furigana').optional({ nullable: true }).isString(),
  body('examples.*.vi').optional({ nullable: true }).isString(),
  body('examples.*.en').optional({ nullable: true }).isString(),
  validate, update);

router.delete('/:id', adminMiddleware, remove);

module.exports = router;
