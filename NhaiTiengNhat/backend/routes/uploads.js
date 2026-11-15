const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const multer = require('multer');
const { adminMiddleware } = require('../middleware/auth');
const { pool } = require('../config/database');

const router = express.Router();
const execFileAsync = promisify(execFile);
const videoDirectory = path.resolve(__dirname, '../uploads/videos');
fs.mkdirSync(videoDirectory, { recursive: true });

const videoTypes = new Map([
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
]);

const storage = multer.diskStorage({
  destination: videoDirectory,
  filename(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

async function hasValidVideoSignature(file) {
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension === '.mp4') {
      return bytesRead >= 8 && header.toString('ascii', 4, 8) === 'ftyp';
    }
    return bytesRead >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  } finally {
    await handle.close();
  }
}

async function prepareVideo(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const assetId = path.basename(file.filename, extension);
  const previewFileName = `${assetId}.preview.mp4`;
  const previewPath = path.join(videoDirectory, previewFileName);
  const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

  const { stdout } = await execFileAsync(ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1',
    file.path,
  ], { timeout: 30000, windowsHide: true });
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Không đọc được thời lượng video.');

  await execFileAsync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-i', file.path, '-t', '300',
    '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast',
    '-crf', '26', '-c:a', 'aac', '-movflags', '+faststart', '-y', previewPath,
  ], { timeout: 10 * 60 * 1000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });

  return {
    id: assetId,
    fileName: file.filename,
    previewFileName,
    duration,
  };
}

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (videoTypes.get(extension) !== file.mimetype) {
      return callback(new Error('Chỉ chấp nhận tệp video MP4 hoặc WebM.'));
    }
    return callback(null, true);
  },
});

router.post('/video', adminMiddleware, (req, res, next) => {
  upload.single('video')(req, res, error => {
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        message: status === 413
          ? 'Video vượt quá giới hạn 500 MB.'
          : 'Không thể nhận tệp video.',
      });
    }
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Hãy chọn một tệp video MP4 hoặc WebM.' });
    }
    Promise.resolve().then(async () => {
      const valid = await hasValidVideoSignature(req.file);
      if (!valid) {
        throw Object.assign(new Error('Nội dung tệp không phải video MP4 hoặc WebM hợp lệ.'), { status: 400 });
      }
      const video = await prepareVideo(req.file);
      await pool.query(
        `INSERT INTO video_assets
         (id, file_name, preview_file_name, mime_type, file_size, duration_seconds, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [video.id, video.fileName, video.previewFileName, req.file.mimetype,
          req.file.size, video.duration, req.user.id]
      );
      return res.status(201).json({
        success: true,
        url: `/media/videos/${video.id}`,
        filename: req.file.originalname,
        size: req.file.size,
        previewDurationSeconds: Math.min(video.duration, 300),
      });
    }).catch(async error => {
      for (const fileName of [req.file.filename, `${path.basename(req.file.filename, path.extname(req.file.filename))}.preview.mp4`]) {
        await fs.promises.unlink(path.join(videoDirectory, fileName)).catch(unlinkError => {
          if (unlinkError.code !== 'ENOENT') console.error('Không thể dọn tệp video tải lỗi:', unlinkError.message);
        });
      }
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      if (error.code === 'ENOENT') {
        return res.status(503).json({
          success: false,
          message: 'Máy chủ chưa cài ffmpeg và ffprobe nên chưa thể tạo video xem thử 5 phút.',
        });
      }
      return next(error);
    });
  });
});

module.exports = router;
