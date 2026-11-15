const jwt = require('jsonwebtoken');

const VIDEO_ID_PATTERN = /^[a-f0-9-]{36}$/i;

function createVideoPlaybackUrl(videoUrl, row, user) {
  if (!videoUrl) return '';
  const match = /^\/media\/videos\/([a-f0-9-]{36})$/i.exec(videoUrl);
  if (!match) return videoUrl;

  const hasFullAccess = user?.role === 'admin' ||
    (Number(row.price_vnd) > 0 && Boolean(row.has_access));
  if (!hasFullAccess) return videoUrl;
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET phải được cấu hình với ít nhất 32 ký tự để cấp quyền phát video.');
  }

  const accessToken = jwt.sign(
    { videoAssetId: match[1], fullAccess: true },
    process.env.JWT_SECRET,
    {
      audience: 'video-stream',
      expiresIn: '2h',
      subject: String(user.id),
    }
  );
  return `${videoUrl}?accessToken=${encodeURIComponent(accessToken)}`;
}

function hasValidVideoAccessToken(token, assetId) {
  if (!token || !VIDEO_ID_PATTERN.test(assetId) ||
      !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return false;
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, { audience: 'video-stream' });
    return claims.videoAssetId === assetId && claims.fullAccess === true;
  } catch {
    return false;
  }
}

module.exports = { createVideoPlaybackUrl, hasValidVideoAccessToken };
