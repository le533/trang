const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const { hasCourseAccess } = require('../utils/courseAccess');
const { hasValidVideoAccessToken } = require('../utils/videoAccess');

async function streamVideo(req, res, next) {
  const assetId = String(req.params.assetId || '');
  if (!/^[a-f0-9-]{36}$/i.test(assetId)) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy video.' });
  }
  try {
    const [assets] = await pool.query('SELECT * FROM video_assets WHERE id=? LIMIT 1', [assetId]);
    if (!assets.length) return res.status(404).json({ success: false, message: 'Không tìm thấy video.' });
    const asset = assets[0];
    const accessToken = String(req.query.accessToken || '');
    if (accessToken && !hasValidVideoAccessToken(accessToken, assetId)) {
      return res.status(403).json({ success: false, message: 'Quyền phát video đã hết hạn hoặc không hợp lệ. Hãy tải lại bài học.' });
    }
    let hasFullAccess = Boolean(accessToken);
    if (req.user) {
      if (req.user.role === 'admin') {
        hasFullAccess = true;
      } else if (!hasFullAccess) {
        const [lessons] = await pool.query(
          `SELECT DISTINCT l.course_id, c.price_vnd FROM lessons l
           JOIN courses c ON c.id=l.course_id
           WHERE l.video_url=? AND l.is_deleted=0 AND l.course_id IS NOT NULL`,
          [`/media/videos/${asset.id}`]
        );
        for (const lesson of lessons) {
          if (Number(lesson.price_vnd) > 0 &&
              await hasCourseAccess(pool, req.user.id, lesson.course_id, req.user.role)) {
            hasFullAccess = true;
            break;
          }
        }
      }
    }

    const fileName = hasFullAccess ? asset.file_name : asset.preview_file_name;
    const filePath = path.resolve(__dirname, '../uploads/videos', fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Tệp video không có trên máy chủ.' });
    }
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
      'X-Video-Access': hasFullAccess ? 'full' : 'preview',
      'X-Video-Preview-Limit': hasFullAccess ? 'none' : '300',
    });
    return res.sendFile(filePath, { acceptRanges: true }, error => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { streamVideo };
