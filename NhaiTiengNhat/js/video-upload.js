const LEARNING_MEDIA_API = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);

function resolveLearningMediaUrl(source) {
  if (!source) return '';
  return new URL(source, `${LEARNING_MEDIA_API}/`).href;
}

function uploadLearningVideo(file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${LEARNING_MEDIA_API}/uploads/video`);
    const token = localStorage.getItem('nihongo_token') || sessionStorage.getItem('nihongo_token');
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);

    request.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      let data;
      try {
        data = JSON.parse(request.responseText);
      } catch {
        reject(new Error('Phản hồi tải video từ máy chủ không hợp lệ.'));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(data.message || `Tải video thất bại (HTTP ${request.status}).`));
        return;
      }
      resolve(data.url);
    });
    request.addEventListener('error', () => reject(new Error('Không thể kết nối để tải video lên máy chủ.')));
    request.addEventListener('abort', () => reject(new Error('Đã hủy tải video.')));

    const formData = new FormData();
    formData.append('video', file);
    request.send(formData);
  });
}
