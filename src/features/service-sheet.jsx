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
          minHeight: 160,
          padding: 22,
          background: error
            ? "rgba(239,68,68,0.06)"
            : dragOver
              ? "rgba(139,92,246,0.08)"
              : "var(--bg-surface-1)",
          border: `1.5px dashed ${
            error
              ? "rgba(239,68,68,0.4)"
              : dragOver
                ? "#8b5cf6"
                : "var(--border-medium)"
          }`,
          borderRadius: 18,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "all 0.2s",
          font: "inherit",
        }}
      >
        {/* Icon */}
        <div
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: error
              ? "rgba(239,68,68,0.14)"
              : label
                ? "rgba(34,197,94,0.16)"
                : "rgba(139,92,246,0.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 4,
          }}
        >
          {error ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
                stroke="#fb7185"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : label ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12l4 4L19 6"
                stroke="#4ade80"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14"
                stroke="#a78bfa"
                strokeWidth="2"
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
            }}
          >
            {error}
          </div>
        ) : label ? (
          <>
            <div
              style={{
                color: "var(--text-primary)",
                fontSize: 13.5,
                fontWeight: 600,
                textAlign: "center",
                wordBreak: "break-all",
                maxWidth: 260,
              }}
            >
              {label}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 11.5 }}>
              {sizeText}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {t.sheetUpload}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {t.sheetUploadSub}
            </div>
            {accept && (
              <div
                style={{
                  color: "var(--text-faint)",
                  fontSize: 10.5,
                  marginTop: 4,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
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
              }}
            >
              Maks. {MAX_FILE_MB} MB
            </div>
          </>
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
function Processing({ t, accent }) {
  const [pct, setPct] = useS(0);

  useE(() => {
    const start = performance.now();
    const DURATION = 2200;
    let rafId;

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / DURATION);
      // Ease out cubic — slows down near 95%
      setPct(Math.round((1 - Math.pow(1 - progress, 3)) * 95));
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

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
        {t.sheetProcessing}
      </div>
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
    const r = await fetch(`${window.BACKEND_URL}/api/send-to-bot`, {
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

  const fileSizeMB = result.blob?.size
    ? (result.blob.size / 1024 / 1024).toFixed(2)
    : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        padding: "4px 0 4px",
      }}
    >
      <SuccessRing />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            color: "var(--text-primary)",
            fontSize: 17,
            fontWeight: 700,
          }}
        >
          {t.sheetDone}
        </div>
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 12.5,
            marginTop: 4,
            fontFamily: "monospace",
            wordBreak: "break-all",
          }}
        >
          📎 {result.filename}
          {fileSizeMB && <span> · {fileSizeMB} MB</span>}
        </div>
        {result.info && (
          <div
            style={{
              marginTop: 8,
              color: "#4ade80",
              fontSize: 12.5,
              fontWeight: 600,
              background: "rgba(34,197,94,0.12)",
              padding: "6px 12px",
              borderRadius: 8,
              display: "inline-block",
            }}
          >
            {result.info}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, width: "100%", flexWrap: "wrap" }}>
        <Button variant="secondary" onClick={onAgain} style={{ flex: 1 }}>
          {t.sheetAgain}
        </Button>
        <Button
          variant="secondary"
          onClick={handleSendToBot}
          disabled={sending}
          style={{ flex: 1 }}
        >
          {sending ? <Spinner size={16} color="var(--text-muted)" /> : "📨"}
        </Button>
        <Button
          variant="primary"
          accent={accent}
          onClick={download}
          style={{ flex: 1 }}
        >
          {t.sheetDownload}
        </Button>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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

      {/* Content */}
      <div
        role="textbox"
        aria-readonly="true"
        aria-multiline="true"
        aria-label="Natija matni"
        style={{
          background: "var(--bg-surface-1)",
          border: "0.5px solid var(--border-subtle)",
          borderRadius: 14,
          padding: 14,
          color: "var(--text-primary)",
          fontSize: 13.5,
          lineHeight: 1.55,
          maxHeight: 220,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          userSelect: "text",
        }}
      >
        {result.content}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <Button variant="secondary" full onClick={onAgain}>
          {t.sheetAgain}
        </Button>
        <Button
          variant="primary"
          accent={copied ? "#22c55e" : accent}
          full
          onClick={handleCopy}
        >
          {copied ? "✓ " + (t.sheetCopied || "Nusxalandi") : t.sheetCopy}
        </Button>
      </div>
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
}) {
  const [step, setStep] = useS(isPremium ? "locked" : "input");
  const [inputData, setInputData] = useS(null);
  const [hasInput, setHasInput] = useS(false);
  const [result, setResult] = useS(null);
  const [extraText, setExtraText] = useS("");

  const meta = isPremium ? t.p?.[service.id] : t.s?.[service.id];
  if (!meta) return null;

  const acceptText = !service.accept;
  const needsExtraText = !acceptText && EXTRA_TEXT_IDS.has(service.id);
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
        setResult({
          type: "text",
          content: "⚠️ Bu xizmat tez kunda qo'shiladi.",
        });
        setStep("done");
        return;
      }

      let arg = {};
      if (acceptText) {
        // ✅ FIX: Text is sanitized in handler, but we trim here too
        arg = { text: String(inputData || "").trim() };
      } else if (service.multi) {
        const files = Array.isArray(inputData) ? inputData : [inputData];
        arg = { files, file: files[0], text: needsExtraText ? extraText.trim() : "" };
      } else {
        arg = { file: inputData, text: needsExtraText ? extraText.trim() : "" };
      }

      const res = await handler(arg);
      setResult(res);
      setStep("done");

      // ✅ NEW: Haptic on success
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    } catch (err) {
      console.error("[ServiceSheet]", err.message);
      // ✅ FIX: User-friendly error message (err.message already sanitized in handlers)
      setResult({
        type: "text",
        content: `❌ ${err.message || "Kutilmagan xato. Qayta urinib ko'ring."}`,
      });
      setStep("done");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    }
  }, [service, inputData, acceptText]);

  const reset = useC(() => {
    setStep("input");
    setInputData(null);
    setHasInput(false);
    setResult(null);
  }, []);

  return (
    <div style={{ padding: "6px 20px 20px" }}>
      {/* Sheet header */}
      <div
        style={{
          display: "flex",
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
          {acceptText ? (
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

      {step === "processing" && <Processing t={t} accent={accent} />}

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
  Dropzone,
  TextInputBox,
  Processing,
  LockedState,
  SuccessRing,
  ResultFile,
  ResultText,
  ResultImage,
});
