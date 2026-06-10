# EduBot Backend — shared state imported by every router module
# Config, thread pools, rate limiter, common helpers, auth.

import os
import time
import asyncio
import secrets
import hashlib
import hmac as _hmac
import threading
import functools
import tempfile
import zipfile
import sys
from urllib.parse import quote as url_quote, parse_qsl
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import httpx
from fastapi import HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address

# ─── Config ───────────────────────────────────────────────────────────────────

BOT_TOKEN      = os.environ.get("BOT_TOKEN", "")
APP_URL        = os.environ.get("APP_URL", "https://nematovbegz0d.github.io/studentsTools/EduBot.html?v=8")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
if not WEBHOOK_SECRET and BOT_TOKEN:
    WEBHOOK_SECRET = hashlib.sha256(f"webhook:{BOT_TOKEN}".encode()).hexdigest()[:48]

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

# ─── Environment / auth mode ─────────────────────────────────────────────────
# Telegram initData (HMAC-SHA256) — barcha endpointlar uchun majburiy auth.
# X-User-Id fallback FAQAT dev muhitida ishlaydi va ikkita flag birga bo'lsa:
#   ENV=development AND ALLOW_INSECURE_AUTH=true
# Boshqa har qanday holatda fallback o'chiq — productionda hech qachon ishlamaydi.
ENV = os.environ.get("ENV", "production").lower()
ALLOW_INSECURE_AUTH = (
    ENV == "development"
    and os.environ.get("ALLOW_INSECURE_AUTH", "").lower() in ("1", "true", "yes")
)
if ALLOW_INSECURE_AUTH:
    logger.warning(
        "⚠️  ALLOW_INSECURE_AUTH=true (ENV=development) — X-User-Id header "
        "fallback yoqilgan. BU FAQAT LOKAL TEST UCHUN. Productionda o'chiring."
    )

MAX_FILE_MB    = 20
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024
# Multi-upload requests (mergepdf, imgs2pdf, zip) can combine several files.
# Historical pattern across the routers is "any single file ≤ MAX_FILE_BYTES,
# combined ≤ 3×MAX_FILE_BYTES". Surfaced here as a named constant.
MAX_MULTI_FILE_BYTES = MAX_FILE_BYTES * 3
# Hard cap on raw request body size — enforced BEFORE the body is buffered.
# Adds a small multipart-overhead allowance on top of the multi-file budget.
MULTIPART_OVERHEAD_BYTES = 2 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_MULTI_FILE_BYTES + MULTIPART_OVERHEAD_BYTES
_start_time    = time.time()

FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONT_BOLD    = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

# ─── Rate limiter ─────────────────────────────────────────────────────────────
# Behind Railway's reverse proxy `get_remote_address` returns the proxy IP, so
# every user shares one bucket. Derive the real client IP from X-Forwarded-For
# (left-most hop) and fall back to the socket address. Use Redis for storage
# when REDIS_URL is set so limits are shared across replicas/restarts; otherwise
# fall back to in-memory.
def _client_ip_key(request: "Request") -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return get_remote_address(request)

_RATE_LIMIT_STORAGE = os.environ.get("REDIS_URL", "").strip() or "memory://"
limiter = Limiter(
    key_func=_client_ip_key,
    default_limits=["60/minute"],
    storage_uri=_RATE_LIMIT_STORAGE,
)

# ─── Thread pools ─────────────────────────────────────────────────────────────
# _io_pool — PDF ops, file conversions, QR, cert, schedule, zip (fast CPU)
# _ml_pool — bgremove (rembg ~170 MB), OCR (Tesseract)
# Kept separate so ML work cannot starve fast file-conversion requests.
#
# Worker counts are env-configurable so the app fits Railway's basic (low-RAM)
# tier. ML defaults to 1 — two concurrent rembg/OCR jobs each hold a model +
# a large decoded image + onnxruntime arena, which OOMs a 512MB-1GB instance.
def _env_int(name: str, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(os.environ.get(name, "").strip() or default)))
    except (ValueError, TypeError):
        return default

_IO_WORKERS = _env_int("IO_WORKERS", min((os.cpu_count() or 2), 4), 1, 8)
_ML_WORKERS = _env_int("ML_WORKERS", 1, 1, 4)

_io_pool = ThreadPoolExecutor(max_workers=_IO_WORKERS, thread_name_prefix="io")
_ml_pool = ThreadPoolExecutor(max_workers=_ML_WORKERS, thread_name_prefix="ml")

# ─── Image-type detection ─────────────────────────────────────────────────────

_IMG_MAGIC = (
    b'\xff\xd8\xff',          # JPEG
    b'\x89PNG',               # PNG
    b'RIFF',                  # WebP
    b'GIF8',                  # GIF
    b'II*\x00', b'MM\x00*',   # TIFF
    b'BM',                    # BMP
)
_HEIC_BRANDS = (b'heic', b'heix', b'mif1', b'msf1', b'heim', b'hevc', b'hevx')
_AVIF_BRANDS = (b'avif', b'avis')

def is_image_bytes(data: bytes) -> bool:
    if any(data[:len(s)] == s for s in _IMG_MAGIC):
        return True
    if len(data) >= 12 and data[4:8] == b'ftyp':
        brand = data[8:12]
        if brand in _HEIC_BRANDS or brand in _AVIF_BRANDS:
            return True
    return False

# ─── Common helpers ───────────────────────────────────────────────────────────

def check_size(data: bytes, endpoint: str = ""):
    """Reject payload larger than MAX_FILE_BYTES with HTTP 413.

    Preserved for backward compatibility — new code should prefer
    `read_upload()` / `read_uploads()` which also handle empty/missing
    files and bound the read at the source.
    """
    if len(data) > MAX_FILE_BYTES:
        mb = round(len(data) / 1024 / 1024, 1)
        raise HTTPException(
            status_code=413,
            detail=(
                f"Fayl hajmi {mb} MB — bu limitdan oshib ketadi. "
                f"Maksimal ruxsat etilgan hajm: {MAX_FILE_MB} MB. "
                "Iltimos, faylni siqing yoki kichikroq faylni yuklang."
            ),
        )


# ─── Upload helpers ───────────────────────────────────────────────────────────
# Centralise the "await file.read(); check_size()" boilerplate so every router
# benefits from the same empty-file / oversized / missing-file diagnostics.

async def read_upload(
    file: Optional[UploadFile],
    endpoint: str = "",
    *,
    allow_empty: bool = False,
) -> bytes:
    """Read a single uploaded file, enforce size limits, return its bytes.

    - Missing file        → HTTP 400 "Fayl yuborilmadi"
    - Empty file          → HTTP 400 "Fayl bo'sh" (unless allow_empty=True)
    - Larger than 20 MB   → HTTP 413 (matches existing check_size message)
    """
    if file is None:
        raise HTTPException(
            status_code=400,
            detail="Fayl yuborilmadi. Iltimos, faylni tanlab qaytadan yuboring.",
        )
    data = await file.read()
    if not allow_empty and not data:
        raise HTTPException(
            status_code=400,
            detail="Tanlangan fayl bo'sh. Iltimos, boshqa fayl tanlang.",
        )
    check_size(data, endpoint)
    return data


async def read_uploads(
    files: Optional[list],
    endpoint: str = "",
    *,
    max_total_bytes: Optional[int] = None,
    allow_empty: bool = False,
) -> list:
    """Read multiple uploads, enforce per-file AND combined size limits.

    `max_total_bytes` defaults to `MAX_MULTI_FILE_BYTES` (3×MAX_FILE_BYTES).
    Returns a list of bytes in the same order as `files`.
    """
    if not files:
        raise HTTPException(
            status_code=400,
            detail="Hech qanday fayl yuborilmadi. Iltimos, kamida bitta fayl tanlang.",
        )
    limit = MAX_MULTI_FILE_BYTES if max_total_bytes is None else max_total_bytes
    result: list = []
    total = 0
    for f in files:
        if f is None:
            raise HTTPException(
                status_code=400,
                detail="Bo'sh fayl uchradi. Iltimos, barcha fayllarni qaytadan tekshiring.",
            )
        data = await f.read()
        if not allow_empty and not data:
            raise HTTPException(
                status_code=400,
                detail="Yuklangan fayllar orasida bo'sh fayl bor. Iltimos, barchasi to'la bo'lsin.",
            )
        check_size(data, endpoint)
        total += len(data)
        if total > limit:
            limit_mb = round(limit / 1024 / 1024)
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Tanlangan fayllarning jami hajmi {limit_mb} MB dan oshib ketadi. "
                    "Iltimos, kamroq yoki kichikroq fayllar tanlang."
                ),
            )
        result.append(data)
    return result


# ─── Body-size guard (ASGI middleware) ────────────────────────────────────────
# Reject oversized requests by Content-Length BEFORE the body is buffered into
# RAM. This is the defence against a malicious client streaming a 2 GB body that
# would otherwise OOM the worker before any handler's check_size() runs.
#
# Requests without Content-Length (chunked transfer) fall through and are still
# caught by the per-file check_size() inside the handler.
class BodySizeLimitMiddleware:
    def __init__(self, app, max_bytes: int = MAX_REQUEST_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        if scope.get("method", "") in ("POST", "PUT", "PATCH"):
            cl_raw = None
            for k, v in scope.get("headers", ()):
                if k == b"content-length":
                    cl_raw = v
                    break
            if cl_raw is not None:
                try:
                    cl = int(cl_raw)
                except (ValueError, TypeError):
                    cl = None
                if cl is not None and cl > self.max_bytes:
                    mb       = round(cl / 1024 / 1024, 1)
                    limit_mb = round(self.max_bytes / 1024 / 1024)
                    response = JSONResponse(
                        status_code=413,
                        content={
                            "error_code":    "FILE_TOO_LARGE",
                            "request_id":    "",
                            "message": (
                                f"So'rov hajmi {mb} MB — bu limitdan oshib ketadi. "
                                f"Maksimal ruxsat etilgan hajm: {limit_mb} MB. "
                                "Iltimos, kichikroq fayl yuklang yoki uni avval siqing."
                            ),
                            "processing_ms": 0,
                        },
                    )
                    await response(scope, receive, send)
                    return
        await self.app(scope, receive, send)


# ─── WeasyPrint SSRF guard ────────────────────────────────────────────────────
# Allow only inline `data:` URIs. Reject http://, https://, file://, ftp://,
# localhost, private/loopback/link-local IPs and cloud metadata IPs. WeasyPrint
# is fed user-supplied DOCX/HTML in mammoth/docx2pdf/cert/cv flows; without a
# safe url_fetcher, an attacker could pivot inside the VPC or read AWS/GCP
# metadata via a crafted <img src="..."> or @font-face url().
def safe_url_fetcher(url, timeout: int = 10, ssl_context=None):
    """WeasyPrint-compatible fetcher: permit only `data:` URIs.

    Any other scheme/host (incl. file://, http://, https://, localhost,
    private IPs, AWS/GCP metadata IPs) raises ValueError, which WeasyPrint
    surfaces as a per-resource failure (the rest of the document still renders).
    """
    if not isinstance(url, str) or not url:
        raise ValueError("URL fetcher: bo'sh URL")
    if url.startswith("data:"):
        # Delegate to WeasyPrint's default fetcher — handles data: URIs natively.
        try:
            from weasyprint import default_url_fetcher  # type: ignore
        except Exception:
            # Manual decode fallback if WeasyPrint internals change.
            import base64 as _b64
            try:
                header, payload = url[5:].split(",", 1)
            except ValueError:
                raise ValueError("URL fetcher: noto'g'ri data: URI")
            is_b64 = ";base64" in header
            mime   = header.split(";")[0] or "application/octet-stream"
            body   = _b64.b64decode(payload) if is_b64 else payload.encode("utf-8")
            return {"mime_type": mime, "string": body}
        return default_url_fetcher(url, timeout=timeout, ssl_context=ssl_context)
    raise ValueError(f"URL fetcher: tashqi resurs bloklandi ({url[:80]})")


# ─── Usage tracking ───────────────────────────────────────────────────────────
# Best-effort: usage_log + history. NEVER raises. Wired by UsageTrackingMiddleware
# so individual handlers don't need to know about it.

# Service-id → human-readable history title. Kept here so the map lives in one
# place; matches the catalog IDs in src/data/data.js (FREE_SERVICES).
_SERVICE_TITLES: dict = {
    "mergepdf":     "PDF birlashtirish",
    "pdfpages":     "PDF sahifa tanlash",
    "pdftext":      "PDF dan matn",
    "pdflock":      "PDF ga parol",
    "watermark":    "PDF watermark",
    "pdf2img":      "PDF → Rasm",
    "compresspdf":  "PDF siqish",
    "pdf2docx":     "PDF → Word",
    "docx2pdf":     "Word → PDF",
    "docxedit":     "Word matn almashtirish",
    "imgs2pdf":     "Rasmlar → PDF",
    "cv":           "CV / Rezyume",
    "xlsx2pdf":     "Excel → PDF",
    "compresspptx": "PPTX siqish",
    "imgcompress":  "Rasm siqish",
    "bgremove":     "Fon olib tashlash",
    "ocr":          "OCR rasmdan matn",
    "send-file":    "Faylni Telegramga yuborish",
    "translit":     "Lotin ↔ Kirill",
    "readtime":     "O'qish vaqti",
    "deadline":     "Deadline eslatma",
    "stats":        "Statistika",
    "qr":           "QR kod",
    "cert":         "Sertifikat",
    "schedule":     "Dars jadvali",
    "translate":    "Tarjima",
    "wiki":         "Wikipedia",
    "books":        "Kitob izlash",
    "zip":          "ZIP arxivlash",
    "unzip":        "ZIP ochish",
}

# Path → service-id. Used by middleware to detect which user-facing service
# the request hit. Read-only / admin / payment / webhook routes are absent.
_PATH_TO_SERVICE: dict = {f"/api/{sid}": sid for sid in _SERVICE_TITLES}


async def track_usage(
    user_id: int,
    service_id: str,
    *,
    preview: Optional[str] = None,
) -> None:
    """Best-effort: write usage_log + history rows. Swallows ALL exceptions.

    Failures (DB down, history table missing, etc.) are logged at WARN level
    and never propagate — calling this MUST be safe inside a fire-and-forget
    background task.
    """
    try:
        import database as _db
        await _db.log_usage(user_id, service_id, success=True)
    except Exception as e:
        logger.warning(f"log_usage [{service_id}] xatosi: {e}")
    try:
        import database as _db
        title = _SERVICE_TITLES.get(service_id, service_id)
        prev  = (preview or "")[:500] if preview else None
        await _db.add_history(user_id, service_id, title, prev)
    except Exception as e:
        logger.warning(f"add_history [{service_id}] xatosi: {e}")


class UsageTrackingMiddleware:
    """ASGI middleware: after a 2xx response, fire-and-forget `track_usage`.

    Relies on the handler having called `_get_user_id(request)` (which stashes
    `request.state.user_id`). Endpoints not in `_PATH_TO_SERVICE` are skipped —
    no need to special-case admin / payment / health / webhook routes.
    """
    def __init__(self, app, path_map: Optional[dict] = None):
        self.app = app
        self.path_map = path_map if path_map is not None else _PATH_TO_SERVICE

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        service_id = self.path_map.get(path)
        if service_id is None:
            await self.app(scope, receive, send)
            return

        status_holder: dict = {"code": 0}

        async def _send(message):
            if message.get("type") == "http.response.start":
                status_holder["code"] = int(message.get("status", 0))
            await send(message)

        await self.app(scope, receive, _send)

        # Only successful (2xx) responses count as a real usage event.
        if 200 <= status_holder["code"] < 300:
            state = scope.get("state") or {}
            uid = state.get("user_id") if isinstance(state, dict) else getattr(state, "user_id", None)
            if uid:
                try:
                    asyncio.create_task(track_usage(int(uid), service_id))
                except Exception as e:
                    logger.warning(f"usage middleware schedule xato [{service_id}]: {e}")

def safe_header(value) -> str:
    """Return an ASCII-only value safe for HTTP response headers."""
    if not isinstance(value, str):
        value = str(value)
    cleaned = []
    replacements = {
        "→": "->", "←": "<-", "·": "-", "•": "-", "×": "x",
        "–": "-", "—": "-", "ʼ": "'", "ʻ": "'", "’": "'",
    }
    for ch in value:
        if ch in replacements:
            cleaned.append(replacements[ch])
        elif 32 <= ord(ch) < 127:
            cleaned.append(ch)
    return "".join(cleaned).strip() or "ok"

async def tg_send(chat_id: int, text: str, reply_markup: Optional[dict] = None):
    """Telegramga xabar yuborish.

    Diagnostik logging: avval kod xatolarni silently yutardi va `/start` ishlamasa
    sababi log-larda ko'rinmasdi. Endi har bir muvaffaqiyatsizlik (BOT_TOKEN yo'q,
    tarmoq xato, Telegram `ok:false` javob) WARN/ERROR sifatida yoziladi.
    """
    if not BOT_TOKEN:
        logger.error("tg_send: BOT_TOKEN sozlanmagan — xabar yuborilmadi")
        return
    if not chat_id:
        logger.warning("tg_send: chat_id bo'sh — xabar yuborilmadi")
        return

    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
                json=payload,
            )
    except httpx.TimeoutException:
        logger.error(f"tg_send: Telegram javob bermadi (timeout) chat_id={chat_id}")
        return
    except httpx.HTTPError as e:
        logger.error(f"tg_send: tarmoq xato chat_id={chat_id} {type(e).__name__}: {e}")
        return

    try:
        data = r.json()
    except Exception:
        logger.error(
            f"tg_send: Telegram noto'g'ri javob (HTTP {r.status_code}) "
            f"chat_id={chat_id} body={r.text[:200]!r}"
        )
        return

    if not data.get("ok"):
        # Asosiy diagnostik joy: ko'p hollarda Telegram xato kodi va tavsifi
        # bu yerda paydo bo'ladi (masalan: 401 — token noto'g'ri,
        # 400 chat not found, 403 bot kicked).
        logger.error(
            f"tg_send: Telegram xato qaytardi chat_id={chat_id} "
            f"code={data.get('error_code')} desc={data.get('description')!r}"
        )

def pil_fonts(sizes: list):
    from PIL import ImageFont
    try:
        return [ImageFont.truetype(FONT_BOLD if i == 0 else FONT_REGULAR, s) for i, s in enumerate(sizes)]
    except Exception:
        return [ImageFont.load_default() for _ in sizes]

def text_center_x(draw, text, font, W):
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        return (W - (bbox[2] - bbox[0])) // 2
    except Exception:
        return W // 4

# ─── Rembg session ────────────────────────────────────────────────────────────

_rembg_session = None
_rembg_lock    = threading.Lock()

def get_rembg_session():
    """rembg session olish (lazy + thread-safe).

    Default model — `u2netp` (~5MB, eng kichik).

    SABAB: Katta modellar (birefnet ~200MB, isnet ~170MB, u2net ~170MB)
    Railway free/hobby tier'idagi 512MB RAM chegarasidan oshib ketadi:
        Python base:   ~200MB
        isnet/u2net:   ~250-300MB RAM (modelni yuklab)
        Rasm ishlov:   ~50-100MB
        ----------------------------
        Jami:          ~600MB → OOM (Killed by kernel)

    u2netp — 5MB disk, ~50MB RAM. Sifati a'lo emas, lekin yaxshi.
    Oddiy portret, predmet, ko'plab keys uchun yetarli.

    Modellar (sifat → tezlik → RAM):
      u2netp              — tez (5MB / ~50MB RAM) ← default (Railway safe)
      isnet-general-use   — yuqori (~170MB / ~300MB RAM) — paid plan kerak
      u2net               — klassik (~170MB / ~250MB RAM) — paid plan kerak
      birefnet-general    — eng yaxshi (200MB+ / ~500MB+ RAM) — paid plan

    Yaxshiroq sifat kerak bo'lsa va RAM chegarasi 1GB+ bo'lsa:
      Railway Variables → REMBG_MODEL=isnet-general-use
    """
    global _rembg_session
    if _rembg_session is None:
        with _rembg_lock:
            if _rembg_session is None:
                # rembg model katalogini ishonchli yo'lga belgilash
                # (appuser HOME dir Docker'da yo'q bo'lishi mumkin)
                u2net_home = os.environ.get("U2NET_HOME", "/tmp/u2net")
                try:
                    os.makedirs(u2net_home, exist_ok=True)
                    os.environ["U2NET_HOME"] = u2net_home
                except Exception as _e:
                    logger.warning(f"u2net_home yaratish xatosi: {_e}")

                from rembg import new_session
                env_model = os.environ.get("REMBG_MODEL", "").strip()
                # Sinash tartibi: env model → u2netp (Railway safe)
                # → isnet/u2net (agar RAM yetsa)
                chain = []
                if env_model:
                    chain.append(env_model)
                # u2netp birinchi: kichkina, har doim ishlaydi.
                # Boshqalari fallback (lekin RAM yetmasa Killed bo'ladi)
                for m in ("u2netp", "isnet-general-use", "u2net"):
                    if m not in chain:
                        chain.append(m)

                last_err = None
                for model in chain:
                    t0 = time.time()
                    try:
                        _rembg_session = new_session(model)
                        logger.info(
                            f"rembg session yaratildi ({model}) "
                            f"— {time.time()-t0:.1f}s"
                        )
                        return _rembg_session
                    except Exception as e:
                        last_err = e
                        logger.warning(
                            f"rembg '{model}' yuklanmadi "
                            f"({time.time()-t0:.1f}s): "
                            f"{type(e).__name__}: {str(e)[:160]}"
                        )

                # Hech qaysi model yuklanmasa — xatoni propagatsiya qilamiz
                logger.error(
                    "rembg: barcha modellar yuklanmadi. "
                    f"Oxirgi xato: {type(last_err).__name__}: {last_err}"
                )
                raise RuntimeError(
                    f"rembg modellarning hech qaysi yuklanmadi. "
                    f"Oxirgi: {type(last_err).__name__ if last_err else 'Unknown'}"
                )
    return _rembg_session

def reset_rembg_session():
    global _rembg_session
    _rembg_session = None

def is_rembg_ready() -> bool:
    return _rembg_session is not None

# ─── Per-user ML concurrency ──────────────────────────────────────────────────
# Prevents a single user from saturating the ML pool with parallel requests.
# 1 concurrent ML op per user; excess requests get HTTP 429.

_user_ml_slots: dict[int, int] = {}
_user_ml_lock = asyncio.Lock()
_MAX_USER_ML_CONCURRENT = 1


async def acquire_user_ml_slot(user_id: int) -> bool:
    """Return True if slot acquired; False if user already at max concurrent ML requests."""
    async with _user_ml_lock:
        n = _user_ml_slots.get(user_id, 0)
        if n >= _MAX_USER_ML_CONCURRENT:
            return False
        _user_ml_slots[user_id] = n + 1
        return True


async def release_user_ml_slot(user_id: int) -> None:
    async with _user_ml_lock:
        count = _user_ml_slots.get(user_id, 0) - 1
        if count <= 0:
            _user_ml_slots.pop(user_id, None)
        else:
            _user_ml_slots[user_id] = count


# ─── Auth helpers ─────────────────────────────────────────────────────────────

def _verify_telegram_init_data(init_data: str) -> dict:
    """
    Validate Telegram WebApp initData HMAC-SHA256 signature.
    Returns parsed user dict on success; raises HTTPException on failure.
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="BOT_TOKEN sozlanmagan")
    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", "")
    if not received_hash:
        raise HTTPException(status_code=401, detail="initData: hash yo'q")
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret_key = _hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    computed   = _hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not secrets.compare_digest(computed, received_hash):
        raise HTTPException(status_code=401, detail="initData imzosi noto'g'ri")
    auth_date = int(parsed.get("auth_date", 0))
    if abs(time.time() - auth_date) > 86400:
        raise HTTPException(status_code=401, detail="initData muddati o'tgan (>24h)")
    import json as _json
    try:
        return _json.loads(parsed.get("user", "{}"))
    except Exception:
        raise HTTPException(status_code=401, detail="initData: user field noto'g'ri")

def _get_user_id(request: Request) -> int:
    """
    Authenticate via Telegram WebApp initData HMAC-SHA256.

    Dev fallback (X-User-Id header) ONLY active when BOTH:
      • ENV=development
      • ALLOW_INSECURE_AUTH=true
    In all other cases — initData is mandatory; missing/invalid → HTTP 401.
    """
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    if init_data:
        user = _verify_telegram_init_data(init_data)
        uid = user.get("id")
        if not uid:
            raise HTTPException(status_code=401, detail="initData: user.id yo'q")
        uid_int = int(uid)
        # Stash on request.state so UsageTrackingMiddleware can log without re-parsing initData.
        request.state.user_id = uid_int
        return uid_int
    if ALLOW_INSECURE_AUTH:
        uid = request.headers.get("X-User-Id") or request.headers.get("x-user-id")
        if uid:
            try:
                uid_int = int(uid)
            except ValueError:
                raise HTTPException(status_code=400, detail="X-User-Id noto'g'ri")
            request.state.user_id = uid_int
            return uid_int
    raise HTTPException(status_code=401, detail="X-Telegram-Init-Data header kerak")

def _check_admin(request: Request):
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="ADMIN_TOKEN sozlanmagan — Railway Variables ga qo'shing")
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:], ADMIN_TOKEN):
        raise HTTPException(status_code=403, detail="Ruxsat yo'q")
