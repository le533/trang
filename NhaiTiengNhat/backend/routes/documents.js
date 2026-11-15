const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { adminMiddleware, authMiddleware, optionalAuth } = require('../middleware/auth');
const { documentDirectory, list, read, streamFile, updateProgress, upload } = require('../controllers/documentsController');

const router = express.Router();
const accepted = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.txt', 'text/plain'],
]);
const storage = multer.diskStorage({
  destination: documentDirectory,
  filename(req, file, callback) {
    callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});
const receiveDocument = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (accepted.get(path.extname(file.originalname).toLowerCase()) !== file.mimetype) {
      return callback(new Error('Chỉ chấp nhận PDF, DOCX hoặc TXT.'));
    }
    callback(null, true);
  },
});

router.get('/', optionalAuth, list);
router.post('/', adminMiddleware, (req, res, next) => {
  receiveDocument.single('document')(req, res, error => {
    if (error instanceof multer.MulterError) {
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        success: false,
        message: error.code === 'LIMIT_FILE_SIZE'
          ? 'Tài liệu vượt quá giới hạn 100 MB.'
          : 'Không thể nhận tệp tài liệu.',
      });
    }
    if (error) return res.status(400).json({ success: false, message: error.message });
    return upload(req, res, next);
  });
});
router.get('/:id/file', authMiddleware, streamFile);
router.get('/:id', authMiddleware, read);
router.put('/:id/progress', authMiddleware, updateProgress);

module.exports = router;
