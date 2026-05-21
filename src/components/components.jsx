// EduBot — shared UI components
// Card, Badge, BottomSheet, BottomNav, AvatarBubble, etc.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Accent + card style helpers (driven by Tweaks) ─────────────
function useCardClass(cardStyle) {
  // returns a className suffix: 'glass' | 'flat' | 'gradient'
  return cardStyle || 'glass';
}

// ─── Badge ──────────────────────────────────────────────────────
function Badge({ kind = 'free', children }) {
  const styles = {
    free:    { bg: 'rgba(34,197,94,0.16)',  fg: '#4ade80', bd: 'rgba(34,197,94,0.28)' },
    new:     { bg: 'rgba(59,130,246,0.16)', fg: '#60a5fa', bd: 'rgba(59,130,246,0.28)' },
    ai:      { bg: 'rgba(139,92,246,0.16)', fg: '#a78bfa', bd: 'rgba(139,92,246,0.28)' },
    premium: { bg: 'rgba(245,158,11,0.16)', fg: '#fbbf24', bd: 'rgba(245,158,11,0.32)' },
    pro:     { bg: 'rgba(245,158,11,0.16)', fg: '#fbbf24', bd: 'rgba(245,158,11,0.32)' },
    popular: { bg: 'rgba(239,68,68,0.18)',  fg: '#fb7185', bd: 'rgba(239,68,68,0.30)' },
  };
  const s = styles[kind] || styles.free;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 7px', borderRadius: 999,
      background: s.bg, color: s.fg, border: `0.5px solid ${s.bd}`,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
      textTransform: 'uppercase', whiteSpace: 'nowrap',
      lineHeight: 1.4,
    }}>{children}</span>
  );
}

// ─── ServiceCard (grid item for Free) ───────────────────────────
function ServiceCard({ service, t, cardStyle, onClick }) {
  const meta = t.s[service.id];
  if (!meta) return null;

  const baseBg = {
    glass:    'rgba(255,255,255,0.04)',
    flat:     '#171720',
    gradient: 'linear-gradient(145deg, rgba(139,92,246,0.10), rgba(59,130,246,0.06) 50%, rgba(255,255,255,0.02))',
  }[cardStyle];
  const baseBd = cardStyle === 'flat' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)';

  const catColor = CAT_COLOR[service.cat] || '#a78bfa';

  return (
    <button
      className="srv-card press"
      onClick={onClick}
      style={{
        position: 'relative', textAlign: 'left',
        background: baseBg,
        border: `0.5px solid ${baseBd}`,
        backdropFilter: cardStyle === 'glass' ? 'blur(20px) saturate(160%)' : 'none',
        WebkitBackdropFilter: cardStyle === 'glass' ? 'blur(20px) saturate(160%)' : 'none',
        borderRadius: 18, padding: '14px 12px 12px',
        color: '#fff', font: 'inherit', cursor: 'pointer',
        minHeight: 138, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {cardStyle === 'gradient' && (
        <div style={{
          position: 'absolute', top: -30, right: -20, width: 80, height: 80,
          background: `radial-gradient(circle, ${catColor}40, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}
      <div style={{
        width: 38, height: 38, borderRadius: 11,
        background: `${catColor}1f`,
        border: `0.5px solid ${catColor}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
      }}>
        <Icon name={service.id} size={20} color={catColor} strokeWidth={1.8} />
      </div>
      <div style={{
        fontSize: 13.5, fontWeight: 600, lineHeight: 1.25,
        marginBottom: 4, color: '#fff',
      }}>{meta.name}</div>
      <div style={{
        fontSize: 11, color: 'rgba(255,255,255,0.5)',
        lineHeight: 1.35, flex: 1, textWrap: 'pretty',
      }}>{meta.desc}</div>
      <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
        <Badge kind="free">{t.freeBadge}</Badge>
        {service.new && <Badge kind="new">{t.newBadge}</Badge>}
        {service.ai && <Badge kind="ai">{t.aiBadge}</Badge>}
      </div>
    </button>
  );
}

// ─── BottomNav ──────────────────────────────────────────────────
const NAV_ICONS = {
  home:    'M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1v-8.5z',
  free:    'M9 12l2 2 4-4M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z',
  premium: 'M12 2l2.4 6.9 7.3.3-5.8 4.5 2 7-5.9-4.2L6.1 21l2-7-5.8-4.5 7.3-.3L12 2z',
  plans:   'M3 7h18M3 12h18M3 17h12',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z',
};

function BottomNav({ tab, setTab, t, accent }) {
  const tabs = [
    { id: 'home',    label: t.tabs.home },
    { id: 'free',    label: t.tabs.free },
    { id: 'premium', label: t.tabs.premium },
    { id: 'plans',   label: t.tabs.plans },
    { id: 'profile', label: t.tabs.profile },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingBottom: 24, zIndex: 30,
      background: 'linear-gradient(180deg, rgba(10,10,15,0) 0%, rgba(10,10,15,0.85) 35%, #0a0a0f 75%)',
    }}>
      <div style={{
        margin: '0 12px', borderRadius: 24,
        background: 'rgba(20,20,28,0.78)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '0.5px solid rgba(255,255,255,0.08)',
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
        padding: '8px 6px',
      }}>
        {tabs.map(x => {
          const active = tab === x.id;
          return (
            <button
              key={x.id}
              className="press"
              onClick={() => setTab(x.id)}
              style={{
                background: 'transparent', border: 0, padding: '6px 4px 4px',
                color: active ? accent : 'rgba(255,255,255,0.45)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                font: 'inherit', cursor: 'pointer',
                transition: 'color 0.2s',
              }}
            >
              <div style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d={NAV_ICONS[x.id]}
                    stroke={active ? accent : 'rgba(255,255,255,0.5)'}
                    fill={active && x.id === 'premium' ? accent : 'none'}
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {active && (
                  <div style={{
                    position: 'absolute', top: -10, left: '50%',
                    width: 4, height: 4, borderRadius: 99,
                    background: accent, transform: 'translateX(-50%)',
                    boxShadow: `0 0 6px ${accent}`,
                  }} />
                )}
              </div>
              <span style={{
                fontSize: 10, fontWeight: active ? 600 : 500, letterSpacing: 0.1,
              }}>{x.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bottom Sheet (modal) ───────────────────────────────────────
function BottomSheet({ open, onClose, children, height = 'auto' }) {
  const [mounted, setMounted] = useState(open);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // next frame to trigger transition
      requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    } else {
      setShow(false);
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'flex-end',
      pointerEvents: show ? 'auto' : 'none',
    }}>
      {/* scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          opacity: show ? 1 : 0, transition: 'opacity 0.28s ease',
        }}
      />
      {/* sheet */}
      <div style={{
        position: 'relative', width: '100%',
        background: '#15151d',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        paddingBottom: 30,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        transform: show ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.36s cubic-bezier(0.32, 0.72, 0.2, 1)',
        maxHeight: '88%', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 99,
          background: 'rgba(255,255,255,0.2)',
          margin: '10px auto 6px', flexShrink: 0,
        }} />
        <div style={{ overflow: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────
function Avatar({ name = '?', size = 48, ring = false, accent }) {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.4,
      flexShrink: 0,
      boxShadow: ring ? `0 0 0 2px ${accent}, 0 0 0 4px rgba(0,0,0,0.5)` : 'none',
      letterSpacing: 0.2,
    }}>{initials}</div>
  );
}

// ─── Button (primary CTA) ───────────────────────────────────────
function Button({ children, variant = 'primary', accent, size = 'md', icon, full, onClick, disabled, style }) {
  const pad = size === 'lg' ? '15px 22px' : size === 'sm' ? '8px 14px' : '12px 18px';
  const fs = size === 'lg' ? 16 : size === 'sm' ? 12 : 14;

  const variants = {
    primary: {
      background: accent,
      color: '#fff',
      border: 'none',
      boxShadow: `0 8px 24px ${accent}40`,
    },
    secondary: {
      background: 'rgba(255,255,255,0.06)',
      color: '#fff',
      border: '0.5px solid rgba(255,255,255,0.12)',
    },
    ghost: {
      background: 'transparent',
      color: 'rgba(255,255,255,0.7)',
      border: 'none',
    },
    danger: {
      background: 'rgba(239,68,68,0.12)',
      color: '#fb7185',
      border: '0.5px solid rgba(239,68,68,0.2)',
    },
  };

  return (
    <button
      className="press"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        padding: pad, fontSize: fs, fontWeight: 600,
        borderRadius: 14, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: full ? '100%' : 'auto',
        font: 'inherit', fontWeight: 600,
        letterSpacing: -0.1,
        ...style,
      }}
    >
      {icon}{children}
    </button>
  );
}

// ─── ProgressBar ────────────────────────────────────────────────
function ProgressBar({ value, max = 100, accent, height = 6, showLabel = false }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        width: '100%', height, background: 'rgba(255,255,255,0.08)',
        borderRadius: 99, overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
          borderRadius: 99,
          transition: 'width 0.5s ease',
          boxShadow: `0 0 12px ${accent}80`,
        }} />
      </div>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [msg, onDone]);

  return (
    <div style={{
      position: 'absolute', top: 64, left: 0, right: 0,
      display: 'flex', justifyContent: 'center', zIndex: 200,
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'rgba(20,20,28,0.92)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '0.5px solid rgba(255,255,255,0.12)',
        borderRadius: 99, padding: '10px 18px',
        color: '#fff', fontSize: 13, fontWeight: 500,
        boxShadow: '0 12px 28px rgba(0,0,0,0.4)',
        transform: msg ? 'translateY(0)' : 'translateY(-100%)',
        opacity: msg ? 1 : 0,
        transition: 'transform 0.3s, opacity 0.3s',
      }}>{msg}</div>
    </div>
  );
}

// ─── PageHeader (with title + optional right slot) ──────────────
function PageHeader({ title, sub, right, large = false }) {
  return (
    <div style={{
      padding: '22px 18px 10px', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {sub && (
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.5)',
            marginBottom: 4, fontWeight: 500,
          }}>{sub}</div>
        )}
        <h1 style={{
          margin: 0, color: '#fff',
          fontSize: large ? 30 : 26, fontWeight: 800,
          letterSpacing: -0.6, lineHeight: 1.15,
        }}>{title}</h1>
      </div>
      {right}
    </div>
  );
}

// ─── Skeleton (loading placeholder) ─────────────────────────────
function Skeleton({ w = '100%', h = 16, r = 8, style = {} }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))',
      backgroundSize: '200% 100%',
      animation: 'skel 1.4s infinite linear',
      ...style,
    }} />
  );
}

Object.assign(window, {
  Badge, ServiceCard, BottomNav, BottomSheet, Avatar,
  Button, ProgressBar, Toast, PageHeader, Skeleton, useCardClass,
});
