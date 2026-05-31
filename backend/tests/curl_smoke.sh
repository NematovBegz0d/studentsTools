#!/usr/bin/env bash
# curl_smoke.sh — Free endpoint regression sanity check against a running server.
#
# Usage:
#   1. Start backend in dev mode (NOT production):
#        ENV=development ALLOW_INSECURE_AUTH=true \
#        uvicorn main:app --reload --port 8000
#
#   2. Run this script (defaults to localhost:8000):
#        ./tests/curl_smoke.sh
#        BASE=http://localhost:8000 ./tests/curl_smoke.sh
#
# What it checks per endpoint:
#   • unauthenticated → expect 401
#   • with X-User-Id dev auth + valid body → expect 2xx (or a documented 5xx for heavy deps)
#   • bad / oversized input → expect 4xx
#
# Heavy endpoints (pdf2docx, docx2pdf, xlsx2pdf, bgremove, photo3x4, ocr) need
# extra system dependencies — those checks are marked HEAVY and may fail with
# 500 in a stripped dev environment. That's fine; auth + size guard are still
# verified.

set -u
BASE="${BASE:-http://localhost:8000}"
AUTH=(-H "X-User-Id: 999000111")
PASS=0
FAIL=0

# --- helpers ------------------------------------------------------------------

# expect <endpoint> <expected-codes> <curl args...>
#   expected-codes can be "401" or "200|500" (pipe-separated alternatives)
expect() {
    local label="$1" wanted="$2"; shift 2
    local got
    got=$(curl -s -o /dev/null -w "%{http_code}" "$@")
    if [[ "|$wanted|" == *"|$got|"* ]]; then
        printf "  PASS  %-40s  → %s\n" "$label" "$got"
        PASS=$((PASS+1))
    else
        printf "  FAIL  %-40s  → %s (wanted %s)\n" "$label" "$got" "$wanted"
        FAIL=$((FAIL+1))
    fi
}

section() { echo; echo "── $1 ──────────────────────────────────────"; }

# Tiny payloads. tmpdir is cleaned at exit.
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# 1×1 transparent PNG
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > "$TMP/a.png"
# Smallest valid PDF
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n170\n%%EOF' > "$TMP/a.pdf"
printf 'hello' > "$TMP/a.txt"
# Tiny ZIP via python -c (portable)
python3 -c "import zipfile; z=zipfile.ZipFile('$TMP/a.zip','w'); z.writestr('x.txt','hi'); z.close()" 2>/dev/null \
    || python -c "import zipfile; z=zipfile.ZipFile('$TMP/a.zip','w'); z.writestr('x.txt','hi'); z.close()"
# 22 MB blob for oversize tests
head -c $((22 * 1024 * 1024)) /dev/urandom > "$TMP/big.bin" 2>/dev/null \
    || dd if=/dev/zero of="$TMP/big.bin" bs=1M count=22 2>/dev/null

# --- health -------------------------------------------------------------------
section "health (no auth)"
expect "GET /health"            200  "$BASE/health"

# --- body-size guard ----------------------------------------------------------
section "cross-cutting: oversize → 413"
expect "POST /api/mergepdf 22MB" 413  -X POST "${AUTH[@]}" \
       -F "files=@$TMP/big.bin" "$BASE/api/mergepdf"

# --- PDF ops ------------------------------------------------------------------
section "PDF ops"
for ep in mergepdf splitpdf pdfpages pdftext pdflock watermark pdf2img compresspdf; do
    expect "POST /api/$ep  no-auth → 401" 401 \
           -X POST -F "file=@$TMP/a.pdf" -F "files=@$TMP/a.pdf" "$BASE/api/$ep"
done

expect "POST /api/mergepdf   valid" 200 -X POST "${AUTH[@]}" \
       -F "files=@$TMP/a.pdf" -F "files=@$TMP/a.pdf" "$BASE/api/mergepdf"
expect "POST /api/splitpdf   valid" 200 -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.pdf" -F "pages=1" "$BASE/api/splitpdf"
expect "POST /api/pdfpages   valid" 200 -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.pdf" -F "pages=1" "$BASE/api/pdfpages"
expect "POST /api/pdftext    valid" 200 -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.pdf" "$BASE/api/pdftext"
expect "POST /api/pdflock    valid" 200 -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.pdf" -F "password=test1234" "$BASE/api/pdflock"
expect "POST /api/watermark  valid" 200 -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.pdf" -F "text=TEST" "$BASE/api/watermark"
expect "POST /api/pdf2img    valid" 200 -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.pdf" -F "dpi=96" "$BASE/api/pdf2img"
expect "POST /api/compresspdf valid" 200 -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.pdf" "$BASE/api/compresspdf"

expect "POST /api/splitpdf   junk → 422" 422 -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.txt;filename=x.pdf" "$BASE/api/splitpdf"
expect "POST /api/pdftext    junk → 422" 422 -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.txt;filename=x.pdf" "$BASE/api/pdftext"

# --- Convert ops --------------------------------------------------------------
section "Convert ops  [HEAVY: pdf2docx/docx2pdf may fail without LibreOffice]"
for ep in pdf2docx docx2pdf docxedit imgs2pdf; do
    expect "POST /api/$ep  no-auth → 401" 401 \
           -X POST -F "file=@$TMP/a.pdf" -F "files=@$TMP/a.pdf" "$BASE/api/$ep"
done
expect "POST /api/imgs2pdf   valid"    200      -X POST "${AUTH[@]}" \
       -F "files=@$TMP/a.png" "$BASE/api/imgs2pdf"
expect "POST /api/pdf2docx   valid"    "200|500" -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.pdf" "$BASE/api/pdf2docx"

# --- Media ops ----------------------------------------------------------------
section "Media ops  [HEAVY: photo3x4/bgremove/ocr/xlsx2pdf need extras]"
for ep in photo3x4 cv xlsx2pdf compresspptx imgcompress bgremove ocr; do
    if [[ "$ep" == "cv" ]]; then
        expect "POST /api/$ep  no-auth → 401" 401 \
               -X POST -H "Content-Type: application/json" -d '{}' "$BASE/api/$ep"
    else
        expect "POST /api/$ep  no-auth → 401" 401 \
               -X POST -F "file=@$TMP/a.png" "$BASE/api/$ep"
    fi
done
expect "POST /api/cv          valid"   200      -X POST "${AUTH[@]}" \
       -H "Content-Type: application/json" -d '{"name":"Bob","skills":["pytest"]}' "$BASE/api/cv"
expect "POST /api/imgcompress valid"   200      -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.png" "$BASE/api/imgcompress"
expect "POST /api/photo3x4    valid"  "200|500" -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.png" "$BASE/api/photo3x4"
expect "POST /api/bgremove    valid"  "200|500" -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.png" "$BASE/api/bgremove"
expect "POST /api/ocr         valid"  "200|500" -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.png" "$BASE/api/ocr"

# --- Tools ops ----------------------------------------------------------------
section "Tools ops"
JSON_EPS=(translit readtime summarize deadline stats qr cert schedule translate wiki books)
for ep in "${JSON_EPS[@]}"; do
    expect "POST /api/$ep  no-auth → 401" 401 \
           -X POST -H "Content-Type: application/json" -d '{"text":"x"}' "$BASE/api/$ep"
done
expect "POST /api/translit    valid" 200 -X POST "${AUTH[@]}" \
       -H "Content-Type: application/json" -d '{"text":"salom dunyo"}' "$BASE/api/translit"
expect "POST /api/readtime    valid" 200 -X POST "${AUTH[@]}" \
       -H "Content-Type: application/json" -d '{"text":"hello world hello world"}' "$BASE/api/readtime"
expect "POST /api/deadline    valid" 200 -X POST "${AUTH[@]}" \
       -H "Content-Type: application/json" -d '{"text":"2026-12-31"}' "$BASE/api/deadline"
expect "POST /api/stats       valid" 200 -X POST "${AUTH[@]}" \
       -H "Content-Type: application/json" -d '{"text":"1 2 3 4 5"}' "$BASE/api/stats"
expect "POST /api/qr          valid" 200 -X POST "${AUTH[@]}" \
       -H "Content-Type: application/json" -d '{"text":"https://example.com"}' "$BASE/api/qr"
expect "POST /api/cert        valid" 200 -X POST "${AUTH[@]}" \
       -H "Content-Type: application/json" -d '{"name":"Bob","course":"Test","format":"png"}' "$BASE/api/cert"
expect "POST /api/schedule    valid" 200 -X POST "${AUTH[@]}" \
       -H "Content-Type: application/json" -d '{"text":"Dushanba: Matematika 8:00"}' "$BASE/api/schedule"

# zip / unzip
expect "POST /api/zip  no-auth → 401" 401 -X POST -F "files=@$TMP/a.txt" "$BASE/api/zip"
expect "POST /api/zip          valid" 200 -X POST "${AUTH[@]}" -F "files=@$TMP/a.txt" "$BASE/api/zip"
expect "POST /api/zip   empty → 400"  400 -X POST "${AUTH[@]}" -F "files=@/dev/null;filename=e.txt" "$BASE/api/zip" \
    || true
expect "POST /api/unzip no-auth → 401" 401 -X POST -F "file=@$TMP/a.zip" "$BASE/api/unzip"
expect "POST /api/unzip         valid" 200 -X POST "${AUTH[@]}" -F "file=@$TMP/a.zip" "$BASE/api/unzip"
expect "POST /api/unzip junk → 400"    400 -X POST "${AUTH[@]}" -F "file=@$TMP/a.txt;filename=x.zip" "$BASE/api/unzip"

# send-file requires BOT_TOKEN — without it, expect 503
expect "POST /api/send-file no-auth → 401" 401 -X POST -F "file=@$TMP/a.txt" -F "filename=a.txt" "$BASE/api/send-file"
expect "POST /api/send-file no BOT_TOKEN → 503" 503 -X POST "${AUTH[@]}" \
       -F "file=@$TMP/a.txt" -F "filename=a.txt" "$BASE/api/send-file"

# cert verify — intentionally PUBLIC
expect "GET /api/cert/verify/FAKE → 404 (no auth needed)" 404 \
       "$BASE/api/cert/verify/FAKE123"

# --- User / history -----------------------------------------------------------
section "User / history"
expect "GET /api/user/.../plan  no-auth → 401" 401 \
       "$BASE/api/user/999000111/plan"
expect "GET /api/user/own/plan  valid → 200" 200 "${AUTH[@]}" \
       "$BASE/api/user/999000111/plan"
expect "GET /api/user/other/plan  → 403"  403  "${AUTH[@]}" \
       "$BASE/api/user/12345/plan"
expect "GET /api/history  no-auth → 401" 401 "$BASE/api/history"
expect "GET /api/history  valid → 200"   200 "${AUTH[@]}" "$BASE/api/history"

# --- summary ------------------------------------------------------------------
echo
echo "──────────────────────────────────────────"
echo "PASS: $PASS    FAIL: $FAIL"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
