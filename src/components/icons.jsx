// EduBot — Icon library (Lucide-style line SVGs)

const ICON_PATHS = {
  // ── Services: Free ────────────────────────────────────────
  'pdf2docx': (<><rect x="4" y="3" width="13" height="18" rx="2"/><path d="M9 12h2.5a1.5 1.5 0 1 1 0 3H9z M9 12v6"/></>),
  'docx2pdf': (<><rect x="4" y="3" width="13" height="18" rx="2"/><path d="M7.5 12h2 M7.5 15h3 M14 12v6 M14 15h2"/></>),
  'img2pdf':  (<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></>),
  'imgs2pdf': (<><rect x="6" y="2" width="14" height="14" rx="2"/><path d="M16 20H6a2 2 0 0 1-2-2V8"/><circle cx="11" cy="8" r="1.5"/><path d="M20 14l-4-4-6 6"/></>),
  'xlsx2pdf': (<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18 M15 3v18 M3 9h18 M3 15h18"/></>),
  'pdf2img':  (<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-9 9"/></>),
  'mergepdf': (<><path d="M4 3h7v8H4z M13 13h7v8h-7z M11 7h2v10h-2z" strokeLinejoin="round"/></>),
  'splitpdf': (<><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 7.5L20 4 M8.5 16.5L20 20 M20 4v16"/></>),
  'pdftext':  (<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8 M8 12h8 M8 16h5"/></>),
  'ocr':      (<><path d="M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 12h0.01 M12 12h0.01 M17 12h0.01"/></>),
  'pdflock':  (<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></>),
  'watermark': (<><path d="M12 2.5s-6 8-6 12a6 6 0 0 0 12 0c0-4-6-12-6-12z M9 16a3 3 0 0 0 3 2"/></>),
  'imgcompress': (<><path d="M4 9V5h4 M20 9V5h-4 M4 15v4h4 M20 15v4h-4"/><rect x="8" y="8" width="8" height="8" rx="1"/></>),
  'translit': (<><path d="M3 7h7 M6.5 7v10 M14 17l4-10 4 10 M15.5 14h5"/></>),
  'equation': (<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8 M12 8v8 M8 16h8"/></>),
  'graph':    (<><path d="M3 3v18h18 M7 14l4-4 3 3 5-7"/></>),
  'stats':    (<><path d="M3 3v18h18 M7 17V11 M12 17V7 M17 17v-4"/></>),
  'translate': (<><circle cx="12" cy="12" r="9"/><path d="M3 12h18 M12 3a13 13 0 0 1 0 18 M12 3a13 13 0 0 0 0 18"/></>),
  'wiki':     (<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z M9 7h6 M9 11h6"/></>),
  'readtime': (<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>),
  'books':    (<><path d="M4 19V5a1 1 0 0 1 1-1h4v17H5a1 1 0 0 1-1-1z M9 4h6v17H9z M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/></>),
  'qr':       (<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z M20 14h1 M14 20h3 M20 20h1 M20 17h1"/></>),
  'cert':     (<><circle cx="12" cy="9" r="6"/><path d="M9 14.5L7 22l5-3 5 3-2-7.5"/></>),
  'bgremove': (<><path d="M3 12l3-3 6 6 3-3 6 6 M3 12V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M16 5l5 5 M16 10l5-5" stroke="currentColor"/></>),
  'schedule': (<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18 M8 3v4 M16 3v4"/></>),
  'deadline': (<><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2 M5 4l-2 3 M19 4l2 3"/></>),
  'zip':      (<><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 4v3 M12 9v2 M12 13v2 M11 17h2v3h-2z"/></>),
  'unzip':    (<><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7 M16 3h6v6 M9 14L22 3"/></>),

  // ── Services: Premium ─────────────────────────────────────
  'referat':    (<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8 M8 12h8 M8 16h5"/></>),
  'amaliy':     (<><path d="M9 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L15 9V3 M8 3h8 M7 14h10"/></>),
  'kursish':    (<><path d="M22 10L12 5 2 10l10 5 10-5z M6 12v5c0 1 3 3 6 3s6-2 6-3v-5 M22 10v6"/></>),
  'insho':      (<><path d="M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18 M2 2l7.586 7.586 M11 11a2 2 0 1 0-4 0 2 2 0 0 0 4 0z"/></>),
  'taqdimot':   (<><path d="M2 3h20 M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3 M8 21l4-5 4 5"/></>),
  'audio2text': (<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8"/></>),
  'text2audio': (<><path d="M11 5L6 9H2v6h4l5 4z M15.5 8.5a5 5 0 0 1 0 7 M19 5a9 9 0 0 1 0 14"/></>),
  'deepl':      (<><circle cx="12" cy="12" r="9"/><path d="M3 12h18 M12 3a13 13 0 0 1 0 18 M12 3a13 13 0 0 0 0 18 M2.5 9h19 M2.5 15h19"/></>),
  'image':      (<><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5 M16 5h6 M19 2v6 M14 12l-3-3-8 8 M14 12l3-3 4 4"/></>),
  'pptx':       (<><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8 M12 17v4 M7 7h5v5H7z M14 7h3 M14 10h3"/></>),

  // ── UI icons ──────────────────────────────────────────────
  'sparkles':  (<><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7z M5 14l.5 1.5L7 16l-1.5.5L5 18l-.5-1.5L3 16l1.5-.5z"/></>),
  'gift':      (<><path d="M20 12v9H4v-9 M22 7H2v5h20V7z M12 22V7 M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/></>),
  'zap':       (<><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" strokeLinejoin="round"/></>),
  'crown':     (<><path d="M2 18h20 M3 8l4 6 5-9 5 9 4-6v10H3z" strokeLinejoin="round"/></>),
  'lock':      (<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></>),
  'check':     (<><path d="M5 12l4 4L20 6" strokeLinejoin="round"/></>),
  'arrow-right': (<><path d="M5 12h14 M13 6l6 6-6 6"/></>),
  'arrow-down':  (<><path d="M12 5v14 M6 13l6 6 6-6"/></>),
  'bell':      (<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9z M9 21a3 3 0 0 0 6 0"/></>),
  'search':    (<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>),
  'x':         (<><path d="M6 6l12 12 M18 6L6 18"/></>),
  'cpu':       (<><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3"/></>),
  'logout':    (<><path d="M16 17l5-5-5-5 M21 12H9 M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></>),
  'chart-bar': (<><path d="M3 3v18h18 M7 17V11 M12 17V7 M17 17v-4"/></>),
  'help':      (<><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .8-1 1.7v.5 M12 17h.01"/></>),
  'upload':    (<><path d="M12 16V4 M6 10l6-6 6 6 M5 20h14"/></>),
  'download':  (<><path d="M12 4v12 M6 14l6 6 6-6 M5 20h14"/></>),
  'plus':      (<><path d="M12 5v14 M5 12h14"/></>),
  'play':      (<><path d="M6 4l14 8-14 8z" strokeLinejoin="round"/></>),
  'mic':       (<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8"/></>),
  'flame':     (<><path d="M8.5 14.5a2.5 2.5 0 1 1 5 0c0 1.5-1 3-2 4 1-2 0-5-1-7-2 0-4 4-4 7a5 5 0 0 0 10 0c0-5-5-9-5-13-2 2-4 5-3 9z" strokeLinejoin="round"/></>),
  'wand':      (<><path d="M15 4V2 M15 16v-2 M8 9H6 M9.5 5.5l-1.4-1.4 M19.5 5.5l1.4-1.4 M9.5 14.5l-1.4 1.4 M22 13h-2 M11.5 11.5l-9 9a1.5 1.5 0 0 0 2 2l9-9 M19.5 14.5l1.4 1.4 M14 13l-3-3"/></>),
  'eraser':    (<><path d="M3 21h18 M14 6l-9 9 4 4h5l9-9-9-9z M10 11l3 3"/></>),
};

function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style }) {
  const path = ICON_PATHS[name];
  if (!path) {
    return <span style={{ fontSize: size * 0.9, ...style }}>?</span>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}>
      {path}
    </svg>
  );
}

// Category palette — each service category has a brand color
const CAT_COLOR = {
  file: '#fb923c',  // orange
  pdf:  '#f87171',  // red
  math: '#34d399',  // green
  text: '#60a5fa',  // blue
  gen:  '#c084fc',  // purple
  plan: '#f472b6',  // pink
  arc:  '#22d3ee',  // cyan
};

// Premium = always amber
const PREMIUM_COLOR = '#fbbf24';

Object.assign(window, { Icon, CAT_COLOR, PREMIUM_COLOR });
