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
from fastapi import HTTPException, Request
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

MAX_FILE_MB    = 20
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024
_start_time    = time.time()

FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONT_BOLD    = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

# ─── Rate limiter ─────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

# ─── Thread pools ─────────────────────────────────────────────────────────────
# _io_pool — PDF ops, file conversions, QR, cert, schedule, zip (fast CPU)
# _ml_pool — bgremove (rembg ~700 MB), OCR (PaddleOCR), photo3x4 (MediaPipe)
# Kept separate so ML work cannot starve fast file-conversion requests.

_IO_WORKERS = min((os.cpu_count() or 2), 4)
_ML_WORKERS = 2

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
    if len(data) > MAX_FILE_BYTES:
        mb = round(len(data) / 1024 / 1024, 1)
        raise HTTPException(status_code=413, detail=f"Fayl {mb}MB. Maksimal: {MAX_FILE_MB}MB")

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
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", json=payload)

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
    global _rembg_session
    if _rembg_session is None:
        with _rembg_lock:
            if _rembg_session is None:
                from rembg import new_session
                model = os.environ.get("REMBG_MODEL", "birefnet-general")
                try:
                    _rembg_session = new_session(model)
                    logger.info(f"rembg session yaratildi ({model})")
                except Exception:
                    _rembg_session = new_session("u2netp")
                    logger.info("rembg session yaratildi (u2netp fallback)")
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
    Falls back to X-User-Id only when BOT_TOKEN is unset (dev/test).
    """
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    if init_data:
        user = _verify_telegram_init_data(init_data)
        uid = user.get("id")
        if not uid:
            raise HTTPException(status_code=401, detail="initData: user.id yo'q")
        return int(uid)
    if not BOT_TOKEN:
        uid = request.headers.get("X-User-Id") or request.headers.get("x-user-id")
        if uid:
            try:
                return int(uid)
            except ValueError:
                raise HTTPException(status_code=400, detail="X-User-Id noto'g'ri")
    raise HTTPException(status_code=401, detail="X-Telegram-Init-Data header kerak")

def _check_admin(request: Request):
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="ADMIN_TOKEN sozlanmagan — Railway Variables ga qo'shing")
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:], ADMIN_TOKEN):
        raise HTTPException(status_code=403, detail="Ruxsat yo'q")
