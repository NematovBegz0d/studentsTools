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
import zipfile
import tempfile
import httpx
import sys
from datetime import datetime

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
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

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

@app.post("/api/pdflock")
@limiter.limit("15/minute")
async def lock_pdf(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        from pypdf import PdfReader, PdfWriter
        data = await file.read()
        check_size(data, "/api/pdflock")
        password = "EduBot123"
        reader = PdfReader(io.BytesIO(data))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.encrypt(password)
        out = io.BytesIO()
        writer.write(out)
        logger.info(f"pdflock: {time.time()-t0:.1f}s")
        return Response(content=out.getvalue(), media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=locked.pdf",
                                 "X-Password": password})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── PDF: Watermark ───────────────────────────────────────────────────────────

@app.post("/api/watermark")
@limiter.limit("15/minute")
async def watermark_pdf(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        from pypdf import PdfReader, PdfWriter
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.lib.colors import Color

        data = await file.read()
        check_size(data, "/api/watermark")
        reader = PdfReader(io.BytesIO(data))
        page0 = reader.pages[0]
        pw = float(page0.mediabox.width)
        ph = float(page0.mediabox.height)

        wm_buf = io.BytesIO()
        c = rl_canvas.Canvas(wm_buf, pagesize=(pw, ph))
        c.saveState()
        c.translate(pw / 2, ph / 2)
        c.rotate(45)
        c.setFillColor(Color(0.6, 0.6, 0.6, alpha=0.22))
        c.setFont("Helvetica-Bold", 52)
        c.drawCentredString(0, 0, "EduBot")
        c.restoreState()
        c.save()

        from pypdf import PdfReader as PR2
        wm_page = PR2(io.BytesIO(wm_buf.getvalue())).pages[0]
        writer = PdfWriter()
        for page in reader.pages:
            page.merge_page(wm_page)
            writer.add_page(page)
        out = io.BytesIO()
        writer.write(out)
        logger.info(f"watermark: {time.time()-t0:.1f}s")
        return Response(content=out.getvalue(), media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=watermarked.pdf"})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"watermark xato: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── PDF: To image ────────────────────────────────────────────────────────────

@app.post("/api/pdf2img")
@limiter.limit("10/minute")
async def pdf_to_img(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        import fitz
        data = await file.read()
        check_size(data, "/api/pdf2img")
        doc = fitz.open(stream=data, filetype="pdf")
        mat = fitz.Matrix(2, 2)
        zf_buf = io.BytesIO()
        with zipfile.ZipFile(zf_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for i, page in enumerate(doc, 1):
                pix = page.get_pixmap(matrix=mat, alpha=False)
                zf.writestr(f"page_{i}.png", pix.tobytes("png"))
        logger.info(f"pdf2img: {doc.page_count} sahifa, {time.time()-t0:.1f}s")
        return Response(content=zf_buf.getvalue(), media_type="application/zip",
                        headers={"Content-Disposition": "attachment; filename=pages.zip"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
            cv.convert(docx_path)
            cv.close()
            with open(docx_path, "rb") as f:
                out = f.read()
            logger.info(f"pdf2docx: {len(data)//1024}KB → {len(out)//1024}KB, {time.time()-t0:.1f}s")
            return Response(content=out,
                            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            headers={"Content-Disposition": "attachment; filename=converted.docx"})
        finally:
            if os.path.exists(pdf_path): os.unlink(pdf_path)
            if os.path.exists(docx_path): os.unlink(docx_path)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

@app.post("/api/docx2pdf")
@limiter.limit("10/minute")
async def docx_to_pdf(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        import mammoth
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm

        data = await file.read()
        check_size(data, "/api/docx2pdf")
        fn, fn_bold = _rl_fonts()

        result = mammoth.convert_to_html(io.BytesIO(data))
        # Strip HTML tags to get readable text with basic structure
        html = result.value
        import re as _re
        # Convert headings
        html = _re.sub(r'<h[1-3][^>]*>(.*?)</h[1-3]>', r'\n### \1\n', html, flags=_re.DOTALL)
        html = _re.sub(r'<li[^>]*>(.*?)</li>', r'\n• \1', html, flags=_re.DOTALL)
        html = _re.sub(r'<p[^>]*>(.*?)</p>', r'\1\n', html, flags=_re.DOTALL)
        html = _re.sub(r'<br\s*/?>', '\n', html)
        html = _re.sub(r'<[^>]+>', '', html)
        import html as _html
        text = _html.unescape(html)

        out = io.BytesIO()
        doc = SimpleDocTemplate(out, pagesize=A4,
                                leftMargin=2*cm, rightMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        h_style = ParagraphStyle('h', fontName=fn_bold, fontSize=14, spaceAfter=6, spaceBefore=10)
        p_style = ParagraphStyle('p', fontName=fn, fontSize=11, leading=16, spaceAfter=6)

        story = []
        for line in text.split('\n'):
            s = line.strip()
            if not s:
                story.append(Spacer(1, 6))
            elif s.startswith('###'):
                story.append(Paragraph(s[3:].strip(), h_style))
            else:
                story.append(Paragraph(s, p_style))
        doc.build(story)
        pdf_bytes = out.getvalue()
        logger.info(f"docx2pdf: {len(data)//1024}KB → {len(pdf_bytes)//1024}KB, {time.time()-t0:.1f}s")
        return Response(content=pdf_bytes, media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=document.pdf"})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"docx2pdf xato: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── Image → PDF ──────────────────────────────────────────────────────────────

@app.post("/api/img2pdf")
@limiter.limit("20/minute")
async def img_to_pdf(request: Request, file: UploadFile = File(...)):
    try:
        from PIL import Image
        data = await file.read()
        check_size(data, "/api/img2pdf")
        img = Image.open(io.BytesIO(data)).convert("RGB")
        out = io.BytesIO()
        img.save(out, format="PDF", resolution=150)
        return Response(content=out.getvalue(), media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=image.pdf"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Images → PDF ─────────────────────────────────────────────────────────────

@app.post("/api/imgs2pdf")
@limiter.limit("10/minute")
async def imgs_to_pdf(request: Request, files: List[UploadFile] = File(...)):
    try:
        from PIL import Image
        images = []
        for f in files:
            data = await f.read()
            images.append(Image.open(io.BytesIO(data)).convert("RGB"))
        if not images:
            raise HTTPException(status_code=400, detail="Rasm yuklanmadi")
        out = io.BytesIO()
        images[0].save(out, format="PDF", save_all=True, append_images=images[1:], resolution=150)
        return Response(content=out.getvalue(), media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=images.pdf"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Excel → PDF ──────────────────────────────────────────────────────────────

@app.post("/api/xlsx2pdf")
@limiter.limit("10/minute")
async def xlsx_to_pdf(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        from openpyxl import load_workbook
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.lib import colors

        data = await file.read()
        check_size(data, "/api/xlsx2pdf")
        fn, fn_bold = _rl_fonts()
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)

        out = io.BytesIO()
        doc = SimpleDocTemplate(out, pagesize=A4,
                                leftMargin=1*cm, rightMargin=1*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        title_st = ParagraphStyle('t', fontName=fn_bold, fontSize=13, spaceAfter=8, spaceBefore=4)
        story = []
        for i, name in enumerate(wb.sheetnames):
            if i > 0:
                story.append(PageBreak())
            story.append(Paragraph(name, title_st))
            ws = wb[name]
            rows = list(ws.iter_rows(values_only=True, max_row=300, max_col=20))
            if not rows:
                continue
            table_data = [[str(v) if v is not None else '' for v in row] for row in rows]
            col_n = max(len(r) for r in table_data)
            col_w = (A4[0] - 2*cm) / col_n if col_n else A4[0]
            t = Table(table_data, colWidths=[col_w]*col_n, repeatRows=1)
            t.setStyle(TableStyle([
                ('FONTNAME', (0,0), (-1,-1), fn),
                ('FONTNAME', (0,0), (-1,0), fn_bold),
                ('FONTSIZE', (0,0), (-1,-1), 8),
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e8e8e8')),
                ('GRID', (0,0), (-1,-1), 0.4, colors.HexColor('#cccccc')),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8f8f8')]),
                ('TOPPADDING', (0,0), (-1,-1), 3),
                ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ]))
            story.append(t)
        doc.build(story)
        logger.info(f"xlsx2pdf: {time.time()-t0:.1f}s")
        return Response(content=out.getvalue(), media_type="application/pdf",
                        headers={"Content-Disposition": "attachment; filename=spreadsheet.pdf"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        logger.info(f"ocr: {len(data)//1024}KB → {len(text)} belgi, {time.time()-t0:.1f}s")
        return JSONResponse({"text": text.strip() or "Matn topilmadi"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
