const express = require('express');
const { list, enrollments } = require('../controllers/coursesController');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

const router = express.Router();
router.get('/', optionalAuth, list);
router.get('/mine', authMiddleware, enrollments);

module.exports = router;
