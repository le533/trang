const express = require('express');
const router = express.Router();
const { myStats, leaderboard } = require('../controllers/statsController');
const { authMiddleware } = require('../middleware/auth');

router.get('/me', authMiddleware, myStats);
router.get('/leaderboard', leaderboard);

module.exports = router;
