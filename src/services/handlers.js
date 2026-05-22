// EduBot — Service handlers (all backend-powered)
// Each handler: async ({ file, files, text }) → { type, ... }

const BACKEND_URL = "https://studentstools-backend.up.railway.app";

// ─── Helpers ────────────────────────────────────────────────────

function getUserIdHeader() {
  const uid = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return uid ? { 'X-User-Id': String(uid) } : {};
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

// FormData → file blob result
async function apiFile(path, form, filename, infoHeader = null) {
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST', headers: getUserIdHeader(), body: form,
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  const info = infoHeader ? r.headers.get(infoHeader) : null;
  return { type: 'file', blob, filename, ...(info ? { info } : {}) };
}

// JSON → text result
async function apiText(path, body) {
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { ...getUserIdHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  const { result } = await r.json();
  return { type: 'text', content: result };
}

// JSON → image (blob → dataUrl)
async function apiImage(path, body, filename) {
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { ...getUserIdHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  const dataUrl = await new Promise(res => {
    const fr = new FileReader();
    fr.onload = e => res(e.target.result);
    fr.readAsDataURL(blob);
  });
  return { type: 'image', dataUrl, filename };
}

// Mobile fallback (multipart → JSON base64) — bgremove / ocr uchun
async function postToBackend(endpoint, file) {
  const form = new FormData();
  form.append('file', file);
  try {
    const r = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST', headers: getUserIdHeader(), body: form,
    });
    if (r.ok) return r;
  } catch (_) {}
  const buf = await readAsArrayBuffer(file);
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return fetch(`${BACKEND_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getUserIdHeader() },
    body: JSON.stringify({ data: btoa(binary) }),
  });
}

// ─── PDF ─────────────────────────────────────────────────────────

async function mergepdf({ files }) {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  return apiFile('/api/mergepdf', form, 'merged.pdf');
}

async function splitpdf({ file }) {
  const form = new FormData();
  form.append('file', file);
  return apiFile('/api/splitpdf', form, 'pages.zip');
}

async function pdftext({ file }) {
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${BACKEND_URL}/api/pdftext`, {
    method: 'POST', headers: getUserIdHeader(), body: form,
  });
  if (!r.ok) throw new Error(await r.text());
  const { result } = await r.json();
  return { type: 'text', content: result };
}

async function pdflock({ file }) {
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${BACKEND_URL}/api/pdflock`, {
    method: 'POST', headers: getUserIdHeader(), body: form,
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  const password = r.headers.get('X-Password') || 'EduBot123';
  return { type: 'file', blob, filename: 'locked.pdf', info: `🔑 Parol: ${password}` };
}

async function watermark({ file }) {
  const form = new FormData();
  form.append('file', file);
  return apiFile('/api/watermark', form, 'watermarked.pdf');
}

async function pdf2img({ file }) {
  const form = new FormData();
  form.append('file', file);
  return apiFile('/api/pdf2img', form, 'pages.zip');
}

async function compresspdf({ file }) {
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${BACKEND_URL}/api/compresspdf`, {
    method: 'POST', headers: getUserIdHeader(), body: form,
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  const saved = r.headers.get('X-Saved-Percent');
  return { type: 'file', blob, filename: 'compressed.pdf', info: saved ? `${saved}% kichiklashdi` : '' };
}

async function pdf2docx({ file }) {
  const form = new FormData();
  form.append('file', file);
  return apiFile('/api/pdf2docx', form, 'converted.docx');
}

async function docx2pdf({ file }) {
  const form = new FormData();
  form.append('file', file);
  return apiFile('/api/docx2pdf', form, 'document.pdf');
}

// ─── File conversion ──────────────────────────────────────────────

async function img2pdf({ file }) {
  const form = new FormData();
  form.append('file', file);
  return apiFile('/api/img2pdf', form, 'image.pdf');
}

async function imgs2pdf({ files }) {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  return apiFile('/api/imgs2pdf', form, 'images.pdf');
}

async function xlsx2pdf({ file }) {
  const form = new FormData();
  form.append('file', file);
  return apiFile('/api/xlsx2pdf', form, 'spreadsheet.pdf');
}

async function compresspptx({ file }) {
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${BACKEND_URL}/api/compresspptx`, {
    method: 'POST', headers: getUserIdHeader(), body: form,
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  const saved = r.headers.get('X-Saved-Percent');
  return { type: 'file', blob, filename: 'compressed.pptx', info: saved ? `${saved}% kichiklashdi` : '' };
}

async function imgcompress({ file }) {
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${BACKEND_URL}/api/imgcompress`, {
    method: 'POST', headers: getUserIdHeader(), body: form,
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  const saved = r.headers.get('X-Saved-Percent');
  return { type: 'file', blob, filename: 'compressed.jpg', info: saved ? `${saved}% kichiklashdi` : '' };
}

// ─── AI (mobile fallback saqlangan) ──────────────────────────────

async function bgremove({ file }) {
  if (!file) return { type: 'text', content: '❌ Rasm faylini yuklang' };
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const r = await postToBackend('/api/bgremove', file);
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  return { type: 'file', blob, filename: 'no-bg.png', info: 'Fon olib tashlandi' };
}

async function ocr({ file }) {
  if (!file) return { type: 'text', content: '❌ Rasm faylini yuklang' };
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const r = await postToBackend('/api/ocr', file);
  if (!r.ok) throw new Error(await r.text());
  const { text } = await r.json();
  return { type: 'text', content: text };
}

// ─── Text & Math ──────────────────────────────────────────────────

async function translit({ text }) { return apiText('/api/translit', { text }); }
async function readtime({ text }) { return apiText('/api/readtime', { text }); }
async function deadline({ text }) { return apiText('/api/deadline', { text }); }
async function stats({ text })    { return apiText('/api/stats', { text }); }
async function equation({ text }) { return apiText('/api/equation', { text }); }
async function translate({ text }){ return apiText('/api/translate', { text }); }
async function wiki({ text })     { return apiText('/api/wiki', { text }); }
async function books({ text })    { return apiText('/api/books', { text }); }

// ─── Visual ───────────────────────────────────────────────────────

async function graph({ text })    { return apiImage('/api/graph', { text }, 'graph.png'); }
async function qr({ text })       { return apiImage('/api/qr', { text }, 'qrcode.png'); }
async function cert({ text })     { return apiImage('/api/cert', { text }, 'certificate.png'); }
async function schedule({ text }) { return apiImage('/api/schedule', { text }, 'schedule.png'); }

// ─── Archive ──────────────────────────────────────────────────────

async function zip({ files }) {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  return apiFile('/api/zip', form, 'archive.zip');
}

async function unzip({ file }) {
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend ulanmagan' };
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${BACKEND_URL}/api/unzip`, {
    method: 'POST', headers: getUserIdHeader(), body: form,
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  const disp = r.headers.get('content-disposition') || '';
  const match = disp.match(/filename=([^;\s]+)/);
  const filename = match ? decodeURIComponent(match[1]) : 'extracted.zip';
  return { type: 'file', blob, filename };
}

// ─── Premium stubs ────────────────────────────────────────────────

function premiumStub() {
  return Promise.resolve({ type: 'premium' });
}

// ─── Export ──────────────────────────────────────────────────────

const SERVICE_HANDLERS = {
  // PDF
  mergepdf, splitpdf, pdftext, pdflock, watermark, pdf2img,
  img2pdf, imgs2pdf, xlsx2pdf, pdf2docx, docx2pdf,
  compresspdf, compresspptx,
  // Image
  imgcompress, bgremove,
  // Text
  translit, readtime, deadline, stats, equation, graph,
  // API proxy
  translate, wiki, books,
  // Generate
  qr, cert, schedule,
  // Archive
  zip, unzip,
  // OCR
  ocr,
  // Premium stubs
  referat: premiumStub, amaliy: premiumStub, kursish: premiumStub,
  insho: premiumStub, taqdimot: premiumStub, audio2text: premiumStub,
  text2audio: premiumStub, deepl: premiumStub, image: premiumStub, pptx: premiumStub,
};

Object.assign(window, { SERVICE_HANDLERS, BACKEND_URL });
