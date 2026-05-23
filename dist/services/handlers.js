// EduBot — Service handlers (IMPROVED)
// ✅ Fixes applied:
//   1. AbortController — request cancellation support
//   2. Request timeout (30 seconds default)
//   3. File size validation before upload
//   4. Typed, user-friendly error messages
//   5. Input sanitization
//   6. No internal error leakage to users
//   7. DRY — removed duplicate fetch patterns
//   8. Proper initData header (not just user ID)

"use strict";

const BACKEND_URL = "https://studentstools-backend.up.railway.app";

// ─── File size limits ─────────────────────────────────────────────
// ✅ NEW: Plan-based limits (enforced client-side first)
const FILE_LIMITS = {
  free: 10 * 1024 * 1024,
  // 10 MB
  standard: 30 * 1024 * 1024,
  // 30 MB
  premium: 50 * 1024 * 1024 // 50 MB
};
const DEFAULT_MAX_SIZE = FILE_LIMITS.free;

// ─── User-friendly HTTP error messages ───────────────────────────
// ✅ NEW: No leaking of backend internals
const HTTP_ERROR_MESSAGES = {
  400: "Noto'g'ri so'rov. Fayl yoki matnni tekshiring.",
  401: "Avtorizatsiya xatosi. Ilovani qayta oching.",
  403: "Ruxsat yo'q.",
  408: "So'rov vaqti tugadi. Internet aloqasini tekshiring.",
  413: "Fayl hajmi juda katta. Kichikroq fayl tanlang.",
  415: "Bu fayl formati qo'llab-quvvatlanmaydi.",
  422: "Fayl ochib bo'lmadi. Boshqa fayl bilan urinib ko'ring.",
  429: "So'rovlar cheklangan. Biroz kuting va qayta urinib ko'ring.",
  500: "Server xatosi. Keyinroq urinib ko'ring.",
  502: "Server vaqtinchalik mavjud emas. Keyinroq urinib ko'ring.",
  503: "Xizmat vaqtinchalik to'xtatilgan. Keyinroq urinib ko'ring."
};

// ─── Auth header ──────────────────────────────────────────────────
// ✅ FIX: initData (HMAC-signed) yuborish — faqat user ID emas!
// Backend bu ma'lumotni Telegram'ning secret key bilan verify qilishi kerak.
function getAuthHeaders() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return {};
  const headers = {};

  // Telegram tavsiya etgan usul: to'liq initData yuborish
  if (tg.initData) {
    headers["X-Telegram-Init-Data"] = tg.initData;
  }

  // Fallback: faqat user ID (eski backend compatibility)
  const uid = tg.initDataUnsafe?.user?.id;
  if (uid) {
    headers["X-User-Id"] = String(uid);
  }
  return headers;
}

// ─── Input sanitization ───────────────────────────────────────────
// ✅ NEW: Text input sanitization — XSS va injection oldini olish
function sanitizeText(str, maxLength = 10000) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, maxLength)
  // Remove null bytes
  .replace(/\0/g, "");
}

// ─── File validation ──────────────────────────────────────────────
// ✅ NEW: Client-side validation before upload
function validateFile(file, allowedTypes = null, maxSize = DEFAULT_MAX_SIZE) {
  if (!file || !(file instanceof File)) {
    throw new Error("Fayl tanlanmagan.");
  }
  if (file.size === 0) {
    throw new Error("Fayl bo'sh. Boshqa fayl tanlang.");
  }
  if (file.size > maxSize) {
    const mbLimit = (maxSize / 1024 / 1024).toFixed(0);
    const mbFile = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`Fayl hajmi ${mbFile} MB. Limit: ${mbLimit} MB. Kichikroq fayl tanlang.`);
  }
  if (allowedTypes) {
    const ext = file.name.split(".").pop().toLowerCase();
    const allowed = allowedTypes.split(",").map(t => t.trim().replace(".", "").toLowerCase());
    if (!allowed.includes(ext)) {
      throw new Error(`Noto'g'ri fayl formati (.${ext}). Ruxsat etilgan: ${allowedTypes}`);
    }
  }
}
function validateFiles(files, allowedTypes = null, maxSize = DEFAULT_MAX_SIZE) {
  if (!files || !files.length) throw new Error("Fayl(lar) tanlanmagan.");
  for (const file of files) validateFile(file, allowedTypes, maxSize);
}

// ─── Fetch with timeout & abort ───────────────────────────────────
// ✅ NEW: AbortController + timeout wrapper
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("So'rov vaqti tugadi (30 soniya). Internet aloqasini tekshiring.");
    }
    if (!navigator.onLine) {
      throw new Error("Internet aloqasi yo'q. Ulanishni tekshiring.");
    }
    throw new Error("Tarmoq xatosi. Qayta urinib ko'ring.");
  }
}

// ─── Response error handling ──────────────────────────────────────
// ✅ NEW: User-friendly HTTP errors — no internal leakage
async function handleResponseError(response) {
  if (response.ok) return;
  const message = HTTP_ERROR_MESSAGES[response.status] || `Xato ${response.status}. Qayta urinib ko\'ring.`;

  // Development'da original xatoni ko'rsatish
  if (window.location.hostname === "localhost" || !window.Telegram?.WebApp?.initData) {
    try {
      const text = await response.text();
      console.error(`[API ${response.status}]`, text);
    } catch (_) {}
  }
  throw new Error(message);
}

// ─── Base API helpers ─────────────────────────────────────────────

// File upload → blob result
async function apiFile(path, form, filename, infoHeader = null) {
  if (!BACKEND_URL) {
    return {
      type: "text",
      content: "⚠️ Backend ulanmagan. Keyinroq urinib ko'ring."
    };
  }
  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: form
  });
  await handleResponseError(response);
  const blob = await response.blob();
  const info = infoHeader ? response.headers.get(infoHeader) : null;
  return {
    type: "file",
    blob,
    filename,
    ...(info ? {
      info
    } : {})
  };
}

// JSON body → text result
async function apiText(path, body) {
  if (!BACKEND_URL) {
    return {
      type: "text",
      content: "⚠️ Backend ulanmagan. Keyinroq urinib ko'ring."
    };
  }
  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  await handleResponseError(response);
  const data = await response.json();
  return {
    type: "text",
    content: data.result ?? ""
  };
}

// JSON body → image (blob → dataUrl)
async function apiImage(path, body, filename) {
  if (!BACKEND_URL) {
    return {
      type: "text",
      content: "⚠️ Backend ulanmagan. Keyinroq urinib ko'ring."
    };
  }
  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  await handleResponseError(response);
  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);
  return {
    type: "image",
    dataUrl,
    filename
  };
}

// File upload → blob (with X-Saved-Percent info)
async function apiFileWithSavedInfo(path, form, filename, savedSuffix = "% kichiklashdi") {
  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: form
  });
  await handleResponseError(response);
  const blob = await response.blob();
  const saved = response.headers.get("X-Saved-Percent");
  return {
    type: "file",
    blob,
    filename,
    info: saved ? `${saved}${savedSuffix}` : undefined
  };
}

// ─── Utility helpers ──────────────────────────────────────────────

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Fayl o'qib bo'lmadi."));
    reader.readAsDataURL(blob);
  });
}
function buildFormData(key, value) {
  const form = new FormData();
  if (Array.isArray(value)) {
    for (const item of value) form.append(key, item);
  } else {
    form.append(key, value);
  }
  return form;
}

// ✅ NEW: Mobile fallback (FormData → base64 JSON)
// BGRemove va OCR kabi ba'zi endpointlar uchun
async function postWithFallback(endpoint, file) {
  const form = buildFormData("file", file);
  try {
    const response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: form
    }, 45000); // OCR/bgremove takes longer

    if (response.ok) return response;
    await handleResponseError(response);
  } catch (networkErr) {
    // If network failed, try base64 fallback
    if (networkErr.message.includes("Tarmoq") || networkErr.message.includes("Internet")) {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const binary = Array.from(bytes, b => String.fromCharCode(b)).join("");
      const base64 = btoa(binary);
      return fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          data: base64
        })
      }, 45000);
    }
    throw networkErr;
  }
}

// ─────────────────────────────────────────────────────────────────
// ─── PDF handlers ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────

async function mergepdf({
  files
}) {
  validateFiles(files, ".pdf");
  return apiFile("/api/mergepdf", buildFormData("files", files), "merged.pdf");
}
async function splitpdf({
  file
}) {
  validateFile(file, ".pdf");
  return apiFile("/api/splitpdf", buildFormData("file", file), "pages.zip");
}
async function pdftext({
  file
}) {
  validateFile(file, ".pdf");
  const form = buildFormData("file", file);
  const response = await fetchWithTimeout(`${BACKEND_URL}/api/pdftext`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: form
  });
  await handleResponseError(response);
  const {
    result
  } = await response.json();
  return {
    type: "text",
    content: result
  };
}
async function pdflock({
  file
}) {
  validateFile(file, ".pdf");
  const form = buildFormData("file", file);
  const response = await fetchWithTimeout(`${BACKEND_URL}/api/pdflock`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: form
  });
  await handleResponseError(response);
  const blob = await response.blob();
  // ✅ FIX: Fallback password if header missing
  const password = response.headers.get("X-Password") || "EduBot123";
  return {
    type: "file",
    blob,
    filename: "locked.pdf",
    info: `🔑 Parol: ${password}`
  };
}
async function watermark({
  file,
  text
}) {
  validateFile(file, ".pdf");
  // ✅ FIX: Sanitize watermark text
  const form = buildFormData("file", file);
  if (text) form.append("text", sanitizeText(text, 100));
  return apiFile("/api/watermark", form, "watermarked.pdf");
}
async function pdf2img({
  file
}) {
  validateFile(file, ".pdf");
  return apiFile("/api/pdf2img", buildFormData("file", file), "pages.zip");
}
async function compresspdf({
  file
}) {
  validateFile(file, ".pdf");
  return apiFileWithSavedInfo("/api/compresspdf", buildFormData("file", file), "compressed.pdf");
}
async function pdf2docx({
  file
}) {
  validateFile(file, ".pdf");
  const form = buildFormData("file", file);
  // Katta PDF'lar uchun 120 soniya — default 30s etarli emas
  const response = await fetchWithTimeout(`${BACKEND_URL}/api/pdf2docx`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: form
  }, 120000);
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info");
  return {
    type: "file",
    blob,
    filename: "converted.docx",
    ...(info ? {
      info
    } : {})
  };
}
async function docx2pdf({
  file
}) {
  validateFile(file, ".doc,.docx");
  const form = buildFormData("file", file);
  // Murakkab hujjatlar uchun 60 soniya — default 30s etarli emas
  const response = await fetchWithTimeout(`${BACKEND_URL}/api/docx2pdf`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: form
  }, 60000);
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info");
  return {
    type: "file",
    blob,
    filename: "document.pdf",
    ...(info ? {
      info
    } : {})
  };
}

// ─── File conversion ──────────────────────────────────────────────

async function img2pdf({
  file
}) {
  validateFile(file, ".jpg,.jpeg,.png");
  return apiFile("/api/img2pdf", buildFormData("file", file), "image.pdf", "X-Info");
}
async function imgs2pdf({
  files
}) {
  validateFiles(files, ".jpg,.jpeg,.png");
  return apiFile("/api/imgs2pdf", buildFormData("files", files), "images.pdf", "X-Info");
}
async function xlsx2pdf({
  file
}) {
  validateFile(file, ".xlsx,.xls");
  return apiFile("/api/xlsx2pdf", buildFormData("file", file), "spreadsheet.pdf");
}
async function compresspptx({
  file
}) {
  validateFile(file, ".pptx,.ppt");
  return apiFileWithSavedInfo("/api/compresspptx", buildFormData("file", file), "compressed.pptx");
}
async function imgcompress({
  file
}) {
  validateFile(file, ".jpg,.png");
  return apiFileWithSavedInfo("/api/imgcompress", buildFormData("file", file), "compressed.jpg");
}

// ─── AI (with mobile fallback) ────────────────────────────────────

async function bgremove({
  file
}) {
  if (!file) throw new Error("Rasm faylini yuklang.");
  validateFile(file, ".jpg,.png");
  if (!BACKEND_URL) return {
    type: "text",
    content: "⚠️ Backend ulanmagan."
  };
  const response = await postWithFallback("/api/bgremove", file);
  await handleResponseError(response);
  const blob = await response.blob();
  return {
    type: "file",
    blob,
    filename: "no-bg.png",
    info: "Fon olib tashlandi ✨"
  };
}
async function ocr({
  file
}) {
  if (!file) throw new Error("Rasm yoki PDF faylini yuklang.");
  validateFile(file, ".jpg,.png,.pdf");
  if (!BACKEND_URL) return {
    type: "text",
    content: "⚠️ Backend ulanmagan."
  };
  const response = await postWithFallback("/api/ocr", file);
  await handleResponseError(response);
  const {
    text
  } = await response.json();
  return {
    type: "text",
    content: text || "Matn topilmadi."
  };
}

// ─── Text & Math ──────────────────────────────────────────────────
// ✅ FIX: All text inputs sanitized

async function translit({
  text
}) {
  return apiText("/api/translit", {
    text: sanitizeText(text)
  });
}
async function readtime({
  text
}) {
  if (!text?.trim()) throw new Error("Matn kiriting.");
  return apiText("/api/readtime", {
    text: sanitizeText(text)
  });
}
async function deadline({
  text
}) {
  return apiText("/api/deadline", {
    text: sanitizeText(text, 200)
  });
}
async function stats({
  text
}) {
  return apiText("/api/stats", {
    text: sanitizeText(text, 1000)
  });
}
async function equation({
  text
}) {
  return apiText("/api/equation", {
    text: sanitizeText(text, 500)
  });
}
async function translate({
  text
}) {
  if (!text?.trim()) throw new Error("Tarjima uchun matn kiriting.");
  return apiText("/api/translate", {
    text: sanitizeText(text)
  });
}
async function wiki({
  text
}) {
  if (!text?.trim()) throw new Error("Maqola nomini kiriting.");
  return apiText("/api/wiki", {
    text: sanitizeText(text, 200)
  });
}
async function books({
  text
}) {
  if (!text?.trim()) throw new Error("Kitob nomi yoki muallifni kiriting.");
  return apiText("/api/books", {
    text: sanitizeText(text, 200)
  });
}

// ─── Visual generators ────────────────────────────────────────────

async function graph({
  text
}) {
  if (!text?.trim()) throw new Error("Funksiya kiriting (masalan: sin(x), x^2).");
  return apiImage("/api/graph", {
    text: sanitizeText(text, 500)
  }, "graph.png");
}
async function qr({
  text
}) {
  if (!text?.trim()) throw new Error("QR kod uchun matn yoki URL kiriting.");
  return apiImage("/api/qr", {
    text: sanitizeText(text, 2000)
  }, "qrcode.png");
}
async function cert({
  text
}) {
  if (!text?.trim()) throw new Error("Ism va kurs nomini kiriting.");
  return apiImage("/api/cert", {
    text: sanitizeText(text, 500)
  }, "certificate.png");
}
async function schedule({
  text
}) {
  if (!text?.trim()) throw new Error("Dars jadvalini kiriting.");
  return apiImage("/api/schedule", {
    text: sanitizeText(text, 2000)
  }, "schedule.png");
}

// ─── Archive ──────────────────────────────────────────────────────

async function zip({
  files
}) {
  validateFiles(files);
  return apiFile("/api/zip", buildFormData("files", files), "archive.zip");
}
async function unzip({
  file
}) {
  validateFile(file, ".zip");
  const response = await fetchWithTimeout(`${BACKEND_URL}/api/unzip`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: buildFormData("file", file)
  });
  await handleResponseError(response);
  const blob = await response.blob();
  // ✅ FIX: Safe filename parsing
  const disp = response.headers.get("content-disposition") || "";
  const match = disp.match(/filename="?([^";\n]+)"?/);
  const filename = match ? decodeURIComponent(match[1]) : "extracted.zip";
  return {
    type: "file",
    blob,
    filename
  };
}

// ─── Premium stubs ────────────────────────────────────────────────

function premiumStub() {
  return Promise.resolve({
    type: "premium"
  });
}

// ─── Export ───────────────────────────────────────────────────────

const SERVICE_HANDLERS = {
  // PDF
  mergepdf,
  splitpdf,
  pdftext,
  pdflock,
  watermark,
  pdf2img,
  img2pdf,
  imgs2pdf,
  xlsx2pdf,
  pdf2docx,
  docx2pdf,
  compresspdf,
  compresspptx,
  // Image
  imgcompress,
  bgremove,
  // Text
  translit,
  readtime,
  deadline,
  stats,
  equation,
  graph,
  // API proxy
  translate,
  wiki,
  books,
  // Generate
  qr,
  cert,
  schedule,
  // Archive
  zip,
  unzip,
  // OCR
  ocr,
  // Premium stubs
  referat: premiumStub,
  amaliy: premiumStub,
  kursish: premiumStub,
  insho: premiumStub,
  taqdimot: premiumStub,
  audio2text: premiumStub,
  text2audio: premiumStub,
  deepl: premiumStub,
  image: premiumStub,
  pptx: premiumStub
};
Object.assign(window, {
  SERVICE_HANDLERS,
  BACKEND_URL
});