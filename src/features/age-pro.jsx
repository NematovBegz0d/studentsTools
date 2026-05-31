// EduBot — AgeCalculatorPro (CLIENT-SIDE)
// Yosh va vaqt hisoblash:
//   • Tug'ilgan sanadan hozirgacha (yosh + jami kun/soat/daqiqa)
//   • Bo'lajak sanagacha qolgan vaqt (oy/hafta/kun/soat/daqiqa)
// To'liq browserda ishlaydi — backend talab qilmaydi.
"use strict";

const {
  useState:    _agS,
  useMemo:     _agM,
  useEffect:   _agE,
  useCallback: _agC,
} = React;

const AGE_ACCENT      = "#8b5cf6";
const AGE_ACCENT_SOFT = "rgba(139,92,246,0.12)";
const AGE_ACCENT_BD   = "rgba(139,92,246,0.32)";
const AGE_GREEN       = "#22c55e";
const AGE_RED         = "#f87171";

// ─── Sana parser ────────────────────────────────────────────────────
// Qo'llab-quvvatlaydigan formatlar:
//   DD.MM.YYYY    06.05.2001
//   DD/MM/YYYY    06/05/2001
//   DD-MM-YYYY    06-05-2001
//   YYYY-MM-DD    2001-05-06   (ISO)
function _parseDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;

  // DD[./-]MM[./-]YYYY
  let m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200) {
      const date = new Date(y, mo - 1, d);
      if (date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d) {
        return date;
      }
    }
  }

  // YYYY-MM-DD (ISO)
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const date = new Date(y, mo - 1, d);
      if (date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d) {
        return date;
      }
    }
  }
  return null;
}

// ─── Yillar, oylar, kunlar bilan to'liq farq ───────────────────────
function _diffYMD(from, to) {
  let years  = to.getFullYear() - from.getFullYear();
  let months = to.getMonth()    - from.getMonth();
  let days   = to.getDate()     - from.getDate();

  if (days < 0) {
    months -= 1;
    // O'tgan oyning oxirgi kuni
    const prevMonth = new Date(to.getFullYear(), to.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years  -= 1;
    months += 12;
  }
  return { years, months, days };
}

// ─── Catall summary (totals) ────────────────────────────────────────
function _totals(from, to) {
  const ms       = to.getTime() - from.getTime();
  const seconds  = Math.floor(ms / 1000);
  const minutes  = Math.floor(seconds / 60);
  const hours    = Math.floor(minutes / 60);
  const days     = Math.floor(hours / 24);
  const weeks    = Math.floor(days / 7);
  // Taxminiy "o'rtacha oy" (30.44 kun) — kalendar oylari bilan emas
  const months   = Math.floor(days / 30.4375);
  return { ms, seconds, minutes, hours, days, weeks, months };
}

// ─── Format yordamchilari ───────────────────────────────────────────
function _fmtNum(n) {
  if (n === undefined || n === null || isNaN(n)) return "—";
  return n.toLocaleString("en-US").replace(/,/g, " ");
}

function _fmtDate(d) {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

// ─── Statistika kartochkasi ─────────────────────────────────────────
function _StatCard({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: "var(--bg-surface-1)",
        border: "0.5px solid var(--border-subtle)",
        borderRadius: 14,
        padding: "12px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: color || AGE_ACCENT,
          fontSize: 22,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.5,
          lineHeight: 1.1,
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: "var(--text-muted)",
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      {sub && (
        <div style={{ color: "var(--text-faint)", fontSize: 10, marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Asosiy komponent ───────────────────────────────────────────────
function AgeCalculatorPro({ t, accent, onToast }) {
  const [mode, setMode]       = _agS("age"); // age | countdown
  const [fromStr, setFromStr] = _agS("");
  const [toStr, setToStr]     = _agS(""); // faqat countdown rejimida
  const [tick, setTick]       = _agS(0);

  // Har soniyada qayta hisoblash (real-time soat) — minimal CPU
  _agE(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fromDate = _agM(() => _parseDate(fromStr), [fromStr]);
  const toDate   = _agM(() => _parseDate(toStr), [toStr]);

  const fromValid = !!fromDate;
  const toValid   = mode === "countdown" ? !!toDate : true;
  const showError = (fromStr && !fromValid) || (mode === "countdown" && toStr && !toValid);

  // Asosiy hisoblar (tick bilan har soniyada yangilanadi)
  const result = _agM(() => {
    if (!fromValid) return null;
    if (mode === "age") {
      const now = new Date();
      // Tug'ilgan sana kelajakda bo'lsa — xato
      if (fromDate > now) {
        return { error: "Tug'ilgan sana kelajakda bo'lishi mumkin emas" };
      }
      const ymd  = _diffYMD(fromDate, now);
      const tots = _totals(fromDate, now);
      return { kind: "age", ymd, tots };
    } else {
      if (!toDate) return null;
      const now = new Date();
      // Boshlanish sanasi sifatida from yoki now ni olamiz
      const startDate = fromDate > now ? now : fromDate;
      if (toDate < startDate) {
        return { error: "Bo'lajak sana o'tib ketgan — uni o'tmish sanasidan keyin tanlang" };
      }
      const startForCount = fromDate > now ? fromDate : now;
      const ymd  = _diffYMD(startForCount, toDate);
      const tots = _totals(startForCount, toDate);
      return { kind: "countdown", ymd, tots, startForCount };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fromDate, toDate, fromValid, tick]);

  const isAge       = mode === "age";
  const isCountdown = mode === "countdown";

  // ─── Input UI ──────────────────────────────────────────────────────
  return (
    <div style={{ padding: "8px 16px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Rejim almashtirgich */}
      <div
        role="tablist"
        aria-label="Hisoblash rejimi"
        style={{
          display: "flex",
          background: "var(--bg-surface-1)",
          border: "0.5px solid var(--border-subtle)",
          borderRadius: 14,
          padding: 4,
          gap: 4,
        }}
      >
        {[
          { id: "age",       label: "Yosh hisoblash", icon: "🎂" },
          { id: "countdown", label: "Kelajak sanasi", icon: "⏳" },
        ].map((it) => {
          const active = mode === it.id;
          return (
            <button
              key={it.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(it.id)}
              style={{
                flex: 1,
                padding: "10px 8px",
                borderRadius: 10,
                background: active ? (accent || AGE_ACCENT) : "transparent",
                border: "none",
                color: active ? "#fff" : "var(--text-secondary)",
                fontSize: 13,
                fontWeight: active ? 700 : 600,
                cursor: "pointer",
                transition: "all 0.18s",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                boxShadow: active ? `0 4px 14px ${(accent || AGE_ACCENT) + "40"}` : "none",
              }}
            >
              <span aria-hidden="true">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>

      {/* From input */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          style={{
            color: "var(--text-muted)",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {isAge ? "Tug'ilgan sana" : "Boshlanish sanasi (ixtiyoriy — bo'sh = hozirgi)"}
        </label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="DD.MM.YYYY  (masalan: 06.05.2001)"
          value={fromStr}
          onChange={(e) => setFromStr(e.target.value)}
          maxLength={10}
          style={{
            padding: "12px 14px",
            background: "var(--bg-surface-2)",
            border: `1px solid ${
              fromStr && !fromValid ? "rgba(248,113,113,0.5)" : "var(--border-medium)"
            }`,
            borderRadius: 12,
            color: "var(--text-primary)",
            fontSize: 15,
            outline: "none",
            fontVariantNumeric: "tabular-nums",
          }}
        />
      </div>

      {/* To input (faqat countdown) */}
      {isCountdown && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              color: "var(--text-muted)",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Bo'lajak sana
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="DD.MM.YYYY  (masalan: 31.12.2026)"
            value={toStr}
            onChange={(e) => setToStr(e.target.value)}
            maxLength={10}
            style={{
              padding: "12px 14px",
              background: "var(--bg-surface-2)",
              border: `1px solid ${
                toStr && !toValid ? "rgba(248,113,113,0.5)" : "var(--border-medium)"
              }`,
              borderRadius: 12,
              color: "var(--text-primary)",
              fontSize: 15,
              outline: "none",
              fontVariantNumeric: "tabular-nums",
            }}
          />
        </div>
      )}

      {/* Tezkor preset tugmalar (faqat countdown) */}
      {isCountdown && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { label: "Yangi yil", date: new Date(new Date().getFullYear() + 1, 0, 1) },
            { label: "31.12 shu yil", date: new Date(new Date().getFullYear(), 11, 31) },
            { label: "+ 30 kun", date: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
            { label: "+ 100 kun", date: new Date(Date.now() + 100 * 24 * 3600 * 1000) },
          ].map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setToStr(_fmtDate(p.date))}
              style={{
                padding: "6px 12px",
                borderRadius: 99,
                background: AGE_ACCENT_SOFT,
                border: `0.5px solid ${AGE_ACCENT_BD}`,
                color: AGE_ACCENT,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Xato xabari */}
      {showError && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: AGE_RED,
            padding: "8px 12px",
            background: "rgba(248,113,113,0.08)",
            border: "0.5px solid rgba(248,113,113,0.25)",
            borderRadius: 10,
          }}
        >
          Sanani DD.MM.YYYY shaklida kiriting. Masalan: <b>06.05.2001</b>
        </div>
      )}

      {/* ─── Natija ──────────────────────────────────────────────────── */}
      {result && result.error && (
        <div
          role="alert"
          style={{
            padding: "12px 14px",
            background: "rgba(248,113,113,0.08)",
            border: "0.5px solid rgba(248,113,113,0.25)",
            color: AGE_RED,
            fontSize: 13,
            borderRadius: 12,
          }}
        >
          {result.error}
        </div>
      )}

      {result && !result.error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
          {/* Asosiy: yil + oy + kun */}
          <div
            style={{
              padding: "18px 16px",
              borderRadius: 18,
              background: `linear-gradient(135deg, ${(accent || AGE_ACCENT) + "20"}, ${(accent || AGE_ACCENT) + "08"})`,
              border: `1px solid ${(accent || AGE_ACCENT) + "40"}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              {isAge ? "Hozirgi yoshingiz" : "Qolgan vaqt"}
            </div>
            <div
              style={{
                display: "flex",
                gap: 14,
                alignItems: "baseline",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  color: accent || AGE_ACCENT,
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: -1,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
              >
                {result.ymd.years}
              </span>
              <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 }}>
                yil
              </span>
              <span
                style={{
                  color: accent || AGE_ACCENT,
                  fontSize: 28,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
              >
                {result.ymd.months}
              </span>
              <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 }}>
                oy
              </span>
              <span
                style={{
                  color: accent || AGE_ACCENT,
                  fontSize: 28,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
              >
                {result.ymd.days}
              </span>
              <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 }}>
                kun
              </span>
            </div>
          </div>

          {/* Statistika grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
            }}
          >
            <_StatCard
              label="Jami kun"
              value={_fmtNum(result.tots.days)}
              color="#60a5fa"
            />
            <_StatCard
              label="Jami soat"
              value={_fmtNum(result.tots.hours)}
              color="#34d399"
            />
            <_StatCard
              label="Jami daqiqa"
              value={_fmtNum(result.tots.minutes)}
              color="#fbbf24"
            />
            <_StatCard
              label="Jami soniya"
              value={_fmtNum(result.tots.seconds)}
              color="#fb7185"
            />
            <_StatCard
              label="Jami hafta"
              value={_fmtNum(result.tots.weeks)}
              color="#a78bfa"
            />
            <_StatCard
              label="Jami oy (~)"
              value={_fmtNum(result.tots.months)}
              color="#f472b6"
              sub="o'rtacha 30.44 kun"
            />
          </div>

          {/* Live indicator */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              alignSelf: "center",
              fontSize: 10.5,
              color: "var(--text-faint)",
              marginTop: 4,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: AGE_GREEN,
                animation: "pulse 1.4s ease-out infinite",
              }}
            />
            har soniya yangilanadi
          </div>
        </div>
      )}

      {/* Format yordami (faqat hech narsa kiritilmagan bo'lsa) */}
      {!fromStr && (
        <div
          style={{
            padding: "12px 14px",
            background: "var(--bg-surface-1)",
            border: "0.5px dashed var(--border-medium)",
            borderRadius: 12,
            color: "var(--text-muted)",
            fontSize: 12.5,
            lineHeight: 1.6,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <b style={{ color: "var(--text-secondary)" }}>Format misollar:</b>
          </div>
          <div>• <code style={{ color: AGE_ACCENT }}>06.05.2001</code> — kun.oy.yil</div>
          <div>• <code style={{ color: AGE_ACCENT }}>2001-05-06</code> — yil-oy-kun (ISO)</div>
          <div>• <code style={{ color: AGE_ACCENT }}>31/12/2026</code> — slash bilan</div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AgeCalculatorPro });
