function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.stack || err.message);
  const status = err.code === 'ER_DUP_ENTRY' ? 409 : err.status || err.statusCode || 500;
  const message =
    status === 409
      ? 'Dữ liệu đã tồn tại.'
      : process.env.NODE_ENV === 'production' && status >= 500
        ? 'Đã xảy ra lỗi phía máy chủ.'
        : err.message || 'Đã xảy ra lỗi phía máy chủ.';
  res.status(status).json({ success: false, message });
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route không tồn tại: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };
