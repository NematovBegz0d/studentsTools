from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from loguru import logger
from typing import List, Optional
import io
import os
import re
import math
import time
import uuid
import asyncio
import secrets
import zipfile
import tempfile
import httpx
import sys
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

import database as db
import payment as pay

# ─── Config ──────────────────────────────────────────────────────────────────

BOT_TOKEN   = os.environ.get("BOT_TOKEN", "")
APP_URL     = os.environ.get("APP_URL", "https://nematovbegz0d.github.io/studentsTools/EduBot.html")
MAX_FILE_MB = 20
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024
_start_time = time.time()

FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONT_BOLD    = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

# ─── Logging ─────────────────────────────────────────────────────────────────

logger.remove()
logger.add(sys.stdout, format="{time:HH:mm:ss} | {level:<7} | {message}", level="INFO")

# ─── Matplotlib setup (non-interactive) ─────────────────────────────────────

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np
    matplotlib.rcParams['font.family'] = 'DejaVu Sans'
    _MPL_OK = True
except Exception:
    _MPL_OK = False

# ─── Rate limiter ─────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

# ─── Thread pool for CPU-intensive conversions ────────────────────────────────
# pdf2docx blocks the event loop — run it in a thread pool

_converter_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="pdf2docx")


def _do_pdf2docx(pdf_path: str, docx_path: str) -> None:
    """CPU-bound, blocking — runs in _converter_pool thread."""
    from pdf2docx import Converter
    cv = Converter(pdf_path)
    try:
        cv.convert(docx_path, multi_processing=False, start=0)
    finally:
        cv.close()


# ─── Rembg session ───────────────────────────────────────────────────────────

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

    # ── Ma'lumotlar bazasini ishga tushirish ──
    try:
        await db.init_db()
        logger.info("SQLite DB ishga tushdi")
    except Exception as e:
        logger.error(f"DB init xatosi: {e}")

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

app = FastAPI(title="EduBot Backend", version="2.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
    expose_headers=["X-Info", "X-Page-Count", "X-Password", "X-Saved-Percent", "X-Warning"],
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def check_size(data: bytes, endpoint: str = ""):
    if len(data) > MAX_FILE_BYTES:
        mb = round(len(data) / 1024 / 1024, 1)
        raise HTTPException(status_code=413, detail=f"Fayl {mb}MB. Maksimal: {MAX_FILE_MB}MB")

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
        "status": "ok", "version": "2.0.0",
        "uptime": int(time.time() - _start_time),
        "ocr": ocr_ok, "rembg_ready": _rembg_session is not None,
        "matplotlib": _MPL_OK, "max_file_mb": MAX_FILE_MB,
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

    # Foydalanuvchini DBga saqlash
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
        raise HTTPException(status_code=500, detail=result.get("description", "Xatolik"))
    logger.info(f"sendDocument: user={user_id} {filename} {time.time()-t0:.1f}s")
    return {"ok": True}

# ─── PDF: Merge ───────────────────────────────────────────────────────────────

@app.post("/api/mergepdf")
@limiter.limit("10/minute")
async def merge_pdf(request: Request, files: List[UploadFile] = File(...)):
    t0 = time.time()
    try:
        from pypdf import PdfReader, PdfWriter
        writer = PdfWriter()
        total = 0
        for f in files:
            data = await f.read()
            total += len(data)
            if total > MAX_FILE_BYTES * 3:
                raise HTTPException(status_code=413, detail="Fayllar jami hajmi juda katta")
            reader = PdfReader(io.BytesIO(data))
            for page in reader.pages:
                writer.add_page(page)
        out = io.BytesIO()
        writer.write(out)
        logger.info(f"mergepdf: {len(files)} fayl, {time.time()-t0:.1f}s")
        return Response(content=out.getvalue(), media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=merged.pdf"})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"mergepdf xato: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── PDF: Split ───────────────────────────────────────────────────────────────

@app.post("/api/splitpdf")
@limiter.limit("10/minute")
async def split_pdf(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        from pypdf import PdfReader, PdfWriter
        data = await file.read()
        check_size(data, "/api/splitpdf")
        reader = PdfReader(io.BytesIO(data))
        zf_buf = io.BytesIO()
        with zipfile.ZipFile(zf_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for i, page in enumerate(reader.pages, 1):
                w = PdfWriter()
                w.add_page(page)
                pb = io.BytesIO()
                w.write(pb)
                zf.writestr(f"page_{i}.pdf", pb.getvalue())
        logger.info(f"splitpdf: {len(reader.pages)} sahifa, {time.time()-t0:.1f}s")
        return Response(content=zf_buf.getvalue(), media_type="application/zip",
                        headers={"Content-Disposition": "attachment; filename=pages.zip"})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"splitpdf xato: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── PDF: Text extraction ─────────────────────────────────────────────────────

@app.post("/api/pdftext")
@limiter.limit("20/minute")
async def pdf_text(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        from pypdf import PdfReader
        data = await file.read()
        check_size(data, "/api/pdftext")
        reader = PdfReader(io.BytesIO(data))
        text = "\n\n".join(p.extract_text() or "" for p in reader.pages).strip()
        if not text:
            return JSONResponse({"result": "❌ Matn topilmadi. Bu skanerlangan PDF bo'lishi mumkin — OCR xizmatidan foydalaning."})
        logger.info(f"pdftext: {len(text)} belgi, {time.time()-t0:.1f}s")
        return JSONResponse({"result": text})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── PDF: Lock ────────────────────────────────────────────────────────────────

def _do_pdflock(data: bytes, password: str) -> tuple:
    from pypdf import PdfReader, PdfWriter
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        raise ValueError("PDF allaqachon parol bilan himoyalangan.")
    n = len(reader.pages)
    if n == 0:
        raise ValueError("PDF bo'sh (0 sahifa).")
    if n > 200:
        raise ValueError(f"PDF {n} sahifa. Maksimal 200 sahifa qabul qilinadi.")
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    try:
        writer.encrypt(password, algorithm="AES-256")
    except TypeError:
        writer.encrypt(password)  # older pypdf fallback
    out = io.BytesIO()
    writer.write(out)
    info = f"{n} sahifa • AES-256 himoyalangan"
    return out.getvalue(), info

@app.post("/api/pdflock")
@limiter.limit("15/minute")
async def lock_pdf(request: Request, file: UploadFile = File(...),
                   password: str = Form("")):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/pdflock")
        if data[:4] != b'%PDF':
            raise HTTPException(status_code=422, detail="Bu fayl PDF emas.")
        pwd = password.strip()[:64] if password.strip() else secrets.token_urlsafe(9)[:12]
        loop = asyncio.get_event_loop()
        try:
            out_bytes, info = await asyncio.wait_for(
                loop.run_in_executor(_converter_pool, _do_pdflock, data, pwd),
                timeout=45.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail="Parol qo'yish 45 soniyadan oshdi. Kichikroq fayl tanlang.")
        logger.info(f"pdflock: {len(data)//1024}KB, {info}, {time.time()-t0:.1f}s")
        return Response(
            content=out_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=locked.pdf",
                "X-Password": pwd,
                "X-Info": info,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"pdflock xato: {e}")
        raise HTTPException(status_code=500,
            detail="Parol qo'yishda xato. Fayl buzilgan bo'lishi mumkin.")

# ─── PDF: Watermark ───────────────────────────────────────────────────────────

def _make_wm_page(pw: float, ph: float, text: str):
    """Create a ReportLab watermark overlay for one (pw×ph) page size."""
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.colors import Color
    from pypdf import PdfReader as _PR

    font_size = max(20, min(56, int(pw * 0.07)))
    spacing = max(pw, ph) * 0.38

    wm_buf = io.BytesIO()
    c = rl_canvas.Canvas(wm_buf, pagesize=(pw, ph))
    c.saveState()
    c.translate(pw / 2, ph / 2)
    c.rotate(42)
    c.setFillColor(Color(0.5, 0.5, 0.5, alpha=0.22))
    c.setFont("Helvetica-Bold", font_size)
    # Three diagonal strips for full-page coverage
    for offset in (-spacing, 0, spacing):
        c.drawCentredString(0, offset, text)
    c.restoreState()
    c.save()
    return _PR(io.BytesIO(wm_buf.getvalue())).pages[0]

def _do_watermark(data: bytes, wm_text: str) -> tuple:
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        raise ValueError("Himoyalangan PDF ga watermark qo'yib bo'lmaydi.")
    n = len(reader.pages)
    if n == 0:
        raise ValueError("PDF bo'sh (0 sahifa).")
    if n > 200:
        raise ValueError(f"PDF {n} sahifa. Maksimal 200 sahifa qabul qilinadi.")

    text = wm_text.strip()[:60] or "EduBot"

    writer = PdfWriter()
    wm_cache: dict = {}

    for page in reader.pages:
        pw = float(page.mediabox.width)
        ph = float(page.mediabox.height)
        key = (round(pw), round(ph))
        if key not in wm_cache:
            wm_cache[key] = _make_wm_page(pw, ph, text)
        page.merge_page(wm_cache[key])
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    info = f"{n} sahifa • \"{text}\" watermark"
    return out.getvalue(), info

@app.post("/api/watermark")
@limiter.limit("15/minute")
async def watermark_pdf(request: Request, file: UploadFile = File(...),
                        text: str = Form("")):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/watermark")
        if data[:4] != b'%PDF':
            raise HTTPException(status_code=422, detail="Bu fayl PDF emas.")
        loop = asyncio.get_event_loop()
        try:
            out_bytes, info = await asyncio.wait_for(
                loop.run_in_executor(_converter_pool, _do_watermark, data, text),
                timeout=45.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail="Watermark qo'yish 45 soniyadan oshdi. Kichikroq fayl tanlang.")
        logger.info(f"watermark: {len(data)//1024}KB, {info}, {time.time()-t0:.1f}s")
        return Response(
            content=out_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=watermarked.pdf",
                "X-Info": info,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"watermark xato: {e}")
        raise HTTPException(status_code=500,
            detail="Watermark qo'yishda xato. Fayl buzilgan yoki himoyalangan bo'lishi mumkin.")

# ─── PDF: To image ────────────────────────────────────────────────────────────

_PDF2IMG_MAX_PAGES = 25   # more than enough for presentations & reports

def _do_pdf2img(data: bytes) -> tuple:
    """
    PDF → ZIP of PNG images (150 DPI, one file per page).
    150 DPI = ilovepdf standard. ZIP_STORED because PNG is already compressed.
    Page-by-page rendering keeps memory usage flat (no full batch in RAM).
    """
    import fitz

    doc = fitz.open(stream=data, filetype="pdf")
    total_pages  = doc.page_count

    if total_pages == 0:
        doc.close()
        raise ValueError("PDF bo'sh (0 sahifa).")

    render_n  = min(total_pages, _PDF2IMG_MAX_PAGES)
    truncated = total_pages > _PDF2IMG_MAX_PAGES

    # 150 DPI — matches ilovepdf default (72 pt × zoom = DPI)
    zoom = 150 / 72          # ≈ 2.083
    mat  = fitz.Matrix(zoom, zoom)

    zf_buf     = io.BytesIO()
    total_size = 0
    padding    = len(str(render_n))   # zero-padding: "01", "02" … or "1", "2"

    # ZIP_STORED — no redundant compression on already-compressed PNG
    with zipfile.ZipFile(zf_buf, 'w', zipfile.ZIP_STORED) as zf:
        for i in range(render_n):
            page      = doc[i]
            pix       = page.get_pixmap(matrix=mat, alpha=False)
            png_bytes = pix.tobytes("png")
            total_size += len(png_bytes)
            zf.writestr(f"page_{str(i + 1).zfill(padding)}.png", png_bytes)
            del pix          # free GPU/CPU memory immediately

    doc.close()

    avg_kb   = total_size // 1024 // render_n if render_n else 0
    info_parts = [f"✅ {render_n} sahifa · 150 DPI · PNG · ~{avg_kb} KB/sahifa"]
    if truncated:
        info_parts.append(
            f"⚠️ Faqat {_PDF2IMG_MAX_PAGES} sahifa ko'rsatildi "
            f"(PDF jami {total_pages} sahifa)"
        )
    return zf_buf.getvalue(), " · ".join(info_parts)


@app.post("/api/pdf2img")
@limiter.limit("10/minute")
async def pdf_to_img(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/pdf2img")

        loop = asyncio.get_event_loop()
        try:
            zip_bytes, info = await asyncio.wait_for(
                loop.run_in_executor(_converter_pool, _do_pdf2img, data),
                timeout=90.0,   # 25 pages × ~3s/page
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail=f"Konversiya 90 soniyadan oshdi. "
                       f"PDF juda katta — maksimal {_PDF2IMG_MAX_PAGES} sahifa.")

        logger.info(f"pdf2img: {len(data)//1024}KB → {len(zip_bytes)//1024}KB, {time.time()-t0:.1f}s")
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": "attachment; filename=pages.zip",
                "X-Info": info,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"pdf2img xato: {e}")
        raise HTTPException(status_code=500,
            detail="PDF rasmga aylantiri bo'lmadi. Fayl buzilgan yoki himoyalangan.")

# ─── PDF: Compress ────────────────────────────────────────────────────────────

@app.post("/api/compresspdf")
@limiter.limit("10/minute")
async def compress_pdf(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        import fitz
        data = await file.read()
        check_size(data, "/api/compresspdf")
        src = fitz.open(stream=data, filetype="pdf")
        out_doc = fitz.open()
        mat = fitz.Matrix(1.5, 1.5)
        for page in src:
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_bytes = pix.tobytes("jpeg", quality=60)
            rect = fitz.Rect(0, 0, page.rect.width, page.rect.height)
            new_page = out_doc.new_page(width=page.rect.width, height=page.rect.height)
            new_page.insert_image(rect, stream=img_bytes)
        buf = io.BytesIO()
        out_doc.save(buf, garbage=4, deflate=True)
        out_bytes = buf.getvalue()
        saved = max(0, round((1 - len(out_bytes) / len(data)) * 100))
        logger.info(f"compresspdf: {len(data)//1024}KB → {len(out_bytes)//1024}KB ({saved}%), {time.time()-t0:.1f}s")
        return Response(content=out_bytes, media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=compressed.pdf",
                                 "X-Saved-Percent": str(saved)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── PDF → DOCX ───────────────────────────────────────────────────────────────

@app.post("/api/pdf2docx")
@limiter.limit("10/minute")
async def pdf_to_docx(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    uid = uuid.uuid4().hex
    pdf_path = f"/tmp/edubot_{uid}.pdf"
    docx_path = f"/tmp/edubot_{uid}.docx"
    try:
        data = await file.read()
        check_size(data, "/api/pdf2docx")

        # ── 1. Sahifalar sonini tekshirish ───────────────────────────
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(data))
            page_count = len(reader.pages)
        except Exception:
            raise HTTPException(status_code=422,
                detail="PDF fayl ochib bo'lmadi. Fayl buzilgan yoki parol bilan himoyalangan.")

        if page_count == 0:
            raise HTTPException(status_code=422, detail="PDF bo'sh (0 sahifa).")

        MAX_PAGES = 50
        if page_count > MAX_PAGES:
            raise HTTPException(status_code=400,
                detail=f"PDF {page_count} sahifali. Maksimal {MAX_PAGES} sahifa. "
                       f"PDF'ni bo'lib (split) qayta urinib ko'ring.")

        # ── 2. Skanerlangan PDF aniqlaish (matn yo'qligi) ────────────
        sample = min(3, page_count)
        total_chars = sum(
            len((reader.pages[i].extract_text() or "").strip())
            for i in range(sample)
        )
        is_scanned = total_chars < 20

        # ── 3. Vaqtinchalik faylga yozish ────────────────────────────
        with open(pdf_path, "wb") as f:
            f.write(data)

        # ── 4. Thread pool'da konversiya (event loop bloklanmaydi) ───
        loop = asyncio.get_event_loop()
        try:
            await asyncio.wait_for(
                loop.run_in_executor(_converter_pool, _do_pdf2docx, pdf_path, docx_path),
                timeout=120.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail=f"Konversiya {page_count} sahifa uchun 120 soniyadan oshdi. "
                       f"Faylni kichikroq qismlarga bo'lib qayta urinib ko'ring.")

        # ── 5. Natijani o'qish ────────────────────────────────────────
        if not os.path.exists(docx_path):
            raise HTTPException(status_code=500, detail="Konversiya muvaffaqiyatsiz (fayl yaratilmadi).")

        with open(docx_path, "rb") as f:
            out = f.read()

        if len(out) < 2000:
            if is_scanned:
                raise HTTPException(status_code=422,
                    detail="Skanerlangan PDF aniqlandi — matn ajratib bo'lmadi. "
                           "Avval OCR xizmatidan foydalaning, keyin qayta urinib ko'ring.")
            raise HTTPException(status_code=422,
                detail="Konversiya natijasi bo'sh. PDF tuzilishi qo'llab-quvvatlanmaydi.")

        # ── 6. Info xabar ─────────────────────────────────────────────
        info = f"✅ {page_count} sahifa aylantiriLdi"
        if is_scanned:
            info += " · ⚠️ Skanerlangan sahifalar bor — sifat past bo'lishi mumkin"

        elapsed = time.time() - t0
        logger.info(f"pdf2docx: {page_count}p {'scan' if is_scanned else 'text'}, "
                    f"{len(data)//1024}KB → {len(out)//1024}KB, {elapsed:.1f}s")

        return Response(
            content=out,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": "attachment; filename=converted.docx",
                "X-Info": info,
                "X-Page-Count": str(page_count),
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"pdf2docx xato: {e}")
        raise HTTPException(status_code=500,
            detail="Kutilmagan xatolik. Fayl buzilgan yoki qo'llab-quvvatlanmaydi.")
    finally:
        for path in (pdf_path, docx_path):
            try:
                if os.path.exists(path):
                    os.unlink(path)
            except Exception:
                pass

# ─── DOCX → PDF ───────────────────────────────────────────────────────────────

def _rl_fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    try:
        pdfmetrics.registerFont(TTFont('DV', FONT_REGULAR))
        pdfmetrics.registerFont(TTFont('DV-Bold', FONT_BOLD))
        return 'DV', 'DV-Bold'
    except Exception:
        return 'Helvetica', 'Helvetica-Bold'


def _do_docx2pdf(data: bytes, fn_regular: str, fn_bold: str) -> bytes:
    """
    CPU-bound DOCX→PDF conversion using python-docx + ReportLab.
    Preserves: headings (H1–H4), bold/italic/underline/color/font-size,
               paragraph alignment, tables (borders + alternating rows),
               embedded images, bulleted & numbered lists.
    Runs in _converter_pool (non-blocking).
    """
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.text.paragraph import Paragraph as DocxParagraph
    from docx.table import Table as DocxTable
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        Image as RLImage, PageBreak,
    )
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
    from PIL import Image as PILImage

    doc = Document(io.BytesIO(data))
    PAGE_W = A4[0] - 4 * cm  # usable text width

    ALIGN_MAP = {
        WD_ALIGN_PARAGRAPH.LEFT:    TA_LEFT,
        WD_ALIGN_PARAGRAPH.CENTER:  TA_CENTER,
        WD_ALIGN_PARAGRAPH.RIGHT:   TA_RIGHT,
        WD_ALIGN_PARAGRAPH.JUSTIFY: TA_JUSTIFY,
        None: TA_LEFT,
    }

    # ── Base styles ────────────────────────────────────────────────
    S = {
        'h1':  ParagraphStyle('h1',  fontName=fn_bold,    fontSize=20, leading=26, spaceAfter=8,  spaceBefore=18),
        'h2':  ParagraphStyle('h2',  fontName=fn_bold,    fontSize=16, leading=21, spaceAfter=6,  spaceBefore=14),
        'h3':  ParagraphStyle('h3',  fontName=fn_bold,    fontSize=13, leading=17, spaceAfter=5,  spaceBefore=10),
        'h4':  ParagraphStyle('h4',  fontName=fn_bold,    fontSize=12, leading=15, spaceAfter=4,  spaceBefore=8),
        'body':ParagraphStyle('body',fontName=fn_regular, fontSize=11, leading=16, spaceAfter=6),
        'lb':  ParagraphStyle('lb',  fontName=fn_regular, fontSize=11, leading=16, spaceAfter=3,  leftIndent=18),
        'ln':  ParagraphStyle('ln',  fontName=fn_regular, fontSize=11, leading=16, spaceAfter=3,  leftIndent=18),
        'tc':  ParagraphStyle('tc',  fontName=fn_regular, fontSize=9,  leading=13),
        'tch': ParagraphStyle('tch', fontName=fn_bold,    fontSize=9,  leading=13),
    }

    _style_ctr = [0]

    def derived(base, alignment, extra_indent=0):
        _style_ctr[0] += 1
        return ParagraphStyle(
            f'_d{_style_ctr[0]}',
            parent=base,
            alignment=alignment,
            leftIndent=base.leftIndent + extra_indent,
        )

    def esc(t: str) -> str:
        return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def runs_to_markup(para) -> str:
        """Convert paragraph runs to ReportLab XML markup."""
        if not para.runs:
            return esc(para.text or "")
        parts = []
        for run in para.runs:
            if not run.text:
                continue
            t = esc(run.text)
            # Font color
            try:
                clr = run.font.color
                if clr and clr.type and clr.rgb:
                    t = f'<font color="#{clr.rgb}">{t}</font>'
            except Exception:
                pass
            # Font size (only if meaningfully different from default 11pt)
            try:
                if run.font.size and run.font.size.pt:
                    fs = round(run.font.size.pt)
                    if fs > 0 and abs(fs - 11) > 1:
                        t = f'<font size="{fs}">{t}</font>'
            except Exception:
                pass
            if run.bold:      t = f'<b>{t}</b>'
            if run.italic:    t = f'<i>{t}</i>'
            if run.underline: t = f'<u>{t}</u>'
            parts.append(t)
        result = "".join(parts)
        return result if result.strip() else esc(para.text or "")

    def heading_level(element, para) -> int:
        """Return heading level 1-4, or 0 for non-heading."""
        style_name = (para.style.name or "").lower()
        for n in (1, 2, 3, 4, 5, 6):
            if f"heading {n}" in style_name or f"заголовок {n}" in style_name:
                return min(n, 4)
        # Fallback: check outline level in XML
        try:
            pPr = element.find(qn("w:pPr"))
            if pPr is not None:
                ol = pPr.find(qn("w:outlineLvl"))
                if ol is not None:
                    lvl = int(ol.get(qn("w:val"), 9))
                    if lvl <= 3:
                        return lvl + 1
        except Exception:
            pass
        return 0

    # ── Extract images from relationships ──────────────────────────
    images: dict[str, bytes] = {}
    try:
        for rel in doc.part.rels.values():
            if "image" in rel.reltype:
                images[rel.rId] = rel.target_part.blob
    except Exception:
        pass

    # ── Track numbered list counters per numId ─────────────────────
    list_counters: dict[str, int] = {}

    # ── Build story ────────────────────────────────────────────────
    story = []

    for element in doc.element.body:
        tag = element.tag.split("}")[-1] if "}" in element.tag else element.tag

        # ── Paragraph ─────────────────────────────────────────────
        if tag == "p":
            para = DocxParagraph(element, doc)
            style_name = (para.style.name or "").lower()

            # Images inside this paragraph
            for blip in element.findall(".//" + qn("a:blip")):
                rId = blip.get(qn("r:embed")) or blip.get(qn("r:link"))
                if rId and rId in images:
                    try:
                        buf = io.BytesIO(images[rId])
                        pil = PILImage.open(buf)
                        iw, ih = pil.size
                        if iw > PAGE_W:
                            ratio = PAGE_W / iw
                            iw, ih = PAGE_W, ih * ratio
                        out_buf = io.BytesIO()
                        pil.convert("RGB").save(out_buf, format="PNG")
                        out_buf.seek(0)
                        story.append(RLImage(out_buf, width=iw, height=ih))
                        story.append(Spacer(1, 6))
                    except Exception:
                        pass

            markup = runs_to_markup(para)
            if not markup.strip():
                story.append(Spacer(1, 3))
                continue

            align = ALIGN_MAP.get(para.alignment, TA_LEFT)
            hlvl = heading_level(element, para)

            if hlvl == 1:
                st = derived(S["h1"], align)
            elif hlvl == 2:
                st = derived(S["h2"], align)
            elif hlvl == 3:
                st = derived(S["h3"], align)
            elif hlvl >= 4:
                st = derived(S["h4"], align)
            elif "list bullet" in style_name or "list paragraph" in style_name:
                markup = f"• {markup}"
                st = derived(S["lb"], align)
            elif "list number" in style_name:
                # Simple auto-numbering per numId
                try:
                    numId = element.find(".//" + qn("w:numId"))
                    key = numId.get(qn("w:val"), "0") if numId is not None else "0"
                except Exception:
                    key = "0"
                list_counters[key] = list_counters.get(key, 0) + 1
                markup = f"{list_counters[key]}. {markup}"
                st = derived(S["ln"], align)
            else:
                st = derived(S["body"], align)

            try:
                story.append(Paragraph(markup, st))
            except Exception:
                # Markup parse error — fall back to plain text
                story.append(Paragraph(esc(para.text or ""), S["body"]))

        # ── Table ─────────────────────────────────────────────────
        elif tag == "tbl":
            table = DocxTable(element, doc)
            rows_data = []
            for r_idx, row in enumerate(table.rows):
                row_cells = []
                is_header = r_idx == 0
                for cell in row.cells:
                    cell_para_text = " ".join(p.text for p in cell.paragraphs).strip()
                    row_cells.append(Paragraph(esc(cell_para_text),
                                               S["tch"] if is_header else S["tc"]))
                rows_data.append(row_cells)

            if rows_data:
                col_n = max(len(r) for r in rows_data)
                col_w = PAGE_W / col_n if col_n else PAGE_W
                tbl = Table(rows_data, colWidths=[col_w] * col_n, repeatRows=1)
                tbl.setStyle(TableStyle([
                    ("BACKGROUND",    (0, 0), (-1,  0), colors.HexColor("#e8e8e8")),
                    ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f7f7")]),
                    ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#bbbbbb")),
                    ("TOPPADDING",    (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING",   (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
                    ("VALIGN",        (0, 0), (-1, -1), "TOP"),
                    ("WORDWRAP",      (0, 0), (-1, -1), "WORD"),
                ]))
                story.append(tbl)
                story.append(Spacer(1, 10))

        # ── Page break ────────────────────────────────────────────
        elif tag == "sectPr":
            pass  # section properties — skip

    if not story:
        story.append(Paragraph("(Bo'sh hujjat)", S["body"]))

    # ── Build PDF ─────────────────────────────────────────────────
    out = io.BytesIO()
    pdf_doc = SimpleDocTemplate(
        out, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2.5 * cm, bottomMargin=2.5 * cm,
        title=doc.core_properties.title or "EduBot Document",
        author="EduBot",
    )
    pdf_doc.build(story)
    return out.getvalue()


@app.post("/api/docx2pdf")
@limiter.limit("10/minute")
async def docx_to_pdf(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/docx2pdf")
        fn, fn_bold = _rl_fonts()

        # ── 1. Fayl validatsiyasi ─────────────────────────────────
        fname = (file.filename or "").lower()
        if fname.endswith(".doc") and not fname.endswith(".docx"):
            raise HTTPException(status_code=400,
                detail="Eski .doc format qo'llab-quvvatlanmaydi. "
                       "Faylni Microsoft Word'da ochib, 'Word hujjati (.docx)' formatida saqlang.")

        # ── 2. Hujjat tarkibini oldindan tekshirish ───────────────
        try:
            from docx import Document as _DocCheck
            _doc_check = _DocCheck(io.BytesIO(data))
            para_count  = sum(1 for p in _doc_check.paragraphs if p.text.strip())
            table_count = len(_doc_check.tables)
            del _doc_check
        except Exception as e:
            raise HTTPException(status_code=422,
                detail="DOCX fayl ochib bo'lmadi. Fayl buzilgan yoki parol bilan himoyalangan.")

        if para_count == 0 and table_count == 0:
            raise HTTPException(status_code=422, detail="Hujjat bo'sh (matn yoki jadval topilmadi).")

        # ── 3. Thread pool'da konversiya (60s timeout) ────────────
        loop = asyncio.get_event_loop()
        try:
            pdf_bytes = await asyncio.wait_for(
                loop.run_in_executor(_converter_pool, _do_docx2pdf, data, fn, fn_bold),
                timeout=60.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail="Konversiya 60 soniyadan oshdi. Hujjat juda katta yoki murakkab.")

        if len(pdf_bytes) < 500:
            raise HTTPException(status_code=500, detail="Konversiya natijasi bo'sh. Qayta urinib ko'ring.")

        # ── 4. Info xabar ─────────────────────────────────────────
        info_parts = [f"✅ {para_count} paragraf"]
        if table_count:
            info_parts.append(f"{table_count} jadval")
        info_parts.append("aylantiriLdi")
        info = " · ".join(info_parts)

        logger.info(f"docx2pdf: {para_count}p+{table_count}t, "
                    f"{len(data)//1024}KB → {len(pdf_bytes)//1024}KB, {time.time()-t0:.1f}s")

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=document.pdf",
                "X-Info": info,
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"docx2pdf xato: {e}")
        raise HTTPException(status_code=500,
            detail="Kutilmagan xatolik. Fayl buzilgan yoki qo'llab-quvvatlanmaydi.")

# ─── Image → PDF helpers ──────────────────────────────────────────────────────

def _open_and_fix_image(data: bytes):
    """
    Open image, apply EXIF rotation, convert transparency to white bg.
    Returns PIL Image in RGB mode.
    """
    from PIL import Image, ImageOps
    img = Image.open(io.BytesIO(data))
    # Fix EXIF rotation (phone cameras store orientation in metadata)
    img = ImageOps.exif_transpose(img)
    # Transparency → white background
    if img.mode in ('RGBA', 'LA', 'P'):
        if img.mode == 'P':
            img = img.convert('RGBA')
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
        img = bg
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    return img


def _fit_image_on_page(img, page_w: float, page_h: float, margin: float):
    """
    Scale image to fit on page with given margin.
    Returns (draw_w, draw_h, x, y) in points.
    """
    from PIL import Image
    w, h = img.size
    # Limit resolution to prevent OOM (very large camera photos)
    MAX_PX = 4000
    if max(w, h) > MAX_PX:
        ratio = MAX_PX / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        w, h = img.size
    avail_w = page_w - 2 * margin
    avail_h = page_h - 2 * margin
    scale = min(avail_w / w, avail_h / h)
    draw_w = w * scale
    draw_h = h * scale
    x = (page_w - draw_w) / 2   # center horizontally
    y = (page_h - draw_h) / 2   # center vertically
    return img, draw_w, draw_h, x, y


def _do_img2pdf(data: bytes) -> tuple:
    """
    Single image → A4 PDF.
    Fixes: EXIF rotation, transparency, auto landscape/portrait,
           centered with 1 cm margins, quality=92 JPEG encoding.
    """
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib.utils import ImageReader

    img = _open_and_fix_image(data)
    orig_w, orig_h = img.size

    # Auto landscape/portrait based on image aspect ratio
    if orig_w > orig_h:
        page_w, page_h = A4[1], A4[0]   # A4 landscape
        orientation = "Landscape"
    else:
        page_w, page_h = A4              # A4 portrait
        orientation = "Portrait"

    img, draw_w, draw_h, x, y = _fit_image_on_page(img, page_w, page_h, 1 * cm)

    # Encode to high-quality JPEG for ReportLab
    img_buf = io.BytesIO()
    img.save(img_buf, format='JPEG', quality=92, optimize=True)
    img_buf.seek(0)

    # Draw on PDF canvas (centered)
    out_buf = io.BytesIO()
    c = rl_canvas.Canvas(out_buf, pagesize=(page_w, page_h))
    c.setTitle("EduBot — Image to PDF")
    c.drawImage(ImageReader(img_buf), x, y, width=draw_w, height=draw_h,
                preserveAspectRatio=True)
    c.save()

    info = f"✅ {orig_w}×{orig_h} px · {orientation} · A4"
    return out_buf.getvalue(), info


def _do_imgs2pdf(all_data: list) -> tuple:
    """
    Multiple images → multi-page A4 PDF.
    Each image gets its own page with auto orientation + centering.
    """
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib.utils import ImageReader

    out_buf = io.BytesIO()
    c = None
    count = 0

    for idx, data in enumerate(all_data):
        try:
            img = _open_and_fix_image(data)
            w, h = img.size

            if w > h:
                page_w, page_h = A4[1], A4[0]
            else:
                page_w, page_h = A4

            img, draw_w, draw_h, x, y = _fit_image_on_page(img, page_w, page_h, 1 * cm)

            img_buf = io.BytesIO()
            img.save(img_buf, format='JPEG', quality=90, optimize=True)
            img_buf.seek(0)

            if c is None:
                c = rl_canvas.Canvas(out_buf, pagesize=(page_w, page_h))
                c.setTitle("EduBot — Images to PDF")
            else:
                c.showPage()
                c.setPageSize((page_w, page_h))

            c.drawImage(ImageReader(img_buf), x, y, width=draw_w, height=draw_h,
                        preserveAspectRatio=True)
            count += 1
        except Exception:
            pass  # skip unreadable images

    if c is None or count == 0:
        raise ValueError("Hech qanday rasm ochib bo'lmadi.")

    c.save()
    info = f"✅ {count} ta rasm · {count} sahifali PDF"
    return out_buf.getvalue(), info


# ─── Image → PDF ──────────────────────────────────────────────────────────────

@app.post("/api/img2pdf")
@limiter.limit("20/minute")
async def img_to_pdf(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/img2pdf")

        loop = asyncio.get_event_loop()
        try:
            pdf_bytes, info = await asyncio.wait_for(
                loop.run_in_executor(_converter_pool, _do_img2pdf, data),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408, detail="Konversiya 30 soniyadan oshdi.")

        logger.info(f"img2pdf: {len(data)//1024}KB → {len(pdf_bytes)//1024}KB, {time.time()-t0:.1f}s")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=image.pdf",
                "X-Info": info,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"img2pdf xato: {e}")
        raise HTTPException(status_code=500,
            detail="Rasm ochib bo'lmadi. JPG yoki PNG fayl yuklang.")

# ─── Images → PDF ─────────────────────────────────────────────────────────────

@app.post("/api/imgs2pdf")
@limiter.limit("10/minute")
async def imgs_to_pdf(request: Request, files: List[UploadFile] = File(...)):
    t0 = time.time()
    try:
        if not files:
            raise HTTPException(status_code=400, detail="Rasm yuklanmadi.")
        if len(files) > 30:
            raise HTTPException(status_code=400,
                detail=f"Juda ko'p rasm ({len(files)} ta). Maksimal 30 ta.")

        all_data = []
        total = 0
        for f in files:
            d = await f.read()
            total += len(d)
            if total > MAX_FILE_BYTES * 3:
                raise HTTPException(status_code=413,
                    detail="Rasmlarning umumiy hajmi juda katta.")
            all_data.append(d)

        loop = asyncio.get_event_loop()
        try:
            pdf_bytes, info = await asyncio.wait_for(
                loop.run_in_executor(_converter_pool, _do_imgs2pdf, all_data),
                timeout=60.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408, detail="Konversiya 60 soniyadan oshdi.")

        logger.info(f"imgs2pdf: {len(files)} rasm, {total//1024}KB → {len(pdf_bytes)//1024}KB, {time.time()-t0:.1f}s")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=images.pdf",
                "X-Info": info,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"imgs2pdf xato: {e}")
        raise HTTPException(status_code=500,
            detail="Rasmlarni ochib bo'lmadi. JPG yoki PNG fayllar yuklang.")

# ─── Excel → PDF ──────────────────────────────────────────────────────────────

def _do_xlsx2pdf(data: bytes) -> tuple:
    """
    Excel → PDF with smart column widths, auto landscape, date/number formatting.
    Pass 1 — scan all sheets → determine orientation.
    Pass 2 — build full document.
    Runs in _converter_pool (non-blocking).
    """
    from openpyxl import load_workbook
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak,
    )
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from datetime import datetime as _dt, date as _date, time as _time

    fn, fn_bold = _rl_fonts()
    MAX_ROWS    = 500
    MAX_SHEETS  = 10
    MAX_COLS    = 20
    MARGIN      = 1.2 * cm

    def fmt_val(v) -> str:
        if v is None:
            return ''
        if isinstance(v, (_dt,)):
            return v.strftime('%d.%m.%Y %H:%M') if v.hour or v.minute else v.strftime('%d.%m.%Y')
        if isinstance(v, _date):
            return v.strftime('%d.%m.%Y')
        if isinstance(v, _time):
            return v.strftime('%H:%M')
        if isinstance(v, bool):
            return 'Ha' if v else "Yo'q"
        if isinstance(v, float):
            # Integer-valued float (e.g. 1.0, 2.0)
            if abs(v) < 1e14 and v == int(v):
                return str(int(v))
            return f'{v:g}'
        return str(v)

    def esc(t: str) -> str:
        return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    def calc_col_widths(all_rows, col_n: int, avail_w: float) -> list:
        """Proportional widths based on max content length, clamped min/max."""
        max_lens = [1] * col_n
        for row in all_rows[:100]:
            for j in range(col_n):
                v = row[j] if j < len(row) else None
                max_lens[j] = max(max_lens[j], min(len(fmt_val(v)), 40))
        total = sum(max_lens) or col_n
        MIN_W, MAX_W = 1.0 * cm, 9.0 * cm
        widths = [max(MIN_W, min(MAX_W, avail_w * l / total)) for l in max_lens]
        # Normalise so columns fill the page exactly
        scale = avail_w / sum(widths)
        return [w * scale for w in widths]

    # ── Pass 1: quick scan — find max non-empty columns across all sheets ──
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    max_col_n = 0
    for name in wb.sheetnames[:MAX_SHEETS]:
        ws = wb[name]
        for row in ws.iter_rows(values_only=True, max_row=5, max_col=MAX_COLS):
            non_empty = sum(1 for v in row if v is not None)
            max_col_n = max(max_col_n, non_empty)
    wb.close()

    # Landscape if any sheet has > 7 meaningful columns
    if max_col_n > 7:
        page_w, page_h = A4[1], A4[0]
        orientation = "Landscape"
    else:
        page_w, page_h = A4
        orientation = "Portrait"
    avail_w = page_w - 2 * MARGIN

    # ── Pass 2: full build ─────────────────────────────────────────────────
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)

    title_st = ParagraphStyle('xt', fontName=fn_bold, fontSize=12,
                               spaceAfter=6, spaceBefore=4,
                               textColor=colors.HexColor('#1a3a5c'))
    note_st  = ParagraphStyle('xn', fontName=fn, fontSize=8,
                               textColor=colors.HexColor('#888888'), spaceAfter=4)

    story = []
    total_rows   = 0
    total_sheets = 0
    any_truncated = False

    for name in wb.sheetnames[:MAX_SHEETS]:
        ws = wb[name]
        raw = list(ws.iter_rows(values_only=True,
                                max_row=MAX_ROWS + 1, max_col=MAX_COLS))
        if not raw:
            continue

        truncated = len(raw) > MAX_ROWS
        raw = raw[:MAX_ROWS]
        if truncated:
            any_truncated = True

        # Trim trailing all-None columns
        col_n = MAX_COLS
        while col_n > 1:
            if all((r[col_n - 1] if col_n - 1 < len(r) else None) is None
                   for r in raw[:30]):
                col_n -= 1
            else:
                break
        col_n = max(1, col_n)

        # Trim trailing all-None rows
        while raw and all(v is None for v in raw[-1][:col_n]):
            raw.pop()
        if not raw:
            continue

        # Font size adapts to column count
        if   col_n <= 4:  fs = 10
        elif col_n <= 7:  fs = 9
        elif col_n <= 11: fs = 8
        else:             fs = 7

        tc_st  = ParagraphStyle(f'tc_{name}',  fontName=fn,      fontSize=fs, leading=fs + 3)
        tch_st = ParagraphStyle(f'tch_{name}', fontName=fn_bold, fontSize=fs, leading=fs + 3)

        col_widths = calc_col_widths(raw, col_n, avail_w)

        # Build table rows
        table_data = []
        for r_idx, row in enumerate(raw):
            is_hdr = r_idx == 0
            cells = []
            for j in range(col_n):
                v = row[j] if j < len(row) else None
                txt = esc(fmt_val(v))
                cells.append(Paragraph(txt, tch_st if is_hdr else tc_st))
            table_data.append(cells)

        # Section header
        if story:
            story.append(PageBreak())
        story.append(Paragraph(name, title_st))
        if truncated:
            story.append(Paragraph(
                f'⚠️ Faqat birinchi {MAX_ROWS} qator ko\'rsatildi', note_st))

        tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle([
            # Header row
            ('BACKGROUND',    (0, 0), (-1,  0), colors.HexColor('#cfe2f3')),
            ('LINEBELOW',     (0, 0), (-1,  0), 1.2, colors.HexColor('#2e7cbf')),
            # Alternating data rows
            ('ROWBACKGROUNDS',(0, 1), (-1, -1),
             [colors.white, colors.HexColor('#f0f6fb')]),
            # Grid
            ('GRID',          (0, 0), (-1, -1), 0.35, colors.HexColor('#b0c8e0')),
            # Padding
            ('TOPPADDING',    (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING',   (0, 0), (-1, -1), 4),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
            ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
            ('WORDWRAP',      (0, 0), (-1, -1), 'WORD'),
        ]))
        story.append(tbl)
        total_rows   += len(raw)
        total_sheets += 1

    wb.close()

    if not story:
        raise ValueError("Excel fayl bo'sh yoki o'qib bo'lmadi.")

    out = io.BytesIO()
    doc = SimpleDocTemplate(
        out, pagesize=(page_w, page_h),
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN + 0.3 * cm, bottomMargin=MARGIN,
        title="EduBot — Excel to PDF",
    )
    doc.build(story)

    sheets_word = f"{total_sheets} varaq" if total_sheets > 1 else "1 varaq"
    info = f"✅ {sheets_word} · {total_rows} qator · {orientation}"
    if any_truncated:
        info += f" · (max {MAX_ROWS} qator/varaq)"
    return out.getvalue(), info


@app.post("/api/xlsx2pdf")
@limiter.limit("10/minute")
async def xlsx_to_pdf(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/xlsx2pdf")

        loop = asyncio.get_event_loop()
        try:
            pdf_bytes, info = await asyncio.wait_for(
                loop.run_in_executor(_converter_pool, _do_xlsx2pdf, data),
                timeout=60.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail="Konversiya 60 soniyadan oshdi. Excel fayl juda katta.")

        logger.info(f"xlsx2pdf: {len(data)//1024}KB → {len(pdf_bytes)//1024}KB, {time.time()-t0:.1f}s")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=spreadsheet.pdf",
                "X-Info": info,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"xlsx2pdf xato: {e}")
        raise HTTPException(status_code=500,
            detail="Excel fayl ochib bo'lmadi. .xlsx yoki .xls fayl yuklang.")

# ─── PPTX Compress (ZIP approach) ────────────────────────────────────────────

@app.post("/api/compresspptx")
@limiter.limit("10/minute")
async def compress_pptx(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        from PIL import Image
        data = await file.read()
        check_size(data, "/api/compresspptx")
        MAX_DIM = 1920
        compressed = 0
        out_buf = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(data), 'r') as zin, \
             zipfile.ZipFile(out_buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zout:
            for item in zin.infolist():
                item_data = zin.read(item.filename)
                ext = item.filename.rsplit('.', 1)[-1].lower()
                if 'media/' in item.filename and ext in ('jpg', 'jpeg', 'png', 'bmp'):
                    try:
                        img = Image.open(io.BytesIO(item_data))
                        ratio = min(1.0, MAX_DIM / max(img.width, img.height))
                        if ratio < 1.0:
                            img = img.resize((int(img.width * ratio), int(img.height * ratio)), Image.LANCZOS)
                        if img.mode not in ('RGB',):
                            img = img.convert('RGB')
                        cb = io.BytesIO()
                        img.save(cb, format='JPEG', quality=72, optimize=True)
                        item_data = cb.getvalue()
                        compressed += 1
                    except Exception:
                        pass
                zout.writestr(item, item_data)
        out_bytes = out_buf.getvalue()
        saved = max(0, round((1 - len(out_bytes) / len(data)) * 100))
        logger.info(f"compresspptx: {compressed} rasm, {saved}%, {time.time()-t0:.1f}s")
        return Response(
            content=out_bytes,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": "attachment; filename=compressed.pptx",
                     "X-Saved-Percent": str(saved)},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Image compress ───────────────────────────────────────────────────────────

@app.post("/api/imgcompress")
@limiter.limit("20/minute")
async def img_compress(request: Request, file: UploadFile = File(...)):
    try:
        from PIL import Image
        data = await file.read()
        check_size(data, "/api/imgcompress")
        img = Image.open(io.BytesIO(data))
        MAX_DIM = 1920
        ratio = min(1.0, MAX_DIM / max(img.width, img.height))
        if ratio < 1.0:
            img = img.resize((int(img.width * ratio), int(img.height * ratio)), Image.LANCZOS)
        if img.mode not in ('RGB',):
            img = img.convert('RGB')
        out = io.BytesIO()
        img.save(out, format='JPEG', quality=72, optimize=True)
        out_bytes = out.getvalue()
        saved = max(0, round((1 - len(out_bytes) / len(data)) * 100))
        return Response(content=out_bytes, media_type="image/jpeg",
                        headers={"Content-Disposition": "attachment; filename=compressed.jpg",
                                 "X-Saved-Percent": str(saved)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        logger.info(f"bgremove: {len(data)//1024}KB → {len(result)//1024}KB, {time.time()-t0:.1f}s")
        return Response(content=result, media_type="image/png",
                        headers={"Content-Disposition": "attachment; filename=no-bg.png"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── OCR helpers ──────────────────────────────────────────────────────────────

def _preprocess_for_ocr(img):
    """
    Prepare image for Tesseract:
      1. EXIF rotation fix
      2. Grayscale
      3. Scale: minimum 1800px long edge (Tesseract needs ~300 DPI)
      4. Cap at 4000px (prevent OOM + slow OCR)
      5. Auto-contrast (stretch histogram)
      6. Moderate contrast boost + sharpen
    Keeps preprocessing moderate — LSTM engine works well without
    aggressive binarization.
    """
    from PIL import Image, ImageFilter, ImageEnhance, ImageOps

    img = ImageOps.exif_transpose(img)
    gray = img.convert('L')
    w, h = gray.size

    # Scale up if image is too small for accurate OCR
    MIN_EDGE = 1800
    if max(w, h) < MIN_EDGE:
        scale = MIN_EDGE / max(w, h)
        gray = gray.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        w, h = gray.size

    # Cap resolution to prevent memory/speed issues
    MAX_EDGE = 4000
    if max(w, h) > MAX_EDGE:
        scale = MAX_EDGE / max(w, h)
        gray = gray.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Stretch histogram (handles under/over-exposed photos)
    gray = ImageOps.autocontrast(gray, cutoff=2)
    # Moderate contrast boost
    gray = ImageEnhance.Contrast(gray).enhance(1.4)
    # Light sharpening (helps with slightly blurry scans)
    gray = gray.filter(ImageFilter.SHARPEN)

    return gray


def _clean_ocr_text(text: str) -> str:
    """Remove Tesseract noise: stray chars, excessive blank lines."""
    # Collapse 3+ consecutive blank lines → 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    lines = text.split('\n')
    result = []
    for line in lines:
        s = line.strip()
        if s and len(s) >= 2:          # keep lines with ≥2 real chars
            result.append(s)
        elif not s and result and result[-1]:
            result.append('')          # keep at most one blank separator
    # Strip leading/trailing blanks
    while result and not result[0]:
        result.pop(0)
    while result and not result[-1]:
        result.pop()
    return '\n'.join(result)


def _do_ocr(data: bytes, is_pdf: bool) -> str:
    """
    Full OCR pipeline — runs in _converter_pool (CPU-bound).

    PDF path:
      • Has extractable text → direct fitz.get_text() (fast, accurate)
      • Scanned PDF         → render 200 DPI + Tesseract (up to 8 pages)

    Image path:
      • Preprocess → Tesseract LSTM
    """
    import pytesseract
    from PIL import Image

    LANGS  = 'rus+eng+uzb'
    CONFIG = '--oem 3 --psm 6'   # LSTM engine, single uniform text block

    if is_pdf:
        import fitz
        doc         = fitz.open(stream=data, filetype='pdf')
        total_pages = doc.page_count

        if total_pages == 0:
            doc.close()
            return 'PDF bo\'sh (0 sahifa).'

        # ── Does the PDF already contain text? ────────────────────
        sample = ''.join(doc[i].get_text() for i in range(min(3, total_pages)))
        if len(sample.strip()) > 50:
            # Text-based PDF: direct extraction (no OCR needed)
            MAX_P = 15
            parts = []
            for i in range(min(total_pages, MAX_P)):
                t = doc[i].get_text().strip()
                if t:
                    if total_pages > 1:
                        parts.append(f'── Sahifa {i + 1} ──')
                    parts.append(t)
            doc.close()
            result = _clean_ocr_text('\n\n'.join(parts))
            if total_pages > MAX_P:
                result += f'\n\n⚠️ Faqat {MAX_P} sahifa o\'qildi (PDF jami {total_pages} sahifa).'
            return result or 'Matn topilmadi.'

        # ── Scanned PDF: render each page + Tesseract ─────────────
        zoom    = 200 / 72      # 200 DPI — better accuracy than 150 for OCR
        mat     = fitz.Matrix(zoom, zoom)
        MAX_P   = 8             # OCR is ~3–5 s/page; cap for fast response
        parts   = []

        for i in range(min(total_pages, MAX_P)):
            pix  = doc[i].get_pixmap(matrix=mat, alpha=False)
            img  = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
            del pix
            img  = _preprocess_for_ocr(img)
            text = pytesseract.image_to_string(img, lang=LANGS, config=CONFIG)
            cleaned = _clean_ocr_text(text)
            if cleaned:
                if total_pages > 1:
                    parts.append(f'── Sahifa {i + 1} ──')
                parts.append(cleaned)

        doc.close()
        result = '\n\n'.join(parts)
        if total_pages > MAX_P:
            result += (f'\n\n⚠️ Faqat {MAX_P} sahifa OCR qilindi '
                       f'(PDF jami {total_pages} sahifali).')
        return result or 'Matn topilmadi.'

    # ── Image ─────────────────────────────────────────────────────
    img  = Image.open(io.BytesIO(data))
    img  = _preprocess_for_ocr(img)
    text = pytesseract.image_to_string(img, lang=LANGS, config=CONFIG)
    return _clean_ocr_text(text) or 'Matn topilmadi.'


# ─── OCR ──────────────────────────────────────────────────────────────────────

@app.post("/api/ocr")
@limiter.limit("15/minute")
async def ocr(request: Request):
    t0 = time.time()
    try:
        import base64
        ct = request.headers.get("content-type", "")
        if "multipart" in ct:
            form  = await request.form()
            f     = form.get("file")
            fname = (f.filename or "").lower()
            data  = await f.read()
        else:
            body  = await request.json()
            data  = base64.b64decode(body["data"])
            fname = body.get("filename", "").lower()

        check_size(data, "/api/ocr")

        # Detect file type: filename OR magic bytes (%PDF)
        is_pdf = fname.endswith('.pdf') or data[:4] == b'%PDF'

        loop = asyncio.get_event_loop()
        try:
            text = await asyncio.wait_for(
                loop.run_in_executor(_converter_pool, _do_ocr, data, is_pdf),
                timeout=90.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail="OCR 90 soniyadan oshdi. Rasmni kichiklashtiring yoki PDF'ni qisqartiring.")

        logger.info(f"ocr: {len(data)//1024}KB {'pdf' if is_pdf else 'img'} → {len(text)} belgi, {time.time()-t0:.1f}s")
        return JSONResponse({"text": text})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ocr xato: {e}")
        raise HTTPException(status_code=500,
            detail="OCR xatosi. Tiniq JPG/PNG rasm yoki skanerlangan PDF yuklang.")

# ─── Translit ─────────────────────────────────────────────────────────────────

@app.post("/api/translit")
@limiter.limit("60/minute")
async def translit(request: Request):
    body = await request.json()
    text = body.get("text", "")
    LTR = {
        "sh": "ш", "ch": "ч", "yo": "ё", "ye": "е", "yu": "ю", "ya": "я", "ts": "ц",
        "o'": "ў", "g'": "ғ",
        "a": "а", "b": "б", "v": "в", "d": "д", "e": "е", "f": "ф", "g": "г", "h": "ҳ",
        "i": "и", "j": "ж", "k": "к", "l": "л", "m": "м", "n": "н", "o": "о", "p": "п",
        "q": "қ", "r": "р", "s": "с", "t": "т", "u": "у", "x": "х", "y": "й", "z": "з",
        "'": "ъ",
    }
    RTL = {
        "ш": "sh", "ч": "ch", "ё": "yo", "ю": "yu", "я": "ya", "ц": "ts", "ў": "o'", "ғ": "g'",
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "j", "з": "z",
        "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p",
        "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "қ": "q", "ҳ": "h", "ъ": "'",
    }
    is_cyr = bool(re.search(r'[а-яёА-ЯЁ]', text))
    if is_cyr:
        out = ""
        for c in text:
            lc = c.lower()
            m = RTL.get(lc, c)
            out += (m[0].upper() + m[1:]) if (c != lc and m != c) else m
        return JSONResponse({"result": out})
    MULTI = ["sh", "ch", "yo", "ye", "yu", "ya", "ts", "o'", "g'"]
    out = ""
    i = 0
    while i < len(text):
        matched = False
        for key in MULTI:
            if text[i:i+len(key)].lower() == key:
                c0 = LTR[key]
                out += c0.upper() if text[i].isupper() else c0
                i += len(key)
                matched = True
                break
        if not matched:
            c = text[i]
            m = LTR.get(c.lower(), c)
            out += m.upper() if (c.isupper() and not c.islower()) else m
            i += 1
    return JSONResponse({"result": out})

# ─── Readtime ─────────────────────────────────────────────────────────────────

@app.post("/api/readtime")
@limiter.limit("60/minute")
async def readtime(request: Request):
    body = await request.json()
    text = body.get("text", "")
    words = len(text.split())
    chars = len(text.replace(" ", ""))
    mins = max(1, round(words / 200))
    return JSONResponse({"result": f"📖 {words} so'z · {chars} belgi\n⏱ O'qish vaqti: ~{mins} daqiqa\n(200 so'z/daqiqa hisobida)"})

# ─── Deadline ─────────────────────────────────────────────────────────────────

@app.post("/api/deadline")
@limiter.limit("60/minute")
async def deadline(request: Request):
    body = await request.json()
    text = body.get("text", "")
    m = re.search(r'(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})', text) or \
        re.search(r'(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})', text)
    if not m:
        return JSONResponse({"result": "❌ Sanani kiriting: 31.12.2025 yoki 2025-12-31"})
    try:
        g = m.groups()
        if len(g[0]) == 4:
            d = datetime(int(g[0]), int(g[1]), int(g[2]))
        else:
            yr = int(g[2])
            if yr < 100: yr += 2000
            d = datetime(yr, int(g[1]), int(g[0]))
        now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        days = (d - now).days
        emoji = "🔴" if days < 0 else ("🚨" if days <= 3 else ("🟡" if days <= 7 else "🟢"))
        msg = f"{abs(days)} kun oldin o'tdi!" if days < 0 else ("BUGUN!" if days == 0 else f"{days} kun qoldi")
        return JSONResponse({"result": f"📅 {d.strftime('%d.%m.%Y')}\n{emoji} {msg}"})
    except ValueError:
        return JSONResponse({"result": "❌ Noto'g'ri sana formati"})

# ─── Stats ────────────────────────────────────────────────────────────────────

@app.post("/api/stats")
@limiter.limit("60/minute")
async def stats(request: Request):
    body = await request.json()
    nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', body.get("text", ""))]
    if not nums:
        return JSONResponse({"result": "❌ Raqamlar kiriting. Masalan: 4 7 2 9 1 5"})
    n = len(nums)
    total = sum(nums)
    mean = total / n
    s = sorted(nums)
    median = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
    var = sum((x - mean) ** 2 for x in nums) / n
    return JSONResponse({"result": (
        f"📊 n = {n}\n∑ Yig'indi: {total:g}\n"
        f"x̄ O'rtacha: {mean:.4f}\nM Mediana: {median:g}\n"
        f"σ² Dispersiya: {var:.4f}\nσ Standart og'ish: {var**0.5:.4f}\n"
        f"Min: {s[0]:g}  Max: {s[-1]:g}"
    )})

# ─── Equation ─────────────────────────────────────────────────────────────────

@app.post("/api/equation")
@limiter.limit("60/minute")
async def equation(request: Request):
    body = await request.json()
    expr = body.get("text", "").strip()
    if not expr:
        return JSONResponse({"result": "❌ Ifoda kiriting. Misol: 2^10, sqrt(144), sin(pi/2)"})
    safe_expr = expr.replace("^", "**")
    safe_ns = {
        "sin": math.sin, "cos": math.cos, "tan": math.tan, "asin": math.asin,
        "acos": math.acos, "atan": math.atan, "sqrt": math.sqrt,
        "log": math.log, "log10": math.log10, "exp": math.exp,
        "abs": abs, "round": round, "floor": math.floor, "ceil": math.ceil,
        "pi": math.pi, "e": math.e, "__builtins__": {},
    }
    try:
        result = eval(safe_expr, safe_ns)
        fmt = f"{result:.10g}" if isinstance(result, float) else str(result)
        return JSONResponse({"result": f"✅ {expr} = {fmt}"})
    except Exception as ex:
        return JSONResponse({"result": f"❌ {str(ex)}\n\nMisol: 2^10, sqrt(144), sin(pi/2), 3*4+2"})

# ─── Graph ────────────────────────────────────────────────────────────────────

@app.post("/api/graph")
@limiter.limit("20/minute")
async def graph(request: Request):
    body = await request.json()
    expr = body.get("text", "sin(x)").strip() or "sin(x)"
    if not _MPL_OK:
        raise HTTPException(status_code=503, detail="Matplotlib mavjud emas")
    try:
        safe_expr = expr.replace("^", "**")
        x = np.linspace(-10, 10, 600)
        safe_ns = {
            "x": x, "sin": np.sin, "cos": np.cos, "tan": np.tan,
            "sqrt": np.sqrt, "log": np.log, "exp": np.exp,
            "abs": np.abs, "pi": np.pi, "e": np.e, "__builtins__": {},
        }
        y = eval(safe_expr, safe_ns)
        y = np.where(np.isfinite(y), y, np.nan)

        fig, ax = plt.subplots(figsize=(7, 4.5), facecolor="#0d0d18")
        ax.set_facecolor("#0d0d18")
        ax.plot(x, y, color="#8b5cf6", linewidth=2.5)
        ax.axhline(0, color="white", linewidth=0.8, alpha=0.3)
        ax.axvline(0, color="white", linewidth=0.8, alpha=0.3)
        ax.grid(True, alpha=0.08, color="white")
        ax.tick_params(colors="#aaaaaa", labelsize=9)
        for sp in ax.spines.values():
            sp.set_edgecolor("#333333")
        ax.set_title(f"f(x) = {expr}", color="#cccccc", fontsize=12, pad=10)
        plt.tight_layout()

        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=120, bbox_inches="tight", facecolor="#0d0d18")
        plt.close(fig)
        buf.seek(0)
        return Response(content=buf.read(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Xatolik: {str(e)}\nMisol: sin(x), x^2, cos(x)*x")

# ─── QR Code ──────────────────────────────────────────────────────────────────

@app.post("/api/qr")
@limiter.limit("30/minute")
async def make_qr(request: Request):
    try:
        import qrcode
        body = await request.json()
        text = body.get("text", "EduBot").strip() or "EduBot"
        qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M,
                            box_size=10, border=4)
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.read(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Certificate ──────────────────────────────────────────────────────────────

@app.post("/api/cert")
@limiter.limit("20/minute")
async def make_cert(request: Request):
    try:
        from PIL import Image, ImageDraw, ImageFont
        body = await request.json()
        lines = body.get("text", "Ism Familiya\nKurs nomi").strip().split("\n")
        name   = lines[0].strip() if lines else "Ism Familiya"
        course = lines[1].strip() if len(lines) > 1 else "Kurs nomi"

        W, H = 800, 560
        img = Image.new("RGB", (W, H))
        draw = ImageDraw.Draw(img)
        for i in range(H):
            t = i / H
            draw.line([(0, i), (W, i)], fill=(
                int(15 + t * 21), int(12 + t * 15), int(41 + t * 21)
            ))
        try:
            fn_sm  = ImageFont.truetype(FONT_REGULAR, 14)
            fn_med = ImageFont.truetype(FONT_REGULAR, 20)
            fn_bold= ImageFont.truetype(FONT_BOLD, 36)
            fn_big = ImageFont.truetype(FONT_BOLD, 42)
        except Exception:
            fn_sm = fn_med = fn_bold = fn_big = ImageFont.load_default()

        draw.rectangle([(18, 18), (W-18, H-18)], outline=(251, 191, 36), width=3)
        draw.rectangle([(28, 28), (W-28, H-28)], outline=(180, 140, 30), width=1)

        def cx(text, font):
            try:
                bb = draw.textbbox((0, 0), text, font=font)
                return (W - (bb[2] - bb[0])) // 2
            except Exception:
                return W // 4

        draw.text((cx("SERTIFIKAT", fn_bold), 100), "SERTIFIKAT", font=fn_bold, fill=(251, 191, 36))
        sub = "quyidagi kurs muvaffaqiyatli yakunlanganligi uchun beriladi"
        draw.text((cx(sub, fn_sm), 148), sub, font=fn_sm, fill=(180, 180, 180))
        draw.text((cx(name, fn_big), 235), name, font=fn_big, fill=(255, 255, 255))
        draw.text((cx(course, fn_med), 295), course, font=fn_med, fill=(167, 139, 250))
        draw.line([(W//2-180, 340), (W//2+180, 340)], fill=(180, 140, 30), width=1)
        date_str = datetime.now().strftime("%d.%m.%Y")
        draw.text((cx(date_str, fn_sm), 465), date_str, font=fn_sm, fill=(150, 150, 150))
        draw.text((cx("EduBot", fn_sm), 490), "EduBot", font=fn_sm, fill=(150, 150, 150))

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.read(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Schedule ─────────────────────────────────────────────────────────────────

@app.post("/api/schedule")
@limiter.limit("20/minute")
async def make_schedule(request: Request):
    try:
        from PIL import Image, ImageDraw, ImageFont
        body = await request.json()
        text = body.get("text", "").strip()
        rows = [l.strip() for l in text.split("\n") if l.strip()]
        if not rows:
            raise HTTPException(status_code=400, detail="Jadval qatorlarini kiriting")

        W, rowH = 680, 52
        H = rowH * (len(rows) + 1) + 80
        img = Image.new("RGB", (W, H), (13, 13, 24))
        draw = ImageDraw.Draw(img)
        try:
            fn_title = ImageFont.truetype(FONT_BOLD, 22)
            fn_row   = ImageFont.truetype(FONT_REGULAR, 15)
        except Exception:
            fn_title = fn_row = ImageFont.load_default()

        title = "Dars Jadvali"
        try:
            bb = draw.textbbox((0, 0), title, font=fn_title)
            tx = (W - (bb[2] - bb[0])) // 2
        except Exception:
            tx = W // 4
        draw.text((tx, 26), title, font=fn_title, fill=(139, 92, 246))

        for i, line in enumerate(rows):
            y = 70 + i * rowH
            bg = (35, 22, 65) if i % 2 == 0 else (20, 20, 35)
            try:
                draw.rounded_rectangle([(16, y), (W-16, y+rowH-4)], radius=8, fill=bg)
            except Exception:
                draw.rectangle([(16, y), (W-16, y+rowH-4)], fill=bg)
            draw.text((28, y + 16), line, font=fn_row, fill=(229, 229, 255))

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.read(), media_type="image/png")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Translate (proxy) ────────────────────────────────────────────────────────

@app.post("/api/translate")
@limiter.limit("20/minute")
async def translate(request: Request):
    body = await request.json()
    lines = body.get("text", "").strip().split("\n")
    query = lines[0].strip()
    lang  = lines[1].strip() if len(lines) > 1 else "en"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get("https://api.mymemory.translated.net/get",
                                  params={"q": query, "langpair": f"uz|{lang}"})
            d = r.json()
            if d.get("responseStatus") == 200:
                return JSONResponse({"result": f"🌐 uz → {lang}\n\n{d['responseData']['translatedText']}"})
            raise Exception(d.get("responseMessage", "Xatolik"))
    except Exception as e:
        return JSONResponse({"result": f"❌ {str(e)}\n\nFormat: 1-qatorda matn, 2-qatorda til (en, ru, tr...)"})

# ─── Wikipedia (proxy) ────────────────────────────────────────────────────────

@app.post("/api/wiki")
@limiter.limit("20/minute")
async def wiki(request: Request):
    body = await request.json()
    q = body.get("text", "").strip()
    async with httpx.AsyncClient(timeout=15) as client:
        for lang in ["uz", "ru", "en"]:
            try:
                r = await client.get(f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{q}")
                if r.status_code == 200:
                    d = r.json()
                    if d.get("extract"):
                        url = d.get("content_urls", {}).get("desktop", {}).get("page", "")
                        result = f"📖 {d['title']}\n\n{d['extract']}"
                        if url: result += f"\n\n🔗 {url}"
                        return JSONResponse({"result": result})
            except Exception:
                continue
    return JSONResponse({"result": "❌ Wikipedia'da topilmadi. Boshqa so'z bilan qidiring."})

# ─── Books (proxy) ────────────────────────────────────────────────────────────

@app.post("/api/books")
@limiter.limit("20/minute")
async def books(request: Request):
    body = await request.json()
    q = body.get("text", "").strip()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get("https://openlibrary.org/search.json",
                                  params={"q": q, "limit": 8, "fields": "title,author_name,first_publish_year"})
            d = r.json()
            if not d.get("docs"):
                return JSONResponse({"result": "📚 Kitob topilmadi"})
            lines = []
            for i, b in enumerate(d["docs"], 1):
                line = f"{i}. {b['title']}"
                if b.get("author_name"): line += f"\n   ✍️ {b['author_name'][0]}"
                if b.get("first_publish_year"): line += f"  📅 {b['first_publish_year']}"
                lines.append(line)
            return JSONResponse({"result": f"📚 Natijalar ({d['numFound']} ta):\n\n" + "\n\n".join(lines)})
    except Exception as e:
        return JSONResponse({"result": f"❌ Xatolik: {str(e)}"})

# ─── ZIP ──────────────────────────────────────────────────────────────────────

@app.post("/api/zip")
@limiter.limit("20/minute")
async def make_zip(request: Request, files: List[UploadFile] = File(...)):
    try:
        buf = io.BytesIO()
        total = 0
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for f in files:
                data = await f.read()
                total += len(data)
                if total > MAX_FILE_BYTES * 3:
                    raise HTTPException(status_code=413, detail="Fayllar jami hajmi juda katta")
                zf.writestr(f.filename or "file", data)
        return Response(content=buf.getvalue(), media_type="application/zip",
                        headers={"Content-Disposition": "attachment; filename=archive.zip"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Unzip ────────────────────────────────────────────────────────────────────

@app.post("/api/unzip")
@limiter.limit("20/minute")
async def unzip_file(request: Request, file: UploadFile = File(...)):
    try:
        data = await file.read()
        check_size(data, "/api/unzip")
        zf = zipfile.ZipFile(io.BytesIO(data))
        names = [n for n in zf.namelist() if not n.endswith("/")]
        if not names:
            raise HTTPException(status_code=400, detail="ZIP fayl bo'sh")
        if len(names) == 1:
            content = zf.read(names[0])
            return Response(content=content, media_type="application/octet-stream",
                            headers={"Content-Disposition": f"attachment; filename={names[0]}"})
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zout:
            for name in names:
                zout.writestr(name, zf.read(name))
        return Response(content=out.getvalue(), media_type="application/zip",
                        headers={"Content-Disposition": "attachment; filename=extracted.zip"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Payment: Create ─────────────────────────────────────────────────────────

@app.post("/api/payment/create")
@limiter.limit("10/minute")
async def payment_create(request: Request):
    """
    Body: { user_id: int, plan: "monthly" | "yearly" }
    Returns: { payment_id, checkout_url, amount }
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON format noto'g'ri")

    user_id = body.get("user_id")
    plan    = body.get("plan", "")

    if not user_id or plan not in pay.PLAN_PRICES:
        raise HTTPException(status_code=400, detail="user_id va plan (monthly/yearly) kerak")

    amount     = pay.PLAN_PRICES[plan]
    payment_id = pay.new_payment_id()

    try:
        await db.create_payment(payment_id, int(user_id), plan, amount)
    except Exception as e:
        logger.error(f"DB create_payment xatosi: {e}")
        raise HTTPException(status_code=500, detail="To'lov yaratishda xatolik")

    checkout_url = pay.build_checkout_url(payment_id, plan)
    logger.info(f"To'lov yaratildi: {payment_id} user={user_id} plan={plan}")
    return {"payment_id": payment_id, "checkout_url": checkout_url, "amount": amount}


# ─── Payment: Payme RPC callback ──────────────────────────────────────────────

@app.post("/api/payment/payme")
async def payment_payme(request: Request):
    """Payme JSON-RPC 2.0 callback endpoint."""
    authorization = request.headers.get("Authorization", "")
    if not pay.verify_payme_auth(authorization):
        return JSONResponse(
            status_code=401,
            content={"error": {"code": -32504, "message": {"uz": "Ruxsat yo'q", "ru": "Доступ запрещён", "en": "Unauthorized"}}},
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            content={"error": {"code": pay.PaymeError.PARSE_ERROR, "message": {"uz": "JSON xatosi", "ru": "Ошибка JSON", "en": "Parse error"}}}
        )

    rpc_id = body.get("id", 1)
    method = body.get("method", "")
    params = body.get("params", {})

    db_fns = {
        "get_payment":          db.get_payment,
        "get_payment_by_payme": db.get_payment_by_payme,
        "confirm_payment":      db.confirm_payment,
        "cancel_payment":       db.cancel_payment,
    }

    result = await pay.handle_rpc(method, params, db_fns)
    return JSONResponse({"jsonrpc": "2.0", "id": rpc_id, **result})


# ─── Payment: Status ──────────────────────────────────────────────────────────

@app.get("/api/payment/status/{payment_id}")
@limiter.limit("30/minute")
async def payment_status(request: Request, payment_id: str):
    """
    Returns: { status: "pending" | "paid" | "cancelled", plan, amount }
    """
    payment = await db.get_payment(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="To'lov topilmadi")
    return {
        "status":   payment["status"],
        "plan":     payment["plan"],
        "amount":   payment["amount"],
        "paid_at":  payment.get("completed_at"),
    }


# ─── User: Plan info ──────────────────────────────────────────────────────────

@app.get("/api/user/{user_id}/plan")
@limiter.limit("30/minute")
async def user_plan(request: Request, user_id: int):
    """
    Returns: { plan, plan_until, is_premium, usage_count }
    """
    user = await db.get_user(user_id)
    if not user:
        # Yangi foydalanuvchi — free plan
        return {"plan": "free", "plan_until": None, "is_premium": False, "usage_count": 0}
    premium = await db.is_premium(user_id)
    return {
        "plan":        user["plan"],
        "plan_until":  user["plan_until"],
        "is_premium":  premium,
        "usage_count": user["usage_count"],
    }


# ─── Admin: Stats ─────────────────────────────────────────────────────────────

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

@app.get("/api/stats")
async def admin_stats(request: Request):
    """
    Bearer token bilan himoyalangan admin statistikasi.
    Header: Authorization: Bearer <ADMIN_TOKEN>
    """
    if ADMIN_TOKEN:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or auth[7:] != ADMIN_TOKEN:
            raise HTTPException(status_code=403, detail="Ruxsat yo'q")
    stats = await db.get_stats()
    stats["uptime_seconds"] = int(time.time() - _start_time)
    return stats
