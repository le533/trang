const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { listUsers, setUserStatus, setUserRole, deleteUser, reports } = require('../controllers/adminController');
const { adminMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// All admin routes require admin role
router.use(adminMiddleware);

router.get('/users', listUsers);
router.put('/users/:id/status',
  body('status').isIn(['active','disabled']),
  validate, setUserStatus);
router.put('/users/:id/role',
  body('role').isIn(['user','admin']),
  validate, setUserRole);
router.delete('/users/:id', deleteUser);
router.get('/reports', reports);

module.exports = router;
