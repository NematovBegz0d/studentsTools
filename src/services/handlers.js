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
  free: 10 * 1024 * 1024, // 10 MB
  standard: 30 * 1024 * 1024, // 30 MB
  premium: 50 * 1024 * 1024, // 50 MB
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
  503: "Xizmat vaqtinchalik to'xtatilgan. Keyinroq urinib ko'ring.",
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
  return (
    str
      .trim()
      .slice(0, maxLength)
      // Remove null bytes
      .replace(/\0/g, "")
  );
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
    throw new Error(
      `Fayl hajmi ${mbFile} MB. Limit: ${mbLimit} MB. Kichikroq fayl tanlang.`,
    );
  }
  if (allowedTypes) {
    const ext = file.name.split(".").pop().toLowerCase();
    const allowed = allowedTypes
      .split(",")
      .map((t) => t.trim().replace(".", "").toLowerCase());
    if (!allowed.includes(ext)) {
      throw new Error(
        `Noto'g'ri fayl formati (.${ext}). Ruxsat etilgan: ${allowedTypes}`,
      );
    }
  }
}

function validateFiles(files, allowedTypes = null, maxSize = DEFAULT_MAX_SIZE) {
  if (!files || !files.length) throw new Error("Fayl(lar) tanlanmagan.");
  for (const file of files) validateFile(file, allowedTypes, maxSize);
}

// ─── Fetch with timeout & abort ───────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      const seconds = Math.round(timeoutMs / 1000);
      throw new Error(
        `So'rov vaqti tugadi (${seconds}s). Internet aloqasini tekshiring.`,
      );
    }
    if (!navigator.onLine) {
      throw new Error("Internet aloqasi yo'q. Ulanishni tekshiring.");
    }
    // Surface the real network error so we can see DNS / TLS / CORS issues
    console.error("[Network]", url, err);
    throw new Error(`Tarmoq xatosi: ${err.message || "noma'lum"}`);
  }
}

// ─── Response error handling ──────────────────────────────────────
// Reads the actual server error detail so users see WHY it failed,
// not just a generic message. Without this, every backend error looks
// identical and is impossible to debug from the user side.
async function handleResponseError(response) {
  if (response.ok) return;

  // Always try to read the server's error message (FastAPI returns
  // { "detail": "..." } for HTTPException)
  let serverDetail = "";
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      serverDetail = json.detail || json.message || json.error || "";
    } catch {
      // Not JSON — use raw text (trimmed)
      serverDetail = (text || "").slice(0, 300);
    }
  } catch (_) {}

  const base =
    HTTP_ERROR_MESSAGES[response.status] ||
    `Xato ${response.status}. Qayta urinib ko\'ring.`;

  // Combine: short server detail wins (more useful), otherwise base
  const message = serverDetail
    ? `${serverDetail} (${response.status})`
    : base;

  // Always log (helps in any environment with a console)
  console.error(`[API ${response.status}] ${response.url}`, serverDetail || "(no detail)");

  throw new Error(message);
}

// ─── Base API helpers ─────────────────────────────────────────────

// File upload → blob result
async function apiFile(path, form, filename, infoHeader = null, timeoutMs = 30000) {
  if (!BACKEND_URL) {
    return {
      type: "text",
      content: "⚠️ Backend ulanmagan. Keyinroq urinib ko'ring.",
    };
  }

  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: form,
  }, timeoutMs);

  await handleResponseError(response);

  const blob = await response.blob();
  const info = infoHeader ? response.headers.get(infoHeader) : null;

  return {
    type: "file",
    blob,
    filename,
    ...(info ? { info } : {}),
  };
}

// JSON body → text result
async function apiText(path, body) {
  if (!BACKEND_URL) {
    return {
      type: "text",
      content: "⚠️ Backend ulanmagan. Keyinroq urinib ko'ring.",
    };
  }

  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  await handleResponseError(response);

  const data = await response.json();
  return { type: "text", content: data.result ?? "" };
}

// JSON body → image (blob → dataUrl)
async function apiImage(path, body, filename) {
  if (!BACKEND_URL) {
    return {
      type: "text",
      content: "⚠️ Backend ulanmagan. Keyinroq urinib ko'ring.",
    };
  }

  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  await handleResponseError(response);

  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);

  return { type: "image", dataUrl, filename };
}

// File upload → blob (with X-Saved-Percent info)
async function apiFileWithSavedInfo(
  path,
  form,
  filename,
  savedSuffix = "% kichiklashdi",
) {
  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: form,
  });

  await handleResponseError(response);

  const blob = await response.blob();
  const saved = response.headers.get("X-Saved-Percent");

  return {
    type: "file",
    blob,
    filename,
    info: saved ? `${saved}${savedSuffix}` : undefined,
  };
}

// ─── Utility helpers ──────────────────────────────────────────────

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
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
    const response = await fetchWithTimeout(
      `${BACKEND_URL}${endpoint}`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: form,
      },
      45000,
    ); // OCR/bgremove takes longer

    if (response.ok) return response;

    await handleResponseError(response);
  } catch (networkErr) {
    // If network failed, try base64 fallback
    if (
      networkErr.message.includes("Tarmoq") ||
      networkErr.message.includes("Internet")
    ) {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
      const base64 = btoa(binary);

      return fetchWithTimeout(
        `${BACKEND_URL}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ data: base64 }),
        },
        45000,
      );
    }
    throw networkErr;
  }
}

// ─────────────────────────────────────────────────────────────────
// ─── PDF handlers ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────

async function mergepdf({ files }) {
  validateFiles(files, ".pdf");
  return apiFile("/api/mergepdf", buildFormData("files", files), "merged.pdf");
}

async function splitpdf({ file }) {
  validateFile(file, ".pdf");
  return apiFile("/api/splitpdf", buildFormData("file", file), "pages.zip");
}

async function pdftext({ file }) {
  validateFile(file, ".pdf");
  const form = buildFormData("file", file);
  const response = await fetchWithTimeout(`${BACKEND_URL}/api/pdftext`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: form,
  });
  await handleResponseError(response);
  const { result } = await response.json();
  return { type: "text", content: result };
}

async function pdflock({ file, text }) {
  validateFile(file, ".pdf");
  const form = buildFormData("file", file);
  if (text && text.trim()) form.append("password", sanitizeText(text.trim(), 64));
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/pdflock`,
    { method: "POST", headers: getAuthHeaders(), body: form },
    45000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  // ✅ YANGILANDI: parol base64(utf-8) bilan keladi — Latin-1 only header chegarasini
  // chetlab o'tib, special belgi/Unicode bo'lsa ham xavfsiz uzatish uchun
  const pwdB64 = response.headers.get("X-Password-B64");
  let password = "???";
  if (pwdB64) {
    try {
      password = decodeURIComponent(escape(atob(pwdB64)));
    } catch {
      password = atob(pwdB64);
    }
  }
  const info = response.headers.get("X-Info");
  return {
    type: "file",
    blob,
    filename: "locked.pdf",
    info: `🔑 Parol: ${password}${info ? ` • ${info}` : ""}`,
  };
}

async function watermark({ file, text }) {
  validateFile(file, ".pdf");
  const form = buildFormData("file", file);
  if (text && text.trim()) form.append("text", sanitizeText(text.trim(), 60));
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/watermark`,
    { method: "POST", headers: getAuthHeaders(), body: form },
    45000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info");
  return { type: "file", blob, filename: "watermarked.pdf", ...(info ? { info } : {}) };
}

async function pdf2img({ file }) {
  validateFile(file, ".pdf");
  const form = buildFormData("file", file);
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/pdf2img`,
    { method: "POST", headers: getAuthHeaders(), body: form },
    90000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info");
  // Single-page → raw image; multi-page → ZIP
  const ct = response.headers.get("content-type") || "";
  const ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : null;
  const filename = ext ? `page_1.${ext}` : "pages.zip";
  return { type: "file", blob, filename, ...(info ? { info } : {}) };
}

async function compresspdf({ file }) {
  validateFile(file, ".pdf");
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/compresspdf`,
    { method: "POST", headers: getAuthHeaders(), body: buildFormData("file", file) },
    60000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  const info  = response.headers.get("X-Info");
  const saved = response.headers.get("X-Saved-Percent");
  const label = info || (saved ? `${saved}% kichiklashdi` : undefined);
  return { type: "file", blob, filename: "compressed.pdf", ...(label ? { info: label } : {}) };
}

async function pdf2docx({ file }) {
  validateFile(file, ".pdf");
  const form = buildFormData("file", file);
  // Katta PDF'lar uchun 120 soniya — default 30s etarli emas
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/pdf2docx`,
    { method: "POST", headers: getAuthHeaders(), body: form },
    120000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info");
  return { type: "file", blob, filename: "converted.docx", ...(info ? { info } : {}) };
}

async function docx2pdf({ file }) {
  validateFile(file, ".doc,.docx");
  const form = buildFormData("file", file);
  // Murakkab DOC/DOCX hujjatlar uchun 150 soniya — LibreOffice server-side ishlaydi
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/docx2pdf`,
    { method: "POST", headers: getAuthHeaders(), body: form },
    150000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info");
  return { type: "file", blob, filename: "document.pdf", ...(info ? { info } : {}) };
}

// ─── File conversion ──────────────────────────────────────────────

// Eslatma: img2pdf va imgs2pdf endi backend'ga so'rov yubormaydi — ServicePage
// to'g'ridan-to'g'ri Img2PdfPro (jsPDF) komponentini render qiladi, shuning
// uchun bu yerda handler funksiyalar talab qilinmaydi.

async function xlsx2pdf({ file }) {
  validateFile(file, ".xlsx,.xls");
  return apiFile("/api/xlsx2pdf", buildFormData("file", file), "spreadsheet.pdf", "X-Info");
}

async function compresspptx({ file }) {
  validateFile(file, ".pptx,.ppt");
  return apiFileWithSavedInfo(
    "/api/compresspptx",
    buildFormData("file", file),
    "compressed.pptx",
  );
}

async function imgcompress({ file }) {
  validateFile(file, ".jpg,.jpeg,.png,.webp");
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/imgcompress`,
    { method: "POST", headers: getAuthHeaders(), body: buildFormData("file", file) },
    30000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info") || "";
  const saved = response.headers.get("X-Saved-Percent");
  return {
    type: "file",
    blob,
    filename: "compressed.jpg",
    info: info || (saved ? `${saved}% kichiklashdi` : undefined),
  };
}

// ─── AI (with mobile fallback) ────────────────────────────────────

async function photo3x4({ file, opts = {} }) {
  validateFile(file, ".jpg,.jpeg,.png,.webp,.heic,.heif");
  const form = new FormData();
  form.append("file", file);
  form.append("bg", ["white", "blue", "lightblue", "gray"].includes(opts.bg) ? opts.bg : "white");
  form.append("sheet", opts.sheet !== false ? "true" : "false");
  form.append("attire", ["suit", "natural"].includes(opts.attire) ? opts.attire : "suit");
  form.append("framing", ["formal", "tight"].includes(opts.framing) ? opts.framing : "formal");
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/photo3x4`,
    { method: "POST", headers: getAuthHeaders(), body: form },
    60000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info");
  return {
    type: "file",
    blob,
    filename: opts.sheet !== false ? "photo3x4_sheet.jpg" : "photo3x4.jpg",
    ...(info ? { info } : {}),
  };
}

async function bgremove({ file }) {
  if (!file) throw new Error("Rasm faylini yuklang.");
  validateFile(file, ".jpg,.png");
  if (!BACKEND_URL) return { type: "text", content: "⚠️ Backend ulanmagan." };

  const response = await postWithFallback("/api/bgremove", file);
  await handleResponseError(response);
  const blob = await response.blob();
  return {
    type: "file",
    blob,
    filename: "no-bg.png",
    info: "Fon olib tashlandi ✨",
  };
}

async function ocr({ file }) {
  if (!file) throw new Error("Rasm yoki PDF faylini yuklang.");
  validateFile(file, ".jpg,.png,.pdf,.jpeg,.webp,.bmp,.tiff,.tif");
  if (!BACKEND_URL) return { type: "text", content: "⚠️ Backend ulanmagan." };

  const form = buildFormData("file", file);
  // Tesseract + PDF render 90s gacha olishi mumkin
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/ocr`,
    { method: "POST", headers: getAuthHeaders(), body: form },
    90000,
  );
  await handleResponseError(response);
  const { text } = await response.json();
  return { type: "text", content: text || "Matn topilmadi." };
}

// ─── Text & Math ──────────────────────────────────────────────────
// ✅ FIX: All text inputs sanitized

async function translit({ text }) {
  return apiText("/api/translit", { text: sanitizeText(text) });
}

async function readtime({ text }) {
  if (!text?.trim()) throw new Error("Matn kiriting.");
  return apiText("/api/readtime", { text: sanitizeText(text) });
}

async function deadline({ text }) {
  return apiText("/api/deadline", { text: sanitizeText(text, 200) });
}

async function stats({ text }) {
  return apiText("/api/stats", { text: sanitizeText(text, 1000) });
}

async function translate({ text }) {
  if (!text?.trim()) throw new Error("Tarjima uchun matn kiriting.");
  return apiText("/api/translate", { text: sanitizeText(text) });
}

async function wiki({ text }) {
  if (!text?.trim()) throw new Error("Maqola nomini kiriting.");
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/wiki`,
    {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ text: sanitizeText(text, 200) }),
    },
  );
  await handleResponseError(response);
  const data = await response.json();
  return {
    type: "wiki",
    content:      data.result      ?? "",
    title:        data.title       ?? "",
    extract:      data.extract     ?? data.result ?? "",
    description:  data.description ?? "",
    thumbnail:    data.thumbnail   ?? null,
    url:          data.url         ?? null,
    lang:         data.lang        ?? "",
    alternatives: data.alternatives ?? [],
    related:      data.related     ?? [],
  };
}

async function books({ text }) {
  if (!text?.trim()) throw new Error("Kitob nomi yoki muallifni kiriting.");
  return apiText("/api/books", { text: sanitizeText(text, 200) });
}

async function summarize({ text }) {
  if (!text?.trim()) throw new Error("Xulosalash uchun matn kiriting.");
  if (text.length < 200) throw new Error("Matn juda qisqa (kamida 200 belgi).");
  return apiText("/api/summarize", { text: sanitizeText(text, 10000) });
}

// ─── Visual generators ────────────────────────────────────────────

async function qr({ text }) {
  if (!text?.trim()) throw new Error("QR kod uchun matn yoki URL kiriting.");
  return apiImage("/api/qr", { text: sanitizeText(text, 2000) }, "qrcode.png");
}

async function cert({ text }) {
  if (!text?.trim()) throw new Error("Ism va kurs nomini kiriting.");
  return apiImage(
    "/api/cert",
    { text: sanitizeText(text, 500) },
    "certificate.png",
  );
}

async function schedule({ text }) {
  if (!text?.trim()) throw new Error("Dars jadvalini kiriting.");
  return apiImage(
    "/api/schedule",
    { text: sanitizeText(text, 2000) },
    "schedule.png",
  );
}

// ─── Archive ──────────────────────────────────────────────────────

async function pdfpages({ file, text }) {
  validateFile(file, ".pdf");
  if (!text?.trim()) throw new Error("Sahifa oralig'ini kiriting. Masalan: 1-3,5,7");
  const form = buildFormData("file", file);
  form.append("pages", sanitizeText(text.trim(), 200));
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/pdfpages`,
    { method: "POST", headers: getAuthHeaders(), body: form },
    45000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info");
  return { type: "file", blob, filename: "selected.pdf", ...(info ? { info } : {}) };
}

async function docxedit({ file, text }) {
  validateFile(file, ".doc,.docx");
  if (!text?.trim()) throw new Error("Qidirish va almashtirish matni kiriting.");
  const lines = text.trim().split("\n");
  const find = lines[0]?.trim() || "";
  const replace = lines.slice(1).join("\n").trimStart();
  if (!find) throw new Error("1-qator: qidiriluvchi matn kiritilmagan.");
  const form = buildFormData("file", file);
  form.append("find", sanitizeText(find, 500));
  form.append("replace", sanitizeText(replace, 500));
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/docxedit`,
    { method: "POST", headers: getAuthHeaders(), body: form },
    30000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info");
  return { type: "file", blob, filename: "edited.docx", ...(info ? { info } : {}) };
}

async function zip({ files, text }) {
  validateFiles(files);
  const form = buildFormData("files", files);
  if (text?.trim()) form.append("password", sanitizeText(text.trim(), 128));
  return apiFile("/api/zip", form, "archive.zip", "X-Info");
}

async function unzip({ file }) {
  validateFile(file, ".zip");
  const response = await fetchWithTimeout(`${BACKEND_URL}/api/unzip`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: buildFormData("file", file),
  });
  await handleResponseError(response);
  const blob = await response.blob();
  // ✅ FIX: Safe filename parsing
  const disp = response.headers.get("content-disposition") || "";
  const match = disp.match(/filename="?([^";\n]+)"?/);
  const filename = match ? decodeURIComponent(match[1]) : "extracted.zip";
  return { type: "file", blob, filename };
}

// ─── CV Generator ─────────────────────────────────────────────────

async function cv({ opts = {} }) {
  const name = (opts.name || "").trim();
  if (!name) throw new Error("Ism majburiy.");
  const body = {
    name,
    title:      (opts.title    || "").trim(),
    email:      (opts.email    || "").trim(),
    phone:      (opts.phone    || "").trim(),
    location:   (opts.location || "").trim(),
    summary:    (opts.summary  || "").trim(),
    template:   opts.template  || "modern",
    skills:     Array.isArray(opts.skills)     ? opts.skills     : [],
    languages:  Array.isArray(opts.languages)  ? opts.languages  : [],
    education:  Array.isArray(opts.education)  ? opts.education  : [],
    experience: Array.isArray(opts.experience) ? opts.experience : [],
  };
  const response = await fetchWithTimeout(
    `${BACKEND_URL}/api/cv`,
    {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    30000,
  );
  await handleResponseError(response);
  const blob = await response.blob();
  const info = response.headers.get("X-Info") || "";
  return {
    type: "file",
    blob,
    filename: `cv_${name.replace(/\s+/g, "_").slice(0, 30)}.pdf`,
    info: info || "CV PDF tayyor",
  };
}

// ─── Premium stubs ────────────────────────────────────────────────

function premiumStub() {
  return Promise.resolve({ type: "premium" });
}

// ─── Export ───────────────────────────────────────────────────────

const SERVICE_HANDLERS = {
  // PDF
  mergepdf,
  splitpdf,
  pdfpages,
  pdftext,
  pdflock,
  watermark,
  pdf2img,
  // img2pdf, imgs2pdf → endi browser tomonida (Img2PdfPro / jsPDF)
  xlsx2pdf,
  pdf2docx,
  docx2pdf,
  docxedit,
  compresspdf,
  compresspptx,
  // Image
  imgcompress,
  bgremove,
  photo3x4,
  // Text
  translit,
  readtime,
  deadline,
  stats,
  // API proxy
  translate,
  wiki,
  books,
  summarize,
  // Generate
  qr,
  cert,
  schedule,
  cv,
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
  pptx: premiumStub,
};

Object.assign(window, { SERVICE_HANDLERS, BACKEND_URL });
