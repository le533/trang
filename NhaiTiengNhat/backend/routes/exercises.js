const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getOne, submit, getAttempts, create, remove } = require('../controllers/exercisesController');
const { authMiddleware, adminMiddleware, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const LEVELS = ['N5','N4','N3','N2','N1'];

router.get('/', optionalAuth, list);
router.get('/:id', getOne);
router.get('/:id/attempts', authMiddleware, getAttempts);

router.post('/:id/submit', authMiddleware,
  body('answers').isArray({ min: 1 }).withMessage('Cần có ít nhất một câu trả lời.'),
  body('answers.*.questionId').isInt({ min: 1 }),
  body('answers.*.choiceId').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
  body('answers.*.answerText').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  validate, submit);

router.post('/', adminMiddleware,
  body('title').trim().notEmpty(),
  body('level').isIn(LEVELS),
  body('description').trim().notEmpty(),
  body('questions').isArray({ min: 1, max: 100 }),
  body('questions.*.text').trim().notEmpty(),
  body('questions.*.type').optional().isIn(['multiple_choice','short_answer','true_false']),
  body('questions.*.choices').isArray({ min: 1, max: 10 }),
  body('questions.*.choices.*.text').trim().notEmpty(),
  body('questions.*.choices.*.isCorrect').isBoolean(),
  validate, create);

router.delete('/:id', adminMiddleware, remove);

module.exports = router;
