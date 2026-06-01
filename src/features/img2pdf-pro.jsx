// EduBot — Img2PdfPro (CLIENT-SIDE, jsPDF)
// ✅ Python backend ishlatilmaydi — hammasi browserda
// ✅ jsPDF + canvas-confetti CDN orqali yuklanadi
// ✅ Document rejim: Canvas grayscale + contrast binarizatsiya
// ✅ Searchable rejim: pastda "OCR Text Layer Activated" metama'lumot

"use strict";

const {
  useState:    _useS,
  useRef:      _useR,
  useCallback: _useC,
  useEffect:   _useE,
  useMemo:     _useM,
} = React;

// ─── Konstantalar ─────────────────────────────────────────────────

const PAGE_SIZES = {
  a4:       { w: 210,   h: 297,   label: "A4 (210 × 297 mm)" },
  a3:       { w: 297,   h: 420,   label: "A3 (297 × 420 mm)" },
  a5:       { w: 148,   h: 210,   label: "A5 (148 × 210 mm)" },
  letter:   { w: 215.9, h: 279.4, label: "Letter (215.9 × 279.4 mm)" },
  legal:    { w: 215.9, h: 355.6, label: "Legal (215.9 × 355.6 mm)" },
  original: { w: 0,     h: 0,     label: "Original (rasmning aniq o'lchami)" },
};

const FIT_OPTIONS = [
  { id: "fit",    label: "Fit",    sub: "Sig'dirish" },
  { id: "fill",   label: "Fill",   sub: "To'ldirish" },
  { id: "center", label: "Center", sub: "DPI bilan" },
];

const DPI_OPTIONS = [
  { value: 72,  label: "72 DPI · Kichik hajm, tezkor" },
  { value: 96,  label: "96 DPI · Standart ekran" },
  { value: 150, label: "150 DPI · O'rtacha, sifatli" },
  { value: 300, label: "300 DPI · Yuqori sifat, bosmaxona" },
];

const MODE_OPTIONS = [
  {
    id:    "normal",
    icon:  "📄",
    title: "Normal Rejim",
    desc:  "Rasmlar asl rang va o'lchamlarda saqlanadi.",
  },
  {
    id:    "document",
    icon:  "📑",
    title: "Skan Rejimi (Document)",
    desc:  "Matnni bo'rttirish, oq-qora tozalash va fonni oqartirish.",
  },
  {
    id:    "searchable",
    icon:  "🔍",
    title: "Searchable PDF (OCR)",
    desc:  "Hujjat ustiga optik matn qatlamini qo'shish simulyatsiyasi.",
  },
];

// Amber/slate inspired ranglar (Tailwind o'rniga inline)
const AMBER       = "#f59e0b";
const AMBER_SOFT  = "rgba(245,158,11,0.10)";
const AMBER_BD    = "rgba(245,158,11,0.32)";
const AMBER_BG_HI = "rgba(245,158,11,0.18)";
const EMERALD     = "#10b981";
const RED         = "#f87171";
const SLATE_BLACK = "#0f172a"; // amber tugmasi ustidagi matn

// Performans: Document rejimida bitta o'lchov chegarasi (max long edge)
const DOC_MAX_DIM = 2000;

// ─── Yordamchilar ─────────────────────────────────────────────────

function _detectFormat(file) {
  const ext = (file.name || "").split(".").pop().toLowerCase();
  const fromName = {
    jpg: "JPEG", jpeg: "JPEG",
    png: "PNG",  webp: "WEBP", gif: "GIF",
    bmp: "BMP",  tif:  "TIFF", tiff: "TIFF",
    heic: "HEIC", heif: "HEIC", avif: "AVIF",
  };
  if (fromName[ext]) return fromName[ext];
  const mime = (file.type || "").split("/")[1] || "IMG";
  return mime.toUpperCase();
}

// File → {file, dataUrl, width, height, format, sizeKB}
function _loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        resolve({
          file,
          dataUrl,
          width:  img.naturalWidth,
          height: img.naturalHeight,
          format: _detectFormat(file),
          sizeKB: Math.max(1, Math.round(file.size / 1024)),
        });
      };
      img.onerror = () =>
        reject(new Error(`Rasm o'qib bo'lmadi: ${file.name}`));
      img.src = dataUrl;
    };
    reader.onerror = () =>
      reject(new Error(`Fayl o'qib bo'lmadi: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// Document rejim: Canvas → grayscale + kontrast oshirish → JPEG dataURL
function _documentEnhance(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const r = Math.min(
          1,
          DOC_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight),
        );
        const w = Math.max(1, Math.round(img.naturalWidth * r));
        const h = Math.max(1, Math.round(img.naturalHeight * r));

        const canvas  = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          // Luminance (Rec. 601)
          const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          // Kontrast oshirish: 1.5× spec dan
          let e = (g - 128) * 1.5 + 128;
          if (e < 0)   e = 0;
          if (e > 255) e = 255;
          d[i] = d[i + 1] = d[i + 2] = e;
          // alpha o'zgarmas
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () =>
      reject(new Error("Document enhance: rasm o'qib bo'lmadi"));
    img.src = dataUrl;
  });
}

function _ensureLibs() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error(
      "jsPDF kutubxonasi yuklanmagan. Sahifani qayta yuklang (Ctrl+R).",
    );
  }
}

// Blob ni fayl sifatida yuklab olish
function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Faylni Telegram botga yuborish (boshqa xizmatlardagi naqshga mos)
async function _sendToBot(blob, filename, onToast) {
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!userId || !window.BACKEND_URL) {
    onToast?.("❌ Telegram ID topilmadi");
    return;
  }
  try {
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("user_id", String(userId));
    form.append("filename", filename);
    const r = await fetch(`${window.BACKEND_URL}/api/send-file`, {
      method:  "POST",
      headers: { "X-User-Id": String(userId) },
      body:    form,
    });
    if (!r.ok) throw new Error("Server xatosi");
    onToast?.("✅ Telegram botga yuborildi");
  } catch (e) {
    onToast?.("❌ Yuborishda xato: " + (e.message || "Qayta urinib ko'ring"));
  }
}

// Rasm uchun PDF sahifa o'lchami va render geometriyasi
function _layoutFor(img, pageSize, marginMm, fitMode, dpi) {
  // Sahifa o'lchami
  let pageW, pageH;
  if (pageSize === "original") {
    pageW = Math.max(10, (img.width  * 25.4) / dpi);
    pageH = Math.max(10, (img.height * 25.4) / dpi);
  } else {
    const ps          = PAGE_SIZES[pageSize];
    const isLandscape = img.width > img.height;
    pageW = isLandscape ? Math.max(ps.w, ps.h) : Math.min(ps.w, ps.h);
    pageH = isLandscape ? Math.min(ps.w, ps.h) : Math.max(ps.w, ps.h);
  }

  const m      = Math.max(0, Math.min(marginMm, Math.min(pageW, pageH) / 2 - 1));
  const availW = Math.max(1, pageW - 2 * m);
  const availH = Math.max(1, pageH - 2 * m);

  // Rasmning fizik o'lchami (DPI ga bog'liq)
  const physW = (img.width  * 25.4) / dpi;
  const physH = (img.height * 25.4) / dpi;

  let x, y, w, h;
  if (fitMode === "fill") {
    // Sahifani to'liq to'ldirish (proporsiyani buzadi)
    x = m; y = m; w = availW; h = availH;
  } else if (fitMode === "center") {
    // Fizik o'lchamda markazda — agar sig'masa kichraytirish
    const sc = Math.min(1, availW / physW, availH / physH);
    w = physW * sc;
    h = physH * sc;
    x = (pageW - w) / 2;
    y = (pageH - h) / 2;
  } else {
    // fit (default) — proporsional sahifaga sig'dirish
    const ratioImg  = img.width  / img.height;
    const ratioPage = availW / availH;
    if (ratioImg > ratioPage) {
      w = availW;
      h = availW / ratioImg;
    } else {
      h = availH;
      w = availH * ratioImg;
    }
    x = (pageW - w) / 2;
    y = (pageH - h) / 2;
  }

  return { pageW, pageH, x, y, w, h, margin: m };
}

// ─── Subkomponentlar: Dropzone ────────────────────────────────────

function _DropzonePro({ dragOver, setDragOver, onPick, onFiles }) {
  return (
    <button
      type="button"
      onClick={onPick}
      onDragOver={(e)  => { e.preventDefault(); setDragOver(true);  }}
      onDragLeave={()  => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
      aria-label="Rasmlarni shu yerga tashlang yoki bosib tanlang"
      style={{
        width:           "100%",
        minHeight:       170,
        padding:         18,
        background:      dragOver ? AMBER_SOFT : "var(--bg-surface-1)",
        border:          `2px dashed ${dragOver ? AMBER : "var(--border-medium)"}`,
        borderRadius:    18,
        cursor:          "pointer",
        display:         "flex",
        flexDirection:   "column",
        alignItems:      "center",
        justifyContent:  "center",
        gap:             10,
        transition:      "all 0.18s",
        font:            "inherit",
        color:           "var(--text-primary)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width:           54,
          height:          54,
          borderRadius:    "50%",
          background:      AMBER_SOFT,
          border:          `1px solid ${AMBER_BD}`,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3v12m0-12l-4 4m4-4l4 4M5 21h14"
            stroke={AMBER}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>
        Rasmlarni shu yerga tashlang
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        yoki bosib tanlang (ko'p fayl mumkin)
      </div>
      <div
        style={{
          fontSize:       10.5,
          letterSpacing:  0.4,
          textTransform:  "uppercase",
          color:          "var(--text-faint)",
          marginTop:      2,
        }}
      >
        JPEG · PNG · WEBP · GIF · BMP · TIFF · HEIC · AVIF
      </div>
    </button>
  );
}

// ─── Image list ─────────────────────────────────────────────────────

function _ImageList({ images, mode, onMove, onDelete }) {
  if (!images.length) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          border: "0.5px dashed var(--border-medium)",
          borderRadius: 16,
          background:
            "linear-gradient(180deg, var(--bg-surface-1) 0%, var(--bg-surface-2) 100%)",
          color: "var(--text-muted)",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle amber glow */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -30,
            left: "50%",
            transform: "translateX(-50%)",
            width: 200,
            height: 60,
            background: `radial-gradient(ellipse at center, ${AMBER}1a, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        {/* Yumshoq miniatyura-stack illyustratsiya */}
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            width: 64,
            height: 48,
            marginBottom: 2,
          }}
        >
          {/* Orqa kart */}
          <div
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              width: 56,
              height: 40,
              borderRadius: 8,
              background: AMBER_SOFT,
              border: `1px solid ${AMBER_BD}`,
              transform: "rotate(-6deg)",
              opacity: 0.6,
            }}
          />
          {/* O'rta kart */}
          <div
            style={{
              position: "absolute",
              top: 2,
              left: 2,
              width: 56,
              height: 40,
              borderRadius: 8,
              background: AMBER_SOFT,
              border: `1px solid ${AMBER_BD}`,
              transform: "rotate(3deg)",
            }}
          />
          {/* Old kart (asosiy) */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 4,
              width: 56,
              height: 40,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${AMBER_BG_HI}, ${AMBER_SOFT})`,
              border: `1px solid ${AMBER}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 4px 12px ${AMBER}30`,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" stroke={AMBER} strokeWidth="1.8"/>
              <circle cx="9" cy="10" r="2" stroke={AMBER} strokeWidth="1.8" fill="none"/>
              <path d="M21 16l-5-5-9 9" stroke={AMBER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--text-secondary)",
            position: "relative",
          }}
        >
          Hozircha hech qanday rasm yuklanmadi
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-faint)",
            position: "relative",
            letterSpacing: 0.2,
          }}
        >
          Yuqoridagi joydan rasm tashlang yoki tanlang
        </div>
      </div>
    );
  }
  const isDoc = mode === "document";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {images.map((img, i) => {
        const upDisabled   = i === 0;
        const downDisabled = i === images.length - 1;
        return (
          <div
            key={img.file.name + i + img.sizeKB}
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:            10,
              padding:        "8px 10px",
              border:         "0.5px solid var(--border-subtle)",
              borderRadius:   12,
              background:     "var(--bg-surface-1)",
            }}
          >
            {/* tartib raqami */}
            <div
              style={{
                minWidth:        22,
                height:          22,
                borderRadius:    6,
                background:      AMBER_SOFT,
                color:           AMBER,
                fontSize:        11,
                fontWeight:      700,
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "center",
                flexShrink:      0,
              }}
            >
              {i + 1}
            </div>

            {/* miniatyura */}
            <div
              style={{
                position:     "relative",
                width:        48,
                height:       48,
                borderRadius: 8,
                overflow:     "hidden",
                background:   "var(--bg-surface-2)",
                flexShrink:   0,
              }}
            >
              <img
                src={img.dataUrl}
                alt={img.file.name}
                style={{
                  width:    "100%",
                  height:   "100%",
                  objectFit: "cover",
                  filter:   isDoc ? "grayscale(1) contrast(1.25)" : "none",
                }}
              />
              {isDoc && (
                <div
                  style={{
                    position:     "absolute",
                    left:         0,
                    right:        0,
                    bottom:       0,
                    background:   "rgba(0,0,0,0.55)",
                    color:        "#fff",
                    fontSize:     8,
                    fontWeight:   700,
                    textAlign:    "center",
                    padding:      "1px 0",
                    letterSpacing: 0.5,
                  }}
                >
                  SKAN
                </div>
              )}
            </div>

            {/* matn */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize:     12.5,
                  fontWeight:   600,
                  color:        "var(--text-primary)",
                  whiteSpace:   "nowrap",
                  overflow:     "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {img.file.name}
              </div>
              <div
                style={{
                  display:    "flex",
                  alignItems: "center",
                  gap:        6,
                  marginTop:  3,
                }}
              >
                <span
                  style={{
                    fontSize:     9.5,
                    fontWeight:   700,
                    padding:      "1px 6px",
                    borderRadius: 4,
                    background:   "var(--bg-surface-2)",
                    color:        "var(--text-secondary)",
                    letterSpacing: 0.4,
                  }}
                >
                  {img.format}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                  {img.width}×{img.height}px
                </span>
                <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
                  · {img.sizeKB} KB
                </span>
              </div>
            </div>

            {/* harakat tugmalari */}
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
              {_iconBtn("↑", "Yuqoriga", upDisabled,   () => onMove(i, -1))}
              {_iconBtn("↓", "Pastga",   downDisabled, () => onMove(i, +1))}
              {_iconBtn("🗑", "O'chirish", false,       () => onDelete(i), RED)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function _iconBtn(label, aria, disabled, onClick, color) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      style={{
        width:           28,
        height:          28,
        borderRadius:    7,
        border:          "0.5px solid var(--border-medium)",
        background:      "var(--bg-surface-2)",
        color:           color || "var(--text-secondary)",
        cursor:          disabled ? "not-allowed" : "pointer",
        opacity:         disabled ? 0.35 : 1,
        fontSize:        12.5,
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        font:            "inherit",
        padding:         0,
      }}
    >
      {label}
    </button>
  );
}

// ─── Sozlamalar paneli ──────────────────────────────────────────────

function _SettingsPanel({
  pageSize, setPageSize,
  marginMm, setMarginMm,
  fitMode,  setFitMode,
  dpi,      setDpi,
  mode,     setMode,
}) {
  const [open, setOpen] = _useS(true);

  const selectStyle = {
    width:        "100%",
    padding:      "9px 12px",
    borderRadius: 10,
    border:       "0.5px solid var(--border-medium)",
    background:   "var(--bg-surface-2)",
    color:        "var(--text-primary)",
    fontSize:     13,
    outline:      "none",
    font:         "inherit",
  };
  const sectionLabel = {
    fontSize:       10.5,
    fontWeight:     700,
    letterSpacing:  0.6,
    textTransform:  "uppercase",
    color:          "var(--text-muted)",
    marginBottom:   6,
  };

  return (
    <div
      style={{
        background:   "var(--bg-surface-1)",
        border:       "0.5px solid var(--border-subtle)",
        borderRadius: 16,
        padding:      14,
      }}
    >
      {/* sarlavha + collapse */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          width:            "100%",
          background:       "transparent",
          border:           "none",
          padding:          0,
          marginBottom:     open ? 12 : 0,
          display:          "flex",
          alignItems:       "center",
          justifyContent:   "space-between",
          color:            "var(--text-primary)",
          cursor:           "pointer",
          font:             "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true">⚙️</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>PDF Parametrlari</span>
        </span>
        <span
          aria-hidden="true"
          style={{
            color:      "var(--text-muted)",
            fontSize:   13,
            transition: "transform 0.2s",
            transform:  open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 1. Sahifa o'lchami */}
          <div>
            <div style={sectionLabel}>Sahifa o'lchami</div>
            <select
              style={selectStyle}
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value)}
            >
              {Object.entries(PAGE_SIZES).map(([id, ps]) => (
                <option key={id} value={id}>{ps.label}</option>
              ))}
            </select>
          </div>

          {/* 2. Hoshiya slider */}
          <div>
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                marginBottom:   6,
              }}
            >
              <div style={{ ...sectionLabel, marginBottom: 0 }}>
                Hoshiya qalinligi
              </div>
              <span
                style={{
                  fontSize:     11,
                  fontWeight:   700,
                  padding:      "2px 8px",
                  borderRadius: 8,
                  background:   AMBER_SOFT,
                  color:        AMBER,
                  border:       `0.5px solid ${AMBER_BD}`,
                }}
              >
                {marginMm} mm
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="1"
              value={marginMm}
              onChange={(e) => setMarginMm(parseInt(e.target.value, 10))}
              aria-label="Hoshiya qalinligi (mm)"
              style={{
                width:       "100%",
                accentColor: AMBER,
              }}
            />
          </div>

          {/* 3. Fit mode (3 button grid) */}
          <div>
            <div style={sectionLabel}>Rasm moslashuvi</div>
            <div
              style={{
                display:             "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap:                 6,
              }}
            >
              {FIT_OPTIONS.map((f) => {
                const active = fitMode === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFitMode(f.id)}
                    aria-pressed={active}
                    style={{
                      padding:       "8px 4px",
                      borderRadius:  10,
                      border:        `1.5px solid ${active ? AMBER : "var(--border-medium)"}`,
                      background:    active ? AMBER : "var(--bg-surface-2)",
                      color:         active ? SLATE_BLACK : "var(--text-primary)",
                      cursor:        "pointer",
                      font:          "inherit",
                      fontSize:      12,
                      fontWeight:    active ? 700 : 500,
                      display:       "flex",
                      flexDirection: "column",
                      alignItems:    "center",
                      gap:           2,
                      transition:    "all 0.15s",
                    }}
                  >
                    <span>{f.label}</span>
                    <span
                      style={{
                        fontSize: 9.5,
                        opacity:  active ? 0.85 : 0.6,
                      }}
                    >
                      {f.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. DPI */}
          <div>
            <div style={sectionLabel}>Ruxsat (DPI)</div>
            <select
              style={selectStyle}
              value={dpi}
              onChange={(e) => setDpi(parseInt(e.target.value, 10))}
            >
              {DPI_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* 5. Mode (3 card radio) */}
          <div>
            <div style={sectionLabel}>Qayta ishlash rejimi</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {MODE_OPTIONS.map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    aria-pressed={active}
                    style={{
                      textAlign:    "left",
                      padding:      "10px 12px",
                      borderRadius: 12,
                      border:       `1.5px solid ${active ? AMBER : "var(--border-medium)"}`,
                      background:   active ? AMBER_SOFT : "var(--bg-surface-2)",
                      color:        "var(--text-primary)",
                      cursor:       "pointer",
                      font:         "inherit",
                      display:      "flex",
                      gap:          10,
                      alignItems:   "flex-start",
                      transition:   "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden="true">
                      {m.icon}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display:    "block",
                          fontSize:   12.5,
                          fontWeight: 700,
                          color:      active ? AMBER : "var(--text-primary)",
                        }}
                      >
                        {m.title}
                      </span>
                      <span
                        style={{
                          display:    "block",
                          fontSize:   11,
                          color:      "var(--text-muted)",
                          marginTop:  2,
                          lineHeight: 1.4,
                        }}
                      >
                        {m.desc}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Progress bar ───────────────────────────────────────────────────

function _ProgressBar({ value, status }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ width: "100%" }}
    >
      <div
        style={{
          width:        "100%",
          height:       8,
          background:   "var(--bg-surface-2)",
          borderRadius: 999,
          overflow:     "hidden",
          position:     "relative",
        }}
      >
        <div
          style={{
            position:     "absolute",
            top:          0,
            left:         0,
            height:       "100%",
            width:        `${value}%`,
            background:   `linear-gradient(90deg, ${AMBER}, #fbbf24)`,
            borderRadius: 999,
            boxShadow:    `0 0 10px ${AMBER}80`,
            transition:   "width 0.25s ease",
          }}
        />
      </div>
      <div
        style={{
          marginTop:  6,
          fontSize:   11,
          color:      "var(--text-muted)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          display:    "flex",
          justifyContent: "space-between",
          gap:        8,
        }}
      >
        <span style={{
          flex: 1, minWidth: 0,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {status || "Tayyorlanmoqda..."}
        </span>
        <span style={{ color: AMBER, fontWeight: 700 }}>{value}% bajarildi</span>
      </div>
    </div>
  );
}

// ─── Generate tugmasi ───────────────────────────────────────────────

function _GenerateButton({ count, isWorking, onClick }) {
  const disabled = !count || isWorking;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      style={{
        width:        "100%",
        padding:      "13px 18px",
        borderRadius: 14,
        border:       "none",
        font:         "inherit",
        fontSize:     14,
        fontWeight:   700,
        cursor:       disabled ? "not-allowed" : "pointer",
        color:        disabled ? "var(--text-muted)" : SLATE_BLACK,
        background:   disabled
          ? "var(--bg-surface-2)"
          : `linear-gradient(135deg, ${AMBER}, #fbbf24)`,
        boxShadow:    disabled ? "none" : `0 8px 24px rgba(245,158,11,0.35)`,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        gap:          8,
        opacity:      disabled ? 0.7 : 1,
        transition:   "all 0.15s",
      }}
    >
      {isWorking ? (
        <>
          <span
            aria-hidden="true"
            style={{
              width:        16,
              height:       16,
              borderRadius: "50%",
              border:       `2.5px solid rgba(15,23,42,0.25)`,
              borderTopColor: SLATE_BLACK,
              animation:    "spin 0.85s linear infinite",
            }}
          />
          PDF yaratilmoqda...
        </>
      ) : count > 0 ? (
        <>📥 PDF Hujjatni Yaratish ({count} ta rasm)</>
      ) : (
        <>📥 PDF Hujjatni Yaratish</>
      )}
    </button>
  );
}

// ─── Console log paneli (Python-uslubidagi) ────────────────────────

function _ConsoleLog({ images, pageSize, marginMm, fitMode, dpi, mode }) {
  const formats = _useM(() => {
    const set = new Set(images.map((i) => i.format));
    return Array.from(set).join(", ") || "—";
  }, [images]);

  const lines = [
    `Fayllar soni     : ${images.length}`,
    `Formatlar        : ${formats}`,
    `Sahifa o'lchami  : ${pageSize.toUpperCase()}`,
    `Hoshiya          : ${marginMm} mm`,
    `Joylashuv (fit)  : ${fitMode}`,
    `Ruxsat           : ${dpi} DPI`,
    `Rejim            : ${mode}`,
  ];

  return (
    <div
      style={{
        background:   "#0b0f1a",
        color:        "#e2e8f0",
        border:       `0.5px solid ${AMBER_BD}`,
        borderRadius: 12,
        padding:      "10px 12px",
        fontFamily:   "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize:     11.5,
        lineHeight:   1.65,
        maxHeight:    220,
        overflowY:    "auto",
      }}
    >
      <div
        style={{
          color:          AMBER,
          fontWeight:     700,
          marginBottom:   6,
          letterSpacing:  0.4,
        }}
      >
        === PDF Chiqish Jurnali Simulyatsiyasi ===
      </div>
      {lines.map((ln, i) => (
        <div key={i}>{ln}</div>
      ))}
    </div>
  );
}

// ─── Result View — boshqa xizmatlardagidek 3 ta tugma ──────────────

function _ResultView({ result, accent, onAgain, onToast }) {
  const [sending, setSending] = _useS(false);

  const handleDownload = _useC(() => {
    _downloadBlob(result.blob, result.filename);
    onToast?.("✅ Yuklandi");
  }, [result, onToast]);

  const handleSendToBot = _useC(async () => {
    setSending(true);
    await _sendToBot(result.blob, result.filename, onToast);
    setSending(false);
  }, [result, onToast]);

  const fileSizeMB = result.blob?.size
    ? (result.blob.size / 1024 / 1024).toFixed(2)
    : null;

  // Yashil muvaffaqiyat halqasi (window.SuccessRing mavjud bo'lsa undan foydalanamiz)
  const successIcon =
    typeof window.SuccessRing === "function"
      ? React.createElement(window.SuccessRing)
      : (
          <div
            aria-hidden="true"
            style={{
              width:           72,
              height:          72,
              borderRadius:    "50%",
              background:      "rgba(34,197,94,0.15)",
              border:          "1px solid rgba(34,197,94,0.35)",
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
            }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12l5 5L20 7"
                stroke="#22c55e"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        );

  // Button — window dan (components.js orqali yuklangan)
  const Btn = window.Button;
  const Spin = window.Spinner;

  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        gap:            14,
        padding:        "4px 0",
      }}
    >
      {successIcon}

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            color:     "var(--text-primary)",
            fontSize:  17,
            fontWeight: 700,
          }}
        >
          Tayyor!
        </div>
        <div
          style={{
            color:       "var(--text-muted)",
            fontSize:    12.5,
            marginTop:   4,
            fontFamily:  "ui-monospace, SFMono-Regular, Menlo, monospace",
            wordBreak:   "break-all",
          }}
        >
          📎 {result.filename}
          {fileSizeMB && <span> · {fileSizeMB} MB</span>}
        </div>
        <div
          style={{
            marginTop:    8,
            color:        EMERALD,
            fontSize:     12.5,
            fontWeight:   600,
            background:   "rgba(16,185,129,0.12)",
            padding:      "6px 12px",
            borderRadius: 8,
            display:      "inline-block",
          }}
        >
          PDF brauzerda yaratildi · {result.pages} sahifa
        </div>
      </div>

      {/* 3 ta tugma — Yana ishlash · Telegramga · Yuklab olish */}
      {Btn ? (
        <div style={{ display: "flex", gap: 8, width: "100%", flexWrap: "wrap" }}>
          <Btn variant="secondary" onClick={onAgain} style={{ flex: 1 }}>
            Yana ishlash
          </Btn>
          <Btn
            variant="secondary"
            onClick={handleSendToBot}
            disabled={sending}
            style={{ flex: 1 }}
          >
            {sending && Spin
              ? React.createElement(Spin, { size: 16, color: "var(--text-muted)" })
              : "📨"}
          </Btn>
          <Btn variant="primary" accent={accent} onClick={handleDownload} style={{ flex: 1 }}>
            Yuklab olish
          </Btn>
        </div>
      ) : (
        // Fallback — Button global'i topilmasa, oddiy tugmalar
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <button
            type="button"
            onClick={onAgain}
            style={_resultBtnStyle("secondary", accent)}
          >
            Yana ishlash
          </button>
          <button
            type="button"
            onClick={handleSendToBot}
            disabled={sending}
            style={_resultBtnStyle("secondary", accent)}
          >
            📨
          </button>
          <button
            type="button"
            onClick={handleDownload}
            style={_resultBtnStyle("primary", accent)}
          >
            Yuklab olish
          </button>
        </div>
      )}
    </div>
  );
}

function _resultBtnStyle(variant, accent) {
  const base = {
    flex:         1,
    padding:      "12px 18px",
    borderRadius: 14,
    fontSize:     14,
    fontWeight:   600,
    cursor:       "pointer",
    font:         "inherit",
    border:       "none",
  };
  if (variant === "primary") {
    return {
      ...base,
      background: accent || "var(--accent)",
      color:      "#fff",
      boxShadow:  `0 8px 24px ${accent || "var(--accent)"}40`,
    };
  }
  return {
    ...base,
    background: "var(--bg-surface-2)",
    color:      "var(--text-primary)",
    border:     "0.5px solid var(--border-medium)",
  };
}

// ─── Asosiy komponent ──────────────────────────────────────────────

function Img2PdfPro({ t, accent, onToast }) {
  const [images,    setImages]    = _useS([]);
  const [pageSize,  setPageSize]  = _useS("a4");
  const [marginMm,  setMarginMm]  = _useS(10);
  const [fitMode,   setFitMode]   = _useS("fit");
  const [dpi,       setDpi]       = _useS(150);
  const [mode,      setMode]      = _useS("normal");

  const [progress,  setProgress]  = _useS(0);
  const [statusLog, setStatusLog] = _useS("");
  const [isWorking, setIsWorking] = _useS(false);
  const [dragOver,  setDragOver]  = _useS(false);
  // result: { blob, filename, pages } — null bo'lsa input UI, aks holda result UI
  const [result,    setResult]    = _useS(null);
  const inputRef = _useR(null);

  // Yangi fayllar qo'shish
  const handleFiles = _useC(
    async (fileList) => {
      const arr = Array.from(fileList || []).filter(
        (f) =>
          (f.type && f.type.startsWith("image/")) ||
          /\.(heic|heif|avif)$/i.test(f.name || ""),
      );
      if (!arr.length) {
        onToast?.("❌ Rasm topilmadi");
        return;
      }
      // Limit: 50 ta
      const slots = Math.max(0, 50 - images.length);
      if (slots <= 0) {
        onToast?.("⚠️ Maksimal 50 ta rasm");
        return;
      }
      const toLoad = arr.slice(0, slots);

      const loaded = [];
      for (const f of toLoad) {
        try {
          const img = await _loadImage(f);
          loaded.push(img);
        } catch (e) {
          onToast?.(`⚠️ ${f.name}: o'qib bo'lmadi`);
        }
      }
      if (loaded.length) {
        setImages((prev) => [...prev, ...loaded]);
        window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
      }
    },
    [images.length, onToast],
  );

  const moveImage = _useC((idx, dir) => {
    setImages((prev) => {
      const tgt = idx + dir;
      if (tgt < 0 || tgt >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[tgt]] = [next[tgt], next[idx]];
      return next;
    });
  }, []);

  const deleteImage = _useC((idx) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // Asosiy: PDF generatsiya
  const generatePdf = _useC(async () => {
    if (!images.length || isWorking) return;
    try {
      _ensureLibs();
    } catch (e) {
      onToast?.(`❌ ${e.message}`);
      return;
    }

    setIsWorking(true);
    setProgress(10);
    setStatusLog("Hujjat o'lchamlari va rejimi tayyorlanmoqda...");

    try {
      const { jsPDF } = window.jspdf;
      let pdf = null;

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const pct = 10 + Math.round(((i + 1) / images.length) * 70);
        setProgress(pct);
        setStatusLog(`${i + 1}-sahifa ishlanmoqda: ${img.file.name}`);

        // Browser bo'sh nafas olishi uchun
        await new Promise((r) => setTimeout(r, 0));

        // Document → enhance
        const renderUrl =
          mode === "document" ? await _documentEnhance(img.dataUrl) : img.dataUrl;

        const L = _layoutFor(img, pageSize, marginMm, fitMode, dpi);

        if (i === 0) {
          pdf = new jsPDF({
            orientation: L.pageW > L.pageH ? "landscape" : "portrait",
            unit:        "mm",
            format:      [L.pageW, L.pageH],
            compress:    true,
          });
        } else {
          pdf.addPage(
            [L.pageW, L.pageH],
            L.pageW > L.pageH ? "landscape" : "portrait",
          );
        }

        // JPEG sifatida qo'shish (eng yengil va keng qo'llab-quvvatlanadigan)
        pdf.addImage(renderUrl, "JPEG", L.x, L.y, L.w, L.h, undefined, "FAST");

        // Searchable rejim → pastda metama'lumot
        if (mode === "searchable") {
          pdf.setFontSize(8);
          pdf.setTextColor(150, 150, 150);
          pdf.text(
            "OCR Text Layer Activated",
            L.margin,
            L.pageH - Math.max(2, L.margin / 2),
          );
        }
      }

      setProgress(90);
      setStatusLog("PDF fayl yig'ilmoqda...");

      const filename = `img2pdf_pro_${pageSize}_${images.length}sahifa.pdf`;
      // ⚠️ pdf.save() o'rniga blob qaytaramiz — boshqa xizmatlardagidek
      // result view orqali Yuklab olish / Telegramga yuborish tugmalari ko'rsatiladi
      const pdfBlob = pdf.output("blob");

      setProgress(100);
      setStatusLog("Muvaffaqiyatli yakunlandi!");

      if (typeof window.confetti === "function") {
        window.confetti({
          particleCount: 80,
          spread:        70,
          origin:        { y: 0.6 },
          colors:        ["#f59e0b", "#10b981", "#3b82f6", "#ef4444"],
        });
      }
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");

      // Progress paneli yopilib, result view ochiladi
      setIsWorking(false);
      setProgress(0);
      setStatusLog("");
      setResult({
        blob:     pdfBlob,
        filename,
        pages:    images.length,
      });
    } catch (e) {
      console.error("[Img2PdfPro]", e);
      setIsWorking(false);
      setProgress(0);
      setStatusLog("");
      onToast?.(`❌ Xato: ${e.message || "noma'lum"}`);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error");
    }
  }, [images, pageSize, marginMm, fitMode, dpi, mode, isWorking, onToast]);

  // Yana ishlash — result'ni tozalaymiz, rasmlar va sozlamalar saqlanadi
  // (foydalanuvchi sozlamani o'zgartirib qayta PDF yaratishi mumkin)
  const handleAgain = _useC(() => {
    setResult(null);
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
  }, []);

  // Telegram MainButton (mobil uchun qulay)
  // Result view ochiq bo'lsa — MainButton "Yuklab olish"ga aylanadi
  _useE(() => {
    const TG  = window.Telegram?.WebApp;
    const btn = TG?.MainButton;
    if (!btn) return;

    if (result) {
      btn.setText("PDF yuklab olish");
      try { btn.setParams({ color: AMBER, text_color: SLATE_BLACK }); } catch (_) {}
      btn.show();
      const handler = () => {
        _downloadBlob(result.blob, result.filename);
        onToast?.("✅ Yuklandi");
      };
      btn.onClick(handler);
      return () => {
        btn.hide();
        btn.offClick(handler);
      };
    }

    if (!images.length || isWorking) {
      btn.hide();
      return;
    }
    btn.setText(`PDF yaratish (${images.length} ta)`);
    try { btn.setParams({ color: AMBER, text_color: SLATE_BLACK }); } catch (_) {}
    btn.show();
    const handler = () => generatePdf();
    btn.onClick(handler);
    return () => {
      btn.hide();
      btn.offClick(handler);
    };
  }, [images.length, isWorking, generatePdf, result, onToast]);

  // ─── RESULT VIEW (boshqa xizmatlardagidek) ──────────────────────
  if (result) {
    return (
      <div
        style={{
          padding:       "12px 16px 28px",
          display:       "flex",
          flexDirection: "column",
          gap:           14,
        }}
      >
        <_ResultView
          result={result}
          accent={accent}
          onAgain={handleAgain}
          onToast={onToast}
        />
      </div>
    );
  }

  // ─── INPUT VIEW ──────────────────────────────────────────────────
  return (
    <div
      style={{
        padding:       "12px 16px 28px",
        display:       "flex",
        flexDirection: "column",
        gap:           14,
      }}
    >
      {/* Yashirin <input> — Dropzone bosilganda chaqiriladi */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* DROPZONE */}
      <_DropzonePro
        dragOver={dragOver}
        setDragOver={setDragOver}
        onPick={() => inputRef.current?.click()}
        onFiles={handleFiles}
      />

      {/* FAYLLAR RO'YXATI */}
      <_ImageList
        images={images}
        mode={mode}
        onMove={moveImage}
        onDelete={deleteImage}
      />

      {/* SETTINGS */}
      {images.length > 0 && (
        <_SettingsPanel
          pageSize={pageSize} setPageSize={setPageSize}
          marginMm={marginMm} setMarginMm={setMarginMm}
          fitMode={fitMode}   setFitMode={setFitMode}
          dpi={dpi}           setDpi={setDpi}
          mode={mode}         setMode={setMode}
        />
      )}

      {/* GENERATE TUGMA */}
      <_GenerateButton
        count={images.length}
        isWorking={isWorking}
        onClick={generatePdf}
      />

      {/* PROGRESS BAR — faqat ishlayotganda */}
      {isWorking && <_ProgressBar value={progress} status={statusLog} />}

      {/* CONSOLE LOG — rasmlar mavjud bo'lganda */}
      {images.length > 0 && (
        <_ConsoleLog
          images={images}
          pageSize={pageSize}
          marginMm={marginMm}
          fitMode={fitMode}
          dpi={dpi}
          mode={mode}
        />
      )}
    </div>
  );
}

Object.assign(window, { Img2PdfPro });
