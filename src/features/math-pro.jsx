// EduBot — MathPro (CLIENT-SIDE matematika xizmatlari)
// Kategoriyalar va hisoblashlar:
//   • Geometriya (Uchburchak, Aylana, To'rtburchak, Trapesiya, Kub, Shar, Silindr, Konus)
//   • Trigonometriya (sin/cos/tan, hisoblagich, qatlama)
//   • Algebra (Kvadrat tenglama, Progressiya, Foiz, ENG katta umumiy bo'luvchi, Sonlar)
// Hammasi browserda ishlaydi — backend talab qilmaydi.
"use strict";

const {
  useState:    _mtS,
  useMemo:     _mtM,
  useCallback: _mtC,
} = React;

const MT_ACCENT      = "#8b5cf6";
const MT_ACCENT_SOFT = "rgba(139,92,246,0.12)";
const MT_ACCENT_BD   = "rgba(139,92,246,0.32)";

// ─── Format / parse yordamchilari ──────────────────────────────────
function _num(v, fallback = NaN) {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return fallback;
  const t = v.trim().replace(",", ".");
  if (!t) return fallback;
  const n = Number(t);
  return isFinite(n) ? n : fallback;
}
function _fmt(n, digits = 4) {
  if (n === undefined || n === null || isNaN(n)) return "—";
  if (!isFinite(n)) return n > 0 ? "+∞" : "−∞";
  if (Math.abs(n) >= 1e9) return n.toExponential(3);
  const rounded = +n.toFixed(digits);
  return String(rounded).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
function _toRad(deg) { return (deg * Math.PI) / 180; }
function _toDeg(rad) { return (rad * 180) / Math.PI; }

// ─── Umumiy input maydoni ─────────────────────────────────────────
function _NumInput({ label, value, onChange, suffix, placeholder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: 1 }}>
      <label
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "0"}
          style={{
            width: "100%",
            padding: suffix ? "10px 38px 10px 12px" : "10px 12px",
            background: "var(--bg-surface-2)",
            border: "1px solid var(--border-medium)",
            borderRadius: 10,
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none",
            fontVariantNumeric: "tabular-nums",
            boxSizing: "border-box",
          }}
        />
        {suffix && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 12,
              color: "var(--text-faint)",
              pointerEvents: "none",
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Natija qatori ─────────────────────────────────────────────────
function _ResRow({ label, value, accent }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "10px 12px",
        background: "var(--bg-surface-1)",
        border: "0.5px solid var(--border-subtle)",
        borderRadius: 10,
        gap: 12,
      }}
    >
      <span style={{ color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 500 }}>
        {label}
      </span>
      <span
        style={{
          color: accent || "var(--text-primary)",
          fontSize: 15,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          wordBreak: "break-all",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  GEOMETRIYA
// ═══════════════════════════════════════════════════════════════════

// Uchburchak — 3 tomon (Heron) yoki tomon+balandlik
function _Triangle({ accent }) {
  const [a, setA] = _mtS("");
  const [b, setB] = _mtS("");
  const [c, setC] = _mtS("");
  const A = _num(a), B = _num(b), C = _num(c);
  const valid = isFinite(A) && isFinite(B) && isFinite(C) && A > 0 && B > 0 && C > 0
    && A + B > C && A + C > B && B + C > A;
  const res = _mtM(() => {
    if (!valid) return null;
    const p = (A + B + C) / 2;
    const area = Math.sqrt(p * (p - A) * (p - B) * (p - C));
    const perimeter = A + B + C;
    // Burchaklar (kosinuslar teoremasi)
    const angA = _toDeg(Math.acos((B*B + C*C - A*A) / (2*B*C)));
    const angB = _toDeg(Math.acos((A*A + C*C - B*B) / (2*A*C)));
    const angC = 180 - angA - angB;
    return { area, perimeter, angA, angB, angC };
  }, [A, B, C, valid]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <_NumInput label="Tomon a" value={a} onChange={setA} />
        <_NumInput label="Tomon b" value={b} onChange={setB} />
        <_NumInput label="Tomon c" value={c} onChange={setC} />
      </div>
      {a && b && c && !valid && (
        <div style={{ fontSize: 11.5, color: "#f87171" }}>
          Uchburchak qoidasi buzilgan: ikki tomon yig'indisi uchinchidan katta bo'lishi kerak.
        </div>
      )}
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          <_ResRow label="Yuza (Heron)" value={`${_fmt(res.area)} kv. birlik`} accent={accent} />
          <_ResRow label="Perimetr" value={`${_fmt(res.perimeter)} birlik`} />
          <_ResRow label="Burchak A" value={`${_fmt(res.angA, 2)}°`} />
          <_ResRow label="Burchak B" value={`${_fmt(res.angB, 2)}°`} />
          <_ResRow label="Burchak C" value={`${_fmt(res.angC, 2)}°`} />
        </div>
      )}
    </div>
  );
}

// Aylana — radius, diametr, doira yuzasi va uzunligi
function _Circle({ accent }) {
  const [r, setR] = _mtS("");
  const R = _num(r);
  const res = _mtM(() => {
    if (!isFinite(R) || R <= 0) return null;
    return {
      diam: 2 * R,
      area: Math.PI * R * R,
      circ: 2 * Math.PI * R,
    };
  }, [R]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <_NumInput label="Radius R" value={r} onChange={setR} />
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="Diametr (2R)" value={_fmt(res.diam)} />
          <_ResRow label="Doira yuzasi (πR²)" value={_fmt(res.area)} accent={accent} />
          <_ResRow label="Aylana uzunligi (2πR)" value={_fmt(res.circ)} />
        </div>
      )}
    </div>
  );
}

// To'rtburchak (kvadrat / to'g'ri to'rtburchak)
function _Rect({ accent }) {
  const [w, setW] = _mtS("");
  const [h, setH] = _mtS("");
  const W = _num(w), H = _num(h);
  const res = _mtM(() => {
    if (!isFinite(W) || W <= 0 || !isFinite(H) || H <= 0) return null;
    return {
      area: W * H,
      perimeter: 2 * (W + H),
      diagonal: Math.sqrt(W * W + H * H),
      isSquare: Math.abs(W - H) < 1e-9,
    };
  }, [W, H]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <_NumInput label="Eni (a)" value={w} onChange={setW} />
        <_NumInput label="Bo'yi (b)" value={h} onChange={setH} />
      </div>
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="Yuza (a×b)" value={_fmt(res.area)} accent={accent} />
          <_ResRow label="Perimetr (2(a+b))" value={_fmt(res.perimeter)} />
          <_ResRow label="Diagonal" value={_fmt(res.diagonal)} />
          {res.isSquare && (
            <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
              💡 Bu kvadrat (a = b)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Trapesiya
function _Trapezoid({ accent }) {
  const [a, setA] = _mtS("");
  const [b, setB] = _mtS("");
  const [h, setH] = _mtS("");
  const A = _num(a), B = _num(b), H = _num(h);
  const res = _mtM(() => {
    if (!isFinite(A) || !isFinite(B) || !isFinite(H)) return null;
    if (A <= 0 || B <= 0 || H <= 0) return null;
    return {
      area: ((A + B) / 2) * H,
      midline: (A + B) / 2,
    };
  }, [A, B, H]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <_NumInput label="Asos a" value={a} onChange={setA} />
        <_NumInput label="Asos b" value={b} onChange={setB} />
        <_NumInput label="Balandlik h" value={h} onChange={setH} />
      </div>
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="Yuza ((a+b)/2 × h)" value={_fmt(res.area)} accent={accent} />
          <_ResRow label="O'rta chiziq" value={_fmt(res.midline)} />
        </div>
      )}
    </div>
  );
}

// Kub
function _Cube({ accent }) {
  const [a, setA] = _mtS("");
  const A = _num(a);
  const res = _mtM(() => {
    if (!isFinite(A) || A <= 0) return null;
    return {
      vol: A ** 3,
      surf: 6 * A * A,
      diag: A * Math.sqrt(3),
    };
  }, [A]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <_NumInput label="Qirra a" value={a} onChange={setA} />
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="Hajm (a³)" value={_fmt(res.vol)} accent={accent} />
          <_ResRow label="Yuza (6a²)" value={_fmt(res.surf)} />
          <_ResRow label="Diagonal (a√3)" value={_fmt(res.diag)} />
        </div>
      )}
    </div>
  );
}

// Shar
function _Sphere({ accent }) {
  const [r, setR] = _mtS("");
  const R = _num(r);
  const res = _mtM(() => {
    if (!isFinite(R) || R <= 0) return null;
    return {
      vol: (4 / 3) * Math.PI * R ** 3,
      surf: 4 * Math.PI * R * R,
    };
  }, [R]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <_NumInput label="Radius R" value={r} onChange={setR} />
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="Hajm (4/3 πR³)" value={_fmt(res.vol)} accent={accent} />
          <_ResRow label="Yuza (4πR²)" value={_fmt(res.surf)} />
        </div>
      )}
    </div>
  );
}

// Silindr
function _Cylinder({ accent }) {
  const [r, setR] = _mtS("");
  const [h, setH] = _mtS("");
  const R = _num(r), H = _num(h);
  const res = _mtM(() => {
    if (!isFinite(R) || !isFinite(H) || R <= 0 || H <= 0) return null;
    return {
      vol: Math.PI * R * R * H,
      surf: 2 * Math.PI * R * (R + H),
      side: 2 * Math.PI * R * H,
    };
  }, [R, H]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <_NumInput label="Radius R" value={r} onChange={setR} />
        <_NumInput label="Balandlik h" value={h} onChange={setH} />
      </div>
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="Hajm (πR²h)" value={_fmt(res.vol)} accent={accent} />
          <_ResRow label="To'liq yuza (2πR(R+h))" value={_fmt(res.surf)} />
          <_ResRow label="Yon yuza (2πRh)" value={_fmt(res.side)} />
        </div>
      )}
    </div>
  );
}

// Konus
function _Cone({ accent }) {
  const [r, setR] = _mtS("");
  const [h, setH] = _mtS("");
  const R = _num(r), H = _num(h);
  const res = _mtM(() => {
    if (!isFinite(R) || !isFinite(H) || R <= 0 || H <= 0) return null;
    const l = Math.sqrt(R * R + H * H);
    return {
      vol: (Math.PI * R * R * H) / 3,
      side: Math.PI * R * l,
      surf: Math.PI * R * (R + l),
      slant: l,
    };
  }, [R, H]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <_NumInput label="Radius R" value={r} onChange={setR} />
        <_NumInput label="Balandlik h" value={h} onChange={setH} />
      </div>
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="Hajm (πR²h/3)" value={_fmt(res.vol)} accent={accent} />
          <_ResRow label="Yon yuza (πRl)" value={_fmt(res.side)} />
          <_ResRow label="To'liq yuza" value={_fmt(res.surf)} />
          <_ResRow label="Yon qirra (l)" value={_fmt(res.slant)} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TRIGONOMETRIYA
// ═══════════════════════════════════════════════════════════════════

function _TrigCalc({ accent }) {
  const [angle, setAngle] = _mtS("");
  const [unit, setUnit] = _mtS("deg"); // deg | rad
  const A = _num(angle);
  const valid = isFinite(A);
  const ar = unit === "deg" ? _toRad(A) : A;
  const res = _mtM(() => {
    if (!valid) return null;
    return {
      sin:  Math.sin(ar),
      cos:  Math.cos(ar),
      tan:  Math.tan(ar),
      cot:  1 / Math.tan(ar),
      sec:  1 / Math.cos(ar),
      csc:  1 / Math.sin(ar),
      deg:  unit === "deg" ? A : _toDeg(A),
      rad:  unit === "deg" ? ar : A,
    };
  }, [A, ar, unit, valid]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <_NumInput label="Burchak" value={angle} onChange={setAngle} suffix={unit === "deg" ? "°" : "rad"} />
        <div style={{ display: "flex", gap: 4 }}>
          {["deg", "rad"].map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: unit === u ? `1px solid ${accent || MT_ACCENT}` : "1px solid var(--border-medium)",
                background: unit === u ? (accent || MT_ACCENT) + "18" : "var(--bg-surface-1)",
                color: unit === u ? (accent || MT_ACCENT) : "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="sin" value={_fmt(res.sin, 6)} accent={accent} />
          <_ResRow label="cos" value={_fmt(res.cos, 6)} accent={accent} />
          <_ResRow label="tan" value={_fmt(res.tan, 6)} accent={accent} />
          <_ResRow label="cot" value={_fmt(res.cot, 6)} />
          <_ResRow label="sec" value={_fmt(res.sec, 6)} />
          <_ResRow label="csc" value={_fmt(res.csc, 6)} />
          <_ResRow label="Daraja" value={`${_fmt(res.deg, 4)}°`} />
          <_ResRow label="Radian" value={_fmt(res.rad, 6)} />
        </div>
      )}
    </div>
  );
}

// Pifagor teoremasi: a² + b² = c²
function _Pythagoras({ accent }) {
  const [a, setA] = _mtS("");
  const [b, setB] = _mtS("");
  const [c, setC] = _mtS("");
  const A = _num(a), B = _num(b), C = _num(c);
  const res = _mtM(() => {
    const knownA = isFinite(A) && A > 0;
    const knownB = isFinite(B) && B > 0;
    const knownC = isFinite(C) && C > 0;
    const cnt = knownA + knownB + knownC;
    if (cnt < 2) return null;
    if (knownA && knownB) return { which: "c (gipotenuza)", value: Math.sqrt(A*A + B*B) };
    if (knownA && knownC) {
      if (C <= A) return { error: "Gipotenuza katetdan katta bo'lishi kerak" };
      return { which: "b (katet)", value: Math.sqrt(C*C - A*A) };
    }
    if (knownB && knownC) {
      if (C <= B) return { error: "Gipotenuza katetdan katta bo'lishi kerak" };
      return { which: "a (katet)", value: Math.sqrt(C*C - B*B) };
    }
    return null;
  }, [A, B, C]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "6px 0" }}>
        Ikkita ma'lum qiymatni kiriting — uchinchisini topadi
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <_NumInput label="Katet a" value={a} onChange={setA} />
        <_NumInput label="Katet b" value={b} onChange={setB} />
        <_NumInput label="Gipotenuza c" value={c} onChange={setC} />
      </div>
      {res?.error && (
        <div style={{ fontSize: 12, color: "#f87171", padding: "6px 12px" }}>
          {res.error}
        </div>
      )}
      {res && !res.error && (
        <_ResRow label={`Noma'lum tomon ${res.which}`} value={_fmt(res.value)} accent={accent} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ALGEBRA
// ═══════════════════════════════════════════════════════════════════

// Kvadrat tenglama ax² + bx + c = 0
function _Quadratic({ accent }) {
  const [a, setA] = _mtS("");
  const [b, setB] = _mtS("");
  const [c, setC] = _mtS("");
  const A = _num(a), B = _num(b), C = _num(c);
  const res = _mtM(() => {
    if (!isFinite(A) || !isFinite(B) || !isFinite(C)) return null;
    if (A === 0) {
      if (B === 0) return { kind: "no-eq" };
      return { kind: "linear", x: -C / B };
    }
    const D = B * B - 4 * A * C;
    if (D > 0) {
      const x1 = (-B + Math.sqrt(D)) / (2 * A);
      const x2 = (-B - Math.sqrt(D)) / (2 * A);
      return { kind: "two", x1, x2, D };
    }
    if (D === 0) return { kind: "one", x: -B / (2 * A), D };
    return {
      kind: "complex",
      real: -B / (2 * A),
      imag: Math.sqrt(-D) / (2 * A),
      D,
    };
  }, [A, B, C]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "6px 0" }}>
        ax² + bx + c = 0
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <_NumInput label="a" value={a} onChange={setA} />
        <_NumInput label="b" value={b} onChange={setB} />
        <_NumInput label="c" value={c} onChange={setC} />
      </div>
      {res?.kind === "no-eq" && (
        <div style={{ fontSize: 12.5, color: "#f87171", textAlign: "center" }}>
          a = 0 va b = 0 — tenglama emas
        </div>
      )}
      {res?.kind === "linear" && (
        <_ResRow label="Chiziqli tenglama: x" value={_fmt(res.x, 6)} accent={accent} />
      )}
      {res?.kind === "two" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="Diskriminant" value={_fmt(res.D)} />
          <_ResRow label="x₁" value={_fmt(res.x1, 6)} accent={accent} />
          <_ResRow label="x₂" value={_fmt(res.x2, 6)} accent={accent} />
        </div>
      )}
      {res?.kind === "one" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="Diskriminant" value="0" />
          <_ResRow label="x₁ = x₂" value={_fmt(res.x, 6)} accent={accent} />
        </div>
      )}
      {res?.kind === "complex" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="Diskriminant" value={_fmt(res.D)} />
          <_ResRow label="x₁" value={`${_fmt(res.real, 4)} + ${_fmt(res.imag, 4)}i`} accent={accent} />
          <_ResRow label="x₂" value={`${_fmt(res.real, 4)} − ${_fmt(res.imag, 4)}i`} accent={accent} />
          <div style={{ fontSize: 11.5, color: "var(--text-faint)", textAlign: "center" }}>
            💡 D &lt; 0 — kompleks ildizlar
          </div>
        </div>
      )}
    </div>
  );
}

// Foiz
function _Percent({ accent }) {
  const [mode, setMode] = _mtS("of"); // of | inc | dec | diff
  const [a, setA] = _mtS("");
  const [b, setB] = _mtS("");
  const A = _num(a), B = _num(b);
  const res = _mtM(() => {
    if (!isFinite(A) || !isFinite(B)) return null;
    if (mode === "of")  return { label: `${A}% sondan ${B}`, value: (A / 100) * B };
    if (mode === "inc") return { label: `${A} ga ${B}% qo'shish`, value: A + (A * B) / 100 };
    if (mode === "dec") return { label: `${A} dan ${B}% ayirish`, value: A - (A * B) / 100 };
    if (mode === "diff") {
      if (A === 0) return { label: "0 ga nisbatan foiz", value: NaN };
      return { label: `${A} dan ${B} gacha o'zgarish`, value: ((B - A) / Math.abs(A)) * 100, suffix: "%" };
    }
    return null;
  }, [A, B, mode]);
  const MODES = [
    { id: "of",   label: "A% × B" },
    { id: "inc",  label: "A + A·B%" },
    { id: "dec",  label: "A − A·B%" },
    { id: "diff", label: "A → B (%)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            style={{
              flex: 1,
              padding: "8px 4px",
              borderRadius: 9,
              border: mode === m.id ? `1px solid ${accent || MT_ACCENT}` : "1px solid var(--border-medium)",
              background: mode === m.id ? (accent || MT_ACCENT) + "18" : "var(--bg-surface-1)",
              color: mode === m.id ? (accent || MT_ACCENT) : "var(--text-secondary)",
              fontSize: 10.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <_NumInput label="A" value={a} onChange={setA} />
        <_NumInput label="B" value={b} onChange={setB} suffix={mode === "of" ? "" : (mode === "diff" ? "" : "%")} />
      </div>
      {res && (
        <_ResRow label={res.label} value={`${_fmt(res.value, 4)}${res.suffix || ""}`} accent={accent} />
      )}
    </div>
  );
}

// EKUB / ENGKUB (GCD / LCM)
function _GcdLcm({ accent }) {
  const [vals, setVals] = _mtS("");
  const res = _mtM(() => {
    const nums = vals.split(/[\s,;]+/).map(_num).filter((n) => isFinite(n) && n > 0);
    if (nums.length < 2) return null;
    const gcd2 = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
    const lcm2 = (a, b) => (a * b) / gcd2(a, b);
    let g = nums[0], l = nums[0];
    for (let i = 1; i < nums.length; i++) {
      g = gcd2(g, nums[i]);
      l = lcm2(l, nums[i]);
    }
    return { nums, gcd: g, lcm: l };
  }, [vals]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <_NumInput label="Sonlar (vergul yoki bo'sh joy bilan)" value={vals} onChange={setVals} placeholder="12 18 24" />
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label={`EKUB (${res.nums.length} ta son)`} value={_fmt(res.gcd, 0)} accent={accent} />
          <_ResRow label="EKUK" value={_fmt(res.lcm, 0)} />
        </div>
      )}
    </div>
  );
}

// Arifmetik progressiya
function _Progression({ accent }) {
  const [a1, setA1] = _mtS("");
  const [d, setD]   = _mtS("");
  const [n, setN]   = _mtS("");
  const A1 = _num(a1), D = _num(d), N = _num(n);
  const res = _mtM(() => {
    if (!isFinite(A1) || !isFinite(D) || !isFinite(N) || N < 1) return null;
    const an = A1 + (N - 1) * D;
    const sn = (N * (A1 + an)) / 2;
    return { an, sn };
  }, [A1, D, N]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
        Arifmetik progressiya: aₙ = a₁ + (n−1)d
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <_NumInput label="a₁" value={a1} onChange={setA1} />
        <_NumInput label="d (ayirma)" value={d} onChange={setD} />
        <_NumInput label="n" value={n} onChange={setN} />
      </div>
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <_ResRow label="n-hadi (aₙ)" value={_fmt(res.an)} accent={accent} />
          <_ResRow label="Yig'indi (Sₙ)" value={_fmt(res.sn)} />
        </div>
      )}
    </div>
  );
}

// ─── Xizmatlar ro'yxati ────────────────────────────────────────────
const TOOLS = [
  // Geometriya
  { id: "triangle",  cat: "geo",   icon: "△",  name: "Uchburchak",          desc: "3 tomon → yuza, perimetr, burchaklar", comp: _Triangle },
  { id: "circle",    cat: "geo",   icon: "○",  name: "Aylana / Doira",      desc: "Radius → diametr, yuza, uzunlik",     comp: _Circle },
  { id: "rect",      cat: "geo",   icon: "▭",  name: "To'rtburchak",        desc: "Eni × bo'yi → yuza, perimetr",        comp: _Rect },
  { id: "trapezoid", cat: "geo",   icon: "⏢",  name: "Trapesiya",           desc: "Asoslar + balandlik → yuza",          comp: _Trapezoid },
  { id: "cube",      cat: "geo",   icon: "⬛",  name: "Kub",                 desc: "Qirra → hajm, yuza, diagonal",         comp: _Cube },
  { id: "sphere",    cat: "geo",   icon: "⬤",  name: "Shar",                desc: "Radius → hajm, yuza",                  comp: _Sphere },
  { id: "cylinder",  cat: "geo",   icon: "🥫",  name: "Silindr",             desc: "R, h → hajm, yuza",                    comp: _Cylinder },
  { id: "cone",      cat: "geo",   icon: "△",  name: "Konus",               desc: "R, h → hajm, yon qirra, yuza",        comp: _Cone },
  // Trigonometriya
  { id: "trig",      cat: "trig",  icon: "∠",  name: "sin / cos / tan",     desc: "Burchak (° yoki rad) → 6 funksiya",   comp: _TrigCalc },
  { id: "pythag",    cat: "trig",  icon: "√",  name: "Pifagor teoremasi",   desc: "a² + b² = c² (noma'lumni topadi)",    comp: _Pythagoras },
  // Algebra
  { id: "quad",      cat: "alg",   icon: "x²", name: "Kvadrat tenglama",    desc: "ax² + bx + c = 0",                     comp: _Quadratic },
  { id: "percent",   cat: "alg",   icon: "%",  name: "Foiz hisoblash",      desc: "4 xil rejim: A%×B, A+B%, A−B%, A→B%", comp: _Percent },
  { id: "gcd",       cat: "alg",   icon: "÷",  name: "EKUB va EKUK",        desc: "Bir nechta son uchun GCD va LCM",     comp: _GcdLcm },
  { id: "prog",      cat: "alg",   icon: "∑",  name: "Arifmetik progressiya", desc: "a₁, d, n → aₙ va Sₙ",               comp: _Progression },
];

const CATS = [
  { id: "all",  label: "Hammasi",        icon: "✨" },
  { id: "geo",  label: "Geometriya",     icon: "📐" },
  { id: "trig", label: "Trigonometriya", icon: "∠"  },
  { id: "alg",  label: "Algebra",        icon: "x²" },
];

// ─── Asosiy MathPro komponenti ────────────────────────────────────
function MathPro({ t, accent, onToast }) {
  const [active, setActive] = _mtS(null); // null = hub, else tool id
  const [cat, setCat] = _mtS("all");

  const ACCENT = accent || MT_ACCENT;
  const filtered = _mtM(
    () => cat === "all" ? TOOLS : TOOLS.filter((x) => x.cat === cat),
    [cat],
  );

  // ─── Tool view ────────────────────────────────────────────────
  if (active) {
    const tool = TOOLS.find((x) => x.id === active);
    if (!tool) {
      return (
        <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>
          Xizmat topilmadi
        </div>
      );
    }
    const Comp = tool.comp;
    return (
      <div style={{ padding: "8px 16px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            background: "var(--bg-surface-1)",
            border: "0.5px solid var(--border-subtle)",
            borderRadius: 14,
          }}
        >
          <button
            type="button"
            onClick={() => setActive(null)}
            aria-label="Orqaga"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              border: "none",
              background: "var(--bg-surface-2)",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            ←
          </button>
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: ACCENT + "22",
              color: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {tool.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
              {tool.name}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 11.5, marginTop: 1 }}>
              {tool.desc}
            </div>
          </div>
        </div>
        <Comp accent={ACCENT} onToast={onToast} />
      </div>
    );
  }

  // ─── Hub view ─────────────────────────────────────────────────
  return (
    <div style={{ padding: "8px 16px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Kategoriya filter */}
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 2,
        }}
        className="hide-scroll"
      >
        {CATS.map((c) => {
          const isActive = cat === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              style={{
                flexShrink: 0,
                padding: "8px 14px",
                borderRadius: 99,
                background: isActive ? ACCENT : "var(--bg-surface-1)",
                border: `0.5px solid ${isActive ? ACCENT : "var(--border-subtle)"}`,
                color: isActive ? "#fff" : "var(--text-secondary)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                whiteSpace: "nowrap",
                boxShadow: isActive ? `0 4px 14px ${ACCENT}40` : "none",
              }}
            >
              <span aria-hidden="true">{c.icon}</span>
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Xizmatlar grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
        }}
      >
        {filtered.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => setActive(tool.id)}
            className="press"
            style={{
              textAlign: "left",
              padding: "14px 12px",
              background: "var(--bg-surface-1)",
              border: "0.5px solid var(--border-subtle)",
              borderRadius: 16,
              color: "var(--text-primary)",
              cursor: "pointer",
              font: "inherit",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minHeight: 110,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: ACCENT + "22",
                border: `0.5px solid ${ACCENT}40`,
                color: ACCENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {tool.icon}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
                {tool.name}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--text-muted)",
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {tool.desc}
              </div>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Bu kategoriyada xizmat yo'q
        </div>
      )}
    </div>
  );
}

Object.assign(window, { MathPro });
