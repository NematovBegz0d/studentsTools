// EduBot — DeadlinePro (CLIENT-SIDE, pure JS)
// ✅ Backend ishlatilmaydi — sana hisob-kitobi browserda
// Input: DD.MM.YYYY yoki YYYY-MM-DD (har qatorda bir sana, ixtiyoriy nom)
// Output: real-vaqtli ortga sanash (har soniyada yangilanadi)

"use strict";

const {
  useState:    _useS,
  useEffect:   _useE,
  useCallback: _useC,
} = React;

// ─── Sana tahlili ─────────────────────────────────────────────────
function _parseDate(raw) {
  const s = raw.trim();
  let m;
  // DD.MM.YYYY
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59);
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59);
  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59);
  return null;
}

function _countdown(target) {
  const diff = target - Date.now();
  if (diff <= 0) return { past: true, d: 0, h: 0, m: 0, s: 0 };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { past: false, d, h, m, s };
}

function _urgencyColor(cd) {
  if (cd.past)      return "#94a3b8"; // o'tib ketdi — kulrang
  if (cd.d > 30)    return "#10b981"; // yashil — uzoq
  if (cd.d > 7)     return "#f59e0b"; // sariq — yaqinlashmoqda
  if (cd.d >= 1)    return "#f87171"; // qizil — juda yaqin
  return "#ef4444";                   // qoʻngʻiroq qizil — bugun!
}

// ─── Countdown Card ───────────────────────────────────────────────
function CountdownCard({ entry }) {
  const [cd, setCd] = _useS(() => _countdown(entry.date));
  _useE(() => {
    if (cd.past) return;
    const id = setInterval(() => setCd(_countdown(entry.date)), 1000);
    return () => clearInterval(id);
  }, [entry.date, cd.past]);

  const color = _urgencyColor(cd);
  const dateStr = entry.date.toLocaleDateString("uz-UZ", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const pads = n => String(n).padStart(2, "0");

  return (
    <div style={{
      marginTop: 12, background: "var(--bg-surface-1)",
      borderRadius: 14, padding: "14px 16px",
      border: `1.5px solid ${color}44`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
          {entry.label}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{dateStr}</span>
      </div>

      {cd.past ? (
        <div style={{ fontSize: 15, fontWeight: 700, color: color }}>
          ✅ Muddati o'tib ketdi
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            {[["Kun", cd.d], ["Soat", pads(cd.h)], ["Daqiqa", pads(cd.m)], ["Soniya", pads(cd.s)]].map(
              ([lbl, val]) => (
                <div
                  key={lbl}
                  style={{
                    flex: 1, textAlign: "center",
                    background: color + "14", borderRadius: 10,
                    padding: "8px 4px", border: `1px solid ${color}28`,
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>
                    {val}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>{lbl}</div>
                </div>
              )
            )}
          </div>
          {cd.d === 0 && (
            <div style={{
              marginTop: 8, textAlign: "center", fontSize: 12.5,
              fontWeight: 700, color, letterSpacing: 0.3,
            }}>
              🔔 Bugun!
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────
function DeadlinePro({ t, accent, onToast }) {
  const [input, setInput] = _useS("");
  const [entries, setEntries] = _useS([]);
  const [err, setErr]         = _useS("");

  const compute = _useC(() => {
    setErr("");
    const lines = input.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) { setErr("Sana kiriting"); return; }
    const parsed = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const rawDate = parts[0];
      const label   = parts.slice(1).join(" ") || rawDate;
      const date    = _parseDate(rawDate);
      if (!date || isNaN(date.getTime())) {
        setErr(`Sana o'qilmadi: "${rawDate}"\nFormat: DD.MM.YYYY yoki YYYY-MM-DD`);
        return;
      }
      parsed.push({ date, label });
    }
    setEntries(parsed.sort((a, b) => a.date - b.date));
  }, [input]);

  return (
    <div style={{ padding: "16px 16px 32px" }}>
      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={"31.12.2025 Imtihon\n2026-03-08 Bahor bayrami\n15.05.2026 Kurs ishi"}
        style={{
          width: "100%", height: 90, padding: "10px 12px",
          borderRadius: 12, border: "1px solid var(--border-subtle)",
          background: "var(--bg-surface-1)", color: "var(--text-primary)",
          fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "monospace",
          lineHeight: 1.6,
        }}
      />
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 5 }}>
        Har qatorda bir sana. Format: DD.MM.YYYY yoki YYYY-MM-DD — so'ng ixtiyoriy nom
      </div>
      {err && (
        <div style={{ color: "#f87171", fontSize: 13, marginTop: 6, whiteSpace: "pre-line" }}>
          {err}
        </div>
      )}
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
        ⏰ Hisoblash
      </button>

      {entries.map(entry => (
        <CountdownCard key={entry.date.getTime() + entry.label} entry={entry} />
      ))}
    </div>
  );
}

Object.assign(window, { DeadlinePro });
