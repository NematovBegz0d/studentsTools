// EduBot — StatsPro (CLIENT-SIDE, pure JS)
// ✅ Backend ishlatilmaydi — hamma hisob-kitob browserda
// Input: bo'sh joy/vergul/yangi qator bilan ajratilgan sonlar
// Output: n, sum, mean, median, mode, std dev, variance, min, max, range

"use strict";

const {
  useState:    _useS,
  useCallback: _useC,
} = React;

// ─── Hisob-kitob ──────────────────────────────────────────────────
function _parse(raw) {
  const nums = raw.trim()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number)
    .filter(n => !isNaN(n) && isFinite(n));
  if (!nums.length) throw new Error("Raqamlar kiriting (bo'sh joy yoki vergul bilan ajrating)");
  return nums;
}

function _calc(nums) {
  const n = nums.length;
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((s, x) => s + x, 0);
  const mean = sum / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const variance = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const freq = {};
  nums.forEach(x => { freq[x] = (freq[x] || 0) + 1; });
  const maxF = Math.max(...Object.values(freq));
  const modes = maxF > 1
    ? Object.entries(freq).filter(([, f]) => f === maxF).map(([v]) => +v)
    : [];
  return { n, sum, mean, median, modes, min: sorted[0], max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0], variance, stddev };
}

function _fmt(x) {
  if (typeof x !== "number") return String(x);
  if (Number.isInteger(x)) return String(x);
  const s = x.toFixed(6);
  return s.replace(/\.?0+$/, "");
}

// ─── Component ────────────────────────────────────────────────────
function StatsPro({ t, accent, onToast }) {
  const [input, setInput] = _useS("");
  const [result, setResult] = _useS(null);
  const [err, setErr] = _useS("");

  const compute = _useC(() => {
    setErr(""); setResult(null);
    try { setResult(_calc(_parse(input))); }
    catch (e) { setErr(e.message); }
  }, [input]);

  const copyResult = _useC(() => {
    if (!result) return;
    const lines = [
      `Soni (n): ${result.n}`,
      `Yig'indi: ${_fmt(result.sum)}`,
      `O'rtacha (mean): ${_fmt(result.mean)}`,
      `Mediana: ${_fmt(result.median)}`,
      result.modes.length ? `Moda: ${result.modes.map(_fmt).join(", ")}` : null,
      `Min: ${_fmt(result.min)}   Max: ${_fmt(result.max)}`,
      `Diapason: ${_fmt(result.range)}`,
      `Dispersiya (σ²): ${_fmt(result.variance)}`,
      `Standart og'ish (σ): ${_fmt(result.stddev)}`,
    ].filter(Boolean);
    navigator.clipboard?.writeText(lines.join("\n"))
      .then(() => onToast?.("✅ Nusxalandi"));
  }, [result, onToast]);

  const rows = result ? [
    ["Soni (n)",             result.n],
    ["Yig'indi",             _fmt(result.sum)],
    ["O'rtacha (mean)",      _fmt(result.mean)],
    ["Mediana",              _fmt(result.median)],
    result.modes.length
      ? ["Moda",             result.modes.map(_fmt).join(", ")]
      : null,
    ["Minimum",              _fmt(result.min)],
    ["Maksimum",             _fmt(result.max)],
    ["Diapason",             _fmt(result.range)],
    ["Dispersiya (σ²)",      _fmt(result.variance)],
    ["Standart og'ish (σ)",  _fmt(result.stddev)],
  ].filter(Boolean) : [];

  return (
    <div style={{ padding: "16px 16px 32px" }}>
      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={"Raqamlarni kiriting:\n4 7 2 9 1 5 8 3"}
        style={{
          width: "100%", height: 80, padding: "10px 12px",
          borderRadius: 12, border: "1px solid var(--border-subtle)",
          background: "var(--bg-surface-1)", color: "var(--text-primary)",
          fontSize: 15, resize: "none", boxSizing: "border-box", fontFamily: "inherit",
        }}
      />
      {err && (
        <div style={{ color: "#f87171", fontSize: 13, marginTop: 6 }}>{err}</div>
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
        📐 Hisoblash
      </button>

      {rows.length > 0 && (
        <div style={{
          marginTop: 14, background: "var(--bg-surface-1)",
          borderRadius: 12, padding: "14px 16px",
          border: "1px solid var(--border-subtle)",
        }}>
          {rows.map(([label, val]) => (
            <div
              key={label}
              style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "baseline", marginBottom: 9, fontSize: 14,
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>{label}</span>
              <span style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>
                {val}
              </span>
            </div>
          ))}
          <button
            onClick={copyResult}
            style={{
              marginTop: 6, width: "100%", padding: "10px 0",
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

Object.assign(window, { StatsPro });
