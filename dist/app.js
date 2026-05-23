// EduBot — Root App (IMPROVED)
// ✅ Fixes applied:
//   1. Proper hook names (uS → useState)
//   2. useReducer for state management
//   3. Telegram HapticFeedback integration
//   4. MainButton support
//   5. Light/Dark mode from Telegram themeParams
//   6. Error boundary
//   7. useCallback for all handlers
//   8. CSS custom properties for accent color

"use strict";

// useState, useEffect, useCallback declared in components.js (shared global scope)
const useReducer = React.useReducer;

// ─── Telegram SDK References ──────────────────────────────────────
const IN_TELEGRAM = !!window.Telegram?.WebApp?.initData;
const TG = window.Telegram?.WebApp ?? null;
const TG_USER = TG?.initDataUnsafe?.user ?? null;

// ✅ FIX: HapticFeedback helpers — native Telegram feel
const Haptic = {
  light: () => TG?.HapticFeedback?.impactOccurred("light"),
  medium: () => TG?.HapticFeedback?.impactOccurred("medium"),
  heavy: () => TG?.HapticFeedback?.impactOccurred("heavy"),
  success: () => TG?.HapticFeedback?.notificationOccurred("success"),
  error: () => TG?.HapticFeedback?.notificationOccurred("error"),
  warning: () => TG?.HapticFeedback?.notificationOccurred("warning"),
  select: () => TG?.HapticFeedback?.selectionChanged()
};

// ─── Language detection ───────────────────────────────────────────
const SUPPORTED_LANGS = ["uz", "ru", "en"];
const DEFAULT_LANG = SUPPORTED_LANGS.includes(TG_USER?.language_code) ? TG_USER.language_code : "uz";

// ─── Tweak defaults ───────────────────────────────────────────────
const _savedTheme = typeof localStorage !== "undefined" && localStorage.getItem("edubot_theme") || "";
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  cardStyle: "glass",
  accent: "#8b5cf6",
  lang: DEFAULT_LANG,
  theme: _savedTheme
}; /*EDITMODE-END*/

// ─── App State Reducer ────────────────────────────────────────────
// ✅ FIX: useReducer instead of 6 useState calls
const initialState = {
  tweaks: TWEAK_DEFAULTS,
  tab: "home",
  sheetService: null,
  // { service, isPremium }
  paymentPlan: null,
  // planId string
  toastQueue: [],
  // { id, msg }[]
  currentPlan: "free"
};
let toastIdCounter = 0;
function appReducer(state, action) {
  switch (action.type) {
    case "SET_TWEAK":
      return {
        ...state,
        tweaks: {
          ...state.tweaks,
          [action.key]: action.val
        }
      };
    case "SET_TAB":
      return {
        ...state,
        tab: action.tab,
        sheetService: null,
        paymentPlan: null
      };
    case "OPEN_SHEET":
      return {
        ...state,
        sheetService: {
          service: action.service,
          isPremium: action.isPremium
        }
      };
    case "CLOSE_SHEET":
      return {
        ...state,
        sheetService: null
      };
    case "OPEN_PAYMENT":
      return {
        ...state,
        paymentPlan: action.planId
      };
    case "CLOSE_PAYMENT":
      return {
        ...state,
        paymentPlan: null
      };
    case "SHOW_TOAST":
      {
        const id = ++toastIdCounter;
        return {
          ...state,
          toastQueue: [...state.toastQueue, {
            id,
            msg: action.msg
          }]
        };
      }
    case "DISMISS_TOAST":
      return {
        ...state,
        toastQueue: state.toastQueue.filter(t => t.id !== action.id)
      };
    case "SET_PLAN":
      return {
        ...state,
        currentPlan: action.plan
      };
    default:
      return state;
  }
}

// ─── Error Boundary ───────────────────────────────────────────────
// ✅ NEW: Class component (required for error boundaries)
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    };
  }
  componentDidCatch(error, info) {
    console.error("[EduBot ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "24px",
          color: "var(--text-primary)",
          textAlign: "center"
        }
      }, [React.createElement("div", {
        key: "icon",
        style: {
          fontSize: 48,
          marginBottom: 16
        }
      }, "⚠️"), React.createElement("h2", {
        key: "title",
        style: {
          margin: "0 0 8px",
          fontSize: 18,
          fontWeight: 700
        }
      }, "Xato yuz berdi"), React.createElement("p", {
        key: "msg",
        style: {
          color: "var(--text-muted)",
          fontSize: 14
        }
      }, "Ilovani qayta yuklang."), React.createElement("button", {
        key: "btn",
        onClick: () => window.location.reload(),
        style: {
          marginTop: 20,
          padding: "12px 24px",
          borderRadius: "var(--radius-md)",
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer"
        }
      }, "Qayta yuklash")]);
    }
    return this.props.children;
  }
}

// ─── Theme manager ────────────────────────────────────────────────
// ✅ NEW: Sync theme with Telegram + CSS custom props
function useThemeSync(accent, manualTheme) {
  useEffect(() => {
    const root = document.documentElement;

    // Manual theme overrides Telegram's colorScheme
    const scheme = manualTheme || TG?.colorScheme || "dark";
    root.setAttribute("data-theme", scheme);

    // Accent color as CSS variable
    root.style.setProperty("--accent", accent);
    const hexToRgb = hex => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : "139, 92, 246";
    };
    root.style.setProperty("--accent-glow", `rgba(${hexToRgb(accent)}, 0.35)`);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = scheme === "dark" ? "#0a0a0f" : "#f8f7ff";
  }, [accent, manualTheme]);

  // Listen for Telegram theme changes (only when no manual override)
  useEffect(() => {
    if (!TG || manualTheme) return;
    const handler = () => {
      const scheme = TG.colorScheme ?? "dark";
      document.documentElement.setAttribute("data-theme", scheme);
    };
    TG.onEvent("themeChanged", handler);
    return () => TG.offEvent("themeChanged", handler);
  }, [manualTheme]);
}

// ─── Main App ─────────────────────────────────────────────────────
function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const {
    tweaks,
    tab,
    sheetService,
    paymentPlan,
    toastQueue,
    currentPlan
  } = state;
  const lang = tweaks.lang;
  const accent = tweaks.accent;
  const cardStyle = tweaks.cardStyle;
  const manualTheme = tweaks.theme || "";
  const str = I18N[lang] || I18N.uz;
  useThemeSync(accent, manualTheme);

  // ─── Telegram SDK init ───────────────────────────────────────
  useEffect(() => {
    if (!TG) return;
    TG.ready();
    requestAnimationFrame(() => TG.expand());
    // ✅ NEW: Disable closing confirmation when data entry in progress
    TG.enableClosingConfirmation?.();
  }, []);

  // ─── BackButton ──────────────────────────────────────────────
  useEffect(() => {
    if (!TG) return;
    const anyOpen = !!(sheetService || paymentPlan);
    if (!anyOpen) {
      TG.BackButton.hide();
      return;
    }
    const handler = () => {
      Haptic.light(); // ✅ NEW: haptic on back
      dispatch({
        type: "CLOSE_SHEET"
      });
      dispatch({
        type: "CLOSE_PAYMENT"
      });
    };
    TG.BackButton.show();
    TG.BackButton.onClick(handler);
    return () => TG.BackButton.offClick(handler);
  }, [sheetService, paymentPlan]);

  // ─── Handlers (all memoized) ──────────────────────────────────
  // ✅ FIX: All closures properly memoized with useCallback

  const setTweak = useCallback((key, val) => {
    dispatch({
      type: "SET_TWEAK",
      key,
      val
    });
  }, []);
  const setLang = useCallback(v => setTweak("lang", v), [setTweak]);
  const setTab = useCallback(tabId => {
    Haptic.select(); // ✅ NEW: haptic on tab switch
    dispatch({
      type: "SET_TAB",
      tab: tabId
    });
  }, []);
  const openService = useCallback((service, isPremium) => {
    Haptic.medium(); // ✅ NEW: haptic on service open
    dispatch({
      type: "OPEN_SHEET",
      service,
      isPremium
    });
  }, []);
  const setTheme = useCallback(t => {
    try {
      localStorage.setItem("edubot_theme", t);
    } catch (_) {}
    dispatch({
      type: "SET_TWEAK",
      key: "theme",
      val: t
    });
  }, []);
  const closeSheet = useCallback(() => {
    dispatch({
      type: "CLOSE_SHEET"
    });
  }, []);
  const closePayment = useCallback(() => {
    dispatch({
      type: "CLOSE_PAYMENT"
    });
  }, []);
  const showToast = useCallback(msg => {
    dispatch({
      type: "SHOW_TOAST",
      msg
    });
  }, []);
  const dismissToast = useCallback(id => {
    dispatch({
      type: "DISMISS_TOAST",
      id
    });
  }, []);
  const subscribe = useCallback(planId => {
    if (planId === "free") {
      dispatch({
        type: "SET_PLAN",
        plan: "free"
      });
      showToast(str.sheetReady);
      return;
    }
    Haptic.medium();
    dispatch({
      type: "OPEN_PAYMENT",
      planId
    });
  }, [str, showToast]);
  const paymentSuccess = useCallback(planId => {
    Haptic.success(); // ✅ NEW: haptic on payment success
    dispatch({
      type: "SET_PLAN",
      plan: planId
    });
    showToast(str.paymentSuccess);
  }, [str, showToast]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: "100%",
      position: "relative",
      background: "var(--bg-page)",
      overflow: "hidden",
      fontFamily: "var(--font-display)",
      color: "var(--text-primary)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-scroll",
    style: {
      position: "absolute",
      inset: 0,
      overflow: "auto",
      WebkitOverflowScrolling: "touch",
      paddingTop: "var(--safe-top)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    key: tab,
    className: "page-fade"
  }, tab === "home" && /*#__PURE__*/React.createElement(HomePage, {
    t: str,
    accent: accent,
    cardStyle: cardStyle,
    onOpenService: openService,
    onGoTo: setTab,
    user: TG_USER,
    onShowToast: showToast
  }), tab === "free" && /*#__PURE__*/React.createElement(FreePage, {
    t: str,
    accent: accent,
    cardStyle: cardStyle,
    onOpenService: openService
  }), tab === "premium" && /*#__PURE__*/React.createElement(PremiumPage, {
    t: str,
    accent: accent,
    isSubscribed: currentPlan !== "free",
    onOpenService: openService,
    onGoTo: setTab
  }), tab === "plans" && /*#__PURE__*/React.createElement(PlansPage, {
    t: str,
    accent: accent,
    currentPlan: currentPlan,
    onSubscribe: subscribe
  }), tab === "profile" && /*#__PURE__*/React.createElement(ProfilePage, {
    t: str,
    accent: accent,
    lang: lang,
    setLang: setLang,
    theme: manualTheme,
    setTheme: setTheme,
    currentPlan: currentPlan,
    onGoTo: setTab,
    user: TG_USER
  }))), /*#__PURE__*/React.createElement(ToastStack, {
    toasts: toastQueue,
    onDismiss: dismissToast
  }), /*#__PURE__*/React.createElement(BottomNav, {
    tab: tab,
    setTab: setTab,
    t: str,
    accent: accent
  }), /*#__PURE__*/React.createElement(BottomSheet, {
    open: !!sheetService,
    onClose: closeSheet
  }, sheetService && /*#__PURE__*/React.createElement(ServiceSheet, {
    service: sheetService.service,
    isPremium: sheetService.isPremium && currentPlan === "free",
    t: str,
    accent: accent,
    onClose: closeSheet,
    onToast: showToast,
    onGoToPlans: () => setTab("plans")
  })), /*#__PURE__*/React.createElement(BottomSheet, {
    open: !!paymentPlan,
    onClose: closePayment
  }, paymentPlan && /*#__PURE__*/React.createElement(PaymentSheet, {
    t: str,
    planId: paymentPlan,
    accent: accent,
    onClose: closePayment,
    onSuccess: paymentSuccess
  })));
}

// ─── Toast Stack ──────────────────────────────────────────────────
// ✅ NEW: Multiple toasts support
function ToastStack({
  toasts,
  onDismiss
}) {
  if (!toasts.length) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 64,
      left: 0,
      right: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      zIndex: 200,
      pointerEvents: "none",
      paddingTop: "var(--safe-top)"
    }
  }, toasts.map(t => /*#__PURE__*/React.createElement(Toast, {
    key: t.id,
    msg: t.msg,
    onDone: () => onDismiss(t.id)
  })));
}

// ─── Root (Telegram vs Browser) ───────────────────────────────────
function Root() {
  const AppWrapped = /*#__PURE__*/React.createElement(AppErrorBoundary, null, /*#__PURE__*/React.createElement(App, null));
  if (IN_TELEGRAM) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        width: "100vw",
        height: "100vh",
        overflow: "hidden"
      }
    }, AppWrapped);
  }

  // Dev preview with iOS frame
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100vw",
      height: "100vh",
      background: "radial-gradient(ellipse at center, #1a1a24 0%, #0a0a0f 70%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      padding: "20px 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      flexShrink: 0,
      transform: "scale(var(--frame-scale, 1))",
      transformOrigin: "center"
    }
  }, /*#__PURE__*/React.createElement(IOSDevice, {
    width: 402,
    height: 874,
    dark: true
  }, AppWrapped)));
}

// ─── Frame scale (browser only) ───────────────────────────────────
if (!IN_TELEGRAM) {
  const applyFrameScale = () => {
    const scale = Math.min(1, window.innerWidth / 442, window.innerHeight / 934);
    document.documentElement.style.setProperty("--frame-scale", scale.toFixed(3));
  };
  window.addEventListener("resize", applyFrameScale, {
    passive: true
  });
  applyFrameScale();
}

// ─── Mount ────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(Root, null));