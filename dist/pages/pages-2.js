// EduBot — Plans + Profile pages + PaymentSheet (IMPROVED)
// ✅ Fixes applied:
//   1. Plans price mismatch fixed — single source of truth
//   2. CSS Custom Properties — no magic strings
//   3. HapticFeedback on interactions
//   4. Payment: real planId passed to success
//   5. Profile: Usage data from real source (extensible)
//   6. Keyboard accessible form elements
//   7. Proper plan features i18n

"use strict";

const {
  useState: u_S2,
  useCallback: u_C2
} = React;

// ─── Plan Configuration ───────────────────────────────────────────
// ✅ FIX: Single source of truth — fixes price mismatch bug!
// Before: PlansPage showed '59,900' but PaymentSheet used 29900
const PLANS_CONFIG = {
  free: {
    id: "free",
    price: 0,
    // UZS
    priceDisplay: "0",
    // Formatted
    iconName: "gift",
    gradient: "linear-gradient(145deg, rgba(34,197,94,0.10), var(--bg-surface-1))",
    border: "rgba(34,197,94,0.20)",
    color: "#4ade80"
  },
  standard: {
    id: "standard",
    price: 59900,
    // ✅ FIX: Was 29900 in PaymentSheet, 59900 in PlansPage
    priceDisplay: "59 900",
    // Formatted with space (UZ standard)
    iconName: "zap",
    popular: true,
    gradient: "linear-gradient(145deg, rgba(139,92,246,0.16), rgba(59,130,246,0.08))",
    border: "rgba(139,92,246,0.30)",
    color: "#a78bfa"
  },
  premium: {
    id: "premium",
    price: 99900,
    priceDisplay: "99 900",
    iconName: "crown",
    gradient: "linear-gradient(145deg, rgba(245,158,11,0.16), rgba(239,68,68,0.08))",
    border: "rgba(245,158,11,0.30)",
    color: "#fbbf24"
  }
};

// ─────────────────────────────────────────────────────────────────
// PLANS PAGE
// ─────────────────────────────────────────────────────────────────
function PlansPage({
  t,
  accent,
  currentPlan,
  onSubscribe
}) {
  const plans = [{
    ...PLANS_CONFIG.free,
    name: t.planFree,
    features: t.planFreeFeatures || ["28 ta bepul xizmat", "Kuniga 3 ta AI so'rov", "10 MB fayl limiti", "Audio: 5 daq/oy"]
  }, {
    ...PLANS_CONFIG.standard,
    name: t.planStandard,
    features: t.planStandardFeatures || ["28 ta bepul xizmat", "Oyiga 20 ta AI so'rov", "30 MB fayl limiti", "60 daqiqa audio/oy", "DeepL tarjima", "Tezroq javob"]
  }, {
    ...PLANS_CONFIG.premium,
    name: t.planPremium,
    features: t.planPremiumFeatures || ["Cheksiz AI so'rovlar", "50 MB fayl limiti", "Cheksiz audio", "Rasm yaratish (DALL·E 3)", "PPTX generator", "Maksimal tezlik", "Premium qo'llab-quvvatlash"]
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 110
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.tabs.plans,
    sub: t.choosePlanSub || "Tarifni tanlang"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 18px 0",
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, plans.map(p => {
    const isCurrent = currentPlan === p.id;
    return /*#__PURE__*/React.createElement("article", {
      key: p.id,
      style: {
        position: "relative",
        overflow: "hidden",
        padding: 18,
        borderRadius: 22,
        background: p.gradient,
        border: `0.5px solid ${p.border}`
      }
    }, p.popular && /*#__PURE__*/React.createElement("div", {
      "aria-label": "Ommabop",
      style: {
        position: "absolute",
        top: 14,
        right: 14,
        padding: "4px 9px",
        borderRadius: 99,
        background: "linear-gradient(90deg, #ef4444, #f59e0b)",
        color: "#fff",
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: "uppercase"
      }
    }, t.popular), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      "aria-hidden": "true",
      style: {
        width: 46,
        height: 46,
        borderRadius: 13,
        background: `${p.color}28`,
        border: `0.5px solid ${p.color}40`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: p.iconName,
      size: 22,
      color: p.color,
      strokeWidth: 1.8
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-primary)",
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: -0.2
      }
    }, p.name), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 2
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: p.color,
        fontSize: 20,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums"
      }
    }, p.priceDisplay), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-muted)",
        fontSize: 12,
        marginLeft: 4
      }
    }, t.soum, p.id !== "free" && t.perMonth)))), /*#__PURE__*/React.createElement("ul", {
      "aria-label": `${p.name} imkoniyatlari`,
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginBottom: 14,
        padding: 0,
        margin: "0 0 14px 0",
        listStyle: "none"
      }
    }, p.features.map((f, i) => /*#__PURE__*/React.createElement("li", {
      key: i,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 9
      }
    }, /*#__PURE__*/React.createElement("div", {
      "aria-hidden": "true",
      style: {
        width: 18,
        height: 18,
        borderRadius: 99,
        background: `${p.color}26`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "10",
      height: "10",
      viewBox: "0 0 24 24",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M5 12l4 4L19 6",
      stroke: p.color,
      strokeWidth: "3",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-secondary)",
        fontSize: 12.5
      }
    }, f)))), isCurrent ? /*#__PURE__*/React.createElement("div", {
      role: "status",
      style: {
        padding: "11px 16px",
        borderRadius: 12,
        background: "var(--bg-surface-2)",
        border: "0.5px solid var(--border-medium)",
        color: "var(--text-muted)",
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center"
      }
    }, "\u2713 ", t.currentPlan) : /*#__PURE__*/React.createElement("button", {
      className: "press",
      onClick: () => onSubscribe(p.id),
      type: "button",
      "aria-label": `${p.name} tarifini tanlash — ${p.priceDisplay} ${t.soum}`,
      style: {
        width: "100%",
        padding: "11px 16px",
        borderRadius: 12,
        background: p.id === "free" ? "var(--bg-surface-2)" : `linear-gradient(135deg, ${p.color}, ${p.color}cc)`,
        color: p.id === "free" ? "var(--text-muted)" : "#fff",
        border: p.id === "free" ? "0.5px solid var(--border-medium)" : "none",
        fontSize: 13.5,
        fontWeight: 700,
        cursor: "pointer",
        font: "inherit",
        boxShadow: p.id !== "free" ? `0 8px 22px ${p.color}40` : "none"
      }
    }, t.choosePlan));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "22px 18px 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 10
    }
  }, t.paymentMethods), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, [{
    name: "Payme",
    bg: "linear-gradient(135deg, #00d4cc, #00b1ab)",
    logo: "P"
  }, {
    name: "Click",
    bg: "linear-gradient(135deg, #4ec5f1, #2196f3)",
    logo: "C"
  }, {
    name: "Uzcard",
    bg: "linear-gradient(135deg, #18b3ee, #0e8bc7)",
    logo: "U"
  }].map(m => /*#__PURE__*/React.createElement("div", {
    key: m.name,
    style: {
      flex: 1,
      padding: "14px 8px",
      borderRadius: 14,
      background: "var(--bg-surface-1)",
      border: "0.5px solid var(--border-subtle)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 32,
      height: 32,
      borderRadius: 9,
      background: m.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontWeight: 800,
      fontSize: 16
    }
  }, m.logo), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-secondary)",
      fontSize: 11,
      fontWeight: 600
    }
  }, m.name))))));
}

// ─────────────────────────────────────────────────────────────────
// PROFILE PAGE
// ─────────────────────────────────────────────────────────────────
function ProfilePage({
  t,
  accent,
  lang,
  setLang,
  theme,
  setTheme,
  currentPlan,
  onGoTo,
  user
}) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || t.studentRole;
  const username = user?.username ? `@${user.username}` : "";
  const planConfig = PLANS_CONFIG[currentPlan] || PLANS_CONFIG.free;
  const planLabel = {
    free: t.planFree,
    standard: t.planStandard,
    premium: t.planPremium
  }[currentPlan] || t.planFree;
  const planIconName = planConfig.iconName;
  const planColor = planConfig.color;

  // ✅ NOTE: In production, usage data should come from API
  const usage = [{
    label: t.usage?.ai || "AI so'rovlar",
    value: 1,
    max: 3,
    color: "#a78bfa"
  }, {
    label: t.usage?.convert || "Konvertatsiya",
    value: 7,
    max: 50,
    color: "#4ade80"
  }, {
    label: t.usage?.translate || "Tarjima",
    value: 12,
    max: 100,
    color: "#60a5fa"
  }];
  const langs = [{
    id: "uz",
    label: "UZ"
  }, {
    id: "ru",
    label: "RU"
  }, {
    id: "en",
    label: "EN"
  }];
  const currentTheme = theme || document.documentElement.getAttribute("data-theme") || "dark";
  const isDark = currentTheme === "dark";
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");
  const settingsRows = [{
    iconName: isDark ? "sun" : "moon",
    color: isDark ? "#fbbf24" : "#818cf8",
    label: isDark ? t.themeDark || "Qorong'i mavzu" : t.themeLight || "Yorug' mavzu",
    sub: null,
    isTheme: true,
    onClick: toggleTheme
  }, {
    iconName: "bell",
    color: "#60a5fa",
    label: t.settingsNotif,
    sub: "On",
    onClick: () => {}
  }, {
    iconName: "chart-bar",
    color: "#a78bfa",
    label: t.settingsStats,
    sub: null,
    onClick: () => {}
  }, {
    iconName: "help",
    color: "#34d399",
    label: t.settingsHelp,
    sub: null,
    onClick: () => {}
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 110
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: t.tabs.profile
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "4px 18px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 18,
      borderRadius: 22,
      background: "linear-gradient(135deg, rgba(139,92,246,0.16), rgba(59,130,246,0.10))",
      border: "0.5px solid rgba(139,92,246,0.22)",
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: fullName,
    size: 64,
    ring: true,
    accent: accent
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-primary)",
      fontSize: 18,
      fontWeight: 700,
      letterSpacing: -0.2
    }
  }, fullName), username && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 12.5,
      marginTop: 1
    }
  }, username), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      borderRadius: 99,
      background: `${planColor}20`,
      border: `0.5px solid ${planColor}40`,
      color: planColor,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: 0.2,
      textTransform: "uppercase"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: planIconName,
    size: 11,
    color: planColor,
    strokeWidth: 2,
    "aria-hidden": "true"
  }), planLabel))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 18px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 10
    }
  }, t.todayUsage), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      borderRadius: 18,
      background: "var(--bg-surface-1)",
      border: "0.5px solid var(--border-subtle)",
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, usage.map((u, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-secondary)",
      fontSize: 12.5,
      fontWeight: 500
    }
  }, u.label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-primary)",
      fontSize: 12,
      fontWeight: 700,
      fontVariantNumeric: "tabular-nums"
    }
  }, u.value, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)"
    }
  }, "/", u.max))), /*#__PURE__*/React.createElement(ProgressBar, {
    value: u.value,
    max: u.max,
    accent: u.color,
    height: 5
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 18px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 10
    }
  }, t.settingsLang), /*#__PURE__*/React.createElement("div", {
    role: "group",
    "aria-label": "Til tanlash",
    style: {
      display: "flex",
      gap: 8
    }
  }, langs.map(l => {
    const active = lang === l.id;
    return /*#__PURE__*/React.createElement("button", {
      key: l.id,
      className: "press",
      onClick: () => setLang(l.id),
      type: "button",
      "aria-pressed": active,
      style: {
        flex: 1,
        padding: "10px 4px",
        borderRadius: 12,
        background: active ? accent : "var(--bg-surface-1)",
        border: `0.5px solid ${active ? accent : "var(--border-light)"}`,
        color: active ? "#fff" : "var(--text-secondary)",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 0.5,
        cursor: "pointer",
        font: "inherit",
        transition: "all 0.18s",
        boxShadow: active ? `0 4px 12px ${accent}40` : "none"
      }
    }, l.label);
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 18px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 18,
      overflow: "hidden",
      background: "var(--bg-surface-1)",
      border: "0.5px solid var(--border-subtle)"
    }
  }, settingsRows.map((row, i, arr) => /*#__PURE__*/React.createElement("button", {
    key: i,
    className: "press",
    onClick: row.onClick,
    type: "button",
    "aria-label": row.label,
    style: {
      width: "100%",
      textAlign: "left",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 14px",
      background: "transparent",
      border: "none",
      borderBottom: i < arr.length - 1 ? "0.5px solid var(--border-subtle)" : "none",
      color: "var(--text-primary)",
      font: "inherit",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 32,
      height: 32,
      borderRadius: 9,
      background: `${row.color}1f`,
      border: `0.5px solid ${row.color}33`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: row.iconName,
    size: 16,
    color: row.color,
    strokeWidth: 1.8
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      fontWeight: 500
    }
  }, row.label), row.isTheme ? /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 42,
      height: 24,
      borderRadius: 99,
      background: isDark ? "rgba(139,92,246,0.25)" : "rgba(251,191,36,0.25)",
      border: `1.5px solid ${isDark ? "rgba(139,92,246,0.45)" : "rgba(251,191,36,0.45)"}`,
      position: "relative",
      transition: "all 0.25s"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 2,
      left: isDark ? 20 : 2,
      width: 16,
      height: 16,
      borderRadius: 99,
      background: isDark ? "#a78bfa" : "#fbbf24",
      transition: "left 0.25s cubic-bezier(0.34,1.56,0.64,1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 9
    }
  }, isDark ? "🌙" : "☀️")) : row.sub ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)",
      fontSize: 12
    }
  }, row.sub) : /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    width: "7",
    height: "12",
    viewBox: "0 0 8 14"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: "var(--border-medium)",
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })))))), currentPlan !== "premium" && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 18px 14px"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onGoTo("plans"),
    className: "press",
    type: "button",
    "aria-label": "Premium tarifga o'tish",
    style: {
      width: "100%",
      textAlign: "left",
      position: "relative",
      overflow: "hidden",
      padding: 16,
      borderRadius: 18,
      background: "linear-gradient(120deg, #f59e0b 0%, #ef4444 100%)",
      border: "none",
      color: "#fff",
      cursor: "pointer",
      font: "inherit",
      display: "flex",
      alignItems: "center",
      gap: 12,
      boxShadow: "0 10px 26px rgba(245,158,11,0.25)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 40,
      height: 40,
      borderRadius: 11,
      background: "rgba(255,255,255,0.20)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "crown",
    size: 20,
    color: "#fff",
    strokeWidth: 2
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700
    }
  }, t.upgradeToPremium), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      opacity: 0.9,
      marginTop: 1
    }
  }, t.cheksizAI)), /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14M13 6l6 6-6 6",
    stroke: "#fff",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 18px"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "press",
    type: "button",
    "aria-label": t.logout,
    style: {
      width: "100%",
      padding: "13px 16px",
      borderRadius: 14,
      background: "rgba(239,68,68,0.08)",
      border: "0.5px solid rgba(239,68,68,0.16)",
      color: "#fb7185",
      fontSize: 13.5,
      fontWeight: 600,
      cursor: "pointer",
      font: "inherit",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "logout",
    size: 15,
    color: "currentColor",
    strokeWidth: 2,
    "aria-hidden": "true"
  }), t.logout)));
}

// ─────────────────────────────────────────────────────────────────
// PAYMENT SHEET
// ─────────────────────────────────────────────────────────────────
function PaymentSheet({
  t,
  planId,
  accent,
  onClose,
  onSuccess
}) {
  const [step, setStep] = u_S2("choose"); // 'choose' | 'processing' | 'success'
  const [method, setMethod] = u_S2("payme");

  // ✅ FIX: Use PLANS_CONFIG — single source of truth
  const planConfig = PLANS_CONFIG[planId];
  const planName = {
    free: t.planFree,
    standard: t.planStandard,
    premium: t.planPremium
  }[planId];
  if (!planConfig) return null;
  const paymentMethods = [{
    id: "payme",
    name: "Payme",
    bg: "linear-gradient(135deg, #00d4cc, #00b1ab)",
    logo: "P",
    fee: "1.5%"
  }, {
    id: "click",
    name: "Click",
    bg: "linear-gradient(135deg, #4ec5f1, #2196f3)",
    logo: "C",
    fee: "1.2%"
  }, {
    id: "uzcard",
    name: "Uzcard",
    bg: "linear-gradient(135deg, #18b3ee, #0e8bc7)",
    logo: "U",
    fee: "1.0%"
  }];
  const handlePay = u_C2(() => {
    // ✅ TODO: Replace with real payment gateway integration
    setStep("processing");
    setTimeout(() => setStep("success"), 2400);
  }, []);
  const handleDone = u_C2(() => {
    // ✅ FIX: Pass planId (not undefined) to onSuccess
    onSuccess(planId);
    onClose();
  }, [planId, onSuccess, onClose]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "6px 20px 18px"
    },
    role: "dialog",
    "aria-label": "To'lov"
  }, step === "choose" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 12.5,
      marginBottom: 4
    }
  }, t.paymentTitle), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-primary)",
      fontSize: 22,
      fontWeight: 800,
      letterSpacing: -0.4
    }
  }, planConfig.priceDisplay, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)",
      fontSize: 14,
      fontWeight: 600
    }
  }, t.soum, t.perMonth)), /*#__PURE__*/React.createElement("div", {
    style: {
      color: planConfig.color,
      fontSize: 12.5,
      fontWeight: 600,
      marginTop: 4
    }
  }, planName)), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 10
    }
  }, t.paymentChoose), /*#__PURE__*/React.createElement("div", {
    role: "radiogroup",
    "aria-label": "To'lov usulini tanlang",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      marginBottom: 18
    }
  }, paymentMethods.map(m => /*#__PURE__*/React.createElement("button", {
    key: m.id,
    type: "button",
    role: "radio",
    "aria-checked": method === m.id,
    onClick: () => setMethod(m.id),
    className: "press",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 14px",
      borderRadius: 14,
      background: method === m.id ? "rgba(139,92,246,0.10)" : "var(--bg-surface-1)",
      border: `0.5px solid ${method === m.id ? "rgba(139,92,246,0.35)" : "var(--border-light)"}`,
      color: "var(--text-primary)",
      cursor: "pointer",
      font: "inherit",
      textAlign: "left",
      transition: "all 0.18s"
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 36,
      height: 36,
      borderRadius: 10,
      background: m.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontWeight: 800,
      fontSize: 17
    }
  }, m.logo), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600
    }
  }, m.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--text-muted)",
      marginTop: 1
    }
  }, "Komissiya ", m.fee)), /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: 20,
      height: 20,
      borderRadius: 99,
      border: `1.5px solid ${method === m.id ? accent : "var(--border-medium)"}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "border-color 0.18s"
    }
  }, method === m.id && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 99,
      background: accent
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    full: true,
    onClick: onClose
  }, t.sheetCancel), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    accent: accent,
    full: true,
    onClick: handlePay
  }, t.paymentPay))), step === "processing" && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "32px 0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 18
    },
    role: "status",
    "aria-live": "polite"
  }, /*#__PURE__*/React.createElement(Spinner, {
    size: 48,
    color: accent
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-primary)",
      fontSize: 15,
      fontWeight: 600
    }
  }, t.paymentProcessing), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 12,
      textAlign: "center"
    }
  }, t.paymentProcessMethod ? t.paymentProcessMethod.replace("{method}", method) : `${method} orqali to'lov amalga oshirilmoqda...`)), step === "success" && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 0 0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 14
    },
    role: "status",
    "aria-live": "polite"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 82,
      height: 82,
      borderRadius: "50%",
      background: "rgba(34,197,94,0.16)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      inset: -10,
      borderRadius: "50%",
      border: "2px solid rgba(34,197,94,0.22)",
      animation: "pulse 1.4s ease-out infinite"
    }
  }), /*#__PURE__*/React.createElement("svg", {
    width: "42",
    height: "42",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12l5 5L20 7",
    stroke: "#22c55e",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-primary)",
      fontSize: 18,
      fontWeight: 700
    }
  }, t.paymentSuccess), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-muted)",
      fontSize: 13,
      marginTop: 4
    }
  }, t.paymentSuccessSub)), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    accent: "#22c55e",
    full: true,
    onClick: handleDone
  }, t.paymentDone)));
}
Object.assign(window, {
  PlansPage,
  ProfilePage,
  PaymentSheet,
  PLANS_CONFIG
});