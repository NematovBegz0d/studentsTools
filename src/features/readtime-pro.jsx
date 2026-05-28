// EduBot — ReadTimePro (CLIENT-SIDE, pure JS)
// ✅ Backend ishlatilmaydi — hamma hisob-kitob browserda
// Input: istalgan matn
// Output: o'qish vaqti + so'z/belgi/jumla/xat boshi soni

"use strict";

const {
  useState:    _useS,
  useCallback: _useC,
} = React;

const WPM = 200; // O'zbek o'rtacha o'qish tezligi (so'z/daqiqa)

function _analyze(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Matn kiriting");

  const words      = trimmed.split(/\s+/).filter(Boolean).length;
  const chars      = trimmed.length;
  const charsNoSp  = trimmed.replace(/\s/g, "").length;
  const sentences  = (trimmed.match(/[.!?…]+/g) || []).length || 1;
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length || 1;

  const totalMin = words / WPM;
  const m = Math.floor(totalMin);
  const s = Math.round((totalMin - m) * 60);
  return { words, chars, charsNoSp, sentences, paragraphs, m, s };
}

function _timeLabel(m, s) {
  if (m === 0 && s < 10) return "1 daqiqadan kam";
  const parts = [];
  if (m > 0)  parts.push(`${m} daqiqa`);
  if (s > 0)  parts.push(`${s} soniya`);
  return parts.join(" ");
}

function ReadTimePro({ t, accent, onToast }) {
  const [input, setInput] = _useS("");
  const [result, setResult] = _useS(null);
  const [err, setErr] = _useS("");

  const compute = _useC(() => {
    setErr(""); setResult(null);
    try { setResult(_analyze(input)); }
    catch (e) { setErr(e.message); }
  }, [input]);

  const copy = _useC(() => {
    if (!result) return;
    const { m, s, words, chars, charsNoSp, sentences, paragraphs } = result;
    const text = [
      `O'qish vaqti: ${_timeLabel(m, s)}`,
      `So'z soni: ${words.toLocaleString()}`,
      `Belgilar: ${chars.toLocaleString()} (bo'sh joysiz: ${charsNoSp.toLocaleString()})`,
      `Jumlalar: ${sentences}`,
      `Xat boshlari: ${paragraphs}`,
    ].join("\n");
    navigator.clipboard?.writeText(text).then(() => onToast?.("✅ Nusxalandi"));
  }, [result, onToast]);

  return (
    <div style={{ padding: "16px 16px 32px" }}>
      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Matnni shu yerga yozing yoki joylashtiring..."
        style={{
          width: "100%", height: 130, padding: "10px 12px",
          borderRadius: 12, border: "1px solid var(--border-subtle)",
          background: "var(--bg-surface-1)", color: "var(--text-primary)",
          fontSize: 15, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit",
          lineHeight: 1.55,
        }}
      />
      {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 6 }}>{err}</div>}

      <button
        onClick={compute}
        disabled={!input.trim()}
        style={{
          marginTop: 10, width: "100%", padding: "13px 0",
          background: accent, color: "#000", borderRadius: 12,
          border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer",
          opacity: input.trim() ? 1 : 0.45,
        }}
      >
        ⏱️ Hisoblash
      </button>

      {result && (
        <div style={{
          marginTop: 14, background: "var(--bg-surface-1)",
          borderRadius: 12, padding: "16px 16px",
          border: "1px solid var(--border-subtle)",
        }}>
          {/* Reading time hero */}
          <div style={{
            textAlign: "center", padding: "10px 0 14px",
            borderBottom: "1px solid var(--border-subtle)", marginBottom: 14,
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: accent }}>
              ⏱️ {_timeLabel(result.m, result.s)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              ~{WPM} so'z/daqiqa tezligida
            </div>
          </div>

          {[
            ["So'z soni",       result.words.toLocaleString()],
            ["Belgilar",        result.chars.toLocaleString()],
            ["Bo'sh joysiz",    result.charsNoSp.toLocaleString()],
            ["Jumlalar",        result.sentences],
            ["Xat boshlari",    result.paragraphs],
          ].map(([label, val]) => (
            <div
              key={label}
              style={{
                display: "flex", justifyContent: "space-between",
                marginBottom: 8, fontSize: 14,
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>{label}</span>
              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{val}</span>
            </div>
          ))}

          <button
            onClick={copy}
            style={{
              marginTop: 8, width: "100%", padding: "10px 0",
              background: accent + "1a", color: accent,
              border: `1px solid ${accent}55`, borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            📋 Nusxalash
          </button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ReadTimePro });
