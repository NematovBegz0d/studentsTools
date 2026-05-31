#!/usr/bin/env node
// Post-build minifier: walks dist/, minifies every .js file with terser.
// Logs per-file before/after sizes and the total compression ratio.
"use strict";

const fs   = require("fs");
const path = require("path");
const { minify } = require("terser");

const DIST_DIR = path.join(__dirname, "..", "dist");

const TERSER_OPTS = {
  compress: {
    drop_console: false,    // keep — handlers use console.error for debugging
    drop_debugger: true,
    passes: 2,
    pure_funcs: ["console.debug"],
  },
  mangle: {
    reserved: [
      // Globals that other scripts reference at runtime
      "React", "ReactDOM", "Telegram",
      "SERVICE_HANDLERS", "BACKEND_URL",
      // Components attached to window
      "ServiceSheet", "ServicePage", "ServiceErrorBoundary",
      "Dropzone", "TextInputBox",
      "Processing", "LockedState", "SuccessRing", "ErrorState",
      "ResultFile", "ResultText", "ResultWiki", "ResultImage",
      "Photo3x4Options", "Img2PdfOptions", "CVForm",
      "Img2PdfPro", "ImgCompressPro", "QrPro", "StatsPro",
      "ReadTimePro", "TranslitPro", "DeadlinePro", "PasswordPro",
      "DocxEditPro", "MergePdfPro",
    ],
  },
  format: { comments: false, ecma: 2018 },
  ecma: 2018,
  sourceMap: false,
};

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && ent.name.endsWith(".js")) out.push(p);
  }
  return out;
}

function kb(n) { return (n / 1024).toFixed(1) + " KB"; }

(async () => {
  if (!fs.existsSync(DIST_DIR)) {
    console.error("dist/ not found — run `npm run build:src` first");
    process.exit(1);
  }
  const files = walk(DIST_DIR);
  let totalBefore = 0, totalAfter = 0, failed = 0;

  for (const file of files) {
    const src    = fs.readFileSync(file, "utf8");
    const before = Buffer.byteLength(src, "utf8");
    totalBefore += before;
    try {
      const { code, error } = await minify(src, TERSER_OPTS);
      if (error || !code) throw error || new Error("empty output");
      fs.writeFileSync(file, code, "utf8");
      const after = Buffer.byteLength(code, "utf8");
      totalAfter += after;
      const pct = ((1 - after / before) * 100).toFixed(0);
      const rel = path.relative(DIST_DIR, file);
      console.log(`  ${rel.padEnd(36)} ${kb(before).padStart(9)} -> ${kb(after).padStart(9)}  (-${pct}%)`);
    } catch (e) {
      failed++;
      totalAfter += before; // kept original
      console.warn(`  FAILED: ${path.relative(DIST_DIR, file)} — ${e.message}`);
    }
  }

  const pct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : 0;
  console.log(`\nTotal: ${kb(totalBefore)} -> ${kb(totalAfter)}  (-${pct}%)${failed ? `, ${failed} failed` : ""}`);
  if (failed > 0) process.exit(1);
})();
