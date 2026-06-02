// EduBot — TranslitPro (CLIENT-SIDE, pure JS)
// ✅ Backend ishlatilmaydi — transliteratsiya browserda
// O'zbek Lotin ↔ Kirill (rasmiy 1995 alifbosi asosida)

"use strict";

const {
  useState:    _useS,
  useCallback: _useC,
  useMemo:     _useM,
} = React;

// ─── Transliteratsiya jadvallari ──────────────────────────────────
// Uzunroq juftliklar avval keladi (greedy matching)
const LAT2CYR_TABLE = [
  // Uch harfli
  ["SHH", "ШҲ"], ["shh", "шҳ"],
  // Ikki harfli — katta
  ["SH", "Ш"], ["CH", "Ч"], ["NG", "НГ"],
  ["O'", "Ў"], ["O'", "Ў"], ["Oʻ", "Ў"],
  ["G'", "Ғ"], ["G'", "Ғ"], ["Gʻ", "Ғ"],
  ["YO", "Ё"], ["YU", "Ю"], ["YA", "Я"],
  ["TS", "Ц"], ["KH", "Х"],
  // Ikki harfli — kichik
  ["sh", "ш"], ["ch", "ч"], ["ng", "нг"],
  ["o'", "ў"], ["o'", "ў"], ["oʻ", "ў"],
  ["g'", "ғ"], ["g'", "ғ"], ["gʻ", "ғ"],
  ["yo", "ё"], ["yu", "ю"], ["ya", "я"],
  ["ts", "ц"], ["kh", "х"],
  // Bir harfli — katta
  ["A","А"],["B","Б"],["D","Д"],["E","Е"],["F","Ф"],
  ["G","Г"],["H","Ҳ"],["I","И"],["J","Ж"],["K","К"],
  ["L","Л"],["M","М"],["N","Н"],["O","О"],["P","П"],
  ["Q","Қ"],["R","Р"],["S","С"],["T","Т"],["U","У"],
  ["V","В"],["X","Х"],["Y","Й"],["Z","З"],
  // Bir harfli — kichik
  ["a","а"],["b","б"],["d","д"],["e","е"],["f","ф"],
  ["g","г"],["h","ҳ"],["i","и"],["j","ж"],["k","к"],
  ["l","л"],["m","м"],["n","н"],["o","о"],["p","п"],
  ["q","қ"],["r","р"],["s","с"],["t","т"],["u","у"],
  ["v","в"],["x","х"],["y","й"],["z","з"],
];

const CYR2LAT_TABLE = [
  // Ikki harfli
  ["Ш","Sh"],["ш","sh"],["Ч","Ch"],["ч","ch"],
  ["Ю","Yu"],["ю","yu"],["Я","Ya"],["я","ya"],
  ["Ё","Yo"],["ё","yo"],["Ц","Ts"],["ц","ts"],
  ["Щ","Sh"],["щ","sh"],
  // O'zbekcha maxsus
  ["Ў","Oʻ"],["ў","oʻ"],["Ғ","Gʻ"],["ғ","gʻ"],
  ["Қ","Q"], ["қ","q"], ["Ҳ","H"], ["ҳ","h"],
  // Bir harfli
  ["А","A"],["а","a"],["Б","B"],["б","b"],
  ["В","V"],["в","v"],["Г","G"],["г","g"],
  ["Д","D"],["д","d"],["Е","E"],["е","e"],
  ["Ж","J"],["ж","j"],["З","Z"],["з","z"],
  ["И","I"],["и","i"],["Й","Y"],["й","y"],
  ["К","K"],["к","k"],["Л","L"],["л","l"],
  ["М","M"],["м","m"],["Н","N"],["н","n"],
  ["О","O"],["о","o"],["П","P"],["п","p"],
  ["Р","R"],["р","r"],["С","S"],["с","s"],
  ["Т","T"],["т","t"],["У","U"],["у","u"],
  ["Ф","F"],["ф","f"],["Х","X"],["х","x"],
  ["Э","E"],["э","e"],
  // Ы, Ъ, Ь — odatda o'zbek matnida yo'q, apostrofga aylantirish
  ["Ъ","'"],["ъ","'"],["Ь","'"],["ь","'"],["Ы","I"],["ы","i"],
];

function _hasCyrillic(text) {
  return /[А-ЯЎҒҚҲа-яўғқҳё]/u.test(text);
}

function _convert(text, table) {
  let result = "";
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const [from, to] of table) {
      if (text.startsWith(from, i)) {
        result += to;
        i += from.length;
        matched = true;
        break;
      }
    }
    if (!matched) { result += text[i]; i++; }
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────
function TranslitPro({ t, accent, onToast }) {
  const [input, setInput] = _useS("");
  const [dir, setDir]     = _useS("auto"); // auto | lat2cyr | cyr2lat

  const result = _useM(() => {
    if (!input.trim()) return "";
    const toCyr = dir === "auto" ? _hasCyrillic(input) : dir === "cyr2lat";
    return _convert(input, toCyr ? CYR2LAT_TABLE : LAT2CYR_TABLE);
  }, [input, dir]);

  const detected = _useM(() => {
    if (!input) return "";
    return _hasCyrillic(input) ? "Kirill → Lotin" : "Lotin → Kirill";
  }, [input]);

  const copy = _useC(() => {
    if (!result) return;
    navigator.clipboard?.writeText(result).then(() => onToast?.("✅ Nusxalandi"));
  }, [result, onToast]);

  const swap = _useC(() => {
    setInput(result);
  }, [result]);

  const DIRS = [
    { id: "auto",    label: "🔍 Auto" },
    { id: "lat2cyr", label: "Lotin → Kirill" },
    { id: "cyr2lat", label: "Kirill → Lotin" },
  ];

  return (
    <div style={{ padding: "16px 16px 32px" }}>
      {/* Direction buttons */}
      <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
        {DIRS.map(d => (
          <button
            key={d.id}
            onClick={() => setDir(d.id)}
            style={{
              flex: 1, padding: "8px 4px", borderRadius: 10,
              border: `1.5px solid ${dir === d.id ? accent : "var(--border-subtle)"}`,
              background: dir === d.id ? accent + "18" : "var(--bg-surface-1)",
              color: dir === d.id ? accent : "var(--text-secondary)",
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Matnni kiriting yoki joylashtiring..."
        style={{
          width: "100%", height: 110, padding: "10px 12px",
          borderRadius: 12, border: "1px solid var(--border-subtle)",
          background: "var(--bg-surface-1)", color: "var(--text-primary)",
          fontSize: 15, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit",
          lineHeight: 1.55,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5, minHeight: 18 }}>
        <span style={{ fontSize: 12, color: accent }}>
          {dir === "auto" && detected ? `🔍 Aniqlandi: ${detected}` : ""}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{input.length} belgi</span>
          {input && (
            <button
              onClick={() => setInput("")}
              style={{ background: "transparent", border: "none", color: "var(--text-muted)",
                fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 }}
            >
              Tozalash
            </button>
          )}
        </span>
      </div>

      {result && (
        <div style={{
          marginTop: 12, background: "var(--bg-surface-1)",
          borderRadius: 12, padding: "12px 14px",
          border: "1px solid var(--border-subtle)",
        }}>
          <div style={{
            fontSize: 15, color: "var(--text-primary)", lineHeight: 1.65,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {result}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={copy}
              style={{
                flex: 2, padding: "10px 0",
                background: accent + "1a", color: accent,
                border: `1px solid ${accent}55`, borderRadius: 10,
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              📋 Nusxalash
            </button>
            <button
              onClick={swap}
              title="Natijani kiritish maydoniga o'tkazish"
              style={{
                flex: 1, padding: "10px 0",
                background: "var(--bg-surface-1)", color: "var(--text-secondary)",
                border: "1px solid var(--border-subtle)", borderRadius: 10,
                fontSize: 14, cursor: "pointer",
              }}
            >
              ⇄ Almash
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { TranslitPro });
