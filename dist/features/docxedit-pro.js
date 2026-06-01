"use strict";
const {
    useState: _deS,
    useRef: _deR,
    useCallback: _deC,
    useEffect: _deE,
  } = React,
  DE_ACCENT = "#8b5cf6",
  DE_ACCENT_SOFT = "rgba(139,92,246,0.12)",
  DE_ACCENT_BD = "rgba(139,92,246,0.32)",
  DE_RED = "#f87171",
  DE_MAX_FILE_MB = 10,
  DE_MAX_FILE = 10485760,
  DE_MAX_PAIRS = 50,
  DE_MAX_LEN = 500;
function _deAuthHeaders() {
  const e = window.Telegram?.WebApp;
  if (!e) return {};
  const t = {};
  e.initData && (t["X-Telegram-Init-Data"] = e.initData);
  const a = e.initDataUnsafe?.user?.id;
  return (a && (t["X-User-Id"] = String(a)), t);
}
function _deExtractError(e, t) {
  if (!e || "object" != typeof e) return `Server xatosi (${t})`;
  const a = e.message ?? e.detail ?? e.error ?? e;
  if ("string" == typeof a) return a;
  if (Array.isArray(a)) {
    const e = a
      .map((e) =>
        e
          ? "string" == typeof e
            ? e
            : "object" == typeof e
              ? [
                  Array.isArray(e.loc) ? e.loc.join(".") : "",
                  e.msg || e.message || "",
                ]
                  .filter(Boolean)
                  .join(": ")
              : String(e)
          : "",
      )
      .filter(Boolean);
    if (e.length) return e.join("; ");
  }
  if ("object" == typeof a) {
    if (a.msg) return a.msg;
    if (a.message) return a.message;
    try {
      return JSON.stringify(a).slice(0, 240);
    } catch (e) {}
  }
  return `Server xatosi (${t})`;
}
function _deDownload(e, t) {
  const a = URL.createObjectURL(e),
    r = document.createElement("a");
  ((r.href = a),
    (r.download = t),
    document.body.appendChild(r),
    r.click(),
    document.body.removeChild(r),
    setTimeout(() => URL.revokeObjectURL(a), 5e3));
}
async function _deSendToBot(e, t, a) {
  const r = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (r && window.BACKEND_URL)
    try {
      const r = new FormData();
      if (
        (r.append("file", e, t),
        r.append("filename", t),
        !(
          await fetch(`${window.BACKEND_URL}/api/send-file`, {
            method: "POST",
            headers: _deAuthHeaders(),
            body: r,
          })
        ).ok)
      )
        throw new Error("Yuborilmadi");
      a?.("Telegram botga yuborildi");
    } catch (e) {
      a?.("Yuborishda xato: " + (e.message || ""));
    }
  else a?.("Telegram ID topilmadi");
}
function _DocxDropzone({ file: e, onPick: t, onClear: a }) {
  const r = _deR(null),
    [n, i] = _deS(!1),
    [o, l] = _deS(null),
    d = (e) => {
      const a = e?.[0];
      a &&
        ((e) => {
          const t = (e.name.split(".").pop() || "").toLowerCase();
          return ["doc", "docx"].includes(t)
            ? 0 === e.size
              ? (l("Tanlangan fayl bo'sh."), !1)
              : e.size > 10485760
                ? (l(
                    `Fayl ${(e.size / 1024 / 1024).toFixed(1)} MB. Maksimum 10 MB.`,
                  ),
                  !1)
                : (l(null), !0)
            : (l(
                `Faqat .doc yoki .docx fayllar qabul qilinadi. Tanlangan: .${t}`,
              ),
              !1);
        })(a) &&
        t(a);
    };
  return e
    ? React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            background:
              "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.02))",
            border: "1px solid rgba(34,197,94,0.35)",
            borderRadius: 16,
            boxShadow: "0 4px 16px rgba(34,197,94,0.10)",
          },
        },
        React.createElement(
          "div",
          {
            "aria-hidden": "true",
            style: {
              width: 42,
              height: 42,
              borderRadius: 11,
              background:
                "linear-gradient(135deg, rgba(34,197,94,0.25), rgba(34,197,94,0.10))",
              border: "0.5px solid rgba(34,197,94,0.40)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(34,197,94,0.20)",
            },
          },
          React.createElement(
            "svg",
            { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none" },
            React.createElement("path", {
              d: "M5 12l5 5L20 7",
              stroke: "#4ade80",
              strokeWidth: "2.6",
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }),
          ),
        ),
        React.createElement(
          "div",
          { style: { flex: 1, minWidth: 0 } },
          React.createElement(
            "div",
            {
              style: {
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                letterSpacing: -0.1,
              },
            },
            e.name,
          ),
          React.createElement(
            "div",
            {
              style: {
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 3,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              },
            },
            React.createElement("span", {
              "aria-hidden": "true",
              style: {
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 6px #22c55e",
              },
            }),
            (e.size / 1024).toFixed(0),
            " KB · yuklash tayyor",
          ),
        ),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: a,
            "aria-label": "Faylni o'zgartirish",
            style: {
              background: "var(--bg-surface-2)",
              border: "0.5px solid var(--border-medium)",
              color: "var(--text-secondary)",
              padding: "8px 12px",
              borderRadius: 10,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            },
          },
          "O'zgartirish",
        ),
      )
    : React.createElement(
        "div",
        null,
        React.createElement("input", {
          ref: r,
          type: "file",
          accept: ".doc,.docx",
          style: { display: "none" },
          onChange: (e) => d(e.target.files),
        }),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => r.current?.click(),
            onDragOver: (e) => {
              (e.preventDefault(), i(!0));
            },
            onDragLeave: () => i(!1),
            onDrop: (e) => {
              (e.preventDefault(), i(!1), d(e.dataTransfer.files));
            },
            style: {
              width: "100%",
              minHeight: 170,
              padding: "26px 22px",
              background: o
                ? "linear-gradient(135deg, rgba(248,113,113,0.10), rgba(248,113,113,0.02))"
                : n
                  ? "linear-gradient(135deg, #8b5cf626, #8b5cf608)"
                  : "linear-gradient(180deg, var(--bg-surface-1), var(--bg-surface-2))",
              border:
                "1.5px dashed " +
                (o
                  ? "rgba(248,113,113,0.45)"
                  : n
                    ? "#8b5cf6"
                    : "var(--border-medium)"),
              borderRadius: 20,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              font: "inherit",
              color: "var(--text-primary)",
              transition: "all 0.22s cubic-bezier(0.3, 0.7, 0.4, 1)",
              transform: n ? "scale(1.01)" : "scale(1)",
              boxShadow: n
                ? "0 10px 32px #8b5cf630"
                : "0 1px 0 rgba(255,255,255,0.04) inset",
              position: "relative",
              overflow: "hidden",
            },
          },
          !o &&
            React.createElement("div", {
              "aria-hidden": "true",
              style: {
                position: "absolute",
                top: -40,
                left: "50%",
                transform: "translateX(-50%)",
                width: 200,
                height: 80,
                background: n
                  ? "radial-gradient(ellipse at center, #8b5cf640, transparent 70%)"
                  : "radial-gradient(ellipse at center, #8b5cf61a, transparent 70%)",
                pointerEvents: "none",
                transition: "opacity 0.22s",
              },
            }),
          React.createElement(
            "div",
            {
              "aria-hidden": "true",
              style: {
                position: "relative",
                width: 56,
                height: 56,
                borderRadius: 16,
                background: o
                  ? "linear-gradient(135deg, rgba(248,113,113,0.20), rgba(248,113,113,0.08))"
                  : "linear-gradient(135deg, #8b5cf638, #8b5cf614)",
                border: `1px solid ${o ? "rgba(248,113,113,0.40)" : DE_ACCENT_BD}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: o
                  ? "0 6px 20px rgba(248,113,113,0.15)"
                  : "0 6px 20px #8b5cf630",
              },
            },
            React.createElement(
              "svg",
              { width: "26", height: "26", viewBox: "0 0 24 24", fill: "none" },
              React.createElement("path", {
                d: "M12 16V4m0 0l-5 5m5-5l5 5M5 20h14",
                stroke: o ? "#fb7185" : "#8b5cf6",
                strokeWidth: "2.2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
              }),
            ),
          ),
          React.createElement(
            "div",
            {
              style: {
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: -0.2,
                position: "relative",
              },
            },
            o ? "Boshqa fayl tanlang" : "Word faylni shu yerga tashlang",
          ),
          React.createElement(
            "div",
            {
              style: {
                fontSize: 12.5,
                color: "var(--text-muted)",
                fontWeight: 500,
                position: "relative",
              },
            },
            "yoki bosib tanlang",
          ),
          React.createElement(
            "div",
            {
              style: {
                fontSize: 10.5,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: "var(--text-secondary)",
                fontWeight: 600,
                background: "var(--bg-surface-2)",
                border: "0.5px solid var(--border-subtle)",
                padding: "4px 10px",
                borderRadius: 99,
                marginTop: 4,
                position: "relative",
              },
            },
            ".DOC · .DOCX · Maks ",
            10,
            " MB",
          ),
          o &&
            React.createElement(
              "div",
              {
                style: {
                  fontSize: 11.5,
                  color: DE_RED,
                  marginTop: 4,
                  textAlign: "center",
                },
              },
              o,
            ),
        ),
      );
}
function _PairRow({ idx: e, pair: t, onChange: a, onRemove: r, canRemove: n }) {
  const i = !!t.find?.trim();
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "stretch",
        gap: 10,
        padding: "12px 12px",
        background: i
          ? `linear-gradient(135deg, ${DE_ACCENT_SOFT}, var(--bg-surface-1) 60%)`
          : "var(--bg-surface-1)",
        border: `0.5px solid ${i ? DE_ACCENT_BD : "var(--border-subtle)"}`,
        borderRadius: 14,
        transition: "all 0.18s",
      },
    },
    React.createElement(
      "div",
      {
        "aria-hidden": "true",
        style: {
          minWidth: 26,
          height: 26,
          borderRadius: 8,
          background: i
            ? "linear-gradient(135deg, #8b5cf6, #8b5cf6cc)"
            : "linear-gradient(135deg, #8b5cf633, #8b5cf611)",
          color: i ? "#fff" : "#8b5cf6",
          fontSize: 11.5,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "flex-start",
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
          boxShadow: i ? "0 4px 12px #8b5cf645" : "0 2px 8px #8b5cf620",
          transition: "all 0.18s",
        },
      },
      e + 1,
    ),
    React.createElement(
      "div",
      {
        style: {
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        },
      },
      React.createElement(
        "label",
        {
          style: {
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "var(--text-muted)",
          },
        },
        "Qidirish",
      ),
      React.createElement("input", {
        type: "text",
        value: t.find,
        onChange: (t) => a(e, "find", t.target.value),
        placeholder: "Word'da turgan matn",
        maxLength: 500,
        rows: 2,
        style: {
          width: "100%",
          padding: "8px 10px",
          background: "var(--bg-surface-2)",
          border: "1px solid var(--border-medium)",
          borderRadius: 10,
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          resize: "vertical",
          minHeight: 38,
          boxSizing: "border-box",
        },
      }),
    ),
    React.createElement(
      "div",
      {
        style: {
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        },
      },
      React.createElement(
        "label",
        {
          style: {
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "var(--text-muted)",
          },
        },
        "Almashtirish",
      ),
        React.createElement("input", {
          type="text",
        value: t.replace,
        onChange: (t) => a(e, "replace", t.target.value),
        placeholder: "Yangi matn",
        maxLength: 500,
        rows: 2,
        style: {
          width: "100%",
          padding: "8px 10px",
          background: "var(--bg-surface-2)",
          border: "1px solid var(--border-medium)",
          borderRadius: 10,
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          resize: "vertical",
          minHeight: 38,
          boxSizing: "border-box",
        },
      }),
    ),
    React.createElement(
      "button",
      {
        type: "button",
        onClick: () => r(e),
        disabled: !n,
        "aria-label": "Qatorni o'chirish",
        style: {
          width: 30,
          height: 30,
          borderRadius: 8,
          background: n ? "rgba(248,113,113,0.10)" : "transparent",
          border:
            "0.5px solid " +
            (n ? "rgba(248,113,113,0.30)" : "var(--border-subtle)"),
          color: n ? DE_RED : "var(--text-faint)",
          cursor: n ? "pointer" : "default",
          alignSelf: "flex-start",
          marginTop: 4,
          fontSize: 14,
          flexShrink: 0,
        },
      },
      "×",
    ),
  );
}
function DocxEditPro({ t: e, accent: t, onToast: a }) {
  const [r, n] = _deS(null),
    [i, o] = _deS([{ find: "", replace: "" }]),
    [l, d] = _deS(!1),
    [c, s] = _deS("input"),
    [p, g] = _deS(null),
    [f, b] = _deS(null),
    u = _deC((e, t, a) => {
      o((r) => r.map((r, n) => (n === e ? { ...r, [t]: a } : r)));
    }, []),
    m = _deC(() => {
      o((e) => (e.length < 50 ? [...e, { find: "", replace: "" }] : e));
    }, []),
    x = _deC((e) => {
      o((t) => (t.length > 1 ? t.filter((t, a) => a !== e) : t));
    }, []),
    h = _deC(() => {
      (n(null),
        o([{ find: "", replace: "" }]),
        d(!1),
        s("input"),
        g(null),
        b(null));
    }, []),
    y = i.filter((e) => e.find.trim()),
    v = !!r && y.length > 0,
    E = _deC(async () => {
      if (v && window.BACKEND_URL) {
        (s("processing"), b(null));
        try {
          const e = new FormData();
          (e.append("file", r),
            e.append("pairs", JSON.stringify(y)),
            e.append("case_sensitive", l ? "true" : "false"),
            y[0] &&
              (e.append("find", y[0].find || ""),
              e.append("replace", y[0].replace || "")));
          const t = new AbortController(),
            a = setTimeout(() => t.abort(), 6e4);
          let n;
          try {
            n = await fetch(`${window.BACKEND_URL}/api/docxedit`, {
              method: "POST",
              headers: _deAuthHeaders(),
              body: e,
              signal: t.signal,
            });
          } finally {
            clearTimeout(a);
          }
          if (!n.ok) {
            let e = `Server xatosi (${n.status})`;
            try {
              e = _deExtractError(await n.json(), n.status);
            } catch (e) {}
            throw (
              422 === n.status &&
                /find|replace/i.test(e) &&
                (e =
                  "Server hali eski versiyada. Iltimos, biroz keyin urinib ko'ring (backend yangilanmoqda)."),
              new Error(e)
            );
          }
          const i = await n.blob(),
            o = n.headers.get("X-Info") || `${y.length} ta juftlik qo'llandi`,
            d = (r.name || "document").replace(/\.[^.]+$/, "");
          (g({ blob: i, filename: `${d}_edited.docx`, info: o }),
            s("done"),
            window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(
              "success",
            ));
        } catch (e) {
          const t =
            "AbortError" === e.name
              ? "So'rov vaqti tugadi (60s). Internet aloqasini tekshiring."
              : e.message || "Kutilmagan xato. Qayta urinib ko'ring.";
          (b(t),
            s("error"),
            window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(
              "error",
            ));
        }
      }
    }, [r, y, l, v]);
  return "processing" === c
    ? React.createElement(
        "div",
        { style: { padding: "40px 20px", textAlign: "center" } },
        React.createElement("div", {
          className: "spinner",
          style: { margin: "0 auto 18px" },
        }),
        React.createElement(
          "div",
          {
            style: {
              color: "var(--text-primary)",
              fontSize: 15,
              fontWeight: 600,
            },
          },
          "Word fayl ishlanmoqda",
        ),
        React.createElement(
          "div",
          {
            style: { color: "var(--text-muted)", fontSize: 12.5, marginTop: 4 },
          },
          y.length,
          " ta juftlik qo'llanmoqda…",
        ),
      )
    : "error" === c
      ? React.createElement(
          "div",
          {
            role: "alert",
            "aria-live": "assertive",
            style: {
              padding: "32px 16px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            },
          },
          React.createElement(
            "div",
            {
              "aria-hidden": "true",
              style: {
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(239,68,68,0.14)",
                border: "1px solid rgba(239,68,68,0.30)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              },
            },
            React.createElement(
              "svg",
              { width: "30", height: "30", viewBox: "0 0 24 24", fill: "none" },
              React.createElement("path", {
                d: "M12 8v5M12 17h.01",
                stroke: "#ef4444",
                strokeWidth: "2.4",
                strokeLinecap: "round",
              }),
              React.createElement("circle", {
                cx: "12",
                cy: "12",
                r: "9",
                stroke: "#ef4444",
                strokeWidth: "2",
                fill: "none",
              }),
            ),
          ),
          React.createElement(
            "div",
            {
              style: {
                color: "var(--text-primary)",
                fontSize: 16,
                fontWeight: 700,
              },
            },
            "Xatolik yuz berdi",
          ),
          React.createElement(
            "div",
            {
              style: {
                color: "var(--text-secondary)",
                fontSize: 13,
                lineHeight: 1.5,
                textAlign: "center",
                whiteSpace: "pre-wrap",
                maxWidth: 420,
              },
            },
            f,
          ),
          React.createElement(
            "div",
            {
              style: { display: "flex", gap: 10, width: "100%", marginTop: 4 },
            },
            React.createElement(
              "button",
              {
                type: "button",
                onClick: h,
                style: {
                  flex: 1,
                  padding: "11px 14px",
                  borderRadius: 12,
                  background: "var(--bg-surface-2)",
                  border: "0.5px solid var(--border-medium)",
                  color: "var(--text-primary)",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                },
              },
              "Yopish",
            ),
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () => s("input"),
                style: {
                  flex: 1,
                  padding: "11px 14px",
                  borderRadius: 12,
                  background: t || "#8b5cf6",
                  border: "none",
                  color: "#fff",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                },
              },
              "Qayta urinish",
            ),
          ),
        )
      : "done" === c && p
        ? React.createElement(
            "div",
            {
              style: {
                minHeight: "70vh",
                padding: "20px 16px 24px",
                display: "flex",
                flexDirection: "column",
                boxSizing: "border-box",
              },
            },
            React.createElement(
              "div",
              {
                style: {
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                  padding: "16px 8px",
                },
              },
              React.createElement(
                "div",
                {
                  "aria-hidden": "true",
                  style: {
                    width: 88,
                    height: 88,
                    borderRadius: "50%",
                    background: "rgba(34,197,94,0.14)",
                    border: "1px solid rgba(34,197,94,0.30)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 8px 28px rgba(34,197,94,0.18)",
                  },
                },
                React.createElement(
                  "svg",
                  {
                    width: "42",
                    height: "42",
                    viewBox: "0 0 24 24",
                    fill: "none",
                  },
                  React.createElement("path", {
                    d: "M5 12l5 5L20 7",
                    stroke: "#22c55e",
                    strokeWidth: "3",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  }),
                ),
              ),
              React.createElement(
                "div",
                {
                  style: {
                    color: "var(--text-primary)",
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: -0.3,
                    marginTop: 2,
                  },
                },
                "Tayyor!",
              ),
              React.createElement(
                "div",
                {
                  style: {
                    color: "var(--text-secondary)",
                    fontSize: 13.5,
                    textAlign: "center",
                    lineHeight: 1.5,
                    maxWidth: 320,
                  },
                },
                p.info,
              ),
              React.createElement(
                "div",
                {
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    borderRadius: 99,
                    background: "var(--bg-surface-1)",
                    border: "0.5px solid var(--border-subtle)",
                    color: "var(--text-muted)",
                    fontSize: 11.5,
                    fontWeight: 500,
                    marginTop: 4,
                  },
                },
                React.createElement("span", { "aria-hidden": "true" }, "📄"),
                React.createElement(
                  "span",
                  {
                    style: {
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    },
                  },
                  p.filename,
                ),
                React.createElement(
                  "span",
                  { style: { color: "var(--text-faint)" } },
                  Math.max(1, Math.round(p.blob.size / 1024)),
                  " KB",
                ),
              ),
            ),
            React.createElement(
              "div",
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  flexShrink: 0,
                },
              },
              React.createElement(
                "div",
                { style: { display: "flex", gap: 10 } },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: h,
                    style: {
                      flex: 1,
                      padding: "13px 14px",
                      borderRadius: 14,
                      background: "var(--bg-surface-2)",
                      border: "0.5px solid var(--border-medium)",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    },
                  },
                  "Yana ishlash",
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: () => _deDownload(p.blob, p.filename),
                    style: {
                      flex: 1,
                      padding: "13px 14px",
                      borderRadius: 14,
                      background: t || "#8b5cf6",
                      border: "none",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 6px 18px " + (t || "#8b5cf6") + "40",
                    },
                  },
                  "Yuklab olish",
                ),
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  onClick: () => _deSendToBot(p.blob, p.filename, a),
                  style: {
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: "var(--bg-surface-1)",
                    border: "0.5px solid var(--border-light)",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  },
                },
                React.createElement("span", { "aria-hidden": "true" }, "✈️"),
                "Telegram botga yuborish",
              ),
            ),
          )
        : React.createElement(
            "div",
            {
              style: {
                padding: "8px 16px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              },
            },
            React.createElement(_DocxDropzone, {
              file: r,
              onPick: n,
              onClear: () => n(null),
            }),
            React.createElement(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 4,
                },
              },
              React.createElement(
                "div",
                {
                  style: {
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  },
                },
                "Almashtirishlar · ",
                i.length,
                "/",
                50,
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  onClick: m,
                  disabled: i.length >= 50,
                  "aria-label": "Yangi almashtirish qatori qo'shish",
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 11px",
                    borderRadius: 99,
                    background:
                      i.length >= 50 ? "var(--bg-surface-1)" : DE_ACCENT_SOFT,
                    border: `0.5px solid ${i.length >= 50 ? "var(--border-subtle)" : DE_ACCENT_BD}`,
                    color: i.length >= 50 ? "var(--text-faint)" : "#8b5cf6",
                    cursor: i.length >= 50 ? "default" : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                  },
                },
                React.createElement(
                  "span",
                  { style: { fontSize: 14, lineHeight: 1 } },
                  "+",
                ),
                " Qo'shish",
              ),
            ),
            React.createElement(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: 8 } },
              i.map((e, t) =>
                React.createElement(_PairRow, {
                  key: t,
                  idx: t,
                  pair: e,
                  onChange: u,
                  onRemove: x,
                  canRemove: i.length > 1,
                }),
              ),
            ),
            React.createElement(
              "label",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: "var(--bg-surface-1)",
                  border: "0.5px solid var(--border-subtle)",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                },
              },
              React.createElement("input", {
                type: "checkbox",
                checked: l,
                onChange: (e) => d(e.target.checked),
                style: { accentColor: t || "#8b5cf6", width: 16, height: 16 },
              }),
              React.createElement(
                "span",
                null,
                "Katta/kichik harf farqlash (case sensitive)",
              ),
            ),
            React.createElement(
              "div",
              { style: { display: "flex", gap: 10, marginTop: 4 } },
              React.createElement(
                "button",
                {
                  type: "button",
                  onClick: h,
                  style: {
                    flex: 1,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "var(--bg-surface-2)",
                    border: "0.5px solid var(--border-medium)",
                    color: "var(--text-primary)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  },
                },
                "Tozalash",
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  onClick: E,
                  disabled: !v,
                  style: {
                    flex: 1,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: v ? t || "#8b5cf6" : "var(--bg-surface-2)",
                    border: "none",
                    color: v ? "#fff" : "var(--text-faint)",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: v ? "pointer" : "default",
                    transition: "background 0.18s",
                  },
                },
                "Boshlash",
              ),
            ),
            !r &&
              React.createElement(
                "div",
                {
                  style: {
                    fontSize: 11.5,
                    color: "var(--text-faint)",
                    textAlign: "center",
                  },
                },
                "Avval Word faylni yuklang",
              ),
            r &&
              0 === y.length &&
              React.createElement(
                "div",
                {
                  style: {
                    fontSize: 11.5,
                    color: "var(--text-faint)",
                    textAlign: "center",
                  },
                },
                'Kamida bitta "Qidirish" matni kiriting',
              ),
          );
}
Object.assign(window, { DocxEditPro });
