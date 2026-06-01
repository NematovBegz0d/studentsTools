// EduBot — DocxEditPro (Word matn almashtirish)
// 2 ustunli ko'p qatorli UI: chap — qidirilayotgan matn, o'ng — almashtirish.
// Bir nechta juftlikni "+" tugmasi bilan qo'shsa bo'ladi.
// Backend /api/docxedit pairs JSON ni qabul qiladi.
"use strict";

const {
  useState: _deS,
  useRef: _deR,
  useCallback: _deC,
  useEffect: _deE,
} = React;

const DE_ACCENT = "#8b5cf6";
const DE_ACCENT_SOFT = "rgba(139,92,246,0.12)";
const DE_ACCENT_BD = "rgba(139,92,246,0.32)";
const DE_RED = "#f87171";
const DE_MAX_FILE_MB = 10;
const DE_MAX_FILE = DE_MAX_FILE_MB * 1024 * 1024;
const DE_MAX_PAIRS = 50;
const DE_MAX_LEN = 500;

function _deAuthHeaders() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return {};
  const h = {};
  if (tg.initData) h["X-Telegram-Init-Data"] = tg.initData;
  const uid = tg.initDataUnsafe?.user?.id;
  if (uid) h["X-User-Id"] = String(uid);
  return h;
}

// Pydantic 422 detail Array, generic object, yoki oddiy string bo'lishi mumkin.
// Hammasini foydalanuvchi-friendly bitta matnga aylantiramiz, "[object Object]"
// kabi chiqishlarni oldini olamiz.
function _deExtractError(j, status) {
  if (!j || typeof j !== "object") return `Server xatosi (${status})`;
  const raw = j.message ?? j.detail ?? j.error ?? j;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const parts = raw
      .map((e) => {
        if (!e) return "";
        if (typeof e === "string") return e;
        if (typeof e === "object") {
          const loc = Array.isArray(e.loc) ? e.loc.join(".") : "";
          const msg = e.msg || e.message || "";
          return [loc, msg].filter(Boolean).join(": ");
        }
        return String(e);
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (typeof raw === "object") {
    if (raw.msg) return raw.msg;
    if (raw.message) return raw.message;
    try {
      return JSON.stringify(raw).slice(0, 240);
    } catch (_) {}
  }
  return `Server xatosi (${status})`;
}

function _deDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function _deSendToBot(blob, filename, onToast) {
  const uid = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!uid || !window.BACKEND_URL) {
    onToast?.("Telegram ID topilmadi");
    return;
  }
  try {
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("filename", filename);
    const r = await fetch(`${window.BACKEND_URL}/api/send-file`, {
      method: "POST",
      headers: _deAuthHeaders(),
      body: form,
    });
    if (!r.ok) throw new Error("Yuborilmadi");
    onToast?.("Telegram botga yuborildi");
  } catch (e) {
    onToast?.("Yuborishda xato: " + (e.message || ""));
  }
}

// ─── Dropzone ────────────────────────────────────────────────────────
function _DocxDropzone({ file, onPick, onClear }) {
  const inputRef = _deR(null);
  const [dragOver, setDragOver] = _deS(false);
  const [err, setErr] = _deS(null);

  const validate = (f) => {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!["doc", "docx"].includes(ext)) {
      setErr(
        `Faqat .doc yoki .docx fayllar qabul qilinadi. Tanlangan: .${ext}`,
      );
      return false;
    }
    if (f.size === 0) {
      setErr("Tanlangan fayl bo'sh.");
      return false;
    }
    if (f.size > DE_MAX_FILE) {
      setErr(
        `Fayl ${(f.size / 1024 / 1024).toFixed(1)} MB. Maksimum ${DE_MAX_FILE_MB} MB.`,
      );
      return false;
    }
    setErr(null);
    return true;
  };

  const pick = (list) => {
    const f = list?.[0];
    if (!f) return;
    if (validate(f)) onPick(f);
  };

  if (file) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          background:
            "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.02))",
          border: "1px solid rgba(34,197,94,0.35)",
          borderRadius: 16,
          boxShadow: "0 4px 16px rgba(34,197,94,0.10)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: 11,
            background:
              "linear-gradient(135deg, rgba(34,197,94,0.25), rgba(34,197,94,0.10))",
            border: "0.5px solid rgba(34,197,94,0.40)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 4px 12px rgba(34,197,94,0.20)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l5 5L20 7"
              stroke="#4ade80"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              letterSpacing: -0.1,
            }}
          >
            {file.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 3,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 6px #22c55e",
              }}
            />
            {(file.size / 1024).toFixed(0)} KB · yuklash tayyor
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Faylni o'zgartirish"
          style={{
            background: "var(--bg-surface-2)",
            border: "0.5px solid var(--border-medium)",
            color: "var(--text-secondary)",
            padding: "8px 12px",
            borderRadius: 10,
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          O'zgartirish
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".doc,.docx"
        style={{ display: "none" }}
        onChange={(e) => pick(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pick(e.dataTransfer.files);
        }}
        style={{
          width: "100%",
          minHeight: 170,
          padding: "26px 22px",
          background: err
            ? "linear-gradient(135deg, rgba(248,113,113,0.10), rgba(248,113,113,0.02))"
            : dragOver
              ? `linear-gradient(135deg, ${DE_ACCENT}26, ${DE_ACCENT}08)`
              : "linear-gradient(180deg, var(--bg-surface-1), var(--bg-surface-2))",
          border: `1.5px dashed ${
            err
              ? "rgba(248,113,113,0.45)"
              : dragOver
                ? DE_ACCENT
                : "var(--border-medium)"
          }`,
          borderRadius: 20,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          font: "inherit",
          color: "var(--text-primary)",
          transition: "all 0.22s cubic-bezier(0.3, 0.7, 0.4, 1)",
          transform: dragOver ? "scale(1.01)" : "scale(1)",
          boxShadow: dragOver
            ? `0 10px 32px ${DE_ACCENT}30`
            : "0 1px 0 rgba(255,255,255,0.04) inset",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Yumshoq glow yuqorida */}
        {!err && (
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
                ? `radial-gradient(ellipse at center, ${DE_ACCENT}40, transparent 70%)`
                : `radial-gradient(ellipse at center, ${DE_ACCENT}1a, transparent 70%)`,
              pointerEvents: "none",
              transition: "opacity 0.22s",
            }}
          />
        )}
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            width: 56,
            height: 56,
            borderRadius: 16,
            background: err
              ? "linear-gradient(135deg, rgba(248,113,113,0.20), rgba(248,113,113,0.08))"
              : `linear-gradient(135deg, ${DE_ACCENT}38, ${DE_ACCENT}14)`,
            border: `1px solid ${err ? "rgba(248,113,113,0.40)" : DE_ACCENT_BD}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: err
              ? "0 6px 20px rgba(248,113,113,0.15)"
              : `0 6px 20px ${DE_ACCENT}30`,
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 16V4m0 0l-5 5m5-5l5 5M5 20h14"
              stroke={err ? "#fb7185" : DE_ACCENT}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: -0.2,
            position: "relative",
          }}
        >
          {err ? "Boshqa fayl tanlang" : "Word faylni shu yerga tashlang"}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--text-muted)",
            fontWeight: 500,
            position: "relative",
          }}
        >
          yoki bosib tanlang
        </div>
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            fontWeight: 600,
            background: "var(--bg-surface-2)",
            border: "0.5px solid var(--border-subtle)",
            padding: "4px 10px",
            borderRadius: 99,
            marginTop: 4,
            position: "relative",
          }}
        >
          .DOC · .DOCX · Maks {DE_MAX_FILE_MB} MB
        </div>
        {err && (
          <div
            style={{
              fontSize: 11.5,
              color: DE_RED,
              marginTop: 4,
              textAlign: "center",
            }}
          >
            {err}
          </div>
        )}
      </button>
    </div>
  );
}

// ─── Matn maydoni (fokus holatli textarea) ──────────────────────────
// Ham "qidirish", ham "almashtirish" uchun ishlatiladi. Fokusda accent
// ramka + yumshoq halqa (glow) chiqadi, pastda belgi hisoblagichi ko'rinadi.
function _DeField({ value, onChange, placeholder, label, dot, accentColor }) {
  const [focused, setFocused] = _deS(false);
  const ac = accentColor || DE_ACCENT;
  const near = value.length > DE_MAX_LEN * 0.8;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: focused ? ac : "var(--text-muted)",
          transition: "color 0.15s",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dot,
            opacity: value.trim() ? 1 : 0.4,
            transition: "opacity 0.15s",
          }}
        />
        {label}
      </label>
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={DE_MAX_LEN}
        rows={2}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          padding: "9px 11px",
          background: focused ? "var(--bg-surface-1)" : "var(--bg-surface-2)",
          border: `1px solid ${focused ? ac : "var(--border-medium)"}`,
          borderRadius: 10,
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: "inherit",
          lineHeight: 1.45,
          outline: "none",
          resize: "vertical",
          minHeight: 42,
          boxSizing: "border-box",
          boxShadow: focused ? `0 0 0 3px ${ac}22` : "none",
          transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
        }}
      />
      <div
        style={{
          fontSize: 9.5,
          textAlign: "right",
          color: near ? DE_RED : "var(--text-faint)",
          fontVariantNumeric: "tabular-nums",
          height: 12,
          opacity: focused || near ? 1 : 0,
          transition: "opacity 0.15s",
        }}
      >
        {value.length}/{DE_MAX_LEN}
      </div>
    </div>
  );
}

// ─── Pair Row (chap | o'ng) ─────────────────────────────────────────
function _PairRow({ idx, pair, onChange, onRemove, canRemove, accentColor }) {
  const _hasContent = !!pair.find?.trim();
  const ac = accentColor || DE_ACCENT;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 8,
        padding: "12px 12px",
        background: _hasContent
          ? `linear-gradient(135deg, ${DE_ACCENT_SOFT}, var(--bg-surface-1) 60%)`
          : "var(--bg-surface-1)",
        border: `0.5px solid ${_hasContent ? DE_ACCENT_BD : "var(--border-subtle)"}`,
        borderRadius: 14,
        transition: "all 0.18s",
      }}
    >
      {/* tartib raqami */}
      <div
        aria-hidden="true"
        style={{
          minWidth: 26,
          height: 26,
          borderRadius: 8,
          background: _hasContent
            ? `linear-gradient(135deg, ${ac}, ${ac}cc)`
            : `linear-gradient(135deg, ${ac}33, ${ac}11)`,
          color: _hasContent ? "#fff" : ac,
          fontSize: 11.5,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "flex-start",
          marginTop: 22,
          fontVariantNumeric: "tabular-nums",
          boxShadow: _hasContent
            ? `0 4px 12px ${ac}45`
            : `0 2px 8px ${ac}20`,
          transition: "all 0.18s",
        }}
      >
        {idx + 1}
      </div>

      {/* chap ustun: qidirish */}
      <_DeField
        label="Qidirish"
        dot={DE_RED}
        accentColor={ac}
        value={pair.find}
        onChange={(e) => onChange(idx, "find", e.target.value)}
        placeholder="Word'da turgan matn"
      />

      {/* o'rtadagi strelka */}
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 18,
          color: _hasContent ? ac : "var(--text-faint)",
          flexShrink: 0,
          transition: "color 0.18s",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12h15m0 0l-5.5-5.5M19 12l-5.5 5.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* o'ng ustun: almashtirish */}
      <_DeField
        label="Almashtirish"
        dot="#22c55e"
        accentColor={ac}
        value={pair.replace}
        onChange={(e) => onChange(idx, "replace", e.target.value)}
        placeholder="Yangi matn (bo'sh = o'chirish)"
      />

      {/* o'chirish tugmasi */}
      <button
        type="button"
        onClick={() => onRemove(idx)}
        disabled={!canRemove}
        aria-label="Qatorni o'chirish"
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: canRemove ? "rgba(248,113,113,0.10)" : "transparent",
          border: `0.5px solid ${canRemove ? "rgba(248,113,113,0.30)" : "var(--border-subtle)"}`,
          color: canRemove ? DE_RED : "var(--text-faint)",
          cursor: canRemove ? "pointer" : "default",
          alignSelf: "flex-start",
          marginTop: 22,
          fontSize: 14,
          flexShrink: 0,
          transition: "all 0.15s",
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Asosiy komponent ────────────────────────────────────────────────
function DocxEditPro({ t, accent, onToast }) {
  const [file, setFile] = _deS(null);
  const [pairs, setPairs] = _deS([{ find: "", replace: "" }]);
  const [caseSensitive, setCaseSensitive] = _deS(false);
  const [step, setStep] = _deS("input"); // input | processing | done | error
  const [result, setResult] = _deS(null);
  const [errorMsg, setErrorMsg] = _deS(null);

  const updatePair = _deC((i, field, val) => {
    setPairs((prev) =>
      prev.map((p, j) => (j === i ? { ...p, [field]: val } : p)),
    );
  }, []);

  const addPair = _deC(() => {
    setPairs((prev) =>
      prev.length < DE_MAX_PAIRS ? [...prev, { find: "", replace: "" }] : prev,
    );
  }, []);

  const removePair = _deC((i) => {
    setPairs((prev) =>
      prev.length > 1 ? prev.filter((_, j) => j !== i) : prev,
    );
  }, []);

  const reset = _deC(() => {
    setFile(null);
    setPairs([{ find: "", replace: "" }]);
    setCaseSensitive(false);
    setStep("input");
    setResult(null);
    setErrorMsg(null);
  }, []);

  const validPairs = pairs.filter((p) => p.find.trim());
  const canStart = !!file && validPairs.length > 0;

  const start = _deC(async () => {
    if (!canStart || !window.BACKEND_URL) return;
    setStep("processing");
    setErrorMsg(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("pairs", JSON.stringify(validPairs));
      form.append("case_sensitive", caseSensitive ? "true" : "false");
      // Orqaga moslik: eski backend faqat find/replace qabul qiladi.
      // Birinchi juftlikni shu yo'l bilan ham yuboramiz — eski backend ham,
      // yangisi ham ishlasin. Yangi backend pairs'ni ustuvor sanaydi.
      if (validPairs[0]) {
        form.append("find", validPairs[0].find || "");
        form.append("replace", validPairs[0].replace || "");
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);

      let resp;
      try {
        resp = await fetch(`${window.BACKEND_URL}/api/docxedit`, {
          method: "POST",
          headers: _deAuthHeaders(),
          body: form,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!resp.ok) {
        let msg = `Server xatosi (${resp.status})`;
        try {
          const j = await resp.json();
          msg = _deExtractError(j, resp.status);
        } catch (_) {}
        // 422 (Pydantic validation) — backend hali eski versiyada bo'lsa,
        // sodda tushuntirish beramiz.
        if (resp.status === 422 && /find|replace/i.test(msg)) {
          msg =
            "Server hali eski versiyada. Iltimos, biroz keyin urinib ko'ring " +
            "(backend yangilanmoqda).";
        }
        throw new Error(msg);
      }

      const blob = await resp.blob();
      const info =
        resp.headers.get("X-Info") ||
        `${validPairs.length} ta juftlik qo'llandi`;
      const orig = (file.name || "document").replace(/\.[^.]+$/, "");
      setResult({ blob, filename: `${orig}_edited.docx`, info });
      setStep("done");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    } catch (e) {
      const msg =
        e.name === "AbortError"
          ? "So'rov vaqti tugadi (60s). Internet aloqasini tekshiring."
          : e.message || "Kutilmagan xato. Qayta urinib ko'ring.";
      setErrorMsg(msg);
      setStep("error");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    }
  }, [file, validPairs, caseSensitive, canStart]);

  // ─── PROCESSING ───────────────────────────────────────────────────
  if (step === "processing") {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 18px" }} />
        <div
          style={{
            color: "var(--text-primary)",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Word fayl ishlanmoqda
        </div>
        <div
          style={{ color: "var(--text-muted)", fontSize: 12.5, marginTop: 4 }}
        >
          {validPairs.length} ta juftlik qo'llanmoqda…
        </div>
      </div>
    );
  }

  // ─── ERROR ────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          padding: "32px 16px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(239,68,68,0.14)",
            border: "1px solid rgba(239,68,68,0.30)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
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
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Xatolik yuz berdi
        </div>
        <div
          style={{
            color: "var(--text-secondary)",
            fontSize: 13,
            lineHeight: 1.5,
            textAlign: "center",
            whiteSpace: "pre-wrap",
            maxWidth: 420,
          }}
        >
          {errorMsg}
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button
            type="button"
            onClick={reset}
            style={{
              flex: 1,
              padding: "11px 14px",
              borderRadius: 12,
              background: "var(--bg-surface-2)",
              border: "0.5px solid var(--border-medium)",
              color: "var(--text-primary)",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Yopish
          </button>
          <button
            type="button"
            onClick={() => setStep("input")}
            style={{
              flex: 1,
              padding: "11px 14px",
              borderRadius: 12,
              background: accent || DE_ACCENT,
              border: "none",
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Qayta urinish
          </button>
        </div>
      </div>
    );
  }

  // ─── DONE ─────────────────────────────────────────────────────────
  // Layout: natija vertikal o'rtada, tugmalar pastda — mobil-friendly
  // "success" sahifa ko'rinishi.
  if (step === "done" && result) {
    return (
      <div
        style={{
          minHeight: "70vh",
          padding: "20px 16px 24px",
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
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 28px rgba(34,197,94,0.18)",
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
              marginTop: 2,
            }}
          >
            Tayyor!
          </div>
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
          {/* Fayl ma'lumoti */}
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
            <span aria-hidden="true">📄</span>
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
            <span style={{ color: "var(--text-faint)" }}>
              {Math.max(1, Math.round(result.blob.size / 1024))} KB
            </span>
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
              onClick={reset}
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
              Yana ishlash
            </button>
            <button
              type="button"
              onClick={() => _deDownload(result.blob, result.filename)}
              style={{
                flex: 1,
                padding: "13px 14px",
                borderRadius: 14,
                background: accent || DE_ACCENT,
                border: "none",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: `0 6px 18px ${(accent || DE_ACCENT) + "40"}`,
              }}
            >
              Yuklab olish
            </button>
          </div>
          <button
            type="button"
            onClick={() => _deSendToBot(result.blob, result.filename, onToast)}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              background: "var(--bg-surface-1)",
              border: "0.5px solid var(--border-light)",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span aria-hidden="true">✈️</span>
            Telegram botga yuborish
          </button>
        </div>
      </div>
    );
  }

  // ─── INPUT ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        padding: "8px 16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Fayl yuklash */}
      <_DocxDropzone
        file={file}
        onPick={setFile}
        onClear={() => setFile(null)}
      />

      {/* Almashtirish ro'yxati */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          Almashtirishlar · {pairs.length}/{DE_MAX_PAIRS}
        </div>
        <button
          type="button"
          onClick={addPair}
          disabled={pairs.length >= DE_MAX_PAIRS}
          aria-label="Yangi almashtirish qatori qo'shish"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 11px",
            borderRadius: 99,
            background:
              pairs.length >= DE_MAX_PAIRS
                ? "var(--bg-surface-1)"
                : DE_ACCENT_SOFT,
            border: `0.5px solid ${pairs.length >= DE_MAX_PAIRS ? "var(--border-subtle)" : DE_ACCENT_BD}`,
            color:
              pairs.length >= DE_MAX_PAIRS ? "var(--text-faint)" : DE_ACCENT,
            cursor: pairs.length >= DE_MAX_PAIRS ? "default" : "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Qo'shish
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pairs.map((p, i) => (
          <_PairRow
            key={i}
            idx={i}
            pair={p}
            onChange={updatePair}
            onRemove={removePair}
            canRemove={pairs.length > 1}
            accentColor={accent || DE_ACCENT}
          />
        ))}
      </div>

      {/* Case sensitivity */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          background: "var(--bg-surface-1)",
          border: "0.5px solid var(--border-subtle)",
          borderRadius: 12,
          cursor: "pointer",
          fontSize: 13,
          color: "var(--text-secondary)",
        }}
      >
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
          style={{ accentColor: accent || DE_ACCENT, width: 16, height: 16 }}
        />
        <span>Katta/kichik harf farqlash (case sensitive)</span>
      </label>

      {/* Tugmalar */}
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button
          type="button"
          onClick={reset}
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--bg-surface-2)",
            border: "0.5px solid var(--border-medium)",
            color: "var(--text-primary)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Tozalash
        </button>
        <button
          type="button"
          onClick={start}
          disabled={!canStart}
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 12,
            background: canStart ? accent || DE_ACCENT : "var(--bg-surface-2)",
            border: "none",
            color: canStart ? "#fff" : "var(--text-faint)",
            fontSize: 14,
            fontWeight: 700,
            cursor: canStart ? "pointer" : "default",
            transition: "background 0.18s",
          }}
        >
          Boshlash
        </button>
      </div>

      {!file && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-faint)",
            textAlign: "center",
          }}
        >
          Avval Word faylni yuklang
        </div>
      )}
      {file && validPairs.length === 0 && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-faint)",
            textAlign: "center",
          }}
        >
          Kamida bitta "Qidirish" matni kiriting
        </div>
      )}
    </div>
  );
}

Object.assign(window, { DocxEditPro });
