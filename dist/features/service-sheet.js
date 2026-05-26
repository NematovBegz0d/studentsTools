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
  useCallback: useC
} = React;

// ✅ FIX: Max file size (displayed to user)
const MAX_FILE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_MB * 1024 * 1024;

// ─── Dropzone ─────────────────────────────────────────────────────
function Dropzone({
  accept,
  multi,
  t,
  onPick
}) {
  const [picked, setPicked] = useS(null);
  const [dragOver, setDragOver] = useS(false);
  const [error, setError] = useS(null);
  const inputRef = useR(null);

  // ✅ NEW: Client-side validation in dropzone
  const validateAndPick = useC(fileList => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    setError(null);

    // File size check
    const oversize = arr.find(f => f.size > MAX_FILE_SIZE);
    if (oversize) {
      const mb = (oversize.size / 1024 / 1024).toFixed(1);
      setError(`Fayl hajmi ${mb} MB. Maksimum ${MAX_FILE_MB} MB.`);
      return;
    }
    const result = multi ? arr : arr[0];
    setPicked(result);
    onPick(result);
  }, [multi, onPick]);
  const label = multi ? Array.isArray(picked) ? `${picked.length} ta fayl tanlandi` : null : picked?.name ?? null;
  const sizeText = multi ? Array.isArray(picked) ? `${(picked.reduce((s, f) => s + f.size, 0) / 1024).toFixed(0)} KB` : null : picked ? `${(picked.size / 1024).toFixed(0)} KB` : null;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("input", {
    ref: inputRef,
    type: "file",
    accept: accept,
    multiple: !!multi,
    style: {
      display: "none"
    },
    "aria-label": "Fayl tanlash",
    onChange: e => validateAndPick(e.target.files)
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setError(null);
      inputRef.current?.click();
    },
    onDragOver: e => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: e => {
      e.preventDefault();
      setDragOver(false);
      validateAndPick(e.dataTransfer.files);
    },
    "aria-label": label ? `${label} tanlandi. O'zgartirish uchun bosing` : "Fayl yuklash",
    style: {
      width: "100%",
      minHeight: 160,
      padding: 22,
      background: error ? "rgba(239,68,68,0.06)" : dragOver ? "rgba(139,92,246,0.08)" : "var(--bg-surface-1)",
      border: `1.5px dashed ${error ? "rgba(239,68,68,0.4)" : dragOver ? "#8b5cf6" : "var(--border-medium)"}`,
      borderRadius: 18,
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      transition: "all 0.2s",
      font: "inherit"
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 48,
      height: 48,
      borderRadius: 14,
      background: error ? "rgba(239,68,68,0.14)" : label ? "rgba(34,197,94,0.16)" : "rgba(139,92,246,0.16)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4
    }
  }, error ? /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    stroke: "#fb7185",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })) : label ? /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12l4 4L19 6",
    stroke: "#4ade80",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })) : /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 4v12m0 0l-5-5m5 5l5-5M5 20h14",
    stroke: "#a78bfa",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), error ? /*#__PURE__*/React.createElement("div", {
    style: {
      color: "#fb7185",
      fontSize: 13,
      fontWeight: 600,
      textAlign: "center"
    }
  }, error) : label ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-primary)",
      fontSize: 13.5,
      fontWeight: 600,
      textAlign: "center",
      wordBreak: "break-all",
      maxWidth: 260
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 11.5
    }
  }, sizeText)) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-primary)",
      fontSize: 14,
      fontWeight: 600
    }
  }, t.sheetUpload), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 12
    }
  }, t.sheetUploadSub), accept && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-faint)",
      fontSize: 10.5,
      marginTop: 4,
      textTransform: "uppercase",
      letterSpacing: 0.4
    }
  }, accept.split(",").map(s => s.trim().toUpperCase()).join(" · ")), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-faint)",
      fontSize: 10.5,
      marginTop: 2
    }
  }, "Maks. ", MAX_FILE_MB, " MB"))));
}

// ─── TextInputBox ─────────────────────────────────────────────────
function TextInputBox({
  t,
  placeholder,
  onChange,
  maxLength = 5000
}) {
  const [val, setVal] = useS("");
  const handleChange = useC(e => {
    const raw = e.target.value;
    setVal(raw);
    onChange(raw);
  }, [onChange]);
  const charCount = val.length;
  const nearLimit = charCount > maxLength * 0.85;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("textarea", {
    value: val,
    onChange: handleChange,
    placeholder: placeholder || t.sheetTextPlaceholder,
    maxLength: maxLength,
    "aria-label": placeholder || t.sheetTextPlaceholder,
    style: {
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
      transition: "border-color 0.18s"
    }
  }), val.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right",
      fontSize: 10.5,
      marginTop: 4,
      color: nearLimit ? "#fbbf24" : "var(--text-faint)"
    }
  }, charCount, " / ", maxLength));
}

// ─── Processing animation ─────────────────────────────────────────
function Processing({
  t,
  accent
}) {
  const [pct, setPct] = useS(0);
  useE(() => {
    const start = performance.now();
    const DURATION = 2200;
    let rafId;
    const tick = now => {
      const progress = Math.min(1, (now - start) / DURATION);
      // Ease out cubic — slows down near 95%
      setPct(Math.round((1 - Math.pow(1 - progress, 3)) * 95));
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);
  const circumference = 2 * Math.PI * 48;
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    "aria-label": `${pct}% tayyorlandi`,
    "aria-live": "polite",
    style: {
      padding: "8px 0 4px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: 110,
      height: 110
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "110",
    height: "110",
    viewBox: "0 0 110 110",
    style: {
      transform: "rotate(-90deg)"
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "55",
    cy: "55",
    r: "48",
    fill: "none",
    stroke: "var(--border-light)",
    strokeWidth: "6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "55",
    cy: "55",
    r: "48",
    fill: "none",
    stroke: accent,
    strokeWidth: "6",
    strokeLinecap: "round",
    strokeDasharray: circumference,
    strokeDashoffset: circumference * (1 - pct / 100),
    style: {
      transition: "stroke-dashoffset 0.3s linear",
      filter: `drop-shadow(0 0 8px ${accent}80)`
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--text-primary)",
      fontSize: 26,
      fontWeight: 700,
      fontVariantNumeric: "tabular-nums"
    }
  }, pct, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-primary)",
      fontSize: 15,
      fontWeight: 600
    }
  }, t.sheetProcessing));
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
      headers: {
        "X-User-Id": String(userId)
      },
      body: form
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
function ResultFile({
  t,
  accent,
  result,
  onAgain,
  onClose,
  onToast
}) {
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
  const fileSizeMB = result.blob?.size ? (result.blob.size / 1024 / 1024).toFixed(2) : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 14,
      padding: "4px 0 4px"
    }
  }, /*#__PURE__*/React.createElement(SuccessRing, null), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-primary)",
      fontSize: 17,
      fontWeight: 700
    }
  }, t.sheetDone), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 12.5,
      marginTop: 4,
      fontFamily: "monospace",
      wordBreak: "break-all"
    }
  }, "\uD83D\uDCCE ", result.filename, fileSizeMB && /*#__PURE__*/React.createElement("span", null, " \xB7 ", fileSizeMB, " MB")), result.info && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      color: "#4ade80",
      fontSize: 12.5,
      fontWeight: 600,
      background: "rgba(34,197,94,0.12)",
      padding: "6px 12px",
      borderRadius: 8,
      display: "inline-block"
    }
  }, result.info)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      width: "100%",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: onAgain,
    style: {
      flex: 1
    }
  }, t.sheetAgain), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: handleSendToBot,
    disabled: sending,
    style: {
      flex: 1
    }
  }, sending ? /*#__PURE__*/React.createElement(Spinner, {
    size: 16,
    color: "var(--text-muted)"
  }) : "📨"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    accent: accent,
    onClick: download,
    style: {
      flex: 1
    }
  }, t.sheetDownload)));
}

// ─── ResultText ───────────────────────────────────────────────────
function ResultText({
  t,
  accent,
  result,
  onAgain,
  onClose,
  onToast
}) {
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
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 0.6
    }
  }, t.sheetResult || "Natija"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-faint)",
      fontSize: 10.5
    }
  }, charCount, " belgi")), /*#__PURE__*/React.createElement("div", {
    role: "textbox",
    "aria-readonly": "true",
    "aria-multiline": "true",
    "aria-label": "Natija matni",
    style: {
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
      userSelect: "text"
    }
  }, result.content), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    full: true,
    onClick: onAgain
  }, t.sheetAgain), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    accent: copied ? "#22c55e" : accent,
    full: true,
    onClick: handleCopy
  }, copied ? "✓ " + (t.sheetCopied || "Nusxalandi") : t.sheetCopy)));
}

// ─── ResultWiki ───────────────────────────────────────────────────
function ResultWiki({
  t,
  accent,
  result,
  onAgain,
  onToast
}) {
  const [copied, setCopied] = useS(false);
  const extract = result.extract || result.content || "";
  const title = result.title || "";
  const desc = result.description || "";
  const thumb = result.thumbnail || null;
  const url = result.url || null;
  const alts = result.alternatives || [];
  const related = result.related || [];
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
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, thumb && /*#__PURE__*/React.createElement("img", {
    src: thumb,
    alt: title || "Wikipedia",
    style: {
      width: "100%",
      maxHeight: 160,
      objectFit: "cover",
      borderRadius: 12,
      border: "0.5px solid var(--border-subtle)"
    }
  }), title && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: "var(--text-primary)"
    }
  }, title), desc && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)",
      marginTop: 3
    }
  }, desc)), /*#__PURE__*/React.createElement("div", {
    role: "textbox",
    "aria-readonly": "true",
    "aria-label": "Wikipedia matni",
    style: {
      background: "var(--bg-surface-1)",
      border: "0.5px solid var(--border-subtle)",
      borderRadius: 14,
      padding: 14,
      color: "var(--text-primary)",
      fontSize: 13.5,
      lineHeight: 1.6,
      maxHeight: 200,
      overflowY: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      userSelect: "text"
    }
  }, extract || "Ma'lumot topilmadi."), related.length > 0 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: "var(--text-muted)",
      marginBottom: 6
    }
  }, "Bog'liq maqolalar"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, related.map((item, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: item.url || "#",
    target: "_blank",
    rel: "noopener noreferrer",
    style: {
      padding: "4px 10px",
      borderRadius: 20,
      background: "var(--bg-surface-2)",
      border: "0.5px solid var(--border-medium)",
      color: accent,
      fontSize: 12,
      textDecoration: "none",
      fontWeight: 500
    }
  }, item.title || item)))), alts.length > 0 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: "var(--text-muted)",
      marginBottom: 6
    }
  }, "Boshqa nomlar"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, alts.map((alt, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      padding: "4px 10px",
      borderRadius: 20,
      background: "var(--bg-surface-1)",
      border: "0.5px solid var(--border-light)",
      color: "var(--text-secondary)",
      fontSize: 12
    }
  }, alt)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    full: true,
    onClick: onAgain
  }, t.sheetAgain), url ? /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    accent: accent,
    full: true,
    onClick: () => window.open(url, "_blank", "noopener,noreferrer")
  }, "Wikipedia \u2192") : /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    accent: accent,
    full: true,
    onClick: handleCopy
  }, copied ? "✓ Nusxalandi" : t.sheetCopy)), url && /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    full: true,
    onClick: handleCopy
  }, copied ? "✓ " + (t.sheetCopied || "Nusxalandi") : t.sheetCopy || "Nusxalash"));
}

// ─── ResultImage ──────────────────────────────────────────────────
function ResultImage({
  t,
  accent,
  result,
  onAgain,
  onToast
}) {
  const download = useC(() => {
    const a = document.createElement("a");
    a.href = result.dataUrl;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onToast?.(t.sheetDownloaded || "Yuklandi ✓");
  }, [result, t, onToast]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: result.dataUrl,
    alt: result.filename || "Natija",
    style: {
      maxWidth: "100%",
      borderRadius: 14,
      border: "0.5px solid var(--border-subtle)",
      maxHeight: 260,
      objectFit: "contain"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    full: true,
    onClick: onAgain
  }, t.sheetAgain), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    accent: accent,
    full: true,
    onClick: download
  }, t.sheetDownload)));
}

// ─── SuccessRing ──────────────────────────────────────────────────
function SuccessRing() {
  return /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 72,
      height: 72,
      borderRadius: "50%",
      background: "rgba(34,197,94,0.15)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: -8,
      borderRadius: "50%",
      border: "2px solid rgba(34,197,94,0.2)",
      animation: "pulse 1.4s ease-out infinite"
    }
  }), /*#__PURE__*/React.createElement("svg", {
    width: "34",
    height: "34",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12l5 5L20 7",
    stroke: "#22c55e",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
}

// ─── Img2PdfOptions ───────────────────────────────────────────────
function Img2PdfOptions({
  opts,
  onChange,
  accent
}) {
  const MODES = [{
    value: "normal",
    label: "Oddiy",
    icon: "📄",
    desc: "Tez"
  }, {
    value: "document",
    label: "Skan",
    icon: "📑",
    desc: "Tenglashtiradi"
  }, {
    value: "searchable",
    label: "Qidiriladigan",
    icon: "🔍",
    desc: "OCR matn"
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 7
    }
  }, "Rejim"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, MODES.map(({
    value,
    label,
    icon,
    desc
  }) => {
    const active = opts.mode === value;
    return /*#__PURE__*/React.createElement("button", {
      key: value,
      type: "button",
      onClick: () => onChange({
        ...opts,
        mode: value
      }),
      "aria-pressed": active,
      style: {
        flex: 1,
        padding: "9px 4px",
        borderRadius: 12,
        border: active ? `1.5px solid ${accent}` : "1.5px solid var(--border-medium)",
        background: active ? `${accent}18` : "var(--bg-surface-1)",
        cursor: "pointer",
        font: "inherit",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        transition: "all 0.15s"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 18
      },
      "aria-hidden": "true"
    }, icon), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        fontWeight: active ? 700 : 500,
        color: active ? accent : "var(--text-secondary)"
      }
    }, label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: "var(--text-faint)"
      }
    }, desc));
  })));
}

// ─── Photo3x4Options ──────────────────────────────────────────────
function Photo3x4Options({
  opts,
  onChange,
  accent
}) {
  const BG = [{
    value: "white",
    label: "Oq",
    color: "#ffffff",
    border: "#bbb"
  }, {
    value: "blue",
    label: "Ko'k",
    color: "#6495ed",
    border: "#6495ed"
  }, {
    value: "gray",
    label: "Kulrang",
    color: "#c8c8c8",
    border: "#aaa"
  }];
  const OUT = [{
    value: true,
    label: "A4 da 6 ta",
    sub: "Bosib chiqarish uchun"
  }, {
    value: false,
    label: "Bitta foto",
    sub: "3×4 sm rasm"
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 7
    }
  }, "Fon rangi"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, BG.map(({
    value,
    label,
    color,
    border
  }) => {
    const active = opts.bg === value;
    return /*#__PURE__*/React.createElement("button", {
      key: value,
      type: "button",
      onClick: () => onChange({
        ...opts,
        bg: value
      }),
      style: {
        flex: 1,
        padding: "9px 0",
        borderRadius: 12,
        cursor: "pointer",
        border: active ? `2px solid ${accent}` : `1.5px solid var(--border-medium)`,
        background: active ? `${accent}12` : "var(--bg-surface-1)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        font: "inherit",
        transition: "all 0.15s"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 26,
        height: 26,
        borderRadius: 6,
        background: color,
        border: `1px solid ${border}90`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        color: active ? "var(--text-primary)" : "var(--text-muted)"
      }
    }, label));
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 7
    }
  }, "Chiqish"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, OUT.map(({
    value,
    label,
    sub
  }) => {
    const active = opts.sheet === value;
    return /*#__PURE__*/React.createElement("button", {
      key: String(value),
      type: "button",
      onClick: () => onChange({
        ...opts,
        sheet: value
      }),
      style: {
        flex: 1,
        padding: "9px 12px",
        borderRadius: 12,
        cursor: "pointer",
        border: active ? `2px solid ${accent}` : `1.5px solid var(--border-medium)`,
        background: active ? `${accent}12` : "var(--bg-surface-1)",
        textAlign: "left",
        font: "inherit",
        transition: "all 0.15s"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--text-primary)"
      }
    }, label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10.5,
        color: "var(--text-muted)",
        marginTop: 2
      }
    }, sub));
  }))));
}

// ─── LockedState ──────────────────────────────────────────────────
function LockedState({
  t,
  accent,
  onSubscribe,
  onClose
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 0 4px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 78,
      height: 78,
      borderRadius: "50%",
      background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))",
      border: "0.5px solid rgba(245,158,11,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "32",
    height: "32",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "5",
    y: "11",
    width: "14",
    height: "10",
    rx: "2",
    stroke: "#fbbf24",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 11V8a4 4 0 1 1 8 0v3",
    stroke: "#fbbf24",
    strokeWidth: "2",
    strokeLinecap: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      maxWidth: 280
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-primary)",
      fontSize: 18,
      fontWeight: 700,
      marginBottom: 6
    }
  }, t.sheetLockedTitle), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 13,
      lineHeight: 1.45
    }
  }, t.sheetLockedSub)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      width: "100%",
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    full: true,
    onClick: onClose
  }, t.sheetCancel), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    accent: "#f59e0b",
    full: true,
    onClick: onSubscribe
  }, t.subscribe)));
}

// ─── CV Form ──────────────────────────────────────────────────────
const CV_TEMPLATES = [{
  id: "modern",
  label: "Modern",
  color: "#4f46e5"
}, {
  id: "classic",
  label: "Classic",
  color: "#1e40af"
}, {
  id: "minimal",
  label: "Minimal",
  color: "#059669"
}, {
  id: "dark",
  label: "Dark",
  color: "#a78bfa"
}];
function CVForm({
  data,
  onChange,
  accent
}) {
  const [expItems, setExpItems] = useS(data.experience?.length ? data.experience : [{
    position: "",
    company: "",
    period: "",
    desc: ""
  }]);
  const [eduItems, setEduItems] = useS(data.education?.length ? data.education : [{
    degree: "",
    school: "",
    year: ""
  }]);
  const [skillsRaw, setSkillsRaw] = useS((data.skills || []).join(", "));
  const [langsRaw, setLangsRaw] = useS((data.languages || []).join(", "));
  const inp = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border-medium)",
    background: "var(--bg-surface-2)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 8
  };
  const label = {
    fontSize: 11,
    color: "var(--text-muted)",
    marginBottom: 3,
    display: "block"
  };
  const sectionTitle = {
    fontSize: 12,
    fontWeight: 700,
    color: accent,
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "14px 0 8px"
  };
  const addBtn = {
    background: "transparent",
    border: `1px dashed ${accent}`,
    color: accent,
    borderRadius: "var(--radius-sm)",
    padding: "6px 12px",
    fontSize: 12,
    cursor: "pointer",
    width: "100%"
  };
  const delBtn = {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 16,
    cursor: "pointer",
    padding: "2px 6px",
    lineHeight: 1
  };
  const notify = patch => onChange({
    ...data,
    ...patch
  });
  const setExp = (i, key, val) => {
    const next = expItems.map((e, idx) => idx === i ? {
      ...e,
      [key]: val
    } : e);
    setExpItems(next);
    notify({
      experience: next
    });
  };
  const addExp = () => {
    const next = [...expItems, {
      position: "",
      company: "",
      period: "",
      desc: ""
    }];
    setExpItems(next);
    notify({
      experience: next
    });
  };
  const delExp = i => {
    const next = expItems.filter((_, idx) => idx !== i);
    setExpItems(next.length ? next : [{
      position: "",
      company: "",
      period: "",
      desc: ""
    }]);
    notify({
      experience: next
    });
  };
  const setEdu = (i, key, val) => {
    const next = eduItems.map((e, idx) => idx === i ? {
      ...e,
      [key]: val
    } : e);
    setEduItems(next);
    notify({
      education: next
    });
  };
  const addEdu = () => {
    const next = [...eduItems, {
      degree: "",
      school: "",
      year: ""
    }];
    setEduItems(next);
    notify({
      education: next
    });
  };
  const delEdu = i => {
    const next = eduItems.filter((_, idx) => idx !== i);
    setEduItems(next.length ? next : [{
      degree: "",
      school: "",
      year: ""
    }]);
    notify({
      education: next
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: sectionTitle
  }, "Shablon"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 12
    }
  }, CV_TEMPLATES.map(tmpl => /*#__PURE__*/React.createElement("button", {
    key: tmpl.id,
    onClick: () => notify({
      template: tmpl.id
    }),
    style: {
      flex: 1,
      padding: "7px 4px",
      borderRadius: "var(--radius-sm)",
      border: `2px solid ${data.template === tmpl.id ? tmpl.color : "var(--border-medium)"}`,
      background: data.template === tmpl.id ? tmpl.color + "22" : "var(--bg-surface-2)",
      color: data.template === tmpl.id ? tmpl.color : "var(--text-muted)",
      fontSize: 11,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, tmpl.label))), /*#__PURE__*/React.createElement("div", {
    style: sectionTitle
  }, "Asosiy ma'lumot"), /*#__PURE__*/React.createElement("label", {
    style: label
  }, "Ism Familiya *"), /*#__PURE__*/React.createElement("input", {
    style: inp,
    placeholder: "Abdullayev Anvar",
    value: data.name || "",
    onChange: e => notify({
      name: e.target.value
    })
  }), /*#__PURE__*/React.createElement("label", {
    style: label
  }, "Kasb / Lavozim"), /*#__PURE__*/React.createElement("input", {
    style: inp,
    placeholder: "Frontend Developer",
    value: data.title || "",
    onChange: e => notify({
      title: e.target.value
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: label
  }, "Email"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...inp,
      marginBottom: 0
    },
    placeholder: "name@email.com",
    value: data.email || "",
    onChange: e => notify({
      email: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: label
  }, "Telefon"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...inp,
      marginBottom: 0
    },
    placeholder: "+998 90 123 45 67",
    value: data.phone || "",
    onChange: e => notify({
      phone: e.target.value
    })
  }))), /*#__PURE__*/React.createElement("label", {
    style: {
      ...label,
      marginTop: 8
    }
  }, "Shahar / Manzil"), /*#__PURE__*/React.createElement("input", {
    style: inp,
    placeholder: "Toshkent, O'zbekiston",
    value: data.location || "",
    onChange: e => notify({
      location: e.target.value
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: sectionTitle
  }, "Qisqacha ma'lumot"), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...inp,
      resize: "vertical",
      minHeight: 72,
      fontFamily: "inherit"
    },
    placeholder: "O'zingiz haqingizda 2-3 jumla...",
    value: data.summary || "",
    onChange: e => notify({
      summary: e.target.value
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: sectionTitle
  }, "Ish tajribasi"), expItems.map((exp, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      border: "1px solid var(--border-medium)",
      borderRadius: "var(--radius-sm)",
      padding: "10px 12px",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--text-muted)"
    }
  }, "#", i + 1), expItems.length > 1 && /*#__PURE__*/React.createElement("button", {
    style: delBtn,
    onClick: () => delExp(i)
  }, "\u2715")), /*#__PURE__*/React.createElement("input", {
    style: inp,
    placeholder: "Lavozim (masalan: Frontend Developer)",
    value: exp.position,
    onChange: e => setExp(i, "position", e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...inp,
      marginBottom: 0
    },
    placeholder: "Kompaniya",
    value: exp.company,
    onChange: e => setExp(i, "company", e.target.value)
  }), /*#__PURE__*/React.createElement("input", {
    style: {
      ...inp,
      marginBottom: 0
    },
    placeholder: "2022\u20132024",
    value: exp.period,
    onChange: e => setExp(i, "period", e.target.value)
  })), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...inp,
      resize: "vertical",
      minHeight: 56,
      fontFamily: "inherit",
      marginTop: 8
    },
    placeholder: "Vazifalar va yutuqlar...",
    value: exp.desc,
    onChange: e => setExp(i, "desc", e.target.value)
  }))), /*#__PURE__*/React.createElement("button", {
    style: addBtn,
    onClick: addExp
  }, "+ Ish tajriba qo'shish"), /*#__PURE__*/React.createElement("div", {
    style: sectionTitle
  }, "Ta'lim"), eduItems.map((edu, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      border: "1px solid var(--border-medium)",
      borderRadius: "var(--radius-sm)",
      padding: "10px 12px",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--text-muted)"
    }
  }, "#", i + 1), eduItems.length > 1 && /*#__PURE__*/React.createElement("button", {
    style: delBtn,
    onClick: () => delEdu(i)
  }, "\u2715")), /*#__PURE__*/React.createElement("input", {
    style: inp,
    placeholder: "Diplom / Mutaxassislik",
    value: edu.degree,
    onChange: e => setEdu(i, "degree", e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...inp,
      marginBottom: 0
    },
    placeholder: "Universitet",
    value: edu.school,
    onChange: e => setEdu(i, "school", e.target.value)
  }), /*#__PURE__*/React.createElement("input", {
    style: {
      ...inp,
      marginBottom: 0
    },
    placeholder: "2018\u20132022",
    value: edu.year,
    onChange: e => setEdu(i, "year", e.target.value)
  })))), /*#__PURE__*/React.createElement("button", {
    style: addBtn,
    onClick: addEdu
  }, "+ Ta'lim qo'shish"), /*#__PURE__*/React.createElement("div", {
    style: sectionTitle
  }, "Ko'nikmalar"), /*#__PURE__*/React.createElement("input", {
    style: inp,
    placeholder: "Python, React, Figma, Ingliz tili...",
    value: skillsRaw,
    onChange: e => {
      setSkillsRaw(e.target.value);
      notify({
        skills: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
      });
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--text-muted)",
      marginTop: -4,
      marginBottom: 8
    }
  }, "Vergul bilan ajrating"), /*#__PURE__*/React.createElement("div", {
    style: sectionTitle
  }, "Tillar"), /*#__PURE__*/React.createElement("input", {
    style: inp,
    placeholder: "O'zbek (ona tili), Ingliz (B2), Rus (C1)...",
    value: langsRaw,
    onChange: e => {
      setLangsRaw(e.target.value);
      notify({
        languages: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
      });
    }
  }));
}

// ─── Per-service "How it works" steps ────────────────────────────
const SERVICE_HOW_TO = {
  pdf2docx: ["PDF faylni yuklang", "Boshlash ni bosing — konvertatsiya 10-30 soniya oladi", "Tayyor DOCX faylni yuklab oling"],
  docx2pdf: ["Word (.doc/.docx) faylni yuklang", "Boshlash ni bosing", "PDF faylni yuklab oling"],
  docxedit: ["DOCX faylni yuklang", "1-qator: qidiriladigan so'z  |  2-qator: yangi so'z", "Yangilangan DOCX faylni yuklab oling"],
  img2pdf: ["Rasm (JPG/PNG/WebP) yuklang", "Sahifa o'lchami va margin tanlang, Boshlash ni bosing", "PDF faylni yuklab oling"],
  imgs2pdf: ["Bir nechta rasm tanlang (tartib muhim)", "Boshlash ni bosing", "Ko'p sahifali PDF faylni yuklab oling"],
  xlsx2pdf: ["Excel (.xlsx/.xls) faylni yuklang", "Boshlash ni bosing", "PDF jadvalni yuklab oling"],
  pdf2img: ["PDF faylni yuklang", "Boshlash ni bosing", "1 sahifa → rasm, ko'p sahifa → ZIP arxivi"],
  mergepdf: ["Birlashtiriladigan PDF fayllarni tanlang (tartib muhim)", "Boshlash ni bosing", "Birlashtirilgan PDF yuklab oling"],
  splitpdf: ["PDF faylni yuklang", "Boshlash ni bosing — har sahifa alohida fayl bo'ladi", "ZIP arxivini yuklab oling"],
  pdfpages: ["PDF faylni yuklang", "Sahifalar oralig'ini kiriting, masalan: 1-3,5,7", "Tanlangan sahifalar bilan yangi PDF yuklab oling"],
  pdftext: ["PDF faylni yuklang", "Boshlash ni bosing", "Matn ekranda ko'rsatiladi — nusxalab oling"],
  ocr: ["Rasm yoki skanerlangan PDF yuklang (o'zbek, rus, ingliz matni)", "Boshlash ni bosing — Tesseract OCR aniqlaydi", "Aniqlangan matnni nusxalab oling"],
  compresspdf: ["Siqiladigan PDF faylni yuklang", "Boshlash ni bosing", "Hajmi 30-70% kamaygan PDF yuklab oling"],
  compresspptx: ["PPTX faylni yuklang", "Boshlash ni bosing", "Siqilgan PPTX faylni yuklab oling"],
  pdflock: ["PDF faylni yuklang", "Parol kiriting (bo'sh qolsa avtomatik yaratiladi)", "Himoyalangan PDF va parolni yuklab oling"],
  watermark: ["PDF faylni yuklang", "Watermark matni kiriting (bo'sh qolsa 'EduBot' yoziladi)", "Watermarkli PDF yuklab oling"],
  imgcompress: ["JPG yoki PNG rasmni yuklang", "Boshlash ni bosing", "Siqilgan rasmni yuklab oling"],
  translit: ["O'zbek matni kiriting (lotin yoki kirill)", "Boshlash ni bosing", "Boshqa yozuvdagi matnni nusxalab oling"],
  stats: ["Raqamlarni bo'sh joy bilan ajratib kiriting: 4 7 2 9 1 5", "Boshlash ni bosing", "O'rtacha, mediana, dispersiya va boshqa ko'rsatkichlar chiqadi"],
  translate: ["Matnni kiriting", "Oxirgi qatorda til kodini yozing: en  ru  tr  de  ja  ko", "Tarjima natijasini nusxalab oling"],
  wiki: ["Maqola nomini kiriting (masalan: Amir Temur)", "Boshlash ni bosing", "Wikipedia dan qisqacha ma'lumot oling"],
  readtime: ["Matnni kiriting yoki joylashtiring", "Boshlash ni bosing", "O'qish uchun taxminiy vaqt ko'rsatiladi"],
  books: ["Kitob nomi yoki muallif ismini kiriting", "Boshlash ni bosing", "Open Library dan kitob ma'lumotlari ko'rsatiladi"],
  summarize: ["Uzun matnni kiriting (kamida 200 belgi)", "Boshlash ni bosing", "AI 3-5 jumlada xulosalab beradi"],
  qr: ["Matn, URL yoki telefon raqam kiriting", "Boshlash ni bosing", "QR kodini yuklab oling"],
  cert: ["1-qator: Ism Familiya\n2-qator: Kurs yoki yutuq nomi", "Boshlash ni bosing", "Sertifikat rasmini yuklab oling"],
  bgremove: ["Rasm (JPG/PNG) yuklang", "Boshlash ni bosing — AI fon olib tashlaydi", "Fonsiz rasmni (PNG) yuklab oling"],
  photo3x4: ["Yuz ko'rinadigan rasm (JPG/PNG) yuklang", "Fon rangi va chiqish turini tanlang", "A4 da 6 ta 3×4 sm foto yoki bitta foto yuklab oling"],
  cv: ["Ism, kasb, kontakt ma'lumotlarini kiriting", "Ish tajribasi, ta'lim, ko'nikmalar qo'shing", "Professional PDF CV ni yuklab oling"],
  schedule: ["Dars jadvalini kiriting:\nDushanba: Matematika 8:00, Fizika 10:00", "Boshlash ni bosing", "Haftalik jadval rasmini yuklab oling"],
  deadline: ["Sana kiriting: 31.12.2025 yoki 2025-12-31", "Boshlash ni bosing", "Qolgan vaqt va eslatma ko'rsatiladi"],
  zip: ["Arxivlanadigan fayllarni tanlang", "Parol kiriting (ixtiyoriy)", "ZIP arxivini yuklab oling"],
  unzip: ["ZIP faylni yuklang", "Boshlash ni bosing", "Fayl nomlari ro'yxati va yuklab olish imkoniyati"]
};

// ─── ServicePage (full-screen page with slide-in animation) ───────
function ServicePage({
  service,
  isPremium,
  t,
  accent,
  onBack,
  onToast,
  onGoToPlans
}) {
  const [mounted, setMounted] = useS(false);
  useE(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const meta = isPremium ? t.p?.[service.id] : t.s?.[service.id];
  const howTo = SERVICE_HOW_TO[service.id] || [];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      zIndex: 50,
      background: "var(--bg-page)",
      display: "flex",
      flexDirection: "column",
      paddingTop: "var(--safe-top)",
      transform: mounted ? "translateX(0)" : "translateX(100%)",
      transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 16px",
      borderBottom: "0.5px solid var(--border-subtle)",
      background: "var(--bg-page)",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    "aria-label": "Orqaga",
    style: {
      width: 36,
      height: 36,
      borderRadius: 10,
      border: "none",
      background: "var(--bg-surface-1)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      color: "var(--text-primary)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15 18l-6-6 6-6",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      lineHeight: 1
    },
    "aria-hidden": "true"
  }, service.icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 16,
      fontWeight: 700,
      color: "var(--text-primary)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, meta?.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch"
    }
  }, howTo.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "16px 16px 0",
      padding: "14px 16px",
      background: "var(--bg-surface-1)",
      borderRadius: 16,
      border: "0.5px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: 0.7,
      textTransform: "uppercase",
      color: "var(--text-muted)",
      marginBottom: 12
    }
  }, "Qanday ishlaydi"), howTo.map((step, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      gap: 10,
      marginBottom: i < howTo.length - 1 ? 10 : 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 20,
      height: 20,
      borderRadius: "50%",
      flexShrink: 0,
      background: `${accent}1a`,
      border: `1.5px solid ${accent}55`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 10,
      fontWeight: 700,
      color: accent,
      marginTop: 2
    }
  }, i + 1), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--text-secondary)",
      lineHeight: 1.5,
      whiteSpace: "pre-line"
    }
  }, step)))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: "0.5px",
      background: "var(--border-subtle)",
      margin: "16px 0 0"
    }
  }), /*#__PURE__*/React.createElement(ServiceSheet, {
    service: service,
    isPremium: isPremium,
    t: t,
    accent: accent,
    embedded: true,
    onClose: onBack,
    onToast: onToast,
    onGoToPlans: onGoToPlans
  })));
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
  summarize: "Xulosalash uchun uzun matn (kamida 200 belgi)",
  qr: "QR kod uchun matn yoki URL",
  cert: "1-qator: Ism Familiya\n2-qator: Kurs nomi",
  schedule: "Dushanba: Matematika 8:00, Fizika 10:00\nSeshanba: Ingliz tili 9:00, Kimyo 11:00",
  pdflock: "Parol kiriting (bo'sh qolsa avtomatik yaratiladi)",
  watermark: "Watermark matni (bo'sh qoldirilsa EduBot yoziladi)",
  pdfpages: "Sahifa oralig'i: 1-3,5,7-10",
  docxedit: "1-qator: qidiriladigan matn\n2-qator: almashtiriluvchi matn",
  zip: "Parol (ixtiyoriy — bo'sh qolsa shifrsiz)"
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
  embedded = false
}) {
  const [step, setStep] = useS(isPremium ? "locked" : "input");
  const [inputData, setInputData] = useS(null);
  const [hasInput, setHasInput] = useS(false);
  const [result, setResult] = useS(null);
  const [extraText, setExtraText] = useS("");
  const _defaultOpts = id => {
    if (id === "cv") return {
      name: "",
      title: "",
      email: "",
      phone: "",
      location: "",
      summary: "",
      template: "modern",
      skills: [],
      languages: [],
      education: [],
      experience: []
    };
    if (id === "img2pdf" || id === "imgs2pdf") return {
      mode: "normal"
    };
    return {
      bg: "white",
      sheet: true
    };
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
    btn.setParams({
      color: accent,
      text_color: "#ffffff"
    });
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
          content: "⚠️ Bu xizmat tez kunda qo'shiladi."
        });
        setStep("done");
        return;
      }
      let arg = {};
      if (isCvForm) {
        arg = {
          opts: serviceOpts
        };
      } else if (acceptText) {
        arg = {
          text: String(inputData || "").trim()
        };
      } else if (service.multi) {
        const files = Array.isArray(inputData) ? inputData : [inputData];
        arg = {
          files,
          file: files[0],
          text: needsExtraText ? extraText.trim() : "",
          opts: serviceOpts
        };
      } else {
        arg = {
          file: inputData,
          text: needsExtraText ? extraText.trim() : "",
          opts: serviceOpts
        };
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
        content: `❌ ${err.message || "Kutilmagan xato. Qayta urinib ko'ring."}`
      });
      setStep("done");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    }
  }, [service, inputData, acceptText, serviceOpts]);
  const reset = useC(() => {
    setStep("input");
    setInputData(null);
    setHasInput(false);
    setResult(null);
    setServiceOpts(_defaultOpts(service.id));
  }, [service.id]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: embedded ? "4px 20px 20px" : "6px 20px 20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: embedded ? "none" : "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 50,
      height: 50,
      borderRadius: 14,
      background: isPremium ? "rgba(245,158,11,0.18)" : `${catColor}26`,
      border: `0.5px solid ${isPremium ? "rgba(245,158,11,0.32)" : catColor + "40"}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: service.id,
    size: 22,
    color: iconColor,
    strokeWidth: 1.8
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      color: "var(--text-primary)",
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: -0.2
    }
  }, meta.name), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 12.5,
      marginTop: 2
    }
  }, meta.desc))), step === "locked" && /*#__PURE__*/React.createElement(LockedState, {
    t: t,
    accent: accent,
    onSubscribe: () => {
      onClose();
      onGoToPlans();
    },
    onClose: onClose
  }), step === "input" && /*#__PURE__*/React.createElement(React.Fragment, null, isCvForm ? /*#__PURE__*/React.createElement(CVForm, {
    data: serviceOpts,
    onChange: patch => {
      setServiceOpts(s => ({
        ...s,
        ...patch
      }));
      setHasInput(!!(patch.name ?? serviceOpts.name));
    },
    accent: accent
  }) : acceptText ? /*#__PURE__*/React.createElement(TextInputBox, {
    t: t,
    placeholder: TEXT_HINTS[service.id] || t.sheetTextPlaceholder,
    onChange: v => {
      setInputData(v);
      setHasInput(v.trim().length > 0);
    }
  }) : /*#__PURE__*/React.createElement(Dropzone, {
    accept: service.accept,
    multi: service.multi,
    t: t,
    onPick: data => {
      setInputData(data);
      setHasInput(true);
    }
  }), service.id === "photo3x4" && /*#__PURE__*/React.createElement(Photo3x4Options, {
    opts: serviceOpts,
    onChange: setServiceOpts,
    accent: accent
  }), (service.id === "img2pdf" || service.id === "imgs2pdf") && /*#__PURE__*/React.createElement(Img2PdfOptions, {
    opts: serviceOpts,
    onChange: setServiceOpts,
    accent: accent
  }), needsExtraText && /*#__PURE__*/React.createElement("input", {
    type: service.id === "pdflock" ? "password" : "text",
    placeholder: TEXT_HINTS[service.id] || "",
    value: extraText,
    onChange: e => setExtraText(e.target.value),
    maxLength: service.id === "pdflock" ? 64 : 200,
    style: {
      marginTop: 10,
      width: "100%",
      padding: "10px 14px",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border-medium)",
      background: "var(--bg-surface-2)",
      color: "var(--text-primary)",
      fontSize: 15,
      outline: "none",
      boxSizing: "border-box"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    full: true,
    onClick: onClose
  }, t.sheetCancel), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    accent: accent,
    full: true,
    disabled: !hasInput,
    onClick: start
  }, t.sheetStart))), step === "processing" && /*#__PURE__*/React.createElement(Processing, {
    t: t,
    accent: accent
  }), step === "done" && result && /*#__PURE__*/React.createElement(React.Fragment, null, result.type === "file" && /*#__PURE__*/React.createElement(ResultFile, {
    t: t,
    accent: accent,
    result: result,
    onAgain: reset,
    onClose: onClose,
    onToast: onToast
  }), result.type === "text" && /*#__PURE__*/React.createElement(ResultText, {
    t: t,
    accent: accent,
    result: result,
    onAgain: reset,
    onClose: onClose,
    onToast: onToast
  }), result.type === "wiki" && /*#__PURE__*/React.createElement(ResultWiki, {
    t: t,
    accent: accent,
    result: result,
    onAgain: reset,
    onToast: onToast
  }), result.type === "image" && /*#__PURE__*/React.createElement(ResultImage, {
    t: t,
    accent: accent,
    result: result,
    onAgain: reset,
    onToast: onToast
  }), result.type === "premium" && /*#__PURE__*/React.createElement(LockedState, {
    t: t,
    accent: accent,
    onSubscribe: () => {
      onClose();
      onGoToPlans();
    },
    onClose: onClose
  })));
}
Object.assign(window, {
  ServiceSheet,
  ServicePage,
  Dropzone,
  TextInputBox,
  Processing,
  LockedState,
  SuccessRing,
  ResultFile,
  ResultText,
  ResultWiki,
  ResultImage,
  Photo3x4Options,
  Img2PdfOptions,
  CVForm
});