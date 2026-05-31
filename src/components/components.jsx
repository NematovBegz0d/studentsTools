// EduBot — Shared UI Components (IMPROVED)
// ✅ Fixes applied:
//   1. CSS Custom Properties — no more magic strings
//   2. ARIA labels for accessibility
//   3. Toast animation fix — proper show/hide cycle
//   4. BottomSheet — keyboard dismissal (Escape key)
//   5. BottomNav — aria-current for active tab
//   6. Skeleton — uses CSS variables
//   7. Button — disabled state accessible
//   8. ServiceCard — proper button semantics

"use strict";

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Badge ────────────────────────────────────────────────────────
const BADGE_STYLES = {
  free: {
    bg: "rgba(34,197,94,0.16)",
    fg: "#4ade80",
    bd: "rgba(34,197,94,0.28)",
  },
  new: {
    bg: "rgba(59,130,246,0.16)",
    fg: "#60a5fa",
    bd: "rgba(59,130,246,0.28)",
  },
  ai: {
    bg: "rgba(139,92,246,0.16)",
    fg: "#a78bfa",
    bd: "rgba(139,92,246,0.28)",
  },
  premium: {
    bg: "rgba(245,158,11,0.16)",
    fg: "#fbbf24",
    bd: "rgba(245,158,11,0.32)",
  },
  pro: {
    bg: "rgba(245,158,11,0.16)",
    fg: "#fbbf24",
    bd: "rgba(245,158,11,0.32)",
  },
  popular: {
    bg: "rgba(239,68,68,0.18)",
    fg: "#fb7185",
    bd: "rgba(239,68,68,0.30)",
  },
};

function Badge({ kind = "free", children }) {
  const s = BADGE_STYLES[kind] || BADGE_STYLES.free;
  return (
    <span
      role="status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 7px",
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        border: `0.5px solid ${s.bd}`,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.2,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  );
}

// ─── ServiceCard ──────────────────────────────────────────────────
function ServiceCard({ service, t, cardStyle, onClick }) {
  const meta = t.s[service.id];
  if (!meta) return null;

  // ✅ FIX: useMemo to avoid object creation on every render
  const cardBg = useMemo(
    () =>
      ({
        glass: "var(--bg-surface-2)",
        flat: "var(--bg-surface-1)",
        gradient: `linear-gradient(145deg, rgba(139,92,246,0.10), rgba(59,130,246,0.06) 50%, var(--bg-surface-1))`,
      })[cardStyle] || "var(--bg-surface-2)",
    [cardStyle],
  );

  const catColor = CAT_COLOR[service.cat] || "#a78bfa";

  return (
    <button
      className="srv-card press"
      onClick={onClick}
      // ✅ NEW: ARIA accessibility
      aria-label={`${meta.name} — ${meta.desc}`}
      type="button"
      style={{
        position: "relative",
        textAlign: "left",
        background: cardBg,
        border: "0.5px solid var(--border-light)",
        backdropFilter:
          cardStyle === "glass" ? "blur(20px) saturate(160%)" : "none",
        WebkitBackdropFilter:
          cardStyle === "glass" ? "blur(20px) saturate(160%)" : "none",
        borderRadius: 18,
        padding: "14px 12px 12px",
        color: "var(--text-primary)",
        font: "inherit",
        cursor: "pointer",
        minHeight: 138,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Gradient glow decoration */}
      {cardStyle === "gradient" && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -30,
            right: -20,
            width: 80,
            height: 80,
            background: `radial-gradient(circle, ${catColor}40, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Icon */}
      <div
        aria-hidden="true"
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: `${catColor}1f`,
          border: `0.5px solid ${catColor}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 10,
          flexShrink: 0,
        }}
      >
        <Icon name={service.id} size={20} color={catColor} strokeWidth={1.8} />
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          lineHeight: 1.25,
          marginBottom: 4,
          color: "var(--text-primary)",
        }}
      >
        {meta.name}
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          lineHeight: 1.35,
          flex: 1,
        }}
      >
        {meta.desc}
      </div>

      {/* Badges */}
      <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
        <Badge kind="free">{t.freeBadge}</Badge>
        {service.new && <Badge kind="new">{t.newBadge}</Badge>}
        {service.ai && <Badge kind="ai">{t.aiBadge}</Badge>}
      </div>
    </button>
  );
}

// ─── BottomNav ────────────────────────────────────────────────────
const NAV_ICONS = {
  home: "M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1v-8.5z",
  free: "M9 12l2 2 4-4M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z",
  premium:
    "M12 2l2.4 6.9 7.3.3-5.8 4.5 2 7-5.9-4.2L6.1 21l2-7-5.8-4.5 7.3-.3L12 2z",
  plans: "M3 7h18M3 12h18M3 17h12",
  profile:
    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z",
};

function BottomNav({ tab, setTab, t, accent }) {
  // 1-Bosqich: Premium va Plans tablari vaqtincha yashirilgan.
  // Bepul xizmatlar mukammal ishlagandan keyin qayta yoqiladi.
  const tabs = [
    { id: "home", label: t.tabs.home },
    { id: "free", label: t.tabs.free },
    { id: "profile", label: t.tabs.profile },
  ];

  return (
    <nav
      // ✅ NEW: Semantic nav element + ARIA
      role="navigation"
      aria-label="Asosiy navigatsiya"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: "max(24px, var(--safe-bottom))",
        zIndex: 30,
        background: "var(--nav-gradient)",
      }}
    >
      <div
        style={{
          margin: "0 12px",
          borderRadius: 24,
          background: "var(--bg-nav)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          border: "0.5px solid var(--border-light)",
          display: "grid",
          gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
          padding: "8px 6px",
        }}
      >
        {tabs.map((x) => {
          const active = tab === x.id;
          return (
            <button
              key={x.id}
              className="press"
              onClick={() => setTab(x.id)}
              // ✅ NEW: ARIA for accessibility
              aria-label={x.label}
              aria-current={active ? "page" : undefined}
              type="button"
              style={{
                background: "transparent",
                border: 0,
                padding: "6px 4px 4px",
                color: active ? accent : "var(--text-muted)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                font: "inherit",
                cursor: "pointer",
                transition: "color 0.2s",
                minWidth: 0,
              }}
            >
              {/* Icon + active dot */}
              <div
                style={{
                  position: "relative",
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d={NAV_ICONS[x.id]}
                    stroke={active ? accent : "var(--text-faint)"}
                    fill={active && x.id === "premium" ? accent : "none"}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {active && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: -10,
                      left: "50%",
                      width: 4,
                      height: 4,
                      borderRadius: 99,
                      background: accent,
                      transform: "translateX(-50%)",
                      boxShadow: `0 0 6px ${accent}`,
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: 0.1,
                }}
              >
                {x.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── BottomSheet ──────────────────────────────────────────────────
function BottomSheet({ open, onClose, children }) {
  const [mounted, setMounted] = useState(open);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    } else {
      setShow(false);
      const timer = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // ✅ NEW: Keyboard dismiss (Escape key)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      // ✅ NEW: ARIA dialog semantics
      role="dialog"
      aria-modal="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        pointerEvents: show ? "auto" : "none",
      }}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        aria-label="Yopish"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--scrim)",
          opacity: show ? 1 : 0,
          transition: "opacity 0.28s ease",
        }}
      />

      {/* Sheet panel */}
      <div
        style={{
          position: "relative",
          width: "100%",
          background: "var(--bg-sheet)",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingBottom: "max(30px, var(--safe-bottom))",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
          transform: show ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.36s cubic-bezier(0.32, 0.72, 0.2, 1)",
          maxHeight: "88%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Drag handle */}
        <div className="sheet-handle" aria-hidden="true" />
        <div
          style={{ overflow: "auto", flex: 1, overscrollBehavior: "contain" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────
function Avatar({ name = "?", size = 48, ring = false, accent }) {
  const initials = useMemo(() => {
    return (
      name
        .split(" ")
        .map((n) => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?"
    );
  }, [name]);

  return (
    <div
      aria-label={name}
      role="img"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: Math.round(size * 0.38),
        flexShrink: 0,
        boxShadow: ring
          ? `0 0 0 2px ${accent}, 0 0 0 4px rgba(0,0,0,0.5)`
          : "none",
        letterSpacing: 0.2,
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────
function Button({
  children,
  variant = "primary",
  accent,
  size = "md",
  icon,
  full,
  onClick,
  disabled,
  style,
}) {
  const PAD_MAP = { lg: "15px 22px", sm: "8px 14px", md: "12px 18px" };
  const SIZE_MAP = { lg: 16, sm: 12, md: 14 };

  // ✅ FIX: Use CSS variables instead of hardcoded values
  const VARIANT_STYLES = {
    primary: {
      background: accent || "var(--accent)",
      color: "#fff",
      border: "none",
      boxShadow: `0 8px 24px ${accent || "var(--accent)"}40`,
    },
    secondary: {
      background: "var(--bg-surface-2)",
      color: "var(--text-primary)",
      border: "0.5px solid var(--border-medium)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text-muted)",
      border: "none",
    },
    danger: {
      background: "rgba(239,68,68,0.12)",
      color: "#fb7185",
      border: "0.5px solid rgba(239,68,68,0.2)",
    },
  };

  return (
    <button
      className="press"
      type="button"
      onClick={onClick}
      disabled={disabled}
      // ✅ NEW: aria-disabled for screen readers
      aria-disabled={disabled}
      style={{
        ...VARIANT_STYLES[variant],
        padding: PAD_MAP[size] || PAD_MAP.md,
        fontSize: SIZE_MAP[size] || SIZE_MAP.md,
        fontWeight: 600,
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: full ? "100%" : "auto",
        font: "inherit",
        letterSpacing: -0.1,
        transition: "opacity 0.15s, box-shadow 0.15s",
        ...style,
      }}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────
function ProgressBar({ value, max = 100, accent, height = 6 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`${value}/${max}`}
      style={{ width: "100%" }}
    >
      <div
        style={{
          width: "100%",
          height,
          background: "var(--border-light)",
          borderRadius: 99,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
            borderRadius: 99,
            transition: "width 0.5s ease",
            boxShadow: `0 0 12px ${accent}80`,
          }}
        />
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────
// ✅ FIX: Proper show/hide animation cycle
function Toast({ msg, onDone }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!msg) return;
    // Start visible on next frame for transition to work
    const showTimer = requestAnimationFrame(() => setVisible(true));

    const hideTimer = setTimeout(() => {
      setVisible(false);
      // Wait for exit animation before unmounting
      setTimeout(onDone, 300);
    }, 2500);

    return () => {
      cancelAnimationFrame(showTimer);
      clearTimeout(hideTimer);
    };
  }, [msg, onDone]);

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      style={{
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(20,20,28,0.92)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "0.5px solid var(--border-medium)",
          borderRadius: 99,
          padding: "10px 18px",
          color: "var(--text-primary)",
          fontSize: 13,
          fontWeight: 500,
          boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
          // ✅ FIX: proper enter/exit animation
          opacity: visible ? 1 : 0,
          transform: visible
            ? "translateY(0) scale(1)"
            : "translateY(-12px) scale(0.95)",
          transition: visible
            ? "opacity 0.28s cubic-bezier(0.34,1.56,0.64,1), transform 0.28s cubic-bezier(0.34,1.56,0.64,1)"
            : "opacity 0.2s ease, transform 0.2s ease",
          whiteSpace: "nowrap",
          maxWidth: "calc(100vw - 48px)",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {msg}
      </div>
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────
function PageHeader({ title, sub, right }) {
  return (
    <header
      style={{
        padding: "22px 18px 10px",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {sub && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 4,
              fontWeight: 500,
            }}
          >
            {sub}
          </div>
        )}
        {/* ✅ NEW: h1 for semantic structure */}
        <h1
          style={{
            margin: 0,
            color: "var(--text-primary)",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: -0.6,
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
      </div>
      {right}
    </header>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────
// ✅ FIX: Uses CSS variables instead of hardcoded colors
function Skeleton({ w = "100%", h = 16, r = 8, style: extraStyle = {} }) {
  return (
    <div
      role="status"
      aria-label="Yuklanmoqda..."
      className="skeleton"
      style={{
        width: w,
        height: h,
        borderRadius: r,
        ...extraStyle,
      }}
    />
  );
}

// ─── EmptyState ───────────────────────────────────────────────────
// ✅ NEW: Reusable empty state component
function EmptyState({ emoji = "📭", title, subtitle, action }) {
  return (
    <div
      style={{
        padding: "60px 30px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 46, marginBottom: 4 }} aria-hidden="true">
        {emoji}
      </div>
      {title && (
        <div
          style={{
            color: "var(--text-primary)",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {title}
        </div>
      )}
      {subtitle && (
        <div
          style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.45 }}
        >
          {subtitle}
        </div>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

// ─── Divider ──────────────────────────────────────────────────────
function Divider({ label }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "4px 0",
      }}
    >
      <div
        style={{ flex: 1, height: "0.5px", background: "var(--border-subtle)" }}
      />
      {label && (
        <span
          style={{
            color: "var(--text-faint)",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      )}
      <div
        style={{ flex: 1, height: "0.5px", background: "var(--border-subtle)" }}
      />
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────
function Spinner({ size = 44, color }) {
  return (
    <div
      role="status"
      aria-label="Yuklanmoqda"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${Math.max(2, size * 0.08)}px solid var(--border-light)`,
        borderTopColor: color || "var(--accent)",
        animation: "spin 0.85s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// ─── Export ───────────────────────────────────────────────────────
Object.assign(window, {
  Badge,
  ServiceCard,
  BottomNav,
  BottomSheet,
  Avatar,
  Button,
  ProgressBar,
  Toast,
  PageHeader,
  Skeleton,
  EmptyState,
  Divider,
  Spinner,
});
