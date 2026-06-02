// EduBot — Service Sheet (IMPROVED)
// ✅ Fixes applied:
//   1. Telegram MainButton integration
//   2. Input sanitization before API calls
//   3. File validation (size + type) before Dropzone allows picking
//   4. Better error state UI
//   5. CSS Variables — light/dark mode ready
//   6. Proper loading percentage animation
//   7. Copy text to clipboard with fallback
//   8. ResultText: character count

"use strict";

const {
  useState: useS,
  useEffect: useE,
  useRef: useR,
  useCallback: useC,
} = React;

// ✅ FIX: Max file size (displayed to user)
const MAX_FILE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_MB * 1024 * 1024;

// ─── Dropzone ─────────────────────────────────────────────────────
function Dropzone({ accept, multi, t, onPick }) {
  const [picked, setPicked] = useS(null);
  const [dragOver, setDragOver] = useS(false);
  const [error, setError] = useS(null);
  const inputRef = useR(null);

  // ✅ NEW: Client-side validation in dropzone
  const validateAndPick = useC(
    (fileList) => {
      const arr = Array.from(fileList);
      if (!arr.length) return;
      setError(null);

      // File size check
      const oversize = arr.find((f) => f.size > MAX_FILE_SIZE);
      if (oversize) {
        const mb = (oversize.size / 1024 / 1024).toFixed(1);
        setError(`Fayl hajmi ${mb} MB. Maksimum ${MAX_FILE_MB} MB.`);
        return;
      }

      const result = multi ? arr : arr[0];
      setPicked(result);
      onPick(result);
    },
    [multi, onPick],
  );

  const label = multi
    ? Array.isArray(picked)
      ? `${picked.length} ta fayl tanlandi`
      : null
    : (picked?.name ?? null);

  const sizeText = multi
    ? Array.isArray(picked)
      ? `${(picked.reduce((s, f) => s + f.size, 0) / 1024).toFixed(0)} KB`
      : null
    : picked
      ? `${(picked.size / 1024).toFixed(0)} KB`
      : null;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={!!multi}
        style={{ display: "none" }}
        aria-label="Fayl tanlash"
        onChange={(e) => validateAndPick(e.target.files)}
      />
      <button
        type="button"
        onClick={() => {
          setError(null);
          inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          validateAndPick(e.dataTransfer.files);
        }}
        aria-label={
          label
            ? `${label} tanlandi. O'zgartirish uchun bosing`
            : "Fayl yuklash"
        }
        style={{
          width: "100%",
          minHeight: 180,
          padding: "26px 22px",
          background: error
            ? "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))"
            : label
              ? "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.03))"
              : dragOver
                ? "linear-gradient(135deg, rgba(139,92,246,0.14), rgba(59,130,246,0.06))"
                : "linear-gradient(180deg, var(--bg-surface-1), var(--bg-surface-2))",
          border: `1.5px dashed ${
            error
              ? "rgba(239,68,68,0.45)"
              : label
                ? "rgba(34,197,94,0.40)"
                : dragOver
                  ? "#8b5cf6"
                  : "var(--border-medium)"
          }`,
          borderRadius: 20,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          transition: "all 0.22s cubic-bezier(0.3, 0.7, 0.4, 1)",
          transform: dragOver ? "scale(1.01)" : "scale(1)",
          boxShadow: dragOver
            ? "0 10px 32px rgba(139,92,246,0.18)"
            : "0 1px 0 rgba(255,255,255,0.04) inset",
          font: "inherit",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Dekorativ orqa fon — subtle radial glow yuqorida */}
        {!label && !error && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -40,
              left: "50%",
              transform: "translateX(-50%)",
              width: 200,
              height: 80,
              background: dragOver
                ? "radial-gradient(ellipse at center, rgba(139,92,246,0.25), transparent 70%)"
                : "radial-gradient(ellipse at center, rgba(139,92,246,0.10), transparent 70%)",
              pointerEvents: "none",
              transition: "opacity 0.22s",
            }}
          />
        )}

        {/* Icon */}
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            width: 56,
            height: 56,
            borderRadius: 16,
            background: error
              ? "linear-gradient(135deg, rgba(239,68,68,0.20), rgba(239,68,68,0.08))"
              : label
                ? "linear-gradient(135deg, rgba(34,197,94,0.22), rgba(34,197,94,0.08))"
                : "linear-gradient(135deg, rgba(139,92,246,0.22), rgba(59,130,246,0.10))",
            border: `1px solid ${
              error
                ? "rgba(239,68,68,0.30)"
                : label
                  ? "rgba(34,197,94,0.35)"
                  : "rgba(139,92,246,0.35)"
            }`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: error
              ? "0 6px 20px rgba(239,68,68,0.12)"
              : label
                ? "0 6px 20px rgba(34,197,94,0.14)"
                : "0 6px 20px rgba(139,92,246,0.15)",
            marginBottom: 2,
          }}
        >
          {error ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
                stroke="#fb7185"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : label ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12l4 4L19 6"
                stroke="#4ade80"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              {/* UPLOAD arrow — yuqoriga, ramka bilan */}
              <path
                d="M12 16V4m0 0l-5 5m5-5l5 5M5 20h14"
                stroke="#a78bfa"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>

        {/* Content */}
        {error ? (
          <div
            style={{
              color: "#fb7185",
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center",
              maxWidth: 280,
              lineHeight: 1.4,
              position: "relative",
            }}
          >
            {error}
          </div>
        ) : label ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}>
            <div
              style={{
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 700,
                textAlign: "center",
                wordBreak: "break-all",
                maxWidth: 260,
                letterSpacing: -0.1,
              }}
            >
              {label}
            </div>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: 11.5,
                fontWeight: 500,
                background: "var(--bg-surface-2)",
                padding: "3px 10px",
                borderRadius: 99,
                border: "0.5px solid var(--border-subtle)",
              }}
            >
              {sizeText} · tayyor
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative" }}>
            <div
              style={{
                color: "var(--text-primary)",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: -0.2,
              }}
            >
              {t.sheetUpload}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 12.5, fontWeight: 500 }}>
              {t.sheetUploadSub}
            </div>
            {accept && (
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: 10.5,
                  marginTop: 6,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  fontWeight: 600,
                  background: "var(--bg-surface-2)",
                  border: "0.5px solid var(--border-subtle)",
                  padding: "4px 10px",
                  borderRadius: 99,
                }}
              >
                {accept
                  .split(",")
                  .map((s) => s.trim().toUpperCase())
                  .join(" · ")}
              </div>
            )}
            <div
              style={{
                color: "var(--text-faint)",
                fontSize: 10.5,
                marginTop: 2,
                fontWeight: 500,
              }}
            >
              Maks. {MAX_FILE_MB} MB
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

// ─── TextInputBox ─────────────────────────────────────────────────
function TextInputBox({ t, placeholder, onChange, maxLength = 5000 }) {
  const [val, setVal] = useS("");

  const handleChange = useC(
    (e) => {
      const raw = e.target.value;
      setVal(raw);
      onChange(raw);
    },
    [onChange],
  );

  const charCount = val.length;
  const nearLimit = charCount > maxLength * 0.85;

  return (
    <div>
      <textarea
        value={val}
        onChange={handleChange}
        placeholder={placeholder || t.sheetTextPlaceholder}
        maxLength={maxLength}
        aria-label={placeholder || t.sheetTextPlaceholder}
        style={{
          width: "100%",
          minHeight: 120,
          background: "var(--bg-surface-2)",
          border: "0.5px solid var(--border-light)",
          borderRadius: 16,
          padding: 14,
          color: "var(--text-primary)",
          fontSize: 14,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
          lineHeight: 1.5,
          boxSizing: "border-box",
          transition: "border-color 0.18s",
        }}
      />
      {/* ✅ NEW: Character count */}
      {val.length > 0 && (
        <div
          style={{
            textAlign: "right",
            fontSize: 10.5,
            marginTop: 4,
            color: nearLimit ? "#fbbf24" : "var(--text-faint)",
          }}
        >
          {charCount} / {maxLength}
        </div>
      )}
    </div>
  );
}

// ─── Processing animation ─────────────────────────────────────────
function Processing({ t, accent, slowHint }) {
  const [pct, setPct] = useS(0);
  const [elapsed, setElapsed] = useS(0);

  useE(() => {
    // Uzoq xizmatlar uchun (bgremove, OCR): har sekundda
    // "5 soniya... 10 soniya..." ko'rsatamiz va foydalanuvchini xotirjam qilamiz.
    const SLOW = !!slowHint;
    const start = performance.now();
    const DURATION = SLOW ? 90000 : 2200; // bgremove uchun 90s 95%'gacha
    let rafId;
    let secondTimer;

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / DURATION);
      // Ease out cubic — slows down near 95%
      setPct(Math.round((1 - Math.pow(1 - progress, 3)) * 95));
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    if (SLOW) {
      secondTimer = setInterval(() => {
        setElapsed(Math.floor((performance.now() - start) / 1000));
      }, 1000);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (secondTimer) clearInterval(secondTimer);
    };
  }, [slowHint]);

  const circumference = 2 * Math.PI * 48;

  return (
    <div
      role="status"
      aria-label={`${pct}% tayyorlandi`}
      aria-live="polite"
      style={{
        padding: "8px 0 4px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div style={{ position: "relative", width: 110, height: 110 }}>
        <svg
          width="110"
          height="110"
          viewBox="0 0 110 110"
          style={{ transform: "rotate(-90deg)" }}
          aria-hidden="true"
        >
          <circle
            cx="55"
            cy="55"
            r="48"
            fill="none"
            stroke="var(--border-light)"
            strokeWidth="6"
          />
          <circle
            cx="55"
            cy="55"
            r="48"
            fill="none"
            stroke={accent}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct / 100)}
            style={{
              transition: "stroke-dashoffset 0.3s linear",
              filter: `drop-shadow(0 0 8px ${accent}80)`,
            }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-primary)",
            fontSize: 26,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pct}%
        </div>
      </div>
      <div
        style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 600 }}
      >
        {slowHint || t.sheetProcessing}
      </div>
      {slowHint && (
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 12,
            textAlign: "center",
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          {elapsed > 0 && (
            <div style={{ marginBottom: 4, color: "var(--text-secondary)" }}>
              ⏱ {elapsed} soniya
            </div>
          )}
          Birinchi marta AI model yuklanyapti (1-2 daqiqa).
          Keyingi safar tez bo'ladi.
        </div>
      )}
    </div>
  );
}

// ─── sendToBot helper ─────────────────────────────────────────────
async function sendToBot(blob, filename, onToast) {
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
      method: "POST",
      headers: { "X-User-Id": String(userId) },
      body: form,
    });
    if (!r.ok) throw new Error("Server xatosi");
    onToast?.("✅ Telegram botga yuborildi");
  } catch (e) {
    onToast?.("❌ Yuborishda xato: " + (e.message || "Qayta urinib ko'ring"));
  }
}

// ─── Download helper ──────────────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── Copy to clipboard ────────────────────────────────────────────
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for older browsers
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return true;
  } catch (e) {
    return false;
  }
}

// ─── ResultFile ───────────────────────────────────────────────────
// Yangi "Tayyor" UI: natija vertikal markazda, 3 tugma pastda
// (DocxEditPro/MergePdfPro bilan bir xil ko'rinish).
function ResultFile({ t, accent, result, onAgain, onClose, onToast }) {
  const [sending, setSending] = useS(false);

  const handleSendToBot = useC(async () => {
    setSending(true);
    await sendToBot(result.blob, result.filename, onToast);
    setSending(false);
  }, [result, onToast]);

  const download = useC(() => {
    downloadBlob(result.blob, result.filename);
    onToast?.(t.sheetDownloaded || "Yuklandi ✓");
  }, [result, t, onToast]);

  const fileSizeKB = result.blob?.size
    ? Math.max(1, Math.round(result.blob.size / 1024))
    : null;

  return (
    <div
      style={{
        minHeight: "70vh",
        padding: "20px 0 24px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* Natija — vertikal markazda */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "16px 8px",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: "rgba(34,197,94,0.14)",
            border: "1px solid rgba(34,197,94,0.30)",
            boxShadow: "0 8px 28px rgba(34,197,94,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l5 5L20 7"
              stroke="#22c55e"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div
          style={{
            color: "var(--text-primary)",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: -0.3,
          }}
        >
          {t.sheetDone || t.sheetReady || "Tayyor!"}
        </div>
        {result.info && (
          <div
            style={{
              color: "var(--text-secondary)",
              fontSize: 13.5,
              textAlign: "center",
              lineHeight: 1.5,
              maxWidth: 320,
            }}
          >
            {result.info}
          </div>
        )}
        {/* Fayl chip */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 99,
            background: "var(--bg-surface-1)",
            border: "0.5px solid var(--border-subtle)",
            color: "var(--text-muted)",
            fontSize: 11.5,
            fontWeight: 500,
            marginTop: 4,
          }}
        >
          <span aria-hidden="true">📎</span>
          <span
            style={{
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {result.filename}
          </span>
          {fileSizeKB && (
            <span style={{ color: "var(--text-faint)" }}>{fileSizeKB} KB</span>
          )}
        </div>
      </div>

      {/* Tugmalar — pastda */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onAgain}
            style={{
              flex: 1,
              padding: "13px 14px",
              borderRadius: 14,
              background: "var(--bg-surface-2)",
              border: "0.5px solid var(--border-medium)",
              color: "var(--text-primary)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.sheetAgain}
          </button>
          <button
            type="button"
            onClick={download}
            style={{
              flex: 1,
              padding: "13px 14px",
              borderRadius: 14,
              background: accent || "#8b5cf6",
              border: "none",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: `0 6px 18px ${(accent || "#8b5cf6") + "40"}`,
            }}
          >
            {t.sheetDownload}
          </button>
        </div>
        <button
          type="button"
          onClick={handleSendToBot}
          disabled={sending}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 14,
            background: "var(--bg-surface-1)",
            border: "0.5px solid var(--border-light)",
            color: "var(--text-secondary)",
            fontSize: 13,
            fontWeight: 600,
            cursor: sending ? "default" : "pointer",
            opacity: sending ? 0.6 : 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {sending ? (
            <Spinner size={14} color="var(--text-muted)" />
          ) : (
            <span aria-hidden="true">✈️</span>
          )}
          Telegram botga yuborish
        </button>
      </div>
    </div>
  );
}

// ─── ResultText ───────────────────────────────────────────────────
function ResultText({ t, accent, result, onAgain, onClose, onToast }) {
  const [copied, setCopied] = useS(false);

  const handleCopy = useC(async () => {
    const ok = await copyToClipboard(result.content);
    if (ok) {
      setCopied(true);
      onToast?.(t.sheetCopied || "Nusxalandi ✓");
      setTimeout(() => setCopied(false), 2000);
    } else {
      onToast?.("❌ Nusxalab bo'lmadi");
    }
  }, [result.content, t, onToast]);

  const charCount = result.content?.length ?? 0;
  // Xato natijasini (handler'lardan kelgan "❌ ..." yoki "🚧 ..." matn)
  // success ko'rinishida ko'rsatmaslik uchun tekshiramiz.
  const isError = /^(\s)*(❌|⚠️|🚧)/.test(result.content || "");

  return (
    <div
      style={{
        minHeight: "70vh",
        padding: "12px 0 24px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* Yashil ✓ + "Tayyor" sarlavhasi (xato bo'lmasa) */}
      {!isError && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(34,197,94,0.14)",
              border: "1px solid rgba(34,197,94,0.30)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 20px rgba(34,197,94,0.15)",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12l5 5L20 7"
                stroke="#22c55e"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            style={{
              color: "var(--text-primary)",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: -0.2,
            }}
          >
            {t.sheetDone || t.sheetReady || "Tayyor!"}
          </div>
        </div>
      )}

      {/* Natija sarlavha + belgi soni */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {t.sheetResult || "Natija"}
        </div>
        <div style={{ color: "var(--text-faint)", fontSize: 10.5 }}>
          {charCount} belgi
        </div>
      </div>

      {/* Matn natija — flex-grow */}
      <div
        role="textbox"
        aria-readonly="true"
        aria-multiline="true"
        aria-label="Natija matni"
        style={{
          flex: 1,
          background: "var(--bg-surface-1)",
          border: "0.5px solid var(--border-subtle)",
          borderRadius: 14,
          padding: 14,
          color: "var(--text-primary)",
          fontSize: 13.5,
          lineHeight: 1.55,
          minHeight: 140,
          maxHeight: 360,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          userSelect: "text",
          marginBottom: 14,
        }}
      >
        {result.content}
      </div>

      {/* Tugmalar — pastda */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onAgain}
          style={{
            flex: 1,
            padding: "13px 14px",
            borderRadius: 14,
            background: "var(--bg-surface-2)",
            border: "0.5px solid var(--border-medium)",
            color: "var(--text-primary)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t.sheetAgain}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            flex: 1,
            padding: "13px 14px",
            borderRadius: 14,
            background: copied ? "#22c55e" : (accent || "#8b5cf6"),
            border: "none",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: `0 6px 18px ${(copied ? "#22c55e" : (accent || "#8b5cf6")) + "40"}`,
          }}
        >
          {copied ? "✓ " + (t.sheetCopied || "Nusxalandi") : "📋 " + t.sheetCopy}
        </button>
      </div>
    </div>
  );
}

// ─── ResultWiki ───────────────────────────────────────────────────
function ResultWiki({ t, accent, result, onAgain, onToast }) {
  const [copied, setCopied] = useS(false);

  const extract   = result.extract || result.content || "";
  const title     = result.title || "";
  const desc      = result.description || "";
  const thumb     = result.thumbnail || null;
  const url       = result.url || null;
  const alts      = result.alternatives || [];
  const related   = result.related || [];
  // lang: backend "UZ"/"RU"/"EN" → lowercase for URL construction
  const langCode  = (result.lang || "en").toLowerCase().slice(0, 2);

  const handleCopy = useC(async () => {
    const ok = await copyToClipboard(extract);
    if (ok) {
      setCopied(true);
      onToast?.(t.sheetCopied || "Nusxalandi ✓");
      setTimeout(() => setCopied(false), 2000);
    } else {
      onToast?.("❌ Nusxalab bo'lmadi");
    }
  }, [extract, t, onToast]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Thumbnail */}
      {thumb && (
        <img
          src={thumb}
          alt={title || "Wikipedia"}
          style={{
            width: "100%", maxHeight: 160, objectFit: "cover",
            borderRadius: 12, border: "0.5px solid var(--border-subtle)",
          }}
        />
      )}

      {/* Title + description */}
      {title && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
            {title}
          </div>
          {desc && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              {desc}
            </div>
          )}
        </div>
      )}

      {/* Extract */}
      <div
        role="textbox"
        aria-readonly="true"
        aria-label="Wikipedia matni"
        style={{
          background: "var(--bg-surface-1)", border: "0.5px solid var(--border-subtle)",
          borderRadius: 14, padding: 14,
          color: "var(--text-primary)", fontSize: 13.5, lineHeight: 1.6,
          maxHeight: 200, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
          userSelect: "text",
        }}
      >
        {extract || "Ma'lumot topilmadi."}
      </div>

      {/* Related articles */}
      {related.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10.5, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: 0.5, color: "var(--text-muted)", marginBottom: 6,
            }}
          >
            Bog'liq maqolalar
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {related.map((item, i) => {
              // backend returns plain strings (article titles)
              const itemTitle = typeof item === "string" ? item : (item.title || "");
              const itemUrl   = typeof item === "object" && item.url
                ? item.url
                : `https://${langCode}.wikipedia.org/wiki/${encodeURIComponent(itemTitle)}`;
              return (
                <a
                  key={i}
                  href={itemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "4px 10px", borderRadius: 20,
                    background: "var(--bg-surface-2)", border: "0.5px solid var(--border-medium)",
                    color: accent, fontSize: 12, textDecoration: "none", fontWeight: 500,
                  }}
                >
                  {itemTitle}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Alternative titles */}
      {alts.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10.5, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: 0.5, color: "var(--text-muted)", marginBottom: 6,
            }}
          >
            Boshqa nomlar
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {alts.map((alt, i) => (
              <span
                key={i}
                style={{
                  padding: "4px 10px", borderRadius: 20,
                  background: "var(--bg-surface-1)", border: "0.5px solid var(--border-light)",
                  color: "var(--text-secondary)", fontSize: 12,
                }}
              >
                {alt}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <Button variant="secondary" full onClick={onAgain}>
          {t.sheetAgain}
        </Button>
        {url ? (
          <Button
            variant="primary" accent={accent} full
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          >
            Wikipedia →
          </Button>
        ) : (
          <Button variant="primary" accent={accent} full onClick={handleCopy}>
            {copied ? "✓ Nusxalandi" : t.sheetCopy}
          </Button>
        )}
      </div>

      {/* Copy button when URL button already shown */}
      {url && (
        <Button variant="secondary" full onClick={handleCopy}>
          {copied ? "✓ " + (t.sheetCopied || "Nusxalandi") : t.sheetCopy || "Nusxalash"}
        </Button>
      )}
    </div>
  );
}

// ─── ResultImage ──────────────────────────────────────────────────
function ResultImage({ t, accent, result, onAgain, onToast }) {
  const download = useC(() => {
    const a = document.createElement("a");
    a.href = result.dataUrl;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onToast?.(t.sheetDownloaded || "Yuklandi ✓");
  }, [result, t, onToast]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        alignItems: "center",
      }}
    >
      <img
        src={result.dataUrl}
        alt={result.filename || "Natija"}
        style={{
          maxWidth: "100%",
          borderRadius: 14,
          border: "0.5px solid var(--border-subtle)",
          maxHeight: 260,
          objectFit: "contain",
        }}
      />
      <div style={{ display: "flex", gap: 10, width: "100%" }}>
        <Button variant="secondary" full onClick={onAgain}>
          {t.sheetAgain}
        </Button>
        <Button variant="primary" accent={accent} full onClick={download}>
          {t.sheetDownload}
        </Button>
      </div>
    </div>
  );
}

// ─── ErrorState ───────────────────────────────────────────────────
// 1-Bosqich: Xato holati uchun alohida, foydalanuvchi-friendly UI.
// Muvaffaqiyatli natijadan (yashil ✓) aniq ajralib turadi va "Qayta urinish"
// hamda "Yopish" tugmalarini taklif qiladi.
function ErrorState({ t, accent, message, onAgain, onClose }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        padding: "32px 8px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(239,68,68,0.14)",
          border: "1px solid rgba(239,68,68,0.30)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 8v5M12 17h.01"
            stroke="#ef4444"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="#ef4444"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      </div>
      <div
        style={{
          color: "var(--text-primary)",
          fontSize: 17,
          fontWeight: 700,
          textAlign: "center",
        }}
      >
        Xatolik yuz berdi
      </div>
      <div
        style={{
          color: "var(--text-secondary)",
          fontSize: 13.5,
          lineHeight: 1.5,
          textAlign: "center",
          padding: "0 12px",
          maxWidth: 420,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          width: "100%",
          marginTop: 8,
        }}
      >
        <Button variant="secondary" full onClick={onClose}>
          {t.sheetCancel || "Yopish"}
        </Button>
        <Button variant="primary" accent={accent} full onClick={onAgain}>
          {t.sheetAgain || "Qayta urinish"}
        </Button>
      </div>
    </div>
  );
}

// ─── SuccessRing ──────────────────────────────────────────────────
function SuccessRing() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 72,
        height: 72,
        borderRadius: "50%",
        background: "rgba(34,197,94,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -8,
          borderRadius: "50%",
          border: "2px solid rgba(34,197,94,0.2)",
          animation: "pulse 1.4s ease-out infinite",
        }}
      />
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
}

// ─── Img2PdfOptions ───────────────────────────────────────────────
function Img2PdfOptions({ opts, onChange, accent }) {
  const MODES = [
    { value: "normal",     label: "Oddiy",         icon: "📄", desc: "Tez" },
    { value: "document",   label: "Skan",           icon: "📑", desc: "Tenglashtiradi" },
    { value: "searchable", label: "Qidiriladigan",  icon: "🔍", desc: "OCR matn" },
  ];
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          color: "var(--text-muted)", fontSize: 11, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7,
        }}
      >
        Rejim
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {MODES.map(({ value, label, icon, desc }) => {
          const active = opts.mode === value;
          return (
            <button
              key={value} type="button"
              onClick={() => onChange({ ...opts, mode: value })}
              aria-pressed={active}
              style={{
                flex: 1, padding: "9px 4px", borderRadius: 12,
                border: active ? `1.5px solid ${accent}` : "1.5px solid var(--border-medium)",
                background: active ? `${accent}18` : "var(--bg-surface-1)",
                cursor: "pointer", font: "inherit",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 18 }} aria-hidden="true">{icon}</span>
              <span
                style={{
                  fontSize: 11.5, fontWeight: active ? 700 : 500,
                  color: active ? accent : "var(--text-secondary)",
                }}
              >
                {label}
              </span>
              <span style={{ fontSize: 9.5, color: "var(--text-faint)" }}>{desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── LockedState ──────────────────────────────────────────────────
function LockedState({ t, accent, onSubscribe, onClose }) {
  return (
    <div
      style={{
        padding: "8px 0 4px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 78,
          height: 78,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))",
          border: "0.5px solid rgba(245,158,11,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <rect
            x="5"
            y="11"
            width="14"
            height="10"
            rx="2"
            stroke="#fbbf24"
            strokeWidth="2"
          />
          <path
            d="M8 11V8a4 4 0 1 1 8 0v3"
            stroke="#fbbf24"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div style={{ textAlign: "center", maxWidth: 280 }}>
        <div
          style={{
            color: "var(--text-primary)",
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {t.sheetLockedTitle}
        </div>
        <div
          style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.45 }}
        >
          {t.sheetLockedSub}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
        <Button variant="secondary" full onClick={onClose}>
          {t.sheetCancel}
        </Button>
        <Button variant="primary" accent="#f59e0b" full onClick={onSubscribe}>
          {t.subscribe}
        </Button>
      </div>
    </div>
  );
}

// ─── CV Form ──────────────────────────────────────────────────────
const CV_TEMPLATES = [
  { id: "modern",       label: "Modern",   color: "#4f46e5" },
  { id: "classic",      label: "Classic",  color: "#1e40af" },
  { id: "minimal",      label: "Minimal",  color: "#059669" },
  { id: "dark",         label: "Dark",     color: "#a78bfa" },
  { id: "professional", label: "Pro",      color: "#0e7490" },
  { id: "elegant",      label: "Elegant",  color: "#9f1239" },
];

function CVForm({ data, onChange, accent }) {
  const [expItems, setExpItems] = useS(data.experience?.length ? data.experience : [{ position: "", company: "", period: "", desc: "" }]);
  const [eduItems, setEduItems] = useS(data.education?.length ? data.education : [{ degree: "", school: "", year: "" }]);
  const [skillsRaw, setSkillsRaw] = useS((data.skills || []).join(", "));
  const [langsRaw,  setLangsRaw]  = useS((data.languages || []).join(", "));

  const inp = {
    width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border-medium)", background: "var(--bg-surface-2)",
    color: "var(--text-primary)", fontSize: 13, outline: "none",
    boxSizing: "border-box", marginBottom: 8,
  };
  const label = { fontSize: 11, color: "var(--text-muted)", marginBottom: 3, display: "block" };
  const sectionTitle = {
    fontSize: 12, fontWeight: 700, color: accent,
    textTransform: "uppercase", letterSpacing: 1,
    margin: "14px 0 8px",
  };
  const addBtn = {
    background: "transparent", border: `1px dashed ${accent}`,
    color: accent, borderRadius: "var(--radius-sm)",
    padding: "6px 12px", fontSize: 12, cursor: "pointer", width: "100%",
  };
  const delBtn = {
    background: "transparent", border: "none",
    color: "var(--text-muted)", fontSize: 16, cursor: "pointer",
    padding: "2px 6px", lineHeight: 1,
  };

  const notify = (patch) => onChange({ ...data, ...patch });

  const setExp = (i, key, val) => {
    const next = expItems.map((e, idx) => idx === i ? { ...e, [key]: val } : e);
    setExpItems(next);
    notify({ experience: next });
  };
  const addExp = () => { const next = [...expItems, { position: "", company: "", period: "", desc: "" }]; setExpItems(next); notify({ experience: next }); };
  const delExp = (i) => { const next = expItems.filter((_, idx) => idx !== i); setExpItems(next.length ? next : [{ position: "", company: "", period: "", desc: "" }]); notify({ experience: next }); };

  const setEdu = (i, key, val) => {
    const next = eduItems.map((e, idx) => idx === i ? { ...e, [key]: val } : e);
    setEduItems(next);
    notify({ education: next });
  };
  const addEdu = () => { const next = [...eduItems, { degree: "", school: "", year: "" }]; setEduItems(next); notify({ education: next }); };
  const delEdu = (i) => { const next = eduItems.filter((_, idx) => idx !== i); setEduItems(next.length ? next : [{ degree: "", school: "", year: "" }]); notify({ education: next }); };

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* Template selector */}
      <div style={sectionTitle}>Shablon</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
        {CV_TEMPLATES.map(tmpl => (
          <button
            key={tmpl.id}
            onClick={() => notify({ template: tmpl.id })}
            style={{
              padding: "8px 4px", borderRadius: "var(--radius-sm)",
              border: `2px solid ${data.template === tmpl.id ? tmpl.color : "var(--border-medium)"}`,
              background: data.template === tmpl.id ? tmpl.color + "22" : "var(--bg-surface-2)",
              color: data.template === tmpl.id ? tmpl.color : "var(--text-muted)",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: tmpl.color, display: "inline-block" }} />
            {tmpl.label}
          </button>
        ))}
      </div>

      {/* Basic info */}
      <div style={sectionTitle}>Asosiy ma'lumot</div>

      {/* Photo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
          border: `2px solid ${data.photo ? accent : "var(--border-medium)"}`,
          background: "var(--bg-surface-2)", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 24,
        }}>
          {data.photo
            ? <img src={data.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span aria-hidden="true">🙂</span>}
        </div>
        <div style={{ flex: 1 }}>
          <label style={{
            display: "inline-block", padding: "7px 14px", borderRadius: "var(--radius-sm)",
            border: `1px solid ${accent}`, color: accent, background: accent + "12",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            {data.photo ? "Rasmni almashtirish" : "📷 Rasm qo'shish"}
            <input
              type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                if (f.size > 8 * 1024 * 1024) { alert("Rasm 8MB dan kichik bo'lsin"); return; }
                const reader = new FileReader();
                reader.onload = () => notify({ photo: String(reader.result || "") });
                reader.readAsDataURL(f);
              }}
            />
          </label>
          {data.photo && (
            <button
              onClick={() => notify({ photo: "" })}
              style={{ marginLeft: 8, background: "transparent", border: "none",
                color: "var(--text-muted)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
            >
              O'chirish
            </button>
          )}
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>Ixtiyoriy · kvadrat eng yaxshi</div>
        </div>
      </div>

      <label style={label}>Ism Familiya *</label>
      <input style={inp} placeholder="Abdullayev Anvar" value={data.name || ""} onChange={e => notify({ name: e.target.value })} />
      <label style={label}>Kasb / Lavozim</label>
      <input style={inp} placeholder="Frontend Developer" value={data.title || ""} onChange={e => notify({ title: e.target.value })} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={label}>Email</label>
          <input style={{ ...inp, marginBottom: 0 }} placeholder="name@email.com" value={data.email || ""} onChange={e => notify({ email: e.target.value })} />
        </div>
        <div>
          <label style={label}>Telefon</label>
          <input style={{ ...inp, marginBottom: 0 }} placeholder="+998 90 123 45 67" value={data.phone || ""} onChange={e => notify({ phone: e.target.value })} />
        </div>
      </div>
      <label style={{ ...label, marginTop: 8 }}>Shahar / Manzil</label>
      <input style={inp} placeholder="Toshkent, O'zbekiston" value={data.location || ""} onChange={e => notify({ location: e.target.value })} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={label}>Telegram</label>
          <input style={{ ...inp, marginBottom: 0 }} placeholder="@username" value={data.telegram || ""} onChange={e => notify({ telegram: e.target.value })} />
        </div>
        <div>
          <label style={label}>Instagram</label>
          <input style={{ ...inp, marginBottom: 0 }} placeholder="@username" value={data.instagram || ""} onChange={e => notify({ instagram: e.target.value })} />
        </div>
      </div>
      <label style={{ ...label, marginTop: 8 }}>Veb-sayt / Portfolio</label>
      <input style={inp} placeholder="github.com/username" value={data.website || ""} onChange={e => notify({ website: e.target.value })} />

      {/* Summary */}
      <div style={sectionTitle}>Qisqacha ma'lumot</div>
      <textarea
        style={{ ...inp, resize: "vertical", minHeight: 72, fontFamily: "inherit" }}
        placeholder="O'zingiz haqingizda 2-3 jumla..."
        value={data.summary || ""}
        onChange={e => notify({ summary: e.target.value })}
      />

      {/* Experience */}
      <div style={sectionTitle}>Ish tajribasi</div>
      {expItems.map((exp, i) => (
        <div key={i} style={{ border: "1px solid var(--border-medium)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>#{i + 1}</span>
            {expItems.length > 1 && <button style={delBtn} onClick={() => delExp(i)}>✕</button>}
          </div>
          <input style={inp} placeholder="Lavozim (masalan: Frontend Developer)" value={exp.position} onChange={e => setExp(i, "position", e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input style={{ ...inp, marginBottom: 0 }} placeholder="Kompaniya" value={exp.company} onChange={e => setExp(i, "company", e.target.value)} />
            <input style={{ ...inp, marginBottom: 0 }} placeholder="2022–2024" value={exp.period} onChange={e => setExp(i, "period", e.target.value)} />
          </div>
          <textarea
            style={{ ...inp, resize: "vertical", minHeight: 56, fontFamily: "inherit", marginTop: 8 }}
            placeholder="Vazifalar va yutuqlar..."
            value={exp.desc}
            onChange={e => setExp(i, "desc", e.target.value)}
          />
        </div>
      ))}
      <button style={addBtn} onClick={addExp}>+ Ish tajriba qo'shish</button>

      {/* Education */}
      <div style={sectionTitle}>Ta'lim</div>
      {eduItems.map((edu, i) => (
        <div key={i} style={{ border: "1px solid var(--border-medium)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>#{i + 1}</span>
            {eduItems.length > 1 && <button style={delBtn} onClick={() => delEdu(i)}>✕</button>}
          </div>
          <input style={inp} placeholder="Diplom / Mutaxassislik" value={edu.degree} onChange={e => setEdu(i, "degree", e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input style={{ ...inp, marginBottom: 0 }} placeholder="Universitet" value={edu.school} onChange={e => setEdu(i, "school", e.target.value)} />
            <input style={{ ...inp, marginBottom: 0 }} placeholder="2018–2022" value={edu.year} onChange={e => setEdu(i, "year", e.target.value)} />
          </div>
        </div>
      ))}
      <button style={addBtn} onClick={addEdu}>+ Ta'lim qo'shish</button>

      {/* Skills */}
      <div style={sectionTitle}>Ko'nikmalar</div>
      <input
        style={inp}
        placeholder="Python, React, Figma, Ingliz tili..."
        value={skillsRaw}
        onChange={e => {
          setSkillsRaw(e.target.value);
          notify({ skills: e.target.value.split(",").map(s => s.trim()).filter(Boolean) });
        }}
      />
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -4, marginBottom: 8 }}>Vergul bilan ajrating</div>

      {/* Languages */}
      <div style={sectionTitle}>Tillar</div>
      <input
        style={inp}
        placeholder="O'zbek (ona tili), Ingliz (B2), Rus (C1)..."
        value={langsRaw}
        onChange={e => {
          setLangsRaw(e.target.value);
          notify({ languages: e.target.value.split(",").map(s => s.trim()).filter(Boolean) });
        }}
      />
    </div>
  );
}

// ─── Per-service "How it works" steps ────────────────────────────
const SERVICE_HOW_TO = {
  pdf2docx:    ["PDF faylni yuklang", "Boshlash ni bosing — konvertatsiya 10-30 soniya oladi", "Tayyor DOCX faylni yuklab oling"],
  docx2pdf:    ["Word (.doc/.docx) faylni yuklang", "Boshlash ni bosing", "PDF faylni yuklab oling"],
  docxedit:    ["DOCX faylni yuklang", "Qidirish va almashtirish juftliklarini kiriting (“+ Qo'shish” bilan ko'p qator)", "“Boshlash” ni bosing — yangilangan DOCX yuklanadi"],
  imgs2pdf:    ["Bir nechta rasm tanlang (tartib muhim)", "Boshlash ni bosing", "Ko'p sahifali PDF faylni yuklab oling"],
  xlsx2pdf:    ["Excel (.xlsx/.xls) faylni yuklang", "Boshlash ni bosing", "PDF jadvalni yuklab oling"],
  pdf2img:     ["PDF faylni yuklang", "Boshlash ni bosing", "1 sahifa → rasm, ko'p sahifa → ZIP arxivi"],
  mergepdf:    ["PDF fayllarni yuklang (“+ Yana qo'shish” bilan ko'p marta qo'shsa bo'ladi)", "↑ ↓ tugmalari bilan tartibni o'zgartiring", "“Birlashtirish” ni bosing — yagona PDF yuklanadi"],
  pdfpages:    ["PDF faylni yuklang", "Sahifalar oralig'ini kiriting, masalan: 1-3,5,7", "Tanlangan sahifalar bilan yangi PDF yuklab oling"],
  pdftext:     ["PDF faylni yuklang", "Boshlash ni bosing", "Matn ekranda ko'rsatiladi — nusxalab oling"],
  ocr:         ["Rasm yoki skanerlangan PDF yuklang (o'zbek, rus, ingliz matni)", "Boshlash ni bosing — Tesseract OCR aniqlaydi", "Aniqlangan matnni nusxalab oling"],
  compresspdf: ["Siqiladigan PDF faylni yuklang", "Boshlash ni bosing", "Hajmi 30-70% kamaygan PDF yuklab oling"],
  compresspptx:["PPTX faylni yuklang", "Boshlash ni bosing", "Siqilgan PPTX faylni yuklab oling"],
  pdflock:     ["PDF faylni yuklang", "Parol kiriting (bo'sh qolsa avtomatik yaratiladi)", "Himoyalangan PDF va parolni yuklab oling"],
  watermark:   ["PDF faylni yuklang", "Watermark matni kiriting (bo'sh qolsa 'EduBot' yoziladi)", "Watermarkli PDF yuklab oling"],
  imgcompress: ["JPG yoki PNG rasmni yuklang", "Boshlash ni bosing", "Siqilgan rasmni yuklab oling"],
  translit:    ["O'zbek matni kiriting (lotin yoki kirill)", "Boshlash ni bosing", "Boshqa yozuvdagi matnni nusxalab oling"],
  stats:       ["Raqamlarni bo'sh joy bilan ajratib kiriting: 4 7 2 9 1 5", "Boshlash ni bosing", "O'rtacha, mediana, dispersiya va boshqa ko'rsatkichlar chiqadi"],
  math:        ["Kategoriyani tanlang: Geometriya, Trigonometriya, Algebra", "Kerakli xizmatni bosing", "Qiymatlarni kiriting — natija avtomatik hisoblanadi"],
  age:         ["Yosh hisoblash yoki kelajak sanasi rejimini tanlang", "Sanani DD.MM.YYYY shaklida kiriting (06.05.2001)", "Yil, oy, kun, soat, daqiqa — real-time yangilanadi"],
  translate:   ["Matnni kiriting", "Oxirgi qatorda til kodini yozing: en  ru  tr  de  ja  ko", "Tarjima natijasini nusxalab oling"],
  wiki:        ["Maqola nomini kiriting (masalan: Amir Temur)", "Boshlash ni bosing", "Wikipedia dan qisqacha ma'lumot oling"],
  readtime:    ["Matnni kiriting yoki joylashtiring", "Boshlash ni bosing", "O'qish uchun taxminiy vaqt ko'rsatiladi"],
  books:       ["Kitob nomi yoki muallif ismini kiriting", "Boshlash ni bosing", "Open Library dan kitob ma'lumotlari ko'rsatiladi"],
  qr:          ["Matn, URL yoki telefon raqam kiriting", "Boshlash ni bosing", "QR kodini yuklab oling"],
  cert:        ["1-qator: Ism Familiya\n2-qator: Kurs yoki yutuq nomi", "Boshlash ni bosing", "Sertifikat rasmini yuklab oling"],
  bgremove:    ["Rasm (JPG/PNG) yuklang", "Boshlash ni bosing — AI fon olib tashlaydi", "Fonsiz rasmni (PNG) yuklab oling"],
  cv:          ["Ism, kasb, kontakt ma'lumotlarini kiriting", "Ish tajribasi, ta'lim, ko'nikmalar qo'shing", "Professional PDF CV ni yuklab oling"],
  schedule:    ["Dars jadvalini kiriting:\nDushanba: Matematika 8:00, Fizika 10:00", "Boshlash ni bosing", "Haftalik jadval rasmini yuklab oling"],
  deadline:    ["Sana kiriting: 31.12.2025 yoki 2025-12-31", "Boshlash ni bosing", "Qolgan vaqt va eslatma ko'rsatiladi"],
  zip:         ["Arxivlanadigan fayllarni tanlang", "Parol kiriting (ixtiyoriy)", "ZIP arxivini yuklab oling"],
  unzip:       ["ZIP faylni yuklang", "Boshlash ni bosing", "Fayl nomlari ro'yxati va yuklab olish imkoniyati"],
};

// ─── ServiceErrorBoundary ─────────────────────────────────────────
// Sahifa darajasidagi error boundary. Bitta xizmat komponentida xato
// bo'lsa, butun ilova yiqilmaydi — faqat shu sahifa "Xato" ni ko'rsatadi
// va foydalanuvchi "Orqaga" tugmasi bilan boshqa xizmatga o'tishi mumkin.
class ServiceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: (error && error.message) || String(error) };
  }
  componentDidCatch(error, info) {
    console.error("[ServiceErrorBoundary]", error, info);
  }
  componentDidUpdate(prevProps) {
    // Yangi service ochilganda bo'sh state'ga qaytarish — eski xato qolib ketmasin.
    if (prevProps.serviceKey !== this.props.serviceKey && this.state.hasError) {
      this.setState({ hasError: false, errorMsg: "" });
    }
  }
  render() {
    if (this.state.hasError) {
      return React.createElement(
        "div",
        {
          role: "alert",
          style: {
            padding: "40px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            color: "var(--text-primary)",
          },
        },
        [
          React.createElement(
            "div",
            {
              key: "ic",
              "aria-hidden": "true",
              style: {
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(239,68,68,0.14)",
                border: "1px solid rgba(239,68,68,0.30)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
              },
            },
            "⚠️",
          ),
          React.createElement(
            "div",
            { key: "t", style: { fontSize: 16, fontWeight: 700 } },
            "Xizmatda xato yuz berdi",
          ),
          React.createElement(
            "div",
            {
              key: "m",
              style: {
                fontSize: 13,
                color: "var(--text-secondary)",
                textAlign: "center",
                maxWidth: 360,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              },
            },
            this.state.errorMsg || "Komponent yuklanmadi.",
          ),
          React.createElement(
            "div",
            {
              key: "h",
              style: { fontSize: 11.5, color: "var(--text-faint)", textAlign: "center" },
            },
            "Iltimos, boshqa xizmatga o'ting yoki ilovani qayta yuklang.",
          ),
          React.createElement(
            "button",
            {
              key: "b",
              type: "button",
              onClick: () => this.props.onBack?.(),
              style: {
                marginTop: 6,
                padding: "11px 22px",
                borderRadius: 12,
                background: "var(--accent, #8b5cf6)",
                color: "#fff",
                border: "none",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              },
            },
            "← Orqaga",
          ),
        ],
      );
    }
    return this.props.children;
  }
}

// ─── ServicePage (full-screen page with slide-in animation) ───────
function ServicePage({ service, isPremium, t, accent, onBack, onToast, onGoToPlans }) {
  const [mounted, setMounted] = useS(false);
  // ServiceSheet o'z step holatini bizga aytadi — "Qanday ishlaydi" ni
  // faqat input bosqichida ko'rsatish uchun.
  const [sheetStep, setSheetStep] = useS("input");

  useE(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Yangi xizmat ochilganda step'ni tiklash
  useE(() => {
    setSheetStep("input");
  }, [service?.id]);

  const meta = isPremium ? t.p?.[service.id] : t.s?.[service.id];
  const howTo = SERVICE_HOW_TO[service.id] || [];
  const showHowTo = sheetStep === "input"; // input bo'lmasa yashirin
  // Ixtisoslashgan komponentlar — har biri o'z UI'sini to'liq render qiladi va
  // generik ServiceSheet'ni chetlab o'tadi. Ba'zilari client-side (jsPDF,
  // browser crypto), boshqalari maxsus UI bilan backend'ga so'rov yuboradi
  // (DocxEditPro, MergePdfPro).
  const _clientComps = {
    imgs2pdf:    window.Img2PdfPro,
    imgcompress: window.ImgCompressPro,
    qr:          window.QrPro,
    stats:       window.StatsPro,
    readtime:    window.ReadTimePro,
    translit:    window.TranslitPro,
    deadline:    window.DeadlinePro,
    password:    window.PasswordPro,
    docxedit:    window.DocxEditPro,
    mergepdf:    window.MergePdfPro,
    age:         window.AgeCalculatorPro,
    math:        window.MathPro,
  };
  // isImg2PdfPro: endi barcha client-side xizmatlarni qamrab oladi (nom orqaga mos saqlanadi)
  const isImg2PdfPro = !isPremium && service.id in _clientComps && !!_clientComps[service.id];
  const ClientComp   = isImg2PdfPro ? _clientComps[service.id] : null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        background: "var(--bg-page)",
        display: "flex",
        flexDirection: "column",
        paddingTop: "var(--safe-top)",
        transform: mounted ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Sticky header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderBottom: "0.5px solid var(--border-subtle)",
          background: "var(--bg-page)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          aria-label="Orqaga"
          style={{
            width: 36, height: 36, borderRadius: 10,
            border: "none", background: "var(--bg-surface-1)",
            cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
            flexShrink: 0, color: "var(--text-primary)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span style={{ fontSize: 14, lineHeight: 1 }} aria-hidden="true">{service.icon}</span>
        <div
          style={{
            flex: 1, minWidth: 0,
            fontSize: 16, fontWeight: 700,
            color: "var(--text-primary)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {meta?.name}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>

        {/* How-to card — faqat input bosqichida ko'rinadi.
            Client-side Pro komponentlarda umuman ko'rinmaydi (ularning o'z UI'si bor). */}
        {howTo.length > 0 && !isImg2PdfPro && showHowTo && (
          <div
            style={{
              margin: "16px 16px 0",
              padding: "16px 18px",
              background:
                "linear-gradient(140deg, var(--bg-surface-1) 0%, var(--bg-surface-2) 100%)",
              borderRadius: 18,
              border: "0.5px solid var(--border-subtle)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Subtle aksent qatlami yuqori chetda */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`,
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.7,
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: 14,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke={accent} strokeWidth="2" />
                <path
                  d="M12 7v6m0 3v.5"
                  stroke={accent}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
              Qanday ishlaydi
            </div>
            {howTo.map((step, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: i < howTo.length - 1 ? 12 : 0,
                  alignItems: "flex-start",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 8,
                    flexShrink: 0,
                    background: `linear-gradient(135deg, ${accent}30, ${accent}10)`,
                    border: `1px solid ${accent}50`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 800,
                    color: accent,
                    marginTop: 1,
                    fontVariantNumeric: "tabular-nums",
                    boxShadow: `0 2px 8px ${accent}25`,
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    color: "var(--text-secondary)",
                    lineHeight: 1.55,
                    whiteSpace: "pre-line",
                    paddingTop: 2,
                  }}
                >
                  {step}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Divider — faqat howTo ko'rsatilganda */}
        {!isImg2PdfPro && showHowTo && howTo.length > 0 && (
          <div style={{ height: "0.5px", background: "var(--border-subtle)", margin: "16px 0 0" }} />
        )}

        {/* Client-side xizmatlar → ixtisoslashgan komponent; aks holda — standart ServiceSheet.
            Hammasi ServiceErrorBoundary ichida — bitta komponent xatosi butun App'ni yiqitmaydi. */}
        <ServiceErrorBoundary serviceKey={service.id} onBack={onBack}>
          {isImg2PdfPro ? (
            <ClientComp t={t} accent={accent} onToast={onToast} />
          ) : (
            <ServiceSheet
              service={service}
              isPremium={isPremium}
              t={t}
              accent={accent}
              embedded={true}
              onClose={onBack}
              onToast={onToast}
              onGoToPlans={onGoToPlans}
              onStepChange={setSheetStep}
            />
          )}
        </ServiceErrorBoundary>
      </div>
    </div>
  );
}

// ─── Text placeholder hints per service ──────────────────────────
const TEXT_HINTS = {
  translit: "Matn kiriting (lotin yoki kirill)",
  readtime: "O'qish vaqtini hisoblash uchun matn kiriting...",
  deadline: "Sana kiriting: 31.12.2025 yoki 2025-12-31",
  stats: "Raqamlar kiriting: 4 7 2 9 1 5",
  translate: "Tarjima qilinadigan matn\nen  ← (oxirgi qatorda til kodi: en, ru, tr, de, zh-CN, ja, ko...)",
  wiki: "Maqola nomi kiriting (uz, ru, en da)",
  books: "Kitob nomi yoki muallif",
  qr: "QR kod uchun matn yoki URL",
  cert: "1-qator: Ism Familiya\n2-qator: Kurs nomi",
  schedule: "Dushanba: Matematika 8:00, Fizika 10:00\nSeshanba: Ingliz tili 9:00, Kimyo 11:00",
  pdflock: "Parol kiriting (bo'sh qolsa avtomatik yaratiladi)",
  watermark: "Watermark matni (bo'sh qoldirilsa EduBot yoziladi)",
  pdfpages: "Sahifa oralig'i: 1-3,5,7-10",
  docxedit: "1-qator: qidiriladigan matn\n2-qator: almashtiriluvchi matn",
  zip: "Parol (ixtiyoriy — bo'sh qolsa shifrsiz)",
};

// File services that also need an optional text input (e.g. password, label)
const EXTRA_TEXT_IDS = new Set(["pdflock", "watermark", "pdfpages", "docxedit", "zip"]);

// ─── Main ServiceSheet ────────────────────────────────────────────
function ServiceSheet({
  service,
  isPremium,
  t,
  accent,
  onClose,
  onToast,
  onGoToPlans,
  embedded = false,
  onStepChange,
}) {
  const [step, setStep] = useS(isPremium ? "locked" : "input");
  // Step o'zgarganda parent ServicePage'ga xabar beramiz (howTo yashirish uchun)
  useE(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);
  const [inputData, setInputData] = useS(null);
  const [hasInput, setHasInput] = useS(false);
  const [result, setResult] = useS(null);
  const [extraText, setExtraText] = useS("");
  const _defaultOpts = (id) => {
    if (id === "cv") return { name: "", title: "", email: "", phone: "", location: "", summary: "",
      telegram: "", instagram: "", website: "", photo: "",
      template: "modern", skills: [], languages: [], education: [], experience: [] };
    if (id === "imgs2pdf") return { mode: "normal" };
    return { bg: "white", sheet: true };
  };

  const [serviceOpts, setServiceOpts] = useS(() => _defaultOpts(service.id));

  const isCvForm = service.id === "cv";

  const meta = isPremium ? t.p?.[service.id] : t.s?.[service.id];
  if (!meta) return null;

  const acceptText = !service.accept && !isCvForm;
  const needsExtraText = !acceptText && !isCvForm && EXTRA_TEXT_IDS.has(service.id);
  const catColor = CAT_COLOR?.[service.cat] || "#a78bfa";
  const iconColor = isPremium ? "#fbbf24" : catColor;

  // ✅ NEW: Telegram MainButton integration
  useE(() => {
    const TG = window.Telegram?.WebApp;
    const btn = TG?.MainButton;
    if (!btn || step !== "input" || !hasInput) return;

    btn.setText(t.sheetStart || "Boshlash");
    btn.setParams({ color: accent, text_color: "#ffffff" });
    btn.show();

    const handleClick = () => start();
    btn.onClick(handleClick);
    return () => {
      btn.hide();
      btn.offClick(handleClick);
    };
  }, [step, hasInput, accent]);

  const start = useC(async () => {
    setStep("processing");
    try {
      const handler = window.SERVICE_HANDLERS?.[service.id];
      if (!handler) {
        // Bu xizmat hali ulanmagan — foydalanuvchini chalg'itmasdan ochiq aytamiz.
        setResult({
          type: "text",
          content: "🚧 Bu xizmat tez kunda qo'shiladi.",
        });
        setStep("done");
        return;
      }

      let arg = {};
      if (isCvForm) {
        arg = { opts: serviceOpts };
      } else if (acceptText) {
        arg = { text: String(inputData || "").trim() };
      } else if (service.multi) {
        const files = Array.isArray(inputData) ? inputData : [inputData];
        arg = { files, file: files[0], text: needsExtraText ? extraText.trim() : "", opts: serviceOpts };
      } else {
        arg = { file: inputData, text: needsExtraText ? extraText.trim() : "", opts: serviceOpts };
      }

      const res = await handler(arg);
      setResult(res);
      setStep("done");

      // ✅ NEW: Haptic on success
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    } catch (err) {
      console.error("[ServiceSheet]", err.message);
      // 1-Bosqich: xato holatini muvaffaqiyatdan aniq ajratamiz.
      // Endi xato `step === "error"` bilan ko'rsatiladi (yashil "✓" emas,
      // qizil ikonkali alohida sahifa). Bu UX/A11Y uchun zarur.
      setResult({
        message: err?.message || "Kutilmagan xato. Iltimos, qayta urinib ko'ring.",
      });
      setStep("error");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    }
  }, [service, inputData, acceptText, serviceOpts, extraText, needsExtraText]);

  const reset = useC(() => {
    setStep("input");
    setInputData(null);
    setHasInput(false);
    setResult(null);
    setServiceOpts(_defaultOpts(service.id));
  }, [service.id]);

  return (
    <div style={{ padding: embedded ? "4px 20px 20px" : "6px 20px 20px" }}>
      {/* Sheet header — hidden when embedded inside ServicePage */}
      <div
        style={{
          display: embedded ? "none" : "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 50,
            height: 50,
            borderRadius: 14,
            background: isPremium ? "rgba(245,158,11,0.18)" : `${catColor}26`,
            border: `0.5px solid ${isPremium ? "rgba(245,158,11,0.32)" : catColor + "40"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon
            name={service.id}
            size={22}
            color={iconColor}
            strokeWidth={1.8}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              color: "var(--text-primary)",
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: -0.2,
            }}
          >
            {meta.name}
          </h2>
          <div
            style={{ color: "var(--text-muted)", fontSize: 12.5, marginTop: 2 }}
          >
            {meta.desc}
          </div>
        </div>
      </div>

      {/* Steps */}
      {step === "locked" && (
        <LockedState
          t={t}
          accent={accent}
          onSubscribe={() => {
            onClose();
            onGoToPlans();
          }}
          onClose={onClose}
        />
      )}

      {step === "input" && (
        <>
          {isCvForm ? (
            <CVForm
              data={serviceOpts}
              onChange={(patch) => {
                setServiceOpts((s) => ({ ...s, ...patch }));
                setHasInput(!!(patch.name ?? serviceOpts.name));
              }}
              accent={accent}
            />
          ) : acceptText ? (
            <TextInputBox
              t={t}
              placeholder={TEXT_HINTS[service.id] || t.sheetTextPlaceholder}
              onChange={(v) => {
                setInputData(v);
                setHasInput(v.trim().length > 0);
              }}
            />
          ) : (
            <Dropzone
              accept={service.accept}
              multi={service.multi}
              t={t}
              onPick={(data) => {
                setInputData(data);
                setHasInput(true);
              }}
            />
          )}
          {service.id === "imgs2pdf" && (
            <Img2PdfOptions
              opts={serviceOpts}
              onChange={setServiceOpts}
              accent={accent}
            />
          )}
          {needsExtraText && (
            <input
              type={service.id === "pdflock" ? "password" : "text"}
              placeholder={TEXT_HINTS[service.id] || ""}
              value={extraText}
              onChange={(e) => setExtraText(e.target.value)}
              maxLength={service.id === "pdflock" ? 64 : 200}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-medium)",
                background: "var(--bg-surface-2)",
                color: "var(--text-primary)",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Button variant="secondary" full onClick={onClose}>
              {t.sheetCancel}
            </Button>
            <Button
              variant="primary"
              accent={accent}
              full
              disabled={!hasInput}
              onClick={start}
            >
              {t.sheetStart}
            </Button>
          </div>
        </>
      )}

      {step === "processing" && (
        <Processing
          t={t}
          accent={accent}
          slowHint={
            service.id === "bgremove"
              ? "AI fon olib tashlanmoqda"
              : service.id === "ocr"
                ? "Matn aniqlanmoqda"
                : null
          }
        />
      )}

      {step === "error" && (
        <ErrorState
          t={t}
          accent={accent}
          message={result?.message || "Kutilmagan xato. Qayta urinib ko'ring."}
          onAgain={reset}
          onClose={onClose}
        />
      )}

      {step === "done" && result && (
        <>
          {result.type === "file" && (
            <ResultFile
              t={t}
              accent={accent}
              result={result}
              onAgain={reset}
              onClose={onClose}
              onToast={onToast}
            />
          )}
          {result.type === "text" && (
            <ResultText
              t={t}
              accent={accent}
              result={result}
              onAgain={reset}
              onClose={onClose}
              onToast={onToast}
            />
          )}
          {result.type === "wiki" && (
            <ResultWiki
              t={t}
              accent={accent}
              result={result}
              onAgain={reset}
              onToast={onToast}
            />
          )}
          {result.type === "image" && (
            <ResultImage
              t={t}
              accent={accent}
              result={result}
              onAgain={reset}
              onToast={onToast}
            />
          )}
          {result.type === "premium" && (
            <LockedState
              t={t}
              accent={accent}
              onSubscribe={() => {
                onClose();
                onGoToPlans();
              }}
              onClose={onClose}
            />
          )}
        </>
      )}
    </div>
  );
}

Object.assign(window, {
  ServiceSheet,
  ServicePage,
  ServiceErrorBoundary,
  Dropzone,
  TextInputBox,
  Processing,
  LockedState,
  SuccessRing,
  ErrorState,
  ResultFile,
  ResultText,
  ResultWiki,
  ResultImage,
  Img2PdfOptions,
  CVForm,
});
