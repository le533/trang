const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { pool } = require('../config/database');
const { hasCourseAccess } = require('../utils/courseAccess');

const documentDirectory = path.resolve(__dirname, '../uploads/documents');
fs.mkdirSync(documentDirectory, { recursive: true });

async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT d.id, d.title, d.file_type, d.course_id, c.title AS course_title, c.price_vnd,
              CASE WHEN c.id IS NULL OR c.price_vnd=0 OR ?='admin' THEN 1
                WHEN EXISTS (SELECT 1 FROM course_subscriptions s WHERE s.user_id=? AND s.course_id=c.id
                  AND s.status='active' AND (s.ends_at IS NULL OR s.ends_at>NOW())) THEN 1 ELSE 0 END AS has_access,
              dp.page_number, dp.scroll_ratio
       FROM learning_documents d LEFT JOIN courses c ON c.id=d.course_id
       LEFT JOIN document_progress dp ON dp.document_id=d.id AND dp.user_id=?
       WHERE d.is_published=1 ORDER BY d.created_at DESC`,
      [req.user?.role || 'user', req.user?.id || 0, req.user?.id || 0]
    );
    return res.json({
      success: true,
      data: rows.map(row => ({
        id: row.id,
        title: row.title,
        fileType: row.file_type,
        courseId: row.course_id ? String(row.course_id) : '',
        courseTitle: row.course_title || 'Tài liệu miễn phí',
        priceVnd: Number(row.price_vnd || 0),
        locked: !row.has_access,
        lastPage: Number(row.page_number || 1),
        scrollRatio: Number(row.scroll_ratio || 0),
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function read(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, c.price_vnd, c.title AS course_title,
              CASE WHEN c.id IS NULL OR c.price_vnd=0 OR ?='admin' THEN 1
                WHEN EXISTS (SELECT 1 FROM course_subscriptions s WHERE s.user_id=? AND s.course_id=c.id
                  AND s.status='active' AND (s.ends_at IS NULL OR s.ends_at>NOW())) THEN 1 ELSE 0 END AS has_access,
              dp.page_number, dp.scroll_ratio
       FROM learning_documents d LEFT JOIN courses c ON c.id=d.course_id
       LEFT JOIN document_progress dp ON dp.document_id=d.id AND dp.user_id=?
       WHERE d.id=? AND d.is_published=1 LIMIT 1`,
      [req.user.role, req.user.id, req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu.' });
    const document = rows[0];
    if (!document.has_access) {
      return res.status(403).json({ success: false, message: 'Tài liệu này thuộc khóa học trả phí.' });
    }
    return res.json({
      success: true,
      data: {
        id: document.id,
        title: document.title,
        fileType: document.file_type,
        text: document.extracted_text || '',
        pageNumber: Number(document.page_number || 1),
        scrollRatio: Number(document.scroll_ratio || 0),
        courseTitle: document.course_title || '',
      },
    });
  } catch (error) {
    next(error);
  }
}

async function streamFile(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT d.file_name, d.file_type, c.price_vnd,
              CASE WHEN c.id IS NULL OR c.price_vnd=0 OR ?='admin' THEN 1
                WHEN EXISTS (SELECT 1 FROM course_subscriptions s WHERE s.user_id=? AND s.course_id=c.id
                  AND s.status='active' AND (s.ends_at IS NULL OR s.ends_at>NOW())) THEN 1 ELSE 0 END AS has_access
       FROM learning_documents d LEFT JOIN courses c ON c.id=d.course_id
       WHERE d.id=? AND d.is_published=1 LIMIT 1`,
      [req.user.role, req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu.' });
    const file = rows[0];
    if (!file.has_access) return res.status(403).json({ success: false, message: 'Bạn chưa có quyền đọc tài liệu này.' });
    const filePath = path.resolve(documentDirectory, file.file_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Tệp tài liệu không có trên máy chủ.' });
    res.set({ 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' });
    return res.type(file.file_type === 'pdf' ? 'application/pdf' : 'application/octet-stream')
      .sendFile(filePath, { acceptRanges: file.file_type === 'pdf' }, error => {
        if (error && !res.headersSent) next(error);
      });
  } catch (error) {
    next(error);
  }
}

async function updateProgress(req, res, next) {
  const pageNumber = Number(req.body.pageNumber);
  const scrollRatio = Number(req.body.scrollRatio);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 ||
      !Number.isFinite(scrollRatio) || scrollRatio < 0 || scrollRatio > 1) {
    return res.status(400).json({ success: false, message: 'Vị trí đọc không hợp lệ.' });
  }
  try {
    const [documents] = await pool.query(
      `SELECT d.id, c.id AS course_id, c.price_vnd,
              CASE WHEN c.id IS NULL OR c.price_vnd=0 OR ?='admin' THEN 1
                WHEN EXISTS (SELECT 1 FROM course_subscriptions s WHERE s.user_id=? AND s.course_id=c.id
                  AND s.status='active' AND (s.ends_at IS NULL OR s.ends_at>NOW())) THEN 1 ELSE 0 END AS has_access
       FROM learning_documents d LEFT JOIN courses c ON c.id=d.course_id
       WHERE d.id=? AND d.is_published=1 LIMIT 1`,
      [req.user.role, req.user.id, req.params.id]
    );
    if (!documents.length) return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu.' });
    if (!documents[0].has_access) return res.status(403).json({ success: false, message: 'Bạn chưa có quyền đọc tài liệu này.' });
    await pool.query(
      `INSERT INTO document_progress (user_id, document_id, page_number, scroll_ratio)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE page_number=VALUES(page_number), scroll_ratio=VALUES(scroll_ratio)`,
      [req.user.id, req.params.id, pageNumber, scrollRatio]
    );
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function upload(req, res, next) {
  if (!req.file || !req.body.title?.trim()) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ success: false, message: 'Chọn tệp và nhập tiêu đề tài liệu.' });
  }
  const extension = path.extname(req.file.originalname).toLowerCase();
  const id = path.basename(req.file.filename, extension);
  let extractedText = null;
  try {
    const header = Buffer.alloc(8);
    const handle = await fs.promises.open(req.file.path, 'r');
    let bytesRead;
    try {
      ({ bytesRead } = await handle.read(header, 0, header.length, 0));
    } finally {
      await handle.close();
    }
    if ((extension === '.pdf' && (bytesRead < 5 || header.toString('ascii', 0, 5) !== '%PDF-')) ||
        (extension === '.docx' && (bytesRead < 4 || header.toString('hex', 0, 4) !== '504b0304'))) {
      throw Object.assign(new Error('Nội dung tệp không khớp định dạng PDF/DOCX.'), { status: 400 });
    }
    if (extension === '.docx') {
      const result = await mammoth.extractRawText({ path: req.file.path });
      extractedText = result.value.trim();
    } else if (extension === '.txt') {
      extractedText = (await fs.promises.readFile(req.file.path, 'utf8')).replace(/^\uFEFF/, '').trim();
    }
    if (extractedText && extractedText.length > 2000000) {
      throw Object.assign(new Error('Văn bản trích xuất vượt quá giới hạn 2 MB.'), { status: 413 });
    }
    const courseId = req.body.courseId ? Number(req.body.courseId) : null;
    if (courseId && !Number.isSafeInteger(courseId)) {
      throw Object.assign(new Error('Khóa học liên kết không hợp lệ.'), { status: 400 });
    }
    await pool.query(
      `INSERT INTO learning_documents
       (id, title, file_name, original_name, file_type, extracted_text, course_id, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.body.title.trim().slice(0, 255), req.file.filename,
        req.file.originalname.slice(0, 255), extension.slice(1), extractedText,
        courseId, req.user.id]
    );
    return res.status(201).json({ success: true, id, message: 'Đã tải tài liệu lên.' });
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(unlinkError => {
      if (unlinkError.code !== 'ENOENT') console.error('Không thể dọn tệp tài liệu:', unlinkError.message);
    });
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
}

module.exports = { documentDirectory, list, read, streamFile, updateProgress, upload };
