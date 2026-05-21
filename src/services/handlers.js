// EduBot — Service handlers (real implementations)
// Each handler: async ({ file, files, text }) → { type, ... }
// type: 'file' → { blob, filename }
// type: 'text' → { content }
// type: 'image' → { dataUrl, filename? }

// Railway/Render'ga deploy qilgandan keyin bu URL ni yangilang
// Misol: 'https://edubot-backend.up.railway.app'
const BACKEND_URL = "https://studentstools-backend.up.railway.app";

// ─── Helpers ────────────────────────────────────────────────────

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Script yuklanmadi: ' + src));
    document.head.appendChild(s);
  });
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const PDF_LIB_CDN    = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
const PDFJS_CDN      = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER   = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const JSPDF_CDN      = 'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js';
const AUTOTABLE_CDN  = 'https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.js';
const JSZIP_CDN      = 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
const QRCODE_CDN     = 'https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js';
const MATHJS_CDN     = 'https://unpkg.com/mathjs@11.11.2/lib/browser/math.js';
const XLSX_CDN       = 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
const MAMMOTH_CDN    = 'https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js';

async function getPdfjsLib() {
  await loadScript(PDFJS_CDN);
  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  return window.pdfjsLib;
}

// ─── PDF Operations ──────────────────────────────────────────────

async function mergepdf({ files }) {
  await loadScript(PDF_LIB_CDN);
  const { PDFDocument } = PDFLib;
  const merged = await PDFDocument.create();
  for (const f of files) {
    const buf = await readAsArrayBuffer(f);
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  const bytes = await merged.save();
  return { type: 'file', blob: new Blob([bytes], { type: 'application/pdf' }), filename: 'merged.pdf' };
}

async function splitpdf({ file }) {
  await loadScript(PDF_LIB_CDN);
  await loadScript(JSZIP_CDN);
  const { PDFDocument } = PDFLib;
  const buf = await readAsArrayBuffer(file);
  const src = await PDFDocument.load(buf);
  const zip = new JSZip();
  for (let i = 0; i < src.getPageCount(); i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    doc.addPage(page);
    zip.file(`page_${i + 1}.pdf`, await doc.save());
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return { type: 'file', blob, filename: 'pages.zip' };
}

async function pdftext({ file }) {
  const pdfjsLib = await getPdfjsLib();
  const buf = await readAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out += `--- ${i}-sahifa ---\n` + content.items.map(x => x.str).join(' ') + '\n\n';
  }
  return { type: 'text', content: out.trim() || 'Matn topilmadi' };
}

async function pdflock({ file, text: password }) {
  if (!password || !password.trim()) {
    return { type: 'text', content: '❌ Parolni kiriting (matn maydonida)' };
  }
  // jsPDF password encryption qo'llab-quvvatlamaydi.
  // pdf-lib ham hozircha encryption API chiqarmagan.
  // Foydalanuvchiga muqobil tavsiya beramiz:
  return {
    type: 'text',
    content:
      '⚠️ PDF parol himoyasi hozircha mavjud emas.\n\n' +
      'Muqobil variantlar:\n' +
      '• ilovepdf.com/protect-pdf\n' +
      '• smallpdf.com/protect-pdf\n' +
      '• Adobe Acrobat (offline)\n\n' +
      '🔧 Bu funksiya keyingi versiyada backend orqali qo\'shiladi.',
  };
}

async function watermark({ file, text: wmText }) {
  await loadScript(PDF_LIB_CDN);
  const { PDFDocument, rgb, degrees } = PDFLib;
  const buf = await readAsArrayBuffer(file);
  const doc = await PDFDocument.load(buf);
  const label = (wmText || 'EduBot').trim();
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(label, {
      x: width / 2 - label.length * 14,
      y: height / 2,
      size: 52,
      color: rgb(0.75, 0.75, 0.75),
      opacity: 0.28,
      rotate: degrees(45),
    });
  }
  const bytes = await doc.save();
  return { type: 'file', blob: new Blob([bytes], { type: 'application/pdf' }), filename: 'watermarked.pdf' };
}

async function pdf2img({ file }) {
  const pdfjsLib = await getPdfjsLib();
  await loadScript(JSZIP_CDN);
  const buf = await readAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const zip = new JSZip();
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    zip.file(`page_${i}.jpg`, dataUrl.split(',')[1], { base64: true });
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return { type: 'file', blob, filename: 'pages.zip' };
}

async function img2pdf({ file }) {
  await loadScript(JSPDF_CDN);
  const { jsPDF } = window.jspdf;
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);
  const landscape = img.width > img.height;
  const doc = new jsPDF({ orientation: landscape ? 'l' : 'p', unit: 'px', format: [img.width, img.height] });
  doc.addImage(dataUrl, 'JPEG', 0, 0, img.width, img.height);
  return { type: 'file', blob: doc.output('blob'), filename: 'image.pdf' };
}

async function imgs2pdf({ files }) {
  await loadScript(JSPDF_CDN);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pW = doc.internal.pageSize.getWidth();
  const pH = doc.internal.pageSize.getHeight();
  let first = true;
  for (const f of files) {
    const dataUrl = await readAsDataURL(f);
    const img = await loadImage(dataUrl);
    const ratio = Math.min(pW / img.width, pH / img.height);
    if (!first) doc.addPage();
    doc.addImage(dataUrl, 'JPEG', 0, 0, img.width * ratio, img.height * ratio);
    first = false;
  }
  return { type: 'file', blob: doc.output('blob'), filename: 'images.pdf' };
}

async function xlsx2pdf({ file }) {
  await loadScript(XLSX_CDN);
  await loadScript(JSPDF_CDN);
  await loadScript(AUTOTABLE_CDN);
  const { jsPDF } = window.jspdf;
  const buf = await readAsArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const doc = new jsPDF({ orientation: 'l' });
  wb.SheetNames.forEach((name, idx) => {
    if (idx > 0) doc.addPage();
    doc.setFontSize(13);
    doc.text(name, 14, 14);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
    if (rows.length) {
      const [head, ...body] = rows;
      doc.autoTable({
        head: [head.map(c => c == null ? '' : String(c))],
        body: body.map(r => r.map(c => c == null ? '' : String(c))),
        startY: 20,
      });
    }
  });
  return { type: 'file', blob: doc.output('blob'), filename: 'spreadsheet.pdf' };
}

async function pdf2docx({ file }) {
  if (!file) return { type: 'text', content: '❌ PDF faylini yuklang' };
  if (BACKEND_URL) {
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch(`${BACKEND_URL}/api/pdf2docx`, { method: 'POST', headers: getUserIdHeader(), body: form });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      return { type: 'file', blob, filename: 'converted.docx', info: "Word formatiga o'tkazildi" };
    } catch (_) {
      // Backend mavjud emas — matn fallback'ga o'tiladi
    }
  }
  // Fallback: matn sifatida eksport
  const pdfjsLib = await getPdfjsLib();
  const buf = await readAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(x => x.str).join(' ') + '\n\n';
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  return { type: 'file', blob, filename: 'document.txt', info: 'Oddiy matn (DOCX uchun backend kerak)' };
}

async function docx2pdf({ file }) {
  await loadScript(MAMMOTH_CDN);
  await loadScript(JSPDF_CDN);
  const buf = await readAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const lines = doc.splitTextToSize(result.value, 180);
  let y = 20;
  for (const line of lines) {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text(line, 15, y);
    y += 7;
  }
  return { type: 'file', blob: doc.output('blob'), filename: 'document.pdf' };
}

// ─── Image Operations ────────────────────────────────────────────

async function imgcompress({ file }) {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const MAX = 1920;
  const ratio = Math.min(1, MAX / img.width, MAX / img.height);
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      const saved = Math.round((1 - blob.size / file.size) * 100);
      const info = saved > 0
        ? `${saved}% kichiklashdi`
        : 'Rasm allaqachon optimallashgan';
      resolve({ type: 'file', blob, filename: 'compressed.jpg', info });
    }, 'image/jpeg', 0.72);
  });
}

function getUserIdHeader() {
  const uid = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return uid ? { 'X-User-Id': String(uid) } : {};
}

async function postToBackend(endpoint, file) {
  const userHeaders = getUserIdHeader();
  const form = new FormData();
  form.append('file', file);
  try {
    const r = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers: userHeaders,
      body: form,
    });
    if (r.ok) return r;
  } catch (_) {}
  // JSON fallback (base64) — Telegram mobile WebView uchun
  const buf = await readAsArrayBuffer(file);
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  const r2 = await fetch(`${BACKEND_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders },
    body: JSON.stringify({ data: b64 }),
  });
  return r2;
}

async function bgremove({ file }) {
  if (!file) return { type: 'text', content: '❌ Rasm faylini yuklang' };
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend hali ulanmagan.\n\nHozircha: remove.bg saytidan foydalaning.' };
  const r = await postToBackend('/api/bgremove', file);
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  return { type: 'file', blob, filename: 'no-bg.png', info: 'Fon olib tashlandi' };
}

// ─── Text & Math ─────────────────────────────────────────────────

function translit({ text }) {
  const LTR = {
    'sh':'ш','ch':'ч','yo':'ё','ye':'е','yu':'ю','ya':'я','ts':'ц',
    "o'": 'ў', "g'": 'ғ',
    'a':'а','b':'б','v':'в','d':'д','e':'е','f':'ф','g':'г','h':'ҳ',
    'i':'и','j':'ж','k':'к','l':'л','m':'м','n':'н','o':'о','p':'п',
    'q':'қ','r':'р','s':'с','t':'т','u':'у','x':'х','y':'й','z':'з',
    "'": 'ъ',
  };
  const RTL = { 'ш':'sh','ч':'ch','ё':'yo','ю':'yu','я':'ya','ц':'ts','ў':"o'",'ғ':"g'",
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'j','з':'z','и':'i','й':'y',
    'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
    'ф':'f','х':'x','қ':'q','ҳ':'h','ъ':"'",
  };
  const isCyrillic = /[а-яёА-ЯЁ]/u.test(text);
  if (isCyrillic) {
    return { type: 'text', content: text.split('').map(c => {
      const low = c.toLowerCase();
      const mapped = RTL[low];
      if (!mapped) return c;
      return c === low ? mapped : mapped[0].toUpperCase() + mapped.slice(1);
    }).join('') };
  }
  const MULTI = ['sh','ch','yo','ye','yu','ya','ts',"o'","g'"];
  let out = ''; let i = 0; const src = text;
  while (i < src.length) {
    let matched = false;
    for (const key of MULTI) {
      if (src.slice(i, i + key.length).toLowerCase() === key) {
        const isUp = src[i] === src[i].toUpperCase() && src[i] !== src[i].toLowerCase();
        const cyr = LTR[key];
        out += isUp ? cyr.toUpperCase() : cyr;
        i += key.length; matched = true; break;
      }
    }
    if (!matched) {
      const c = src[i]; const mapped = LTR[c.toLowerCase()];
      if (mapped) {
        const isUp = c === c.toUpperCase() && c !== c.toLowerCase();
        out += isUp ? mapped.toUpperCase() : mapped;
      } else { out += c; }
      i++;
    }
  }
  return { type: 'text', content: out };
}

function readtime({ text }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const mins = Math.ceil(words.length / 200);
  return {
    type: 'text',
    content: `📖 ${words.length} so'z · ${text.replace(/\s/g,'').length} belgi\n⏱ O'qish vaqti: ~${mins} daqiqa\n(200 so'z/daqiqa hisobida)`,
  };
}

function deadline({ text }) {
  const m = text.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/) ||
            text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return { type: 'text', content: '❌ Sanani kiriting: 31.12.2025 yoki 2025-12-31' };
  let d;
  if (m[1].length === 4) d = new Date(`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
  else d = new Date(`${m[3].length===2?'20'+m[3]:m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
  const days = Math.ceil((d - Date.now()) / 86400000);
  if (isNaN(days)) return { type: 'text', content: '❌ Noto\'g\'ri sana formati' };
  const emoji = days < 0 ? '🔴' : days <= 3 ? '🚨' : days <= 7 ? '🟡' : '🟢';
  const msg = days < 0 ? `${Math.abs(days)} kun oldin o'tdi!` : days === 0 ? 'BUGUN!' : `${days} kun qoldi`;
  return { type: 'text', content: `📅 ${d.toLocaleDateString('uz-UZ')}\n${emoji} ${msg}` };
}

function stats({ text }) {
  const nums = (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return { type: 'text', content: '❌ Raqamlar kiriting. Masalan: 4 7 2 9 1 5' };
  const n = nums.length;
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sorted = [...nums].sort((a, b) => a - b);
  const median = n % 2 ? sorted[Math.floor(n/2)] : (sorted[n/2-1] + sorted[n/2]) / 2;
  const variance = nums.reduce((a, b) => a + (b-mean)**2, 0) / n;
  return {
    type: 'text',
    content: `📊 n = ${n}\n∑ Yig'indi: ${sum}\nx̄ O'rtacha: ${mean.toFixed(4)}\nM Mediana: ${median}\nσ² Dispersiya: ${variance.toFixed(4)}\nσ Standart og'ish: ${Math.sqrt(variance).toFixed(4)}\nMin: ${sorted[0]}  Max: ${sorted[n-1]}`,
  };
}

async function equation({ text }) {
  await loadScript(MATHJS_CDN);
  try {
    const result = math.evaluate(text.trim());
    return { type: 'text', content: `✅ ${text.trim()} = ${math.format(result, { precision: 10 })}` };
  } catch (e) {
    return { type: 'text', content: `❌ ${e.message}\n\nMisol: 2^10, sqrt(144), sin(pi/2), 3*4+2` };
  }
}

async function graph({ text }) {
  await loadScript(MATHJS_CDN);
  const expr = text.trim() || 'sin(x)';
  try {
    const f = math.compile(expr);
    const W = 560, H = 360;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d0d18'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += W/10) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 0; y <= H; y += H/8) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();

    ctx.strokeStyle = '#8b5cf6'; ctx.lineWidth = 2.5;
    ctx.beginPath(); let started = false;
    const scale = 40;
    for (let px = 0; px < W; px++) {
      const x = (px - W/2) / scale;
      try {
        const y = f.evaluate({ x });
        if (!isFinite(y)) { started = false; continue; }
        const py = H/2 - y * scale;
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      } catch { started = false; }
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '13px monospace';
    ctx.fillText(`f(x) = ${expr}`, 10, 18);
    return { type: 'image', dataUrl: canvas.toDataURL(), filename: 'graph.png' };
  } catch (e) {
    return { type: 'text', content: `❌ ${e.message}\nMisol: sin(x), x^2, cos(x)*x` };
  }
}

// ─── External APIs ────────────────────────────────────────────────

async function translate({ text }) {
  const lines = text.trim().split('\n');
  const query = lines[0];
  const lang = lines[1]?.trim() || 'en';
  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=uz|${lang}`);
    const d = await r.json();
    if (d.responseStatus === 200) {
      return { type: 'text', content: `🌐 (uz → ${lang})\n\n${d.responseData.translatedText}` };
    }
    throw new Error(d.responseMessage);
  } catch (e) {
    return { type: 'text', content: `❌ Xatolik: ${e.message}\n\nFormat: 1-qatorda matn, 2-qatorda til kodi (en, ru, tr...)` };
  }
}

async function wiki({ text }) {
  const q = encodeURIComponent(text.trim());
  const langs = ['uz', 'ru', 'en'];
  for (const lang of langs) {
    try {
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${q}`);
      if (!r.ok) continue;
      const d = await r.json();
      if (!d.extract) continue;
      return { type: 'text', content: `📖 ${d.title}\n\n${d.extract}${d.content_urls?.desktop?.page ? '\n\n🔗 ' + d.content_urls.desktop.page : ''}` };
    } catch {}
  }
  return { type: 'text', content: '❌ Wikipedia\'da topilmadi. Boshqa so\'z bilan qidiring.' };
}

async function books({ text }) {
  try {
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(text)}&limit=8&fields=title,author_name,first_publish_year,key`);
    const d = await r.json();
    if (!d.docs?.length) return { type: 'text', content: '📚 Kitob topilmadi' };
    const list = d.docs.map((b, i) =>
      `${i+1}. ${b.title}${b.author_name ? '\n   ✍️ ' + b.author_name[0] : ''}${b.first_publish_year ? '  📅 ' + b.first_publish_year : ''}`
    ).join('\n\n');
    return { type: 'text', content: `📚 Natijalar (${d.numFound} ta topildi):\n\n${list}` };
  } catch {
    return { type: 'text', content: '❌ Kitob qidirishda xatolik. Internet aloqasini tekshiring.' };
  }
}

// ─── Generators ───────────────────────────────────────────────────

async function qr({ text }) {
  await loadScript(QRCODE_CDN);
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, text.trim() || 'EduBot', {
    width: 280, margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
  return { type: 'image', dataUrl: canvas.toDataURL(), filename: 'qrcode.png' };
}

function cert({ text }) {
  const [name = 'Ism Familiya', course = 'Kurs nomi'] = text.trim().split('\n');
  const W = 800, H = 560;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f0c29'); bg.addColorStop(0.5, '#302b63'); bg.addColorStop(1, '#24243e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, W-36, H-36);
  ctx.strokeStyle = 'rgba(251,191,36,0.3)'; ctx.lineWidth = 1;
  ctx.strokeRect(28, 28, W-56, H-56);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 38px Georgia, serif';
  ctx.fillText('SERTIFIKAT', W/2, 115);

  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '17px Georgia, serif';
  ctx.fillText('quyidagi kurs muvaffaqiyatli yakunlanganligi uchun beriladi', W/2, 155);

  ctx.fillStyle = '#fff'; ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText(name.trim(), W/2, 255);

  ctx.fillStyle = '#a78bfa'; ctx.font = '22px Georgia, serif';
  ctx.fillText(course.trim(), W/2, 310);

  ctx.strokeStyle = 'rgba(251,191,36,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W/2 - 180, 345); ctx.lineTo(W/2 + 180, 345); ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '14px sans-serif';
  ctx.fillText(new Date().toLocaleDateString('uz-UZ', { year:'numeric', month:'long', day:'numeric' }), W/2, 480);
  ctx.fillText('EduBot • edubot.uz', W/2, 510);

  return { type: 'image', dataUrl: canvas.toDataURL('image/png'), filename: 'certificate.png' };
}

function schedule({ text }) {
  const lines = text.trim().split('\n').filter(Boolean);
  const W = 680, rowH = 52, H = rowH * (lines.length + 1) + 80;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0d0d18'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#8b5cf6'; ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📅 Dars Jadvali', W/2, 44);

  ctx.textAlign = 'left'; ctx.font = '15px sans-serif';
  lines.forEach((line, i) => {
    const y = 70 + i * rowH;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.roundRect(16, y, W - 32, rowH - 4, 8);
    ctx.fill();
    ctx.fillStyle = '#e5e5ff';
    ctx.fillText(line, 28, y + 33);
  });
  return { type: 'image', dataUrl: canvas.toDataURL('image/png'), filename: 'schedule.png' };
}

// ─── Archive ─────────────────────────────────────────────────────

async function zip({ files }) {
  await loadScript(JSZIP_CDN);
  const archive = new JSZip();
  for (const f of files) {
    archive.file(f.name, await readAsArrayBuffer(f));
  }
  const blob = await archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { type: 'file', blob, filename: 'archive.zip' };
}

async function unzip({ file }) {
  await loadScript(JSZIP_CDN);
  const buf = await readAsArrayBuffer(file);
  const archive = await JSZip.loadAsync(buf);
  const names = Object.keys(archive.files).filter(n => !archive.files[n].dir);
  if (names.length === 1) {
    const blob = await archive.files[names[0]].async('blob');
    return { type: 'file', blob, filename: names[0] };
  }
  const list = names.join('\n');
  const newZip = new JSZip();
  for (const name of names) {
    newZip.file(name, await archive.files[name].async('arraybuffer'));
  }
  const blob = await newZip.generateAsync({ type: 'blob' });
  return { type: 'file', blob, filename: 'extracted.zip', info: `${names.length} fayl:\n${list}` };
}

async function ocr({ file }) {
  if (!file) return { type: 'text', content: '❌ Rasm faylini yuklang' };
  if (!BACKEND_URL) return { type: 'text', content: '⚠️ Backend hali ulanmagan.\n\nHozircha: Google Lens yoki i2OCR.com dan foydalaning.' };
  const r = await postToBackend('/api/ocr', file);
  if (!r.ok) throw new Error(await r.text());
  const { text } = await r.json();
  return { type: 'text', content: text };
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
  // Image
  imgcompress, bgremove,
  // Text
  translit, readtime, deadline, stats, equation, graph,
  // API
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
