# EduBot — Student Tools

Telegram Mini App giving students 30+ free utilities (PDF/DOCX/XLSX conversion, OCR,
translation, QR codes, CV/certificate generators, dars jadvali, summarization) plus
premium AI services and a Payme-backed subscription flow.

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI 0.115 · Python 3.11 · asyncpg / aiosqlite |
| Frontend | React 18 (Babel-only, no bundler) · Telegram WebApp SDK |
| Database | PostgreSQL (prod) / SQLite (local) |
| Cache | Redis (optional) / in-memory fallback |
| OCR | PaddleOCR · Tesseract |
| PDF | PyMuPDF · pikepdf · pdf2docx · marker-pdf · LibreOffice (xlsx/docx) |
| Image | Pillow · pyvips · rembg · MediaPipe (face detection) |
| Deployment | Docker → Railway |

## Local development

```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env  # fill in BOT_TOKEN, etc.
uvicorn main:app --reload --port 8000

# 2. Frontend (separate terminal)
npm install
npm run build         # build:src + minify
# or, for watch mode without minify:
npm run watch

# 3. Open EduBot.html in browser (or load in Telegram via BotFather Mini App URL)
```

### Build pipeline

```
npm run build:src     Babel JSX → JS (dist/)
npm run minify        Terser minify dist/*.js (~40% smaller)
npm run build         Both (default)
npm run watch         Babel watch mode (no minify)
```

### Environment variables

See `.env.example` for the full list. The only one required for local dev is `BOT_TOKEN`
(any Telegram bot token works for testing). Without `DATABASE_URL`, the backend falls
back to SQLite at `edubot.db`.

## Deployment (Railway)

1. Connect this repo to Railway
2. Add the PostgreSQL plugin → `DATABASE_URL` auto-injects
3. Set required env vars in Railway dashboard:
   - `BOT_TOKEN`, `ADMIN_TOKEN`, `WEBHOOK_SECRET`
   - Optional: `ANTHROPIC_API_KEY`, `SENTRY_DSN`, `REDIS_URL`, `PAYME_*`
4. Deploy. Railway uses `backend/Dockerfile`.
5. Set Telegram webhook:
   ```
   curl -X POST "https://api.telegram.org/bot{BOT_TOKEN}/setWebhook" \
        -d "url=https://your-app.up.railway.app/webhook" \
        -d "secret_token=$WEBHOOK_SECRET"
   ```

Frontend lives on GitHub Pages at `https://<user>.github.io/<repo>/EduBot.html`.

## Running tests

```bash
cd backend
pytest                           # all tests
pytest tests/test_translit.py    # one file
pytest -k "wiki"                 # by name
```

## Project layout

```
.
├── backend/
│   ├── main.py            # FastAPI app — endpoints
│   ├── database.py        # PG + SQLite abstraction
│   ├── payment.py         # Payme integration
│   ├── cache.py           # Redis + memory cache
│   ├── img2pdf_improved.py
│   ├── admin.html         # served at /admin
│   ├── Dockerfile
│   ├── requirements.txt
│   └── tests/             # pytest
├── src/                   # React source (Babel input)
│   ├── app.jsx
│   ├── components/
│   ├── features/
│   ├── pages/
│   ├── services/handlers.js  # API client
│   └── data/data.js          # Service catalog
├── dist/                  # built JS (committed for GitHub Pages)
├── EduBot.html            # Telegram Mini App entry
├── sw.js                  # PWA service worker
├── scripts/minify.js
└── .env.example
```

## Notes on the audit corrections applied

This codebase went through several modernization passes documented in commits:

- **photo3x4** → MediaPipe (3× more accurate vs Haar Cascade)
- **xlsx2pdf** → LibreOffice CLI (preserves colors/merges/charts)
- **CV / cert** → WeasyPrint + Jinja2 HTML templates
- **schedule** → adds iCalendar (`.ics`) export
- **readtime** → language-adaptive WPM (Brysbaert 2019)
- **pdflock** → password moved from `X-Password` to `X-Password-B64` (UTF-8 safe)
- **cert verification** → new DB-backed `/api/cert/verify/{id}` endpoint
- **PaddleOCR** → `threading.Lock` double-checked init (fixes race in `_converter_pool`)

## License

ISC
