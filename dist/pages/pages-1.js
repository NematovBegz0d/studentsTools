"use strict";

// EduBot — Pages
// HomePage, FreePage, PremiumPage

const {
  useState: u_S,
  useEffect: u_E,
  useMemo: u_M
} = React;

// ─────────────────────────────────────────────────────────────
// HOME
// ─────────────────────────────────────────────────────────────
function HomePage({
  t,
  accent,
  cardStyle,
  onOpenService,
  onGoTo,
  user
}) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t.studentRole;
  const firstName = user?.first_name || t.studentRole;
  const stats = [{
    label: t.stats.total,
    value: '38',
    fg: '#a78bfa'
  }, {
    label: t.stats.free,
    value: '28',
    fg: '#4ade80'
  }, {
    label: t.stats.premium,
    value: '10',
    fg: '#fbbf24'
  }, {
    label: t.stats.users,
    value: '12k+',
    fg: '#60a5fa'
  }];
  const quickIds = ['referat', 'amaliy', 'img2pdf', 'translate'];
  const quickItems = quickIds.map(id => {
    const pIdx = PREMIUM_SERVICES.findIndex(p => p.id === id);
    if (pIdx >= 0) {
      const s = PREMIUM_SERVICES[pIdx];
      return {
        ...s,
        isPremium: true,
        meta: t.p[id]
      };
    }
    const fIdx = FREE_SERVICES.findIndex(p => p.id === id);
    const s = FREE_SERVICES[fIdx];
    return {
      ...s,
      isPremium: false,
      meta: t.s[id]
    };
  });
  const aiUsed = 1;
  const aiLimit = 3;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 110
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 18px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: fullName,
    size: 48,
    ring: true,
    accent: accent
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-muted)',
      fontSize: 13,
      fontWeight: 500
    }
  }, t.hello, ","), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-primary)',
      fontSize: 20,
      fontWeight: 700,
      letterSpacing: -0.4
    }
  }, firstName, " \uD83D\uDC4B")), /*#__PURE__*/React.createElement("button", {
    className: "press",
    type: "button",
    style: {
      width: 40,
      height: 40,
      borderRadius: 12,
      background: 'var(--bg-surface-2)',
      border: '0.5px solid var(--border-light)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9zM9 21a3 3 0 0 0 6 0",
    stroke: "var(--text-secondary)",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 9,
      right: 10,
      width: 7,
      height: 7,
      borderRadius: 99,
      background: '#ef4444',
      border: '1.5px solid var(--bg-solid)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 18px 18px',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 8
    }
  }, stats.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: '10px 8px',
      background: 'var(--bg-surface-1)',
      border: '0.5px solid var(--border-subtle)',
      borderRadius: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: s.fg,
      fontSize: 20,
      fontWeight: 700,
      letterSpacing: -0.4
    }
  }, s.value), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-muted)',
      fontSize: 10,
      marginTop: 2,
      fontWeight: 500
    }
  }, s.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px 22px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "press",
    onClick: () => onGoTo('plans'),
    style: {
      width: '100%',
      textAlign: 'left',
      position: 'relative',
      overflow: 'hidden',
      padding: '18px 18px',
      borderRadius: 22,
      background: 'linear-gradient(120deg, #8b5cf6 0%, #6d28d9 45%, #3b82f6 100%)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      font: 'inherit',
      color: '#fff',
      boxShadow: '0 10px 30px rgba(139,92,246,0.30)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: -30,
      top: -30,
      width: 140,
      height: 140,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.08)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 30,
      bottom: -50,
      width: 80,
      height: 80,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: 13,
      background: 'rgba(255,255,255,0.18)',
      backdropFilter: 'blur(20px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 22,
    color: "#fff",
    strokeWidth: 1.8
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      letterSpacing: -0.2
    }
  }, t.bannerTitle), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      opacity: 0.85,
      marginTop: 3,
      textWrap: 'pretty'
    }
  }, t.bannerSub)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.18)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14M13 6l6 6-6 6",
    stroke: "#fff",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px 14px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      color: 'var(--text-primary)',
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: -0.2
    }
  }, t.quickAccess), /*#__PURE__*/React.createElement("button", {
    onClick: () => onGoTo('free'),
    style: {
      background: 'none',
      border: 'none',
      color: accent,
      fontSize: 12.5,
      fontWeight: 600,
      cursor: 'pointer',
      font: 'inherit'
    }
  }, t.viewAll, " \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px 22px',
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 10
    }
  }, quickItems.map(item => /*#__PURE__*/React.createElement("button", {
    key: item.id,
    className: "press",
    onClick: () => onOpenService(item, item.isPremium),
    style: {
      textAlign: 'left',
      padding: '14px 12px',
      background: item.isPremium ? 'linear-gradient(145deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))' : 'var(--bg-surface-2)',
      border: `0.5px solid ${item.isPremium ? 'rgba(245,158,11,0.22)' : 'var(--border-light)'}`,
      borderRadius: 16,
      cursor: 'pointer',
      font: 'inherit',
      color: 'var(--text-primary)',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: item.isPremium ? 'rgba(245,158,11,0.18)' : `${CAT_COLOR[item.cat] || '#a78bfa'}26`,
      border: `0.5px solid ${item.isPremium ? 'rgba(245,158,11,0.30)' : (CAT_COLOR[item.cat] || '#a78bfa') + '40'}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: item.id,
    size: 18,
    color: item.isPremium ? PREMIUM_COLOR : CAT_COLOR[item.cat] || '#a78bfa',
    strokeWidth: 1.8
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 3,
      lineHeight: 1.2
    }
  }, item.meta.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-muted)',
      lineHeight: 1.35,
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden'
    }
  }, item.meta.desc), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, item.isPremium ? /*#__PURE__*/React.createElement(Badge, {
    kind: "premium"
  }, t.aiBadge, " \u2022 Premium") : item.ai ? /*#__PURE__*/React.createElement(Badge, {
    kind: "ai"
  }, t.aiBadge) : /*#__PURE__*/React.createElement(Badge, {
    kind: "free"
  }, t.freeBadge))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px 22px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      borderRadius: 18,
      background: 'var(--bg-surface-1)',
      border: '0.5px solid var(--border-light)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 9,
      background: 'rgba(139,92,246,0.16)',
      border: '0.5px solid rgba(139,92,246,0.28)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "cpu",
    size: 16,
    color: "#a78bfa",
    strokeWidth: 1.8
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-primary)',
      fontSize: 13.5,
      fontWeight: 600
    }
  }, t.aiLimitTitle), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-muted)',
      fontSize: 11,
      marginTop: 2
    }
  }, t.aiLimitSub)), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-primary)',
      fontSize: 14,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums'
    }
  }, aiUsed, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)'
    }
  }, "/", aiLimit))), /*#__PURE__*/React.createElement(ProgressBar, {
    value: aiUsed,
    max: aiLimit,
    accent: "#8b5cf6",
    height: 6
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px 12px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      color: 'var(--text-primary)',
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: -0.2
    }
  }, t.recentActivity)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, t.activities.map((a, i) => {
    const fIdx = FREE_SERVICES.findIndex(s => s.id === a.id);
    const isPremium = fIdx < 0;
    const svc = isPremium ? PREMIUM_SERVICES.find(s => s.id === a.id) : FREE_SERVICES[fIdx];
    const meta = isPremium ? t.p[a.id] : t.s[a.id];
    if (!svc || !meta) return null;
    const catColor = isPremium ? PREMIUM_COLOR : CAT_COLOR[svc.cat] || '#a78bfa';
    const bg = isPremium ? 'rgba(245,158,11,0.16)' : `${catColor}1f`;
    const border = isPremium ? '0.5px solid rgba(245,158,11,0.30)' : `0.5px solid ${catColor}33`;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 12px',
        borderRadius: 14,
        background: 'var(--bg-surface-1)',
        border: '0.5px solid var(--border-subtle)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 36,
        height: 36,
        borderRadius: 10,
        background: bg,
        border: border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: svc.id,
      size: 18,
      color: catColor,
      strokeWidth: 1.8
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: 'var(--text-primary)',
        fontSize: 13.5,
        fontWeight: 600
      }
    }, meta.name), /*#__PURE__*/React.createElement("div", {
      style: {
        color: 'var(--text-muted)',
        fontSize: 11,
        marginTop: 1
      }
    }, a.time)), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 20,
        height: 20,
        borderRadius: 99,
        background: 'rgba(34,197,94,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "10",
      height: "10",
      viewBox: "0 0 24 24",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M5 12l4 4L19 6",
      stroke: "#4ade80",
      strokeWidth: "3",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))));
  })));
}

// ─────────────────────────────────────────────────────────────
// FREE
// ─────────────────────────────────────────────────────────────
function FreePage({
  t,
  accent,
  cardStyle,
  onOpenService
}) {
  const [q, setQ] = u_S('');
  const [cat, setCat] = u_S('all');
  const filtered = u_M(() => {
    let list = FREE_SERVICES;
    if (cat !== 'all') list = list.filter(s => s.cat === cat);
    if (q.trim()) {
      const Q = q.toLowerCase();
      list = list.filter(s => {
        const m = t.s[s.id];
        return m && (m.name.toLowerCase().includes(Q) || m.desc.toLowerCase().includes(Q));
      });
    }
    return list;
  }, [q, cat, t]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 110
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.tabs.free,
    sub: `28 ${t.freeBadge.toLowerCase()}`
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 18px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '11px 14px',
      borderRadius: 14,
      background: 'var(--bg-surface-2)',
      border: '0.5px solid var(--border-light)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7",
    stroke: "var(--text-muted)",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 21l-4.3-4.3",
    stroke: "var(--text-muted)",
    strokeWidth: "2",
    strokeLinecap: "round"
  })), /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: t.searchPlaceholder,
    style: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      color: 'var(--text-primary)',
      fontSize: 14,
      outline: 'none',
      font: 'inherit'
    }
  }), q && /*#__PURE__*/React.createElement("button", {
    onClick: () => setQ(''),
    style: {
      background: 'var(--bg-surface-3)',
      border: 'none',
      width: 18,
      height: 18,
      borderRadius: 99,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "9",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 6l12 12M18 6L6 18",
    stroke: "var(--text-secondary)",
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 0 14px',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'none'
    },
    className: "hide-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 7,
      padding: '0 18px',
      width: 'max-content'
    }
  }, CATEGORIES.map(c => {
    const active = cat === c.id;
    return /*#__PURE__*/React.createElement("button", {
      key: c.id,
      className: "press",
      onClick: () => setCat(c.id),
      style: {
        padding: '8px 14px',
        borderRadius: 99,
        background: active ? accent : 'var(--bg-surface-2)',
        border: `0.5px solid ${active ? accent : 'var(--border-light)'}`,
        color: active ? '#fff' : 'var(--text-secondary)',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
        font: 'inherit',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        boxShadow: active ? `0 4px 14px ${accent}40` : 'none',
        transition: 'all 0.18s'
      }
    }, t.cats[c.id]);
  }))), filtered.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '60px 30px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 42,
      marginBottom: 10
    }
  }, "\uD83D\uDD0D"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-primary)',
      fontSize: 16,
      fontWeight: 600
    }
  }, t.noResults), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-muted)',
      fontSize: 13,
      marginTop: 4
    }
  }, t.noResultsSub)) : /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px',
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 10
    }
  }, filtered.map(s => /*#__PURE__*/React.createElement(ServiceCard, {
    key: s.id,
    service: s,
    t: t,
    cardStyle: cardStyle,
    onClick: () => onOpenService(s, false)
  }))));
}

// ─────────────────────────────────────────────────────────────
// PREMIUM
// ─────────────────────────────────────────────────────────────
function PremiumPage({
  t,
  accent,
  isSubscribed,
  onOpenService,
  onGoTo
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 110
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.tabs.premium,
    sub: `10 AI ${t.tabs.premium.toLowerCase()}`
  }), !isSubscribed && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 14px',
      borderRadius: 14,
      background: 'rgba(245,158,11,0.10)',
      border: '0.5px solid rgba(245,158,11,0.22)',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "5",
    y: "11",
    width: "14",
    height: "10",
    rx: "2",
    stroke: "#fbbf24",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 11V8a4 4 0 1 1 8 0v3",
    stroke: "#fbbf24",
    strokeWidth: "2",
    strokeLinecap: "round"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: '#fbbf24',
      fontSize: 12,
      fontWeight: 600
    }
  }, t.premiumLocked), /*#__PURE__*/React.createElement("button", {
    onClick: () => onGoTo('plans'),
    style: {
      padding: '6px 12px',
      borderRadius: 99,
      background: '#f59e0b',
      color: '#fff',
      border: 'none',
      fontSize: 11.5,
      fontWeight: 700,
      cursor: 'pointer',
      font: 'inherit'
    }
  }, t.subscribe))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, PREMIUM_SERVICES.map(s => {
    const meta = t.p[s.id];
    if (!meta) return null;
    return /*#__PURE__*/React.createElement("button", {
      key: s.id,
      className: "press",
      onClick: () => onOpenService(s, true),
      style: {
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'left',
        padding: 14,
        borderRadius: 18,
        background: 'linear-gradient(140deg, rgba(245,158,11,0.08), rgba(139,92,246,0.04) 60%, var(--bg-surface-1))',
        border: '0.5px solid rgba(245,158,11,0.18)',
        cursor: 'pointer',
        font: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 52,
        height: 52,
        borderRadius: 14,
        background: 'rgba(245,158,11,0.16)',
        border: '0.5px solid rgba(245,158,11,0.30)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: s.id,
      size: 24,
      color: PREMIUM_COLOR,
      strokeWidth: 1.8
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 3
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: 'var(--text-primary)',
        fontSize: 14.5,
        fontWeight: 700,
        letterSpacing: -0.15
      }
    }, meta.name), s.badge && /*#__PURE__*/React.createElement(Badge, {
      kind: s.badge.toLowerCase()
    }, s.badge)), /*#__PURE__*/React.createElement("div", {
      style: {
        color: 'var(--text-secondary)',
        fontSize: 11.5,
        lineHeight: 1.35,
        textWrap: 'pretty'
      }
    }, meta.desc), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#fbbf24',
        fontSize: 13,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums'
      }
    }, s.price.toLocaleString('ru-RU')), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-muted)',
        fontSize: 11
      }
    }, t.perRequest))), !isSubscribed && /*#__PURE__*/React.createElement("div", {
      style: {
        width: 32,
        height: 32,
        borderRadius: 10,
        background: 'var(--bg-surface-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "5",
      y: "11",
      width: "14",
      height: "10",
      rx: "2",
      stroke: "var(--text-secondary)",
      strokeWidth: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 11V8a4 4 0 1 1 8 0v3",
      stroke: "var(--text-secondary)",
      strokeWidth: "2",
      strokeLinecap: "round"
    }))));
  })), !isSubscribed && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 18px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 22,
      padding: '20px 18px',
      background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 60%, #8b5cf6 100%)',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: -20,
      top: -20,
      width: 100,
      height: 100,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.12)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      marginBottom: 4,
      letterSpacing: -0.3
    }
  }, t.bannerTitle), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      opacity: 0.92,
      marginBottom: 14,
      textWrap: 'pretty'
    }
  }, t.bannerSub), /*#__PURE__*/React.createElement("button", {
    onClick: () => onGoTo('plans'),
    className: "press",
    style: {
      padding: '11px 20px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.95)',
      color: '#1a1a24',
      border: 'none',
      fontSize: 13.5,
      fontWeight: 700,
      cursor: 'pointer',
      font: 'inherit'
    }
  }, t.subscribe, " \u2192")))));
}
Object.assign(window, {
  HomePage,
  FreePage,
  PremiumPage
});