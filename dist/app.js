// EduBot — Root App
// Wires tabs + sheets + payment + toasts + tweaks

const {
  useState: uS,
  useEffect: uE,
  useCallback: uC
} = React;

// true faqat haqiqiy Telegram ichida, brauzerda false
const IN_TELEGRAM = !!window.Telegram?.WebApp?.initData;
const TG = window.Telegram?.WebApp ?? null;

// Telegram user ob'ekti: { first_name, last_name?, username?, language_code? }
const TG_USER = TG?.initDataUnsafe?.user ?? null;

// Telegram tiliga mos til, aks holda 'uz'
const SUPPORTED_LANGS = ['uz', 'ru', 'en'];
const DEFAULT_LANG = SUPPORTED_LANGS.includes(TG_USER?.language_code) ? TG_USER.language_code : 'uz';
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "cardStyle": "glass",
  "accent": "#8b5cf6",
  "lang": DEFAULT_LANG
} /*EDITMODE-END*/;
function App() {
  const [t, setTweakState] = uS(TWEAK_DEFAULTS);
  const setTweak = (key, val) => setTweakState(prev => ({
    ...prev,
    [key]: val
  }));
  const [tab, setTab] = uS('home');
  const [sheetService, setSheetService] = uS(null); // {service, isPremium}
  const [paymentPlan, setPaymentPlan] = uS(null);
  const [toast, setToast] = uS(null);
  const [currentPlan, setCurrentPlan] = uS('free');

  // Telegram SDK: ready() + expand() — bir marta chaqiriladi
  uE(() => {
    if (!TG) return;
    TG.ready();
    TG.expand();
  }, []);

  // BackButton: sheet ochiq bo'lsa ko'rsat, yopilganda yashir
  uE(() => {
    if (!TG) return;
    const anyOpen = !!(sheetService || paymentPlan);
    if (!anyOpen) {
      TG.BackButton.hide();
      return;
    }
    const handler = () => {
      setSheetService(null);
      setPaymentPlan(null);
    };
    TG.BackButton.show();
    TG.BackButton.onClick(handler);
    return () => {
      TG.BackButton.offClick(handler);
    };
  }, [sheetService, paymentPlan]);
  const lang = t.lang;
  const setLang = v => setTweak('lang', v);
  const str = I18N[lang] || I18N.uz;
  const openService = uC((service, isPremium) => {
    setSheetService({
      service,
      isPremium
    });
  }, []);
  const closeSheet = () => setSheetService(null);
  const closePayment = () => setPaymentPlan(null);
  const subscribe = planId => {
    if (planId === 'free') {
      setCurrentPlan('free');
      setToast(str.sheetReady);
      return;
    }
    setPaymentPlan(planId);
  };
  const paymentSuccess = planId => {
    setCurrentPlan(planId);
    setToast(str.paymentSuccess);
  };
  const accent = t.accent;
  const cardStyle = t.cardStyle;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '100%',
      position: 'relative',
      background: 'radial-gradient(ellipse at top, #1a1530 0%, #0a0a0f 40%, #08080d 100%)',
      overflow: 'hidden',
      fontFamily: '-apple-system, "SF Pro Display", "SF Pro", system-ui, sans-serif',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-scroll",
    style: {
      position: 'absolute',
      inset: 0,
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch'
    }
  }, /*#__PURE__*/React.createElement("div", {
    key: tab,
    className: "page-fade"
  }, tab === 'home' && /*#__PURE__*/React.createElement(HomePage, {
    t: str,
    accent: accent,
    cardStyle: cardStyle,
    onOpenService: openService,
    onGoTo: setTab,
    user: TG_USER
  }), tab === 'free' && /*#__PURE__*/React.createElement(FreePage, {
    t: str,
    accent: accent,
    cardStyle: cardStyle,
    onOpenService: openService
  }), tab === 'premium' && /*#__PURE__*/React.createElement(PremiumPage, {
    t: str,
    accent: accent,
    isSubscribed: currentPlan !== 'free',
    onOpenService: openService,
    onGoTo: setTab
  }), tab === 'plans' && /*#__PURE__*/React.createElement(PlansPage, {
    t: str,
    accent: accent,
    currentPlan: currentPlan,
    onSubscribe: subscribe
  }), tab === 'profile' && /*#__PURE__*/React.createElement(ProfilePage, {
    t: str,
    accent: accent,
    lang: lang,
    setLang: setLang,
    currentPlan: currentPlan,
    onGoTo: setTab,
    user: TG_USER
  }))), toast && /*#__PURE__*/React.createElement(Toast, {
    msg: toast,
    onDone: () => setToast(null)
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
    isPremium: sheetService.isPremium && currentPlan === 'free',
    t: str,
    accent: accent,
    onClose: closeSheet,
    onToast: m => setToast(m),
    onGoToPlans: () => setTab('plans')
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

// Haqiqiy Telegram ichida: to'liq ekran, frame yo'q
// Brauzerda (dev): iOS device frame bilan preview
function Root() {
  if (IN_TELEGRAM) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        width: '100vw',
        height: '100vh',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement(App, null));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(ellipse at center, #1a1a24 0%, #0a0a0f 70%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      padding: '20px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flexShrink: 0,
      transform: 'scale(var(--frame-scale, 1))',
      transformOrigin: 'center'
    }
  }, /*#__PURE__*/React.createElement(IOSDevice, {
    width: 402,
    height: 874,
    dark: true
  }, /*#__PURE__*/React.createElement(App, null))));
}

// Dev preview uchun frame scale (faqat brauzerda ishlaydi)
if (!IN_TELEGRAM) {
  function applyFrameScale() {
    const scale = Math.min(1, window.innerWidth / 442, window.innerHeight / 934);
    document.documentElement.style.setProperty('--frame-scale', scale.toFixed(3));
  }
  window.addEventListener('resize', applyFrameScale);
  applyFrameScale();
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Root, null));