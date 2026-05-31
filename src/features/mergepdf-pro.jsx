// EduBot — MergePdfPro (PDF birlashtirish)
// Yuklangan PDF fayllarning ro'yxati: har birida ↑/↓/× tugmalar.
// "+ Yana fayl qo'shish" bilan qo'shimcha fayl qo'shsa bo'ladi.
// Backend /api/mergepdf ga fayllarni tartiblangan ko'rinishda yuboradi.
"use strict";

const {
  useState:    _mpS,
  useRef:      _mpR,
  useCallback: _mpC,
} = React;

const MP_ACCENT       = "#8b5cf6";
const MP_ACCENT_SOFT  = "rgba(139,92,246,0.12)";
const MP_ACCENT_BD    = "rgba(139,92,246,0.32)";
const MP_RED          = "#f87171";
const MP_MAX_FILE_MB  = 10;
const MP_MAX_FILE     = MP_MAX_FILE_MB * 1024 * 1024;
const MP_MAX_FILES    = 30;
const MP_MAX_TOTAL_MB = 60;

function _mpAuthHeaders() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return {};
  const h = {};
  if (tg.initData) h["X-Telegram-Init-Data"] = tg.initData;
  const uid = tg.initDataUnsafe?.user?.id;
  if (uid) h["X-User-Id"] = String(uid);
  return h;
}

function _mpExtractError(j, status) {
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
    try { return JSON.stringify(raw).slice(0, 240); } catch (_) {}
  }
  return `Server xatosi (${status})`;
}

function _mpDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function _mpSendToBot(blob, filename, onToast) {
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
      headers: _mpAuthHeaders(),
      body: form,
    });
    if (!r.ok) throw new Error("Yuborilmadi");
    onToast?.("Telegram botga yuborildi");
  } catch (e) {
    onToast?.("Yuborishda xato: " + (e.message || ""));
  }
}

// PDF magic-bytes tekshiruvi
async function _mpIsPdf(file) {
  try {
    const buf = await file.slice(0, 4).arrayBuffer();
    const head = String.fromCharCode(...new Uint8Array(buf));
    return head === "%PDF";
  } catch (_) {
    return false;
  }
}

// ─── Add files button (dropzone) ────────────────────────────────────
function _MpAdder({ count, onAdd }) {
  const inputRef = _mpR(null);
  const [dragOver, setDragOver] = _mpS(false);
  const isEmpty = count === 0;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        multiple
        style={{ display: "none" }}
        onChange={(e) => onAdd(Array.from(e.target.files || []))}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onAdd(Array.from(e.dataTransfer.files || []));
        }}
        style={{
          width: "100%",
          minHeight: isEmpty ? 160 : 64,
          padding: isEmpty ? 22 : 14,
          background: dragOver ? MP_ACCENT_SOFT : "var(--bg-surface-1)",
          border: `1.5px dashed ${dragOver ? MP_ACCENT : "var(--border-medium)"}`,
          borderRadius: 18,
          cursor: "pointer",
          display: "flex",
          flexDirection: isEmpty ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: isEmpty ? 8 : 10,
          font: "inherit",
          color: "var(--text-primary)",
        }}
      >
        {isEmpty ? (
          <>
            <div
              aria-hidden="true"
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                background: MP_ACCENT_SOFT,
                border: `1px solid ${MP_ACCENT_BD}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v12m0-12l-4 4m4-4l4 4M5 21h14"
                  stroke={MP_ACCENT} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              PDF fayllarni shu yerga tashlang
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              yoki bosib tanlang (bir nechta fayl)
            </div>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: "var(--text-faint)",
              }}
            >
              .PDF · Har biri maks {MP_MAX_FILE_MB} MB · Jami maks {MP_MAX_TOTAL_MB} MB
            </div>
          </>
        ) : (
          <>
            <div
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: MP_ACCENT_SOFT,
                color: MP_ACCENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              +
            </div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Yana PDF qo'shish
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                Tanlangan: {count} ta · Maksimum {MP_MAX_FILES} ta
              </div>
            </div>
          </>
        )}
      </button>
    </div>
  );
}

// ─── PDF File Row ───────────────────────────────────────────────────
function _PdfRow({ idx, item, total, onMove, onRemove }) {
  const upDisabled   = idx === 0;
  const downDisabled = idx === total - 1;
  const btnStyle = (disabled, color) => ({
    width: 28,
    height: 28,
    borderRadius: 7,
    background: disabled ? "transparent" : "var(--bg-surface-2)",
    border: `0.5px solid ${disabled ? "var(--border-subtle)" : "var(--border-medium)"}`,
    color: disabled ? "var(--text-faint)" : color || "var(--text-secondary)",
    cursor: disabled ? "default" : "pointer",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        background: "var(--bg-surface-1)",
        border: "0.5px solid var(--border-subtle)",
        borderRadius: 12,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          minWidth: 24,
          height: 24,
          borderRadius: 7,
          background: MP_ACCENT_SOFT,
          color: MP_ACCENT,
          fontSize: 11,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {idx + 1}
      </div>
      <div
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: "rgba(239,68,68,0.10)",
          border: "0.5px solid rgba(239,68,68,0.20)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          flexShrink: 0,
        }}
      >
        📕
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.file.name}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>
          {(item.file.size / 1024).toFixed(0)} KB
        </div>
      </div>
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        <button type="button" onClick={() => onMove(idx, -1)} disabled={upDisabled}
          aria-label="Yuqoriga" style={btnStyle(upDisabled)}>↑</button>
        <button type="button" onClick={() => onMove(idx, +1)} disabled={downDisabled}
          aria-label="Pastga" style={btnStyle(downDisabled)}>↓</button>
        <button type="button" onClick={() => onRemove(idx)}
          aria-label="O'chirish" style={btnStyle(false, MP_RED)}>×</button>
      </div>
    </div>
  );
}

// ─── Asosiy komponent ────────────────────────────────────────────────
function MergePdfPro({ t, accent, onToast }) {
  const [items, setItems] = _mpS([]); // [{file}]
  const [pickError, setPickError] = _mpS(null);
  const [step, setStep] = _mpS("input");
  const [result, setResult] = _mpS(null);
  const [errorMsg, setErrorMsg] = _mpS(null);

  const addFiles = _mpC(async (raw) => {
    if (!raw || !raw.length) return;
    setPickError(null);
    const errors = [];
    const accepted = [];
    for (const f of raw) {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (ext !== "pdf") {
        errors.push(`${f.name}: faqat .pdf qabul qilinadi`);
        continue;
      }
      if (f.size === 0) {
        errors.push(`${f.name}: fayl bo'sh`);
        continue;
      }
      if (f.size > MP_MAX_FILE) {
        errors.push(`${f.name}: ${(f.size / 1024 / 1024).toFixed(1)} MB > ${MP_MAX_FILE_MB} MB`);
        continue;
      }
      const ok = await _mpIsPdf(f);
      if (!ok) {
        errors.push(`${f.name}: PDF formatida emas`);
        continue;
      }
      accepted.push({ file: f });
    }
    if (errors.length) setPickError(errors.slice(0, 3).join(" · "));

    setItems((prev) => {
      const next = [...prev, ...accepted];
      if (next.length > MP_MAX_FILES) {
        setPickError(`Maksimal ${MP_MAX_FILES} ta fayl. Ortig'i quvib o'tkazildi.`);
        return next.slice(0, MP_MAX_FILES);
      }
      const totalMb = next.reduce((s, it) => s + it.file.size, 0) / 1024 / 1024;
      if (totalMb > MP_MAX_TOTAL_MB) {
        setPickError(`Fayllarning jami hajmi ${totalMb.toFixed(1)} MB > ${MP_MAX_TOTAL_MB} MB`);
      }
      return next;
    });
  }, []);

  const moveItem = _mpC((idx, dir) => {
    setItems((prev) => {
      const tgt = idx + dir;
      if (tgt < 0 || tgt >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[tgt]] = [next[tgt], next[idx]];
      return next;
    });
  }, []);

  const removeItem = _mpC((idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearAll = _mpC(() => {
    setItems([]);
    setPickError(null);
  }, []);

  const reset = _mpC(() => {
    setItems([]);
    setPickError(null);
    setStep("input");
    setResult(null);
    setErrorMsg(null);
  }, []);

  const totalMb = items.reduce((s, it) => s + it.file.size, 0) / 1024 / 1024;
  const canStart = items.length >= 2 && totalMb <= MP_MAX_TOTAL_MB;

  const start = _mpC(async () => {
    if (!canStart || !window.BACKEND_URL) return;
    setStep("processing");
    setErrorMsg(null);

    try {
      const form = new FormData();
      for (const it of items) form.append("files", it.file);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);

      let resp;
      try {
        resp = await fetch(`${window.BACKEND_URL}/api/mergepdf`, {
          method: "POST",
          headers: _mpAuthHeaders(),
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
          msg = _mpExtractError(j, resp.status);
        } catch (_) {}
        throw new Error(msg);
      }

      const blob = await resp.blob();
      const info = resp.headers.get("X-Info") || `${items.length} ta PDF birlashtirildi`;
      setResult({ blob, filename: "merged.pdf", info });
      setStep("done");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    } catch (e) {
      const msg =
        e.name === "AbortError"
          ? "So'rov vaqti tugadi (90s). Internet aloqasini tekshiring."
          : e.message || "Kutilmagan xato. Qayta urinib ko'ring.";
      setErrorMsg(msg);
      setStep("error");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    }
  }, [items, canStart]);

  // ─── PROCESSING ───────────────────────────────────────────────────
  if (step === "processing") {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 18px" }} />
        <div style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 600 }}>
          PDF fayllar birlashtirilmoqda
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 12.5, marginTop: 4 }}>
          {items.length} ta fayl birlashtirilyapti…
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
            <path d="M12 8v5M12 17h.01" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="2" fill="none" />
          </svg>
        </div>
        <div style={{ color: "var(--text-primary)", fontSize: 16, fontWeight: 700 }}>
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
          <button type="button" onClick={reset}
            style={{
              flex: 1, padding: "11px 14px", borderRadius: 12,
              background: "var(--bg-surface-2)",
              border: "0.5px solid var(--border-medium)",
              color: "var(--text-primary)", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            }}>
            Yopish
          </button>
          <button type="button" onClick={() => setStep("input")}
            style={{
              flex: 1, padding: "11px 14px", borderRadius: 12,
              background: accent || MP_ACCENT,
              border: "none", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            }}>
            Qayta urinish
          </button>
        </div>
      </div>
    );
  }

  // ─── DONE ─────────────────────────────────────────────────────────
  if (step === "done" && result) {
    return (
      <div
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
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(34,197,94,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path d="M5 12l5 5L20 7" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ color: "var(--text-primary)", fontSize: 16, fontWeight: 700 }}>
          Tayyor!
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 12.5, textAlign: "center" }}>
          {result.info}
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button type="button" onClick={reset}
            style={{
              flex: 1, padding: "11px 14px", borderRadius: 12,
              background: "var(--bg-surface-2)",
              border: "0.5px solid var(--border-medium)",
              color: "var(--text-primary)", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            }}>
            Yana ishlash
          </button>
          <button type="button" onClick={() => _mpDownload(result.blob, result.filename)}
            style={{
              flex: 1, padding: "11px 14px", borderRadius: 12,
              background: accent || MP_ACCENT,
              border: "none", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            }}>
            Yuklab olish
          </button>
        </div>
        <button type="button" onClick={() => _mpSendToBot(result.blob, result.filename, onToast)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 12,
            background: "var(--bg-surface-1)",
            border: "0.5px solid var(--border-light)",
            color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}>
          Telegram botga yuborish
        </button>
      </div>
    );
  }

  // ─── INPUT ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "8px 16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <_MpAdder count={items.length} onAdd={addFiles} />

      {pickError && (
        <div
          role="alert"
          style={{
            fontSize: 12, color: MP_RED, padding: "8px 12px",
            background: "rgba(248,113,113,0.08)",
            border: "0.5px solid rgba(248,113,113,0.25)",
            borderRadius: 10,
          }}
        >
          {pickError}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                textTransform: "uppercase", color: "var(--text-muted)",
              }}
            >
              Tartib · {items.length} ta · {totalMb.toFixed(1)} MB
            </div>
            <button
              type="button"
              onClick={clearAll}
              style={{
                background: "transparent", border: "none",
                color: MP_RED, fontSize: 11.5, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Hammasini tozalash
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((it, i) => (
              <_PdfRow
                key={it.file.name + i + it.file.size}
                idx={i}
                item={it}
                total={items.length}
                onMove={moveItem}
                onRemove={removeItem}
              />
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={start}
        disabled={!canStart}
        style={{
          padding: "13px 14px",
          borderRadius: 12,
          background: canStart ? (accent || MP_ACCENT) : "var(--bg-surface-2)",
          border: "none",
          color: canStart ? "#fff" : "var(--text-faint)",
          fontSize: 14,
          fontWeight: 700,
          cursor: canStart ? "pointer" : "default",
          marginTop: 4,
        }}
      >
        Birlashtirish
      </button>

      {items.length < 2 && items.length > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--text-faint)", textAlign: "center" }}>
          Birlashtirish uchun kamida 2 ta PDF kerak
        </div>
      )}
      {totalMb > MP_MAX_TOTAL_MB && (
        <div style={{ fontSize: 11.5, color: MP_RED, textAlign: "center" }}>
          Jami hajm {MP_MAX_TOTAL_MB} MB dan oshib ketdi. Ba'zilarini olib tashlang.
        </div>
      )}
    </div>
  );
}

Object.assign(window, { MergePdfPro });
