const DOCUMENT_API_BASE = window.NIHONGO_API_BASE || (window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : `${window.location.origin}/api`);

function documentToken() {
  return getToken();
}

async function documentRequest(path, options = {}) {
  const headers = { ...options.headers };
  const token = documentToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${DOCUMENT_API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({ message: 'Phản hồi không hợp lệ từ máy chủ.' }));
  if (!response.ok) throw new Error(data.message || `Máy chủ trả về lỗi ${response.status}.`);
  return data;
}

const documentGrid = document.querySelector('#document-grid');
if (documentGrid) {
  const readerDialog = document.querySelector('#document-reader-dialog');
  const readerPages = document.querySelector('#reader-page-list');
  const readerStatus = document.querySelector('#reader-save-status');
  const readerPageStatus = document.querySelector('#reader-page-status');
  let currentDocument = null;
  let currentPage = 1;
  let totalPages = 1;
  let savedRatio = 0;
  let isRestoring = false;
  let saveTimer;
  let intersectionObserver;

  function showDocumentMessage(message, type = '') {
    const node = document.querySelector('#documents-message');
    node.textContent = message;
    node.className = `form-notice${type ? ` is-${type}` : ''}`;
  }

  function createDocumentCard(documentItem) {
    const card = document.createElement('article');
    card.className = 'document-card';
    const type = document.createElement('span');
    type.className = 'document-type-badge';
    type.textContent = documentItem.fileType.toUpperCase();
    const title = document.createElement('h2');
    title.textContent = documentItem.title;
    const meta = document.createElement('p');
    meta.textContent = `${documentItem.courseTitle} · ${documentItem.lastPage > 1 ? `Đang đọc trang ${documentItem.lastPage}` : 'Chưa đọc'}`;
    const action = document.createElement('a');
    action.className = 'button button-primary';
    action.textContent = documentItem.locked ? 'Xem khóa học' : 'Đọc tài liệu';
    action.href = documentItem.locked
      ? '../training/index.html'
      : `index.html?id=${encodeURIComponent(documentItem.id)}`;
    card.append(type, title, meta, action);
    return card;
  }

  function splitIntoPages(text) {
    const paragraphs = text.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    const pages = [];
    let page = '';
    for (const paragraph of paragraphs) {
      if (page && page.length + paragraph.length + 2 > 2600) {
        pages.push(page);
        page = '';
      }
      page += `${page ? '\n\n' : ''}${paragraph}`;
    }
    if (page) pages.push(page);
    return pages.length ? pages : ['Tài liệu không chứa văn bản có thể hiển thị.'];
  }

  function updateReaderPageStatus() {
    readerPageStatus.textContent = `Trang ${currentPage} / ${totalPages}`;
    document.querySelector('#reader-prev').disabled = currentPage <= 1;
    document.querySelector('#reader-next').disabled = currentPage >= totalPages;
  }

  function getPageForScrollPosition() {
    const pages = [...readerPages.querySelectorAll('[data-reader-page]')];
    if (!pages.length) return 1;
    const containerTop = readerPages.getBoundingClientRect().top;
    let closestPage = Number(pages[0].dataset.readerPage);
    let smallestDistance = Infinity;
    for (const page of pages) {
      const distance = Math.abs(page.getBoundingClientRect().top - containerTop);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestPage = Number(page.dataset.readerPage);
      }
    }
    return closestPage;
  }

  function getActivePageScrollRatio() {
    const page = readerPages.querySelector(`[data-reader-page="${currentPage}"]`);
    if (!page) return 0;
    const container = readerPages.getBoundingClientRect();
    const rect = page.getBoundingClientRect();
    return Math.max(0, Math.min(1, (container.top - rect.top) / Math.max(1, rect.height - container.height)));
  }

  async function saveReaderProgress() {
    if (isRestoring || !currentDocument) return;
    const pageNumber = currentPage;
    const scrollRatio = Number(getActivePageScrollRatio().toFixed(6));
    try {
      await documentRequest(`/documents/${encodeURIComponent(currentDocument.id)}/progress`, {
        method: 'PUT',
        body: JSON.stringify({ pageNumber, scrollRatio }),
      });
      readerStatus.textContent = 'Đã lưu vị trí đọc của bạn.';
    } catch (error) {
      readerStatus.textContent = `Không lưu được vị trí đọc: ${error.message}`;
    }
  }

  function onReaderScroll() {
    currentPage = getPageForScrollPosition();
    updateReaderPageStatus();
    if (!isRestoring) {
      readerStatus.textContent = 'Đang lưu vị trí đọc…';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveReaderProgress, 700);
    }
  }

  async function loadPdf(documentItem) {
    const response = await fetch(`${DOCUMENT_API_BASE}/documents/${encodeURIComponent(documentItem.id)}/file`, {
      headers: { Authorization: `Bearer ${documentToken()}` },
    });
    if (!response.ok) throw new Error('Không thể tải PDF. Hãy đăng nhập lại hoặc kiểm tra quyền khóa học.');
    const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
    const pdf = await pdfjs.getDocument({ data: await response.arrayBuffer() }).promise;
    totalPages = pdf.numPages;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.25 });
      const article = document.createElement('article');
      article.className = 'reader-document-page';
      article.dataset.readerPage = String(pageNumber);
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-label', `Trang ${pageNumber}`);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Trình duyệt không hỗ trợ vẽ PDF.');
      const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * deviceScale);
      canvas.height = Math.floor(viewport.height * deviceScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      await page.render({
        canvasContext: context,
        viewport,
        transform: deviceScale === 1 ? null : [deviceScale, 0, 0, deviceScale, 0, 0],
      }).promise;
      article.append(canvas);
      readerPages.append(article);
    }
  }

  async function openDocument(documentId) {
    if (!documentToken()) {
      showDocumentMessage('Hãy đăng nhập để lưu vị trí đọc và mở tài liệu.', 'error');
      return;
    }
    isRestoring = true;
    readerPages.replaceChildren();
    if (intersectionObserver) intersectionObserver.disconnect();
    try {
      const { data } = await documentRequest(`/documents/${encodeURIComponent(documentId)}`);
      currentDocument = data;
      currentPage = data.pageNumber || 1;
      savedRatio = Number(data.scrollRatio || 0);
      totalPages = 1;
      document.querySelector('#reader-title').textContent = data.title;
      if (data.fileType === 'pdf') {
        await loadPdf(data);
      } else {
        const pages = splitIntoPages(data.text || '');
        totalPages = pages.length;
        pages.forEach((text, index) => {
          const article = document.createElement('article');
          article.className = 'reader-document-page reader-text-page';
          article.dataset.readerPage = String(index + 1);
          const heading = document.createElement('h3');
          heading.textContent = `Trang ${index + 1}`;
          const content = document.createElement('pre');
          content.textContent = text;
          article.append(heading, content);
          readerPages.append(article);
        });
      }
      currentPage = Math.min(Math.max(1, currentPage), totalPages);
      isRestoring = false;
      readerDialog.showModal();
      requestAnimationFrame(() => {
        const page = readerPages.querySelector(`[data-reader-page="${currentPage}"]`);
        if (page) readerPages.scrollTop = page.offsetTop + savedRatio * Math.max(0, page.offsetHeight - readerPages.clientHeight);
        updateReaderPageStatus();
        intersectionObserver = new IntersectionObserver(onReaderScroll, {
          root: readerPages,
          threshold: [0.1, 0.5, 0.9],
        });
        readerPages.querySelectorAll('[data-reader-page]').forEach(node => intersectionObserver.observe(node));
      });
    } catch (error) {
      isRestoring = false;
      showDocumentMessage(error.message, 'error');
      if (readerDialog.open) readerDialog.close();
    }
  }

  async function loadDocuments() {
    const result = await documentRequest('/documents');
    documentGrid.replaceChildren(...result.data.map(createDocumentCard));
    const form = document.querySelector('#document-upload-form');
    if (form) form.hidden = true;
    if (typeof onAuthReady === 'function') {
      onAuthReady(function (isAdminVerified) {
        if (form) form.hidden = !isAdminVerified;
      });
    }
    if (!result.data.length) {
      const empty = document.createElement('p');
      empty.className = 'learning-empty-state';
      empty.textContent = 'Chưa có tài liệu được xuất bản.';
      documentGrid.append(empty);
    }
    if (typeof onAuthReady === 'function') {
      onAuthReady(async function (isAdminVerified) {
        if (!isAdminVerified) return;
        try {
          const courses = await documentRequest('/courses');
          const selector = form.elements.courseId;
          for (const course of courses.data) {
            if (course.isFree) continue;
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.title;
            selector.append(option);
          }
        } catch (_) {}
      });
    }

  document.querySelector('#document-upload-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    showDocumentMessage('Đang tải và xử lý tài liệu…');
    try {
      const body = new FormData(form);
      const result = await documentRequest('/documents', { method: 'POST', body });
      showDocumentMessage(result.message);
      form.reset();
      await loadDocuments();
    } catch (error) {
      showDocumentMessage(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector('#reader-prev')?.addEventListener('click', () => {
    const page = readerPages.querySelector(`[data-reader-page="${Math.max(1, currentPage - 1)}"]`);
    page?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  document.querySelector('#reader-next')?.addEventListener('click', () => {
    const page = readerPages.querySelector(`[data-reader-page="${Math.min(totalPages, currentPage + 1)}"]`);
    page?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  readerPages.addEventListener('scroll', onReaderScroll, { passive: true });
  document.querySelector('#reader-close')?.addEventListener('click', () => readerDialog.close());
  readerDialog.addEventListener('close', () => {
    clearTimeout(saveTimer);
    saveReaderProgress();
    intersectionObserver?.disconnect();
  });

  loadDocuments()
    .then(() => {
      const documentId = new URLSearchParams(location.search).get('id');
      if (documentId) openDocument(documentId);
    })
    .catch(error => {
      const region = document.querySelector('#documents-error');
      region.textContent = `Không thể tải thư viện: ${error.message}`;
      region.hidden = false;
    });
}
