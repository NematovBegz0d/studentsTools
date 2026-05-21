from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Form, Header
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

from database import (
    init_db, upsert_user, get_user, is_premium, log_usage, get_stats,
    create_payment, get_payment, get_payment_by_payme, confirm_payment, cancel_payment,
)
from payment import (
    handle_rpc, build_checkout_url, new_payment_id,
    verify_payme_auth, PLAN_PRICES,
)

# ─── Config ──────────────────────────────────────────────────────────────────

BOT_TOKEN            = os.environ.get("BOT_TOKEN", "")
APP_URL              = os.environ.get("APP_URL", "https://nematovbegz0d.github.io/studentsTools/EduBot.html")
SECRET_WEBHOOK_TOKEN = os.environ.get("SECRET_WEBHOOK_TOKEN", "")
ADMIN_IDS            = set(os.environ.get("ADMIN_IDS", "").split(",")) - {""}
MAX_FILE_BYTES       = 10 * 1024 * 1024  # 10 MB
_start_time          = time.time()

# ─── Logging ─────────────────────────────────────────────────────────────────

logger.remove()
logger.add(sys.stdout, format="{time:HH:mm:ss} | {level:<7} | {message}", level="INFO")
logger.add(
    "logs/error.log",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}",
    level="ERROR",
    rotation="10 MB",
    retention="30 days",
    create=True,
)

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
    # Startup
    logger.info("EduBot Backend ishga tushmoqda...")

    await init_db()
    logger.info("Database tayyor")

    domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
    if BOT_TOKEN and domain:
        webhook_url = f"https://{domain}/webhook"
        payload = {"url": webhook_url, "drop_pending_updates": True}
        if SECRET_WEBHOOK_TOKEN:
            payload["secret_token"] = SECRET_WEBHOOK_TOKEN
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook",
                json=payload,
            )
            result = r.json()
            if result.get("ok"):
                logger.info(f"Webhook o'rnatildi: {webhook_url}")
            else:
                logger.error(f"Webhook xatosi: {result}")
    else:
        logger.warning("BOT_TOKEN yoki RAILWAY_PUBLIC_DOMAIN yo'q — webhook o'rnatilmadi")

    yield

    # Shutdown
    logger.info("EduBot Backend to'xtatilmoqda...")
    global _rembg_session
    if _rembg_session is not None:
        _rembg_session = None
        logger.info("rembg session yopildi")

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="EduBot Backend", version="2.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def check_file_size(data: bytes, endpoint: str = ""):
    if len(data) > MAX_FILE_BYTES:
        mb = len(data) / 1024 / 1024
        logger.warning(f"{endpoint}: fayl hajmi {mb:.1f}MB, limit 10MB")
        raise HTTPException(
            status_code=413,
            detail=f"Fayl hajmi {mb:.1f}MB. Maksimal ruxsat: 10MB"
        )

def parse_user_id(x_user_id: Optional[str]) -> Optional[int]:
    try:
        return int(x_user_id) if x_user_id else None
    except (ValueError, TypeError):
        return None

async def tg_send(chat_id: int, text: str, reply_markup: dict = None):
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
def root():
    return {"status": "ok", "service": "EduBot Backend", "version": "2.1.0"}


@app.get("/health")
def health():
    uptime = int(time.time() - _start_time)

    rembg_ok = False
    try:
        import importlib
        rembg_ok = importlib.util.find_spec("rembg") is not None
    except Exception:
        pass

    ocr_ok = False
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        ocr_ok = True
    except Exception:
        pass

    return {
        "status": "ok",
        "rembg": rembg_ok,
        "ocr": ocr_ok,
        "uptime": uptime,
        "max_file_mb": MAX_FILE_BYTES // (1024 * 1024),
    }

# ─── Admin stats ──────────────────────────────────────────────────────────────

@app.get("/api/admin/stats")
async def admin_stats(x_admin_id: Optional[str] = Header(None)):
    if not ADMIN_IDS or x_admin_id not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Forbidden")
    return await get_stats()

# ─── Webhook ──────────────────────────────────────────────────────────────────

@app.post("/webhook")
async def webhook(request: Request):
    if not BOT_TOKEN:
        return {"ok": False}

    if SECRET_WEBHOOK_TOKEN:
        incoming = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if incoming != SECRET_WEBHOOK_TOKEN:
            logger.warning(f"Webhook: noto'g'ri secret token, IP={get_remote_address(request)}")
            raise HTTPException(status_code=403, detail="Forbidden")

    update = await request.json()
    message = update.get("message") or update.get("edited_message")
    if not message:
        return {"ok": True}

    chat_id    = message.get("chat", {}).get("id")
    text       = message.get("text", "")
    user       = message.get("from", {})
    user_id    = user.get("id")
    first_name = user.get("first_name", "Do'st")
    username   = user.get("username")

    logger.info(f"Webhook: user={user_id} text={text[:40]!r}")

    # Foydalanuvchini database ga saqlash/yangilash
    if user_id:
        await upsert_user(user_id, username, first_name)

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
            reply_markup={
                "inline_keyboard": [[
                    {"text": "📱 Ilovani ochish", "web_app": {"url": APP_URL}}
                ]]
            },
        )
    elif text.startswith("/stats") and str(user_id) in ADMIN_IDS:
        stats = await get_stats()
        lines = [
            f"📊 <b>EduBot statistikasi</b>\n",
            f"👥 Jami foydalanuvchilar: <b>{stats['total_users']}</b>",
            f"⭐ Premium foydalanuvchilar: <b>{stats['premium_users']}</b>",
            f"📨 Bugungi so'rovlar: <b>{stats['today_requests']}</b>\n",
            f"🏆 Top xizmatlar:",
        ]
        for item in stats["top_services"]:
            lines.append(f"  • {item['service_id']}: {item['cnt']} marta")
        await tg_send(chat_id, "\n".join(lines))
    else:
        await tg_send(
            chat_id,
            "📱 Barcha xizmatlar ilovada mavjud:",
            reply_markup={
                "inline_keyboard": [[
                    {"text": "📱 Ilovani ochish", "web_app": {"url": APP_URL}}
                ]]
            },
        )

    return {"ok": True}

# ─── Send file to user via bot ────────────────────────────────────────────────

@app.post("/api/send-file")
@limiter.limit("20/minute")
async def send_file_to_user(
    request: Request,
    user_id: str = Form(...),
    filename: str = Form(...),
    file: UploadFile = File(...),
):
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot sozlanmagan")
    data = await file.read()
    check_file_size(data, "/api/send-file")
    mime = file.content_type or "application/octet-stream"
    t0 = time.time()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument",
            data={"chat_id": user_id, "caption": f"📎 {filename}\n\n🤖 EduBot"},
            files={"document": (filename, data, mime)},
        )
    result = r.json()
    elapsed = time.time() - t0
    if not result.get("ok"):
        logger.error(f"sendDocument xatosi: {result.get('description')} user={user_id}")
        raise HTTPException(status_code=500, detail=result.get("description", "Xatolik"))
    logger.info(f"sendDocument: user={user_id} file={filename} {elapsed:.1f}s")

    uid = parse_user_id(user_id)
    if uid:
        await log_usage(uid, "send-file", success=True)

    return {"ok": True}

# ─── Background removal ───────────────────────────────────────────────────────

@app.post("/api/bgremove")
@limiter.limit("5/minute")
async def bgremove(
    request: Request,
    x_user_id: Optional[str] = Header(None),
):
    t0 = time.time()
    try:
        from rembg import remove
        import base64
        ct = request.headers.get("content-type", "")
        if "multipart" in ct:
            form = await request.form()
            file = form.get("file")
            data = await file.read()
        else:
            body = await request.json()
            data = base64.b64decode(body["data"])

        check_file_size(data, "/api/bgremove")
        result = remove(data, session=get_rembg_session())
        elapsed = time.time() - t0
        logger.info(f"bgremove: {len(data)/1024:.0f}KB → {len(result)/1024:.0f}KB  {elapsed:.1f}s")

        uid = parse_user_id(x_user_id)
        if uid:
            await log_usage(uid, "bgremove", success=True)

        return Response(
            content=result,
            media_type="image/png",
            headers={"Content-Disposition": "attachment; filename=no-bg.png"},
        )
    except HTTPException:
        raise
    except Exception as e:
        uid = parse_user_id(x_user_id)
        if uid:
            await log_usage(uid, "bgremove", success=False)
        logger.error(f"bgremove xatosi: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── OCR ──────────────────────────────────────────────────────────────────────

@app.post("/api/ocr")
@limiter.limit("15/minute")
async def ocr(
    request: Request,
    x_user_id: Optional[str] = Header(None),
):
    t0 = time.time()
    try:
        import pytesseract
        from PIL import Image
        import base64
        ct = request.headers.get("content-type", "")
        if "multipart" in ct:
            form = await request.form()
            file = form.get("file")
            data = await file.read()
        else:
            body = await request.json()
            data = base64.b64decode(body["data"])

        check_file_size(data, "/api/ocr")
        img = Image.open(io.BytesIO(data))
        text = pytesseract.image_to_string(img, lang="rus+eng+uzb")
        elapsed = time.time() - t0
        logger.info(f"ocr: {len(data)/1024:.0f}KB → {len(text)} belgi  {elapsed:.1f}s")

        uid = parse_user_id(x_user_id)
        if uid:
            await log_usage(uid, "ocr", success=True)

        return JSONResponse({"text": text.strip() or "Matn topilmadi"})
    except HTTPException:
        raise
    except Exception as e:
        uid = parse_user_id(x_user_id)
        if uid:
            await log_usage(uid, "ocr", success=False)
        logger.error(f"ocr xatosi: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── PDF → DOCX ───────────────────────────────────────────────────────────────

@app.post("/api/pdf2docx")
@limiter.limit("10/minute")
async def pdf_to_docx(
    request: Request,
    file: UploadFile = File(...),
    x_user_id: Optional[str] = Header(None),
):
    t0 = time.time()
    try:
        from pdf2docx import Converter
        data = await file.read()
        check_file_size(data, "/api/pdf2docx")

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(data)
            pdf_path = tmp.name

        docx_path = pdf_path.replace(".pdf", ".docx")
        try:
            cv = Converter(pdf_path)
            cv.convert(docx_path, start=0, end=None)
            cv.close()
            with open(docx_path, "rb") as f:
                docx_data = f.read()
            elapsed = time.time() - t0
            logger.info(f"pdf2docx: {len(data)/1024:.0f}KB → {len(docx_data)/1024:.0f}KB  {elapsed:.1f}s")

            uid = parse_user_id(x_user_id)
            if uid:
                await log_usage(uid, "pdf2docx", success=True)

            return Response(
                content=docx_data,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": "attachment; filename=converted.docx"},
            )
        finally:
            os.unlink(pdf_path)
            if os.path.exists(docx_path):
                os.unlink(docx_path)
    except HTTPException:
        raise
    except Exception as e:
        uid = parse_user_id(x_user_id)
        if uid:
            await log_usage(uid, "pdf2docx", success=False)
        logger.error(f"pdf2docx xatosi: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── Payment ──────────────────────────────────────────────────────────────────

@app.post("/api/payment/create")
async def payment_create(
    request: Request,
    x_user_id: Optional[str] = Header(None),
):
    uid = parse_user_id(x_user_id)
    if not uid:
        raise HTTPException(status_code=400, detail="X-User-Id header kerak")

    body = await request.json()
    plan = body.get("plan", "monthly")
    if plan not in PLAN_PRICES:
        raise HTTPException(status_code=400, detail="Noto'g'ri tarif")

    user = await get_user(uid)
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    payment_id = new_payment_id()
    amount     = PLAN_PRICES[plan]
    await create_payment(payment_id, uid, plan, amount)

    checkout_url = build_checkout_url(payment_id, plan)
    logger.info(f"To'lov yaratildi: {payment_id} user={uid} plan={plan} amount={amount//100} so'm")

    return {
        "payment_id":   payment_id,
        "checkout_url": checkout_url,
        "amount":        amount // 100,
        "plan":          plan,
    }


@app.get("/api/payment/status/{payment_id}")
async def payment_status(
    payment_id: str,
    x_user_id: Optional[str] = Header(None),
):
    uid = parse_user_id(x_user_id)
    payment = await get_payment(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="To'lov topilmadi")
    if uid and payment["user_id"] != uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "payment_id": payment_id,
        "status":     payment["status"],
        "plan":       payment["plan"],
        "amount":     payment["amount"] // 100,
    }


@app.post("/api/payment/payme")
async def payment_payme(request: Request):
    auth = request.headers.get("Authorization", "")
    if not verify_payme_auth(auth):
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    method = body.get("method", "")
    params = body.get("params", {})
    rpc_id = body.get("id", 1)

    logger.info(f"Payme RPC: {method} params={str(params)[:120]}")

    db_fns = {
        "get_payment":          get_payment,
        "get_payment_by_payme": get_payment_by_payme,
        "confirm_payment":      confirm_payment,
        "cancel_payment":       cancel_payment,
    }
    result = await handle_rpc(method, params, db_fns)
    return {"id": rpc_id, "jsonrpc": "2.0", **result}


# ─── User info ────────────────────────────────────────────────────────────────

@app.get("/api/me")
async def me(x_user_id: Optional[str] = Header(None)):
    uid = parse_user_id(x_user_id)
    if not uid:
        raise HTTPException(status_code=400, detail="X-User-Id header kerak")
    user = await get_user(uid)
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    premium = await is_premium(uid)
    return {
        "id":          user["id"],
        "first_name":  user["first_name"],
        "username":    user["username"],
        "plan":        user["plan"],
        "plan_until":  user["plan_until"],
        "is_premium":  premium,
        "usage_count": user["usage_count"],
        "created_at":  user["created_at"],
    }
