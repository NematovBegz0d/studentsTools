// EduBot — ImgCompressPro (CLIENT-SIDE, Canvas API)
// ✅ Backend ishlatilmaydi — rasm siqish browserda Canvas orqali
// JPG/PNG/WebP qabul qiladi → JPEG sifatda chiqaradi

"use strict";

const {
  useState:    _useS,
  useRef:      _useR,
  useCallback: _useC,
} = React;

const MAX_MB = 20;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const QUALITY_OPTS = [
  { id: "high",   label: "Yuqori",    q: 0.85, hint: "~20-35% kichraytirish" },
  { id: "medium", label: "O'rtacha",  q: 0.65, hint: "~40-60% kichraytirish" },
  { id: "low",    label: "Past",      q: 0.40, hint: "~60-80% kichraytirish" },
];

const DIM_OPTS = [
  { id: "orig",  label: "Asl",    px: 0    },
  { id: "1920",  label: "1920px", px: 1920 },
  { id: "1280",  label: "1280px", px: 1280 },
  { id: "800",   label: "800px",  px: 800  },
];

function _fmtBytes(b) {
  if (b < 1024)         return `${b} B`;
  if (b < 1024 * 1024)  return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function _compress(file, quality, maxPx) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (maxPx > 0 && Math.max(w, h) > maxPx) {
        const r = maxPx / Math.max(w, h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error("Canvas blob yaratilmadi")); return; }
          resolve({ blob, w, h });
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => reject(new Error("Rasm o'qilmadi — fayl buzilgan bo'lishi mumkin"));
    img.src = objUrl;
  });
}

async function _sendToBot(blob, filename, onToast) {
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!userId || !window.BACKEND_URL) { onToast?.("❌ Telegram ID topilmadi"); return; }
  try {
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("user_id", String(userId));
    form.append("filename", filename);
    const r = await fetch(`${window.BACKEND_URL}/api/send-file`, {
      method: "POST", headers: { "X-User-Id": String(userId) }, body: form,
    });
    if (!r.ok) throw new Error(`Server ${r.status}`);
    onToast?.("✅ Telegram botga yuborildi");
  } catch (e) {
    onToast?.("❌ Yuborishda xato: " + (e.message || "Qayta urinib ko'ring"));
  }
}

// ─── Component ────────────────────────────────────────────────────
function ImgCompressPro({ t, accent, onToast }) {
  const [file,    setFile]    = _useS(null);
  const [quality, setQuality] = _useS("medium");
  const [maxDim,  setMaxDim]  = _useS("orig");
  const [result,  setResult]  = _useS(null);
  const [loading, setLoading] = _useS(false);
  const [err,     setErr]     = _useS("");
  const inputRef = _useR(null);

  const pickFile = _useC(e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) { setErr(`Fayl ${(f.size/1024/1024).toFixed(1)} MB. Maksimal: ${MAX_MB} MB`); return; }
    const ok = /\.(jpe?g|png|webp)$/i.test(f.name);
    if (!ok) { setErr("Faqat JPG, PNG yoki WebP fayllari qabul qilinadi"); return; }
    setErr(""); setResult(null); setFile(f);
  }, []);

  const compress = _useC(async () => {
    if (!file) return;
    setLoading(true); setErr("");
    try {
      const q  = QUALITY_OPTS.find(o => o.id === quality)?.q ?? 0.65;
      const px = DIM_OPTS.find(o => o.id === maxDim)?.px ?? 0;
      const { blob, w, h } = await _compress(file, q, px);
      const saved = Math.max(0, Math.round((1 - blob.size / file.size) * 100));
      setResult({ blob, w, h, origSize: file.size, newSize: blob.size, saved });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [file, quality, maxDim]);

  const download = _useC(() => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url; a.download = "compressed.jpg";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [result]);

  const sendBot = _useC(() => {
    if (result) _sendToBot(result.blob, "compressed.jpg", onToast);
  }, [result, onToast]);

  return (
    <div style={{ padding: "16px 16px 32px" }}>
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${file ? accent : "var(--border-subtle)"}`,
          borderRadius: 14, padding: "22px 16px", textAlign: "center",
          background: file ? accent + "08" : "var(--bg-surface-1)", cursor: "pointer",
        }}
      >
        <input
          ref={inputRef} type="file"
          accept=".jpg,.jpeg,.png,.webp"
          style={{ display: "none" }}
          onChange={pickFile}
        />
        {file ? (
          <>
            <div style={{ fontSize: 30 }}>🖼️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
              {file.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {_fmtBytes(file.size)}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 30 }}>📁</div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4 }}>
              JPG, PNG yoki WebP tanlang
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              Maksimal {MAX_MB} MB
            </div>
          </>
        )}
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{err}</div>}

      {/* Sifat darajasi */}
      <div style={{ marginTop: 16 }}>
        <div style={{
          fontSize: 11.5, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: 0.6, color: "var(--text-muted)", marginBottom: 8,
        }}>
          Sifat
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {QUALITY_OPTS.map(o => (
            <button
              key={o.id}
              onClick={() => setQuality(o.id)}
              style={{
                flex: 1, padding: "9px 6px", borderRadius: 10,
                border: `1.5px solid ${quality === o.id ? accent : "var(--border-subtle)"}`,
                background: quality === o.id ? accent + "18" : "var(--bg-surface-1)",
                color: quality === o.id ? accent : "var(--text-secondary)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              <div>{o.label}</div>
              <div style={{ fontSize: 9.5, marginTop: 2, opacity: 0.75, fontWeight: 400 }}>
                {o.hint}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Maksimal o'lcham */}
      <div style={{ marginTop: 14 }}>
        <div style={{
          fontSize: 11.5, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: 0.6, color: "var(--text-muted)", marginBottom: 8,
        }}>
          Maksimal tomon
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {DIM_OPTS.map(o => (
            <button
              key={o.id}
              onClick={() => setMaxDim(o.id)}
              style={{
                flex: 1, padding: "8px 4px", borderRadius: 10,
                border: `1.5px solid ${maxDim === o.id ? accent : "var(--border-subtle)"}`,
                background: maxDim === o.id ? accent + "18" : "var(--bg-surface-1)",
                color: maxDim === o.id ? accent : "var(--text-secondary)",
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={compress}
        disabled={!file || loading}
        style={{
          marginTop: 14, width: "100%", padding: "13px 0",
          background: accent, color: "#000", borderRadius: 12,
          border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer",
          opacity: (!file || loading) ? 0.5 : 1,
        }}
      >
        {loading ? "Siqilmoqda..." : "🗜️ Siqish"}
      </button>

      {result && (
        <div style={{
          marginTop: 14, background: "var(--bg-surface-1)",
          borderRadius: 12, padding: "14px 16px",
          border: "1px solid var(--border-subtle)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <span style={{
              fontSize: 30, fontWeight: 800,
              color: result.saved > 0 ? "#10b981" : "#f59e0b",
            }}>
              {result.saved > 0 ? `↓ ${result.saved}%` : "≈ 0%"}
            </span>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>kichraydi</div>
          </div>
          {[
            ["Asl hajm",   _fmtBytes(result.origSize)],
            ["Yangi hajm", _fmtBytes(result.newSize)],
            ["O'lcham",    `${result.w} × ${result.h} px`],
          ].map(([label, val]) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between",
              marginBottom: 7, fontSize: 13,
            }}>
              <span style={{ color: "var(--text-secondary)" }}>{label}</span>
              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{val}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={download}
              style={{
                flex: 1, padding: "11px 0",
                background: accent, color: "#000",
                borderRadius: 10, border: "none",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}
            >
              ⬇️ Yuklab olish
            </button>
            <button
              onClick={sendBot}
              style={{
                flex: 1, padding: "11px 0",
                background: accent + "1a", color: accent,
                borderRadius: 10, border: `1px solid ${accent}55`,
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              📤 Botga yuborish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ImgCompressPro });
