// EduBot — PasswordPro (CLIENT-SIDE, Web Crypto API)
// ✅ Backend ishlatilmaydi — crypto.getRandomValues() bilan browserda
// Options: uzunlik (6-64), katta/kichik harf, raqam, maxsus belgilar
// Output: kriptografik jihatdan xavfsiz parol(lar)

"use strict";

const {
  useState:    _useS,
  useCallback: _useC,
  useMemo:     _useM,
} = React;

// ─── Belgilar to'plami ────────────────────────────────────────────
const POOLS = {
  upper:   "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower:   "abcdefghijklmnopqrstuvwxyz",
  digits:  "0123456789",
  symbols: "!@#$%^&*()-_=+[]{}|;:,.?",
};

function _generate({ length, upper, lower, digits, symbols }) {
  const pool = [
    upper   ? POOLS.upper   : "",
    lower   ? POOLS.lower   : "",
    digits  ? POOLS.digits  : "",
    symbols ? POOLS.symbols : "",
  ].join("");
  if (!pool) throw new Error("Kamida bitta belgi turini tanlang");
  // Majburiy: har bir yoqilgan to'plamdan kamida 1 belgi
  const required = [];
  if (upper)   required.push(POOLS.upper  [_rand(POOLS.upper.length)]);
  if (lower)   required.push(POOLS.lower  [_rand(POOLS.lower.length)]);
  if (digits)  required.push(POOLS.digits [_rand(POOLS.digits.length)]);
  if (symbols) required.push(POOLS.symbols[_rand(POOLS.symbols.length)]);

  const rest = Array.from(
    crypto.getRandomValues(new Uint8Array(length - required.length)),
    b => pool[b % pool.length],
  );
  // Aralashtirish
  const all = [...required, ...rest];
  const shuffled = new Uint8Array(all.length);
  crypto.getRandomValues(shuffled);
  all.sort((_, __, i = shuffled[all.indexOf(_)]) => 0); // Fisher–Yates via sort
  // To'g'ri Fisher–Yates
  for (let i = all.length - 1; i > 0; i--) {
    const j = shuffled[i] % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join("");
}

function _rand(max) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

function _strength(pw) {
  let score = 0;
  if (pw.length >= 8)               score++;
  if (pw.length >= 12)              score++;
  if (pw.length >= 16)              score++;
  if (/[A-Z]/.test(pw))             score++;
  if (/[a-z]/.test(pw))             score++;
  if (/[0-9]/.test(pw))             score++;
  if (/[^A-Za-z0-9]/.test(pw))      score++;
  if (score <= 2)  return { label: "Zaif",      color: "#f87171", width: "25%" };
  if (score <= 4)  return { label: "O'rtacha",  color: "#f59e0b", width: "50%" };
  if (score <= 5)  return { label: "Yaxshi",    color: "#34d399", width: "75%" };
  return            { label: "Kuchli",           color: "#10b981", width: "100%" };
}

// ─── Component ────────────────────────────────────────────────────
function PasswordPro({ t, accent, onToast }) {
  const [opts, setOpts] = _useS({
    length: 16, upper: true, lower: true, digits: true, symbols: false,
  });
  const [count, setCount] = _useS(1);
  const [output, setOutput] = _useS("");

  const toggle = _useC(k => setOpts(o => ({ ...o, [k]: !o[k] })), []);

  const generate = _useC(() => {
    try {
      const pws = Array.from({ length: count }, () => _generate(opts));
      setOutput(pws.join("\n"));
    } catch (e) {
      onToast?.("❌ " + e.message);
    }
  }, [opts, count, onToast]);

  const copy = _useC(() => {
    if (!output) return;
    navigator.clipboard?.writeText(output).then(() => onToast?.("✅ Nusxalandi"));
  }, [output, onToast]);

  const str = _useM(() => {
    const firstLine = output.split("\n")[0];
    return firstLine ? _strength(firstLine) : null;
  }, [output]);

  const CHECK_OPTS = [
    ["upper",   "A-Z  Katta harflar"],
    ["lower",   "a-z  Kichik harflar"],
    ["digits",  "0-9  Raqamlar"],
    ["symbols", "!@#  Maxsus belgilar"],
  ];

  return (
    <div style={{ padding: "16px 16px 32px" }}>
      {/* Uzunlik slayderi */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Uzunlik</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: accent }}>{opts.length}</span>
        </div>
        <input
          type="range" min="6" max="64" value={opts.length}
          onChange={e => setOpts(o => ({ ...o, length: +e.target.value }))}
          style={{ width: "100%", accentColor: accent, height: 4 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
          <span>6</span><span>64</span>
        </div>
      </div>

      {/* Belgi to'plamlari */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {CHECK_OPTS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => toggle(k)}
            style={{
              padding: "10px 12px", borderRadius: 10, textAlign: "left",
              border: `1.5px solid ${opts[k] ? accent : "var(--border-subtle)"}`,
              background: opts[k] ? accent + "18" : "var(--bg-surface-1)",
              color: opts[k] ? accent : "var(--text-secondary)",
              fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
              border: `1.5px solid ${opts[k] ? accent : "var(--border-subtle)"}`,
              background: opts[k] ? accent : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: "#000",
            }}>
              {opts[k] ? "✓" : ""}
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* Nechta parol */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 14, color: "var(--text-secondary)", flex: 1 }}>Miqdor</span>
        {[1, 3, 5, 10].map(n => (
          <button
            key={n}
            onClick={() => setCount(n)}
            style={{
              width: 40, height: 36, borderRadius: 9,
              border: `1.5px solid ${count === n ? accent : "var(--border-subtle)"}`,
              background: count === n ? accent + "18" : "var(--bg-surface-1)",
              color: count === n ? accent : "var(--text-secondary)",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            {n}
          </button>
        ))}
      </div>

      <button
        onClick={generate}
        style={{
          width: "100%", padding: "13px 0",
          background: accent, color: "#000", borderRadius: 12,
          border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}
      >
        🔐 Yaratish
      </button>

      {output && (
        <div style={{
          marginTop: 14, background: "var(--bg-surface-1)",
          borderRadius: 12, padding: "14px 16px",
          border: "1px solid var(--border-subtle)",
        }}>
          {/* Kuch indikatori */}
          {str && count === 1 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Kuch</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: str.color }}>{str.label}</span>
              </div>
              <div style={{ height: 4, background: "var(--border-subtle)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: str.width,
                  background: str.color, borderRadius: 4,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>
          )}

          <div style={{
            fontFamily: "monospace", fontSize: 14.5,
            color: "var(--text-primary)", wordBreak: "break-all",
            lineHeight: 1.9, whiteSpace: "pre-wrap", userSelect: "all",
          }}>
            {output}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={copy}
              style={{
                flex: 1, padding: "11px 0",
                background: accent + "1a", color: accent,
                border: `1px solid ${accent}55`, borderRadius: 10,
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              📋 Nusxalash
            </button>
            <button
              onClick={generate}
              style={{
                flex: 1, padding: "11px 0",
                background: "var(--bg-surface-1)", color: "var(--text-secondary)",
                border: "1px solid var(--border-subtle)", borderRadius: 10,
                fontSize: 14, cursor: "pointer",
              }}
            >
              🔄 Yangilash
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PasswordPro });
