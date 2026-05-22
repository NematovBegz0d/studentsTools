from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from loguru import logger
from typing import Optional
import io
import os
import time
import tempfile
import httpx
import sys

# ─── Config ──────────────────────────────────────────────────────────────────

BOT_TOKEN   = os.environ.get("BOT_TOKEN", "")
APP_URL     = os.environ.get("APP_URL", "https://nematovbegz0d.github.io/studentsTools/EduBot.html")
MAX_FILE_MB = 10
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024
_start_time = time.time()

# ─── Logging ─────────────────────────────────────────────────────────────────

logger.remove()
logger.add(sys.stdout, format="{time:HH:mm:ss} | {level:<7} | {message}", level="INFO")

# ─── Rate limiter ─────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["30/minute"])

# ─── Rembg session (singleton) ───────────────────────────────────────────────

_rembg_session = None

def get_rembg_session():
    global _rembg_session
    if _rembg_session is None:
        from rembg import new_session
        _rembg_session = new_session("u2netp")
        logger.info("rembg session yaratildi (u2netp)")
    return _rembg_session

# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("EduBot Backend ishga tushmoqda...")
    domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
    if BOT_TOKEN and domain:
        webhook_url = f"https://{domain}/webhook"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook",
                    json={"url": webhook_url, "drop_pending_updates": True},
                )
                if r.json().get("ok"):
                    logger.info(f"Webhook: {webhook_url}")
                else:
                    logger.error(f"Webhook xatosi: {r.json()}")
        except Exception as e:
            logger.error(f"Webhook ulanishda xato: {e}")
    else:
        logger.warning("BOT_TOKEN yoki RAILWAY_PUBLIC_DOMAIN yo'q")

    yield

    logger.info("EduBot Backend to'xtatilmoqda...")
    global _rembg_session
    _rembg_session = None

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="EduBot Backend", version="1.2.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def check_size(data: bytes, endpoint: str = ""):
    if len(data) > MAX_FILE_BYTES:
        mb = round(len(data) / 1024 / 1024, 1)
        logger.warning(f"{endpoint}: {mb}MB > {MAX_FILE_MB}MB limit")
        raise HTTPException(status_code=413, detail=f"Fayl {mb}MB. Maksimal: {MAX_FILE_MB}MB")

async def tg_send(chat_id: int, text: str, reply_markup: Optional[dict] = None):
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            json=payload,
        )

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/")
@app.get("/health")
def health():
    ocr_ok = False
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        ocr_ok = True
    except Exception:
        pass

    return {
        "status":       "ok",
        "version":      "1.2.0",
        "uptime":       int(time.time() - _start_time),
        "ocr":          ocr_ok,
        "rembg_ready":  _rembg_session is not None,
        "max_file_mb":  MAX_FILE_MB,
    }

# ─── Telegram Webhook ─────────────────────────────────────────────────────────

@app.post("/webhook")
async def webhook(request: Request):
    if not BOT_TOKEN:
        return {"ok": False}

    try:
        update = await request.json()
    except Exception:
        return {"ok": False}

    message = update.get("message") or update.get("edited_message")
    if not message:
        return {"ok": True}

    chat_id    = message.get("chat", {}).get("id")
    text       = message.get("text", "")
    first_name = message.get("from", {}).get("first_name", "Do'st")

    logger.info(f"Webhook: chat={chat_id} text={text[:30]!r}")

    if text.startswith("/start"):
        await tg_send(
            chat_id,
            f"Salom, <b>{first_name}</b>! 👋\n\n"
            f"📚 <b>EduBot</b> — talabalar uchun 28+ ta bepul xizmat:\n\n"
            f"• 📄 PDF birlashtirish, bo'lish, himoyalash\n"
            f"• 🖼 Rasm → PDF, siqish, fon olib tashlash\n"
            f"• 🌐 Tarjima, Wikipedia, kitob qidirish\n"
            f"• 📊 Formula, grafik, statistika\n"
            f"• 🎓 Sertifikat, jadval, QR kod\n\n"
            f"Quyidagi tugmani bosib ilovani oching 👇",
            reply_markup={"inline_keyboard": [[
                {"text": "📱 Ilovani ochish", "web_app": {"url": APP_URL}}
            ]]},
        )
    else:
        await tg_send(
            chat_id,
            "📱 Barcha xizmatlar ilovada mavjud:",
            reply_markup={"inline_keyboard": [[
                {"text": "📱 Ilovani ochish", "web_app": {"url": APP_URL}}
            ]]},
        )

    return {"ok": True}

# ─── Send file to Telegram ────────────────────────────────────────────────────

@app.post("/api/send-file")
@limiter.limit("20/minute")
async def send_file(
    request: Request,
    user_id: str = Form(...),
    filename: str = Form(...),
    file: UploadFile = File(...),
):
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot sozlanmagan")
    data = await file.read()
    check_size(data, "/api/send-file")
    t0 = time.time()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument",
            data={"chat_id": user_id, "caption": f"📎 {filename}\n\n🤖 EduBot"},
            files={"document": (filename, data, file.content_type or "application/octet-stream")},
        )
    result = r.json()
    if not result.get("ok"):
        logger.error(f"sendDocument xato: {result.get('description')} user={user_id}")
        raise HTTPException(status_code=500, detail=result.get("description", "Xatolik"))
    logger.info(f"sendDocument: user={user_id} {filename} {time.time()-t0:.1f}s")
    return {"ok": True}

# ─── Background removal ───────────────────────────────────────────────────────

@app.post("/api/bgremove")
@limiter.limit("5/minute")
async def bgremove(request: Request):
    t0 = time.time()
    try:
        from rembg import remove
        import base64
        ct = request.headers.get("content-type", "")
        if "multipart" in ct:
            form = await request.form()
            f = form.get("file")
            data = await f.read()
        else:
            body = await request.json()
            data = base64.b64decode(body["data"])

        check_size(data, "/api/bgremove")
        result = remove(data, session=get_rembg_session())
        logger.info(f"bgremove: {len(data)//1024}KB → {len(result)//1024}KB  {time.time()-t0:.1f}s")
        return Response(
            content=result,
            media_type="image/png",
            headers={"Content-Disposition": "attachment; filename=no-bg.png"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"bgremove xato: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── OCR ──────────────────────────────────────────────────────────────────────

@app.post("/api/ocr")
@limiter.limit("15/minute")
async def ocr(request: Request):
    t0 = time.time()
    try:
        import pytesseract
        from PIL import Image
        import base64
        ct = request.headers.get("content-type", "")
        if "multipart" in ct:
            form = await request.form()
            f = form.get("file")
            data = await f.read()
        else:
            body = await request.json()
            data = base64.b64decode(body["data"])

        check_size(data, "/api/ocr")
        img = Image.open(io.BytesIO(data))
        text = pytesseract.image_to_string(img, lang="rus+eng+uzb")
        logger.info(f"ocr: {len(data)//1024}KB → {len(text)} belgi  {time.time()-t0:.1f}s")
        return JSONResponse({"text": text.strip() or "Matn topilmadi"})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ocr xato: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── PDF → DOCX ───────────────────────────────────────────────────────────────

@app.post("/api/pdf2docx")
@limiter.limit("10/minute")
async def pdf_to_docx(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        from pdf2docx import Converter
        data = await file.read()
        check_size(data, "/api/pdf2docx")

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(data)
            pdf_path = tmp.name
        docx_path = pdf_path.replace(".pdf", ".docx")

        try:
            cv = Converter(pdf_path)
            cv.convert(docx_path, start=0, end=None)
            cv.close()
            with open(docx_path, "rb") as f:
                out = f.read()
            logger.info(f"pdf2docx: {len(data)//1024}KB → {len(out)//1024}KB  {time.time()-t0:.1f}s")
            return Response(
                content=out,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": "attachment; filename=converted.docx"},
            )
        finally:
            if os.path.exists(pdf_path):
                os.unlink(pdf_path)
            if os.path.exists(docx_path):
                os.unlink(docx_path)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"pdf2docx xato: {e}")
        raise HTTPException(status_code=500, detail=str(e))
