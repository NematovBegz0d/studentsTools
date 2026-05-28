// EduBot — QrPro (CLIENT-SIDE, qrcodejs@1.0.0)
// ✅ Backend ishlatilmaydi — QR kod browserda Canvas orqali yaratiladi
// CDN: qrcodejs@1.0.0 (cdnjs, SRI verified)
// API: new QRCode(element, opts) — sinxron, Promise kerak emas

"use strict";

const {
  useState:    _useS,
  useRef:      _useR,
  useCallback: _useC,
  useEffect:   _useE,
} = React;

// ─── CDN — SRI integrity tasdiqlangan ────────────────────────────
const QRCODE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
const QRCODE_SRI = "sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU";

const EC_OPTS = [
  { id: "L", level: 1, label: "L · 7%",  note: "Tez" },
  { id: "M", level: 0, label: "M · 15%", note: "Standart" },
  { id: "Q", level: 3, label: "Q · 25%", note: "Yuqori" },
  { id: "H", level: 2, label: "H · 30%", note: "Maksimal" },
];

// ─── CDN dinamik yuklash (SRI + crossOrigin) ──────────────────────
let _libPromise = null;

function _loadLib() {
  if (_libPromise) return _libPromise;
  _libPromise = new Promise((resolve, reject) => {
    if (window.QRCode) { resolve(); return; }
    const existing = document.querySelector(`script[src="${QRCODE_CDN}"]`);
    if (existing) {
      // Skript mavjud — yuklash holati
      if (window.QRCode) { resolve(); return; }
      existing.addEventListener("load",  resolve);
      existing.addEventListener("error", () => { _libPromise = null; reject(new Error("CDN xato")); });
      return;
    }
    const s = document.createElement("script");
    s.src         = QRCODE_CDN;
    s.integrity   = QRCODE_SRI;
    s.crossOrigin = "anonymous";
    s.onload  = resolve;
    s.onerror = () => {
      _libPromise = null; // Keyingi urinish uchun reset
      reject(new Error(
        "QR kutubxonasi yuklanmadi.\n" +
        "Internet aloqasini tekshiring yoki sahifani qayta yuklang."
      ));
    };
    document.head.appendChild(s);
  });
  return _libPromise;
}

// ─── QR data URL yaratish ─────────────────────────────────────────
function _generateDataUrl(text, { size, ecLevel }) {
  const div = document.createElement("div");
  // qrcodejs API: new QRCode(element, { text, width, height, correctLevel })
  new window.QRCode(div, {
    text,
    width:        size,
    height:       size,
    correctLevel: ecLevel,
  });
  // qrcodejs sinxron ravishda canvas (+ img) yaratadi
  const canvas = div.querySelector("canvas");
  if (canvas) return canvas.toDataURL("image/png");
  // Fallback: img src dan olish (eski brauzerlarda)
  const img = div.querySelector("img");
  if (img && img.src) return img.src;
  throw new Error("QR canvas yaratilmadi");
}

async function _toDataUrl(text, { size, ecId }) {
  await _loadLib();
  const ec = EC_OPTS.find(o => o.id === ecId) || EC_OPTS[1];
  return _generateDataUrl(text, { size, ecLevel: ec.level });
}

// ─── Telegram botga yuborish ──────────────────────────────────────
async function _sendToBot(dataUrl, onToast) {
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!userId || !window.BACKEND_URL) {
    onToast?.("❌ Telegram ID topilmadi");
    return;
  }
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const form = new FormData();
    form.append("file", blob, "qrcode.png");
    form.append("user_id", String(userId));
    form.append("filename", "qrcode.png");
    const r = await fetch(`${window.BACKEND_URL}/api/send-file`, {
      method: "POST",
      headers: { "X-User-Id": String(userId) },
      body: form,
    });
    if (!r.ok) throw new Error(`Server ${r.status}`);
    onToast?.("✅ Telegram botga yuborildi");
  } catch (e) {
    onToast?.("❌ Yuborishda xato: " + (e.message || "Qayta urinib ko'ring"));
  }
}

// ─── Component ────────────────────────────────────────────────────
function QrPro({ t, accent, onToast }) {
  const [text,    setText]    = _useS("");
  const [ec,      setEc]      = _useS("M");
  const [size,    setSize]    = _useS(256);
  const [dataUrl, setDataUrl] = _useS(null);
  const [loading, setLoading] = _useS(false);
  const [err,     setErr]     = _useS("");
  const timer = _useR(null);

  const generate = _useC(async (val, ecId, px) => {
    if (!val.trim()) { setDataUrl(null); setErr(""); return; }
    setLoading(true); setErr("");
    try {
      const url = await _toDataUrl(val.trim(), { size: px, ecId });
      setDataUrl(url);
    } catch (e) {
      setErr(e.message);
      setDataUrl(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced auto-generate
  _useE(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => generate(text, ec, size), 500);
    return () => clearTimeout(timer.current);
  }, [text, ec, size, generate]);

  const download = _useC(() => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl; a.download = "qrcode.png";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
  }, [dataUrl]);

  const sendBot = _useC(() => {
    if (dataUrl) _sendToBot(dataUrl, onToast);
  }, [dataUrl, onToast]);

  return (
    <div style={{ padding: "16px 16px 32px" }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        maxLength={2000}
        placeholder="URL, matn, telefon raqami yoki email kiriting..."
        style={{
          width: "100%", height: 80, padding: "10px 12px",
          borderRadius: 12, border: "1px solid var(--border-subtle)",
          background: "var(--bg-surface-1)", color: "var(--text-primary)",
          fontSize: 15, resize: "none", boxSizing: "border-box", fontFamily: "inherit",
        }}
      />
      <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
        {text.length}/2000
      </div>

      {/* Xato tuzatish darajasi */}
      <div style={{ marginTop: 12 }}>
        <div style={{
          fontSize: 11.5, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: 0.6, color: "var(--text-muted)", marginBottom: 8,
        }}>
          Xato tuzatish
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {EC_OPTS.map(o => (
            <button
              key={o.id}
              onClick={() => setEc(o.id)}
              style={{
                flex: 1, padding: "7px 4px", borderRadius: 9,
                border: `1.5px solid ${ec === o.id ? accent : "var(--border-subtle)"}`,
                background: ec === o.id ? accent + "18" : "var(--bg-surface-1)",
                color: ec === o.id ? accent : "var(--text-secondary)",
                fontSize: 10.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              <div>{o.label}</div>
              <div style={{ fontSize: 9, marginTop: 1, opacity: 0.7, fontWeight: 400 }}>{o.note}</div>
            </button>
          ))}
        </div>
      </div>

      {/* O'lcham */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>O'lcham</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{size} × {size} px</span>
        </div>
        <input
          type="range" min="128" max="512" step="64" value={size}
          onChange={e => setSize(+e.target.value)}
          style={{ width: "100%", accentColor: accent }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{
          marginTop: 10, padding: "10px 12px", borderRadius: 10,
          background: "#f871711a", border: "1px solid #f8717144",
          color: "#f87171", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-line",
        }}>
          {err}
          <button
            onClick={() => generate(text, ec, size)}
            style={{
              display: "block", marginTop: 6,
              background: "none", border: "none",
              color: "#f87171", fontSize: 12.5, cursor: "pointer",
              textDecoration: "underline", padding: 0,
            }}
          >
            Qayta urinish
          </button>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 20, fontSize: 13 }}>
          Yaratilmoqda...
        </div>
      )}

      {dataUrl && !loading && (
        <div style={{ marginTop: 14 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{
              display: "inline-block", background: "#fff",
              padding: 12, borderRadius: 16,
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            }}>
              <img src={dataUrl} alt="QR Kod" style={{ display: "block", borderRadius: 8 }} />
            </div>
          </div>
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

Object.assign(window, { QrPro });
