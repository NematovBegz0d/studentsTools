import os
import sys
import time
import uuid
import asyncio
import secrets
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

import database as db
import cache as _cache  # noqa: F401 — registers cache backend on import
from startup_checks import run_all_checks, set_db_ok, is_ready, get_last_results

from shared import (
    limiter,
    BOT_TOKEN, APP_URL, WEBHOOK_SECRET, ADMIN_TOKEN,
    MAX_FILE_MB, _start_time,
    get_rembg_session, reset_rembg_session, is_rembg_ready,
    tg_send,
    BodySizeLimitMiddleware, MAX_REQUEST_BYTES,
    UsageTrackingMiddleware,
)

from routers import pdf_ops, convert_ops, media_ops, tools_ops, payment_router, user_router

# ─── Request tracing ──────────────────────────────────────────────────────────

_STATUS_TO_ERROR_CODE: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    408: "TIMEOUT",
    409: "CONFLICT",
    413: "FILE_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "UNPROCESSABLE",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
}


class _RequestTracingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.request_id = str(uuid.uuid4())[:8]
        request.state.t0 = time.perf_counter()
        response = await call_next(request)
        ms = int((time.perf_counter() - request.state.t0) * 1000)
        response.headers["X-Request-Id"] = request.state.request_id
        response.headers["X-Processing-Ms"] = str(ms)
        return response


async def _http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", "")
    t0 = getattr(request.state, "t0", time.perf_counter())
    ms = int((time.perf_counter() - t0) * 1000)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": _STATUS_TO_ERROR_CODE.get(exc.status_code, f"HTTP_{exc.status_code}"),
            "request_id": request_id,
            "message": str(exc.detail),
            "processing_ms": ms,
        },
        headers={"X-Request-Id": request_id, "X-Processing-Ms": str(ms)},
    )


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    request_id = getattr(request.state, "request_id", "")
    t0 = getattr(request.state, "t0", time.perf_counter())
    ms = int((time.perf_counter() - t0) * 1000)
    return JSONResponse(
        status_code=429,
        content={
            "error_code": "RATE_LIMITED",
            "request_id": request_id,
            "message": "So'rovlar soni cheklangan. Iltimos, biroz kuting va qayta urinib ko'ring.",
            "processing_ms": ms,
        },
        headers={"X-Request-Id": request_id, "X-Processing-Ms": str(ms)},
    )


# 1-Bosqich: Kutilmagan ichki xatoliklar uchun foydalanuvchi-friendly handler.
# Foydalanuvchiga texnik stack-trace yoki Python xato nomi ko'rsatilmaydi —
# faqat tushunarli o'zbek matni va kuzatuv uchun `request_id` qaytariladi.
# Texnik tafsilotlar log-ga yoziladi va Sentry-ga yuboriladi (sozlangan bo'lsa).
async def _unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "")
    t0 = getattr(request.state, "t0", time.perf_counter())
    ms = int((time.perf_counter() - t0) * 1000)
    logger.error(
        f"Unhandled exception [{request_id}] "
        f"{request.method} {request.url.path}: "
        f"{type(exc).__name__}: {str(exc)[:240]}"
    )
    return JSONResponse(
        status_code=500,
        content={
            "error_code": "INTERNAL_ERROR",
            "request_id": request_id,
            "message": (
                "Xizmatda vaqtinchalik xatolik yuz berdi. "
                "Iltimos, qayta urinib ko'ring. Muammo davom etsa, "
                f"yordam so'rashda ushbu kodni qo'shing: {request_id or 'unknown'}."
            ),
            "processing_ms": ms,
        },
        headers={"X-Request-Id": request_id, "X-Processing-Ms": str(ms)},
    )

# ─── HEIC/HEIF + AVIF support (registers PIL openers globally) ────────────────
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

try:
    import pillow_avif  # noqa: F401
except ImportError:
    pass

# ─── Sentry (optional) ────────────────────────────────────────────────────────
_SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if _SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            traces_sample_rate=float(os.environ.get("SENTRY_TRACE_RATE", "0.1")),
            profiles_sample_rate=0.0,
            environment=os.environ.get("RAILWAY_ENVIRONMENT", "production"),
            release=os.environ.get("RAILWAY_GIT_COMMIT_SHA", "")[:7] or "dev",
            integrations=[StarletteIntegration(), FastApiIntegration()],
            send_default_pii=False,
        )
    except Exception:
        pass

# ─── Logging ──────────────────────────────────────────────────────────────────
logger.remove()
logger.add(sys.stdout, format="{time:HH:mm:ss} | {level:<7} | {message}", level="INFO")

# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("EduBot Backend ishga tushmoqda...")
    logger.info("ADMIN_TOKEN: set" if ADMIN_TOKEN else "ADMIN_TOKEN: NOT SET — Railway Variables ga qoshing")

    try:
        await db.init_db()
        db_type = "PostgreSQL" if db._USE_PG else "SQLite"
        logger.info(f"{db_type} DB ishga tushdi")
        set_db_ok(True)
    except Exception as e:
        logger.error(f"DB init xatosi: {e}")
        set_db_ok(False)

    try:
        await run_all_checks()
    except Exception as e:
        logger.error(f"Startup checks xatosi: {e}")

    domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
    if BOT_TOKEN and domain:
        webhook_url = f"https://{domain}/webhook"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                # 1) Avval BOT_TOKEN haqiqiy ekanligini tekshiramiz (getMe).
                #    Bu — `/start` ishlamasligi sababini darrov ko'rsatadi.
                try:
                    me_r = await client.get(
                        f"https://api.telegram.org/bot{BOT_TOKEN}/getMe"
                    )
                    me = me_r.json()
                    if me.get("ok"):
                        bot_info = me.get("result", {})
                        logger.info(
                            f"Bot OK: @{bot_info.get('username')} "
                            f"(id={bot_info.get('id')})"
                        )
                    else:
                        logger.error(
                            f"BOT_TOKEN noto'g'ri yoki muddati o'tgan: {me}"
                        )
                except Exception as e:
                    logger.error(f"getMe so'rovi muvaffaqiyatsiz: {e}")

                # 2) Webhook ro'yxatdan o'tkazish
                payload = {"url": webhook_url, "drop_pending_updates": True}
                if WEBHOOK_SECRET:
                    payload["secret_token"] = WEBHOOK_SECRET
                r = await client.post(
                    f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook",
                    json=payload,
                )
                if r.json().get("ok"):
                    logger.info(
                        f"Webhook ro'yxatdan o'tdi: {webhook_url} "
                        f"(secret_token: {'sozlangan' if WEBHOOK_SECRET else 'sozlanmagan'})"
                    )
                else:
                    logger.error(f"setWebhook muvaffaqiyatsiz: {r.json()}")

                # 3) Webhook holatini darhol tekshiramiz — Telegram serverida
                #    nima ko'rinishini bilamiz (pending updates, oxirgi xato).
                try:
                    info_r = await client.get(
                        f"https://api.telegram.org/bot{BOT_TOKEN}/getWebhookInfo"
                    )
                    info = info_r.json().get("result", {})
                    pending = info.get("pending_update_count", 0)
                    last_err = info.get("last_error_message")
                    if last_err:
                        logger.warning(
                            f"Webhook oxirgi xato (Telegram tomonidan): "
                            f"{last_err} (pending={pending})"
                        )
                    elif pending:
                        logger.info(f"Webhook pending updates: {pending}")
                except Exception as e:
                    logger.debug(f"getWebhookInfo: {e}")
        except Exception as e:
            logger.error(f"Webhook ulanishda xato: {e}")
    else:
        # Aniqroq diagnostik: qaysi env yo'qligini ko'rsatamiz.
        missing = []
        if not BOT_TOKEN:
            missing.append("BOT_TOKEN")
        if not domain:
            missing.append("RAILWAY_PUBLIC_DOMAIN")
        logger.warning(
            f"Webhook ro'yxatdan o'tmadi — yo'q env: {', '.join(missing)}. "
            "Railway Variables-ga qo'shing va deploy-ni qayta ishga tushiring."
        )

    async def _preload_rembg():
        try:
            loop = asyncio.get_running_loop()
            await asyncio.wait_for(
                loop.run_in_executor(None, get_rembg_session),
                timeout=120.0,
            )
            logger.info("rembg model preloaded ✓")
        except asyncio.TimeoutError:
            logger.warning("rembg preload timeout — birinchi so'rovda yuklanadi")
        except Exception as e:
            logger.warning(f"rembg preload muvaffaqiyatsiz — birinchi so'rovda yuklanadi: {e}")

    asyncio.create_task(_preload_rembg())

    yield
    logger.info("EduBot Backend to'xtatilmoqda...")
    reset_rembg_session()

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="EduBot Backend", version="2.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(HTTPException, _http_exception_handler)
app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
# Catch-all: agar handler ichida HTTPException bilan o'ralmasdan exception otilsa,
# foydalanuvchiga texnik detallarni emas, tushunarli o'zbek xabarini qaytaramiz.
app.add_exception_handler(Exception, _unhandled_exception_handler)

_default_origins = (
    "https://nematovbegz0d.github.io,"
    "https://web.telegram.org,"
    "https://telegram.org,"
    "https://t.me,"
    "http://127.0.0.1:5500,"
    "http://localhost:5500,"
    "http://127.0.0.1:3000,"
    "http://localhost:3000,"
    "http://127.0.0.1:5173,"
    "http://localhost:5173,"
    "http://127.0.0.1:8000,"
    "http://localhost:8000"
)
_cors_raw     = os.environ.get("CORS_ORIGINS", _default_origins)
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=(
        r"^(https://[\w-]+\.github\.io"
        r"|https://(web\.)?telegram\.org"
        r"|https://t\.me"
        r"|http://(127\.0\.0\.1|localhost)(:\d+)?"
        r"|null)$"
    ),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Info", "X-Page-Count", "X-Saved-Percent", "X-Warning",
        "X-Password-B64",
        "X-Cert-Id", "X-Verify-Url",
        "X-Request-Id", "X-Processing-Ms",
        "Content-Disposition",
    ],
)
app.add_middleware(_RequestTracingMiddleware)
# Usage tracking middleware: fires after a 2xx response. Reads request.state.user_id
# set by `_get_user_id()` during handler execution; skipped for unknown paths.
app.add_middleware(UsageTrackingMiddleware)
# Body-size guard added LAST → Starlette wraps it OUTERMOST so the 413 fires
# before any other middleware (incl. tracing) and before FastAPI buffers the body.
app.add_middleware(BodySizeLimitMiddleware, max_bytes=MAX_REQUEST_BYTES)
logger.info(f"CORS allowed origins: {_cors_origins}")
logger.info(f"Body-size guard: max {MAX_REQUEST_BYTES // 1024 // 1024}MB per request")

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(pdf_ops.router)
app.include_router(convert_ops.router)
app.include_router(media_ops.router)
app.include_router(tools_ops.router)
app.include_router(payment_router.router)
app.include_router(user_router.router)

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
        "version":      "2.0.0",
        "uptime":       int(time.time() - _start_time),
        "ocr":          ocr_ok,
        "rembg_ready":  is_rembg_ready(),
        "max_file_mb":  MAX_FILE_MB,
    }


@app.get("/health/ready")
def health_ready():
    """Kubernetes/Docker readiness probe.

    Returns 200 when the app is fully ready to serve traffic.
    Returns 503 when the database is unreachable or, with
    STRICT_STARTUP_CHECKS=true, when required system tools are missing.
    """
    if not is_ready():
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "checks": get_last_results()},
        )
    return {"status": "ready", "checks": get_last_results()}


# ─── Telegram Webhook ─────────────────────────────────────────────────────────

@app.post("/webhook")
async def webhook(request: Request):
    if not BOT_TOKEN:
        logger.error("/webhook keldi, lekin BOT_TOKEN sozlanmagan — javob bermaymiz")
        return {"ok": False}
    if WEBHOOK_SECRET:
        got = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not secrets.compare_digest(got, WEBHOOK_SECRET):
            logger.warning(
                f"Webhook secret_token mos kelmadi (kelgan IP: "
                f"{get_remote_address(request)}). Telegram-da setWebhook qaytadan "
                "bajaring yoki WEBHOOK_SECRET env-ni tekshiring."
            )
            raise HTTPException(status_code=403, detail="Forbidden")
    try:
        update = await request.json()
    except Exception:
        logger.warning("/webhook: JSON parse xatosi")
        return {"ok": False}

    message = update.get("message") or update.get("edited_message")
    if not message:
        # Update boshqa turdagi bo'lishi mumkin (callback_query, inline, va h.k.).
        # Hozirgi bot faqat message-larga javob beradi — qolganini quvib o'tkazamiz.
        logger.debug(f"/webhook: message yo'q, update turi: {list(update.keys())}")
        return {"ok": True}

    chat_id    = message.get("chat", {}).get("id")
    text       = message.get("text", "")
    first_name = message.get("from", {}).get("first_name", "Do'st")
    logger.info(f"Webhook: chat={chat_id} text={text[:30]!r}")

    from_user = message.get("from", {})
    try:
        await db.upsert_user(
            user_id=from_user.get("id"),
            username=from_user.get("username"),
            first_name=from_user.get("first_name"),
        )
    except Exception as e:
        logger.warning(f"upsert_user xatosi: {e}")

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
            reply_markup={"inline_keyboard": [[{"text": "📱 Ilovani ochish", "web_app": {"url": APP_URL}}]]},
        )
    else:
        await tg_send(
            chat_id,
            "📱 Barcha xizmatlar ilovada mavjud:",
            reply_markup={"inline_keyboard": [[{"text": "📱 Ilovani ochish", "web_app": {"url": APP_URL}}]]},
        )
    return {"ok": True}
