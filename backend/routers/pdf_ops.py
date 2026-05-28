# EduBot — PDF manipulation routes
# mergepdf, splitpdf, pdfpages, pdftext, pdflock, watermark, pdf2img, compresspdf

import io
import re
import asyncio
import functools
import zipfile
import secrets
import time
import tempfile

from fastapi import APIRouter, File, UploadFile, Form, Request, HTTPException
from fastapi.responses import Response, JSONResponse
from loguru import logger
from typing import Optional, List

from shared import limiter, _io_pool, check_size, safe_header, MAX_FILE_BYTES

router = APIRouter()

# ─── PDF: Merge ───────────────────────────────────────────────────────────────

_MERGEPDF_MAX_FILES = 30


def _do_mergepdf(data_list: list) -> tuple:
    import pikepdf

    out_pdf = pikepdf.new()
    page_count = 0
    for data in data_list:
        if data[:4] != b"%PDF":
            raise ValueError("Faqat PDF fayllar qabul qilinadi")
        try:
            src = pikepdf.open(io.BytesIO(data))
        except pikepdf.PasswordError:
            raise ValueError("Himoyalangan PDF birlashtirish uchun ochib bo'lmadi")
        out_pdf.pages.extend(src.pages)
        page_count += len(src.pages)
        src.close()
    buf = io.BytesIO()
    out_pdf.save(buf, linearize=True)
    out_pdf.close()
    info = f"{len(data_list)} fayl, {page_count} sahifa"
    return buf.getvalue(), info, page_count


@router.post("/api/mergepdf")
@limiter.limit("10/minute")
async def merge_pdf(request: Request, files: List[UploadFile] = File(...)):
    try:
        if len(files) > _MERGEPDF_MAX_FILES:
            raise HTTPException(status_code=400, detail=f"Maksimal {_MERGEPDF_MAX_FILES} fayl")
        data_list = []
        total = 0
        for f in files:
            data = await f.read()
            check_size(data, "/api/mergepdf")
            total += len(data)
            if total > MAX_FILE_BYTES * 3:
                raise HTTPException(status_code=413, detail="Fayllar jami hajmi juda katta")
            data_list.append(data)
        loop = asyncio.get_running_loop()
        try:
            out_bytes, info, _ = await asyncio.wait_for(
                loop.run_in_executor(_io_pool, _do_mergepdf, data_list),
                timeout=60.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="PDF birlashtirish vaqti tugadi")
        logger.info(f"mergepdf: {info}")
        return Response(
            content=out_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=merged.pdf",
                "X-Info": safe_header(info),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"mergepdf xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"mergepdf: {type(e).__name__}: {str(e)[:160]}")

# ─── PDF: Split ───────────────────────────────────────────────────────────────

_SPLITPDF_MAX_PAGES = 200


def _parse_page_ranges(pages_str: str, total: int) -> list:
    """Parse "1-5,8,10-15" → [0,1,2,3,4,7,9,10,11,12,13,14] (0-indexed)."""
    if not pages_str or not pages_str.strip():
        return list(range(total))
    result = set()
    for part in pages_str.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            start, end = int(a), int(b)
            if start > end:
                raise ValueError(f"Noto'g'ri diapazon: {a}-{b} (bosh > oxir)")
            result.update(range(start - 1, end))
        else:
            result.add(int(part) - 1)
    return sorted(x for x in result if 0 <= x < total)


def _do_splitpdf(data: bytes, page_indices: list) -> tuple:
    import pikepdf

    if data[:4] != b"%PDF":
        raise ValueError("PDF fayl emas")
    try:
        doc = pikepdf.open(io.BytesIO(data))
    except pikepdf.PasswordError:
        raise ValueError("PDF parol bilan himoyalangan")
    n = len(doc.pages)
    if n == 0:
        doc.close()
        raise ValueError("PDF sahifasiz")
    if len(page_indices) > _SPLITPDF_MAX_PAGES:
        doc.close()
        raise ValueError(f"Maksimal {_SPLITPDF_MAX_PAGES} sahifa ajratish mumkin")

    zf_buf = io.BytesIO()
    with zipfile.ZipFile(zf_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        pad = len(str(max(page_indices) + 1))
        for i in page_indices:
            out = pikepdf.new()
            out.pages.append(doc.pages[i])
            pb = io.BytesIO()
            out.save(pb, linearize=True)
            out.close()
            zf.writestr(f"page_{str(i + 1).zfill(pad)}.pdf", pb.getvalue())
    doc.close()
    return zf_buf.getvalue(), len(page_indices)


@router.post("/api/splitpdf")
@limiter.limit("10/minute")
async def split_pdf(
    request: Request,
    file: UploadFile = File(...),
    pages: Optional[str] = Form(None),
):
    try:
        data = await file.read()
        check_size(data, "/api/splitpdf")
        if data[:4] != b"%PDF" or b"%%EOF" not in data[-4096:]:
            raise HTTPException(status_code=422, detail="PDF fayl emas yoki fayl buzilgan.")
        import pikepdf as _pike_check
        try:
            _pdf_check = _pike_check.open(io.BytesIO(data))
        except _pike_check.PasswordError:
            raise HTTPException(status_code=422, detail="PDF parol bilan himoyalangan.")
        except Exception:
            raise HTTPException(status_code=422, detail="Bu fayl PDF emas.")
        total_n = len(_pdf_check.pages)
        _pdf_check.close()
        try:
            indices = _parse_page_ranges(pages, total_n)
        except Exception:
            raise HTTPException(status_code=400, detail="Sahifa oralig'i noto'g'ri. Format: 1-5,8,10-15")
        if not indices:
            raise HTTPException(status_code=400, detail="Sahifalar ro'yxati bo'sh")
        loop = asyncio.get_running_loop()
        try:
            zip_bytes, count = await asyncio.wait_for(
                loop.run_in_executor(_io_pool, _do_splitpdf, data, indices),
                timeout=45.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="PDF ajratish vaqti tugadi")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        info = f"{count} sahifa → {count} fayl"
        logger.info(f"splitpdf: {info}")
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": "attachment; filename=pages.zip",
                "X-Info": safe_header(info),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"splitpdf xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"splitpdf: {type(e).__name__}: {str(e)[:160]}")


# ─── PDF: Page selection ──────────────────────────────────────────────────────

@router.post("/api/pdfpages")
@limiter.limit("10/minute")
async def pdf_select_pages(
    request: Request,
    file: UploadFile = File(...),
    pages: str = Form(...),
):
    """Extract a subset of pages into a new PDF. pages = '1,3,5-10,15'"""
    try:
        data = await file.read()
        check_size(data, "/api/pdfpages")
        if data[:4] != b"%PDF":
            raise HTTPException(status_code=422, detail="Bu fayl PDF emas.")
        import pikepdf as _pike
        try:
            _pdf_tmp = _pike.open(io.BytesIO(data))
        except _pike.PasswordError:
            raise HTTPException(status_code=422, detail="PDF parol bilan himoyalangan.")
        except Exception:
            raise HTTPException(status_code=422, detail="Bu fayl PDF emas.")
        total_n = len(_pdf_tmp.pages)
        _pdf_tmp.close()
        try:
            indices = _parse_page_ranges(pages, total_n)
        except Exception:
            raise HTTPException(status_code=400, detail="Sahifa oralig'i noto'g'ri. Format: 1-5,8,10")
        if not indices:
            raise HTTPException(status_code=400, detail="Sahifalar ro'yxati bo'sh")

        def _extract():
            src = _pike.open(io.BytesIO(data))
            out = _pike.new()
            for i in indices:
                out.pages.append(src.pages[i])
            buf = io.BytesIO()
            out.save(buf, linearize=True)
            src.close()
            return buf.getvalue()

        loop = asyncio.get_running_loop()
        try:
            out_bytes = await asyncio.wait_for(
                loop.run_in_executor(_io_pool, _extract),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="Sahifa ajratish vaqti tugadi")
        info = f"{len(indices)} sahifa tanlandi (jami {total_n} dan)"
        return Response(
            content=out_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=selected.pdf",
                "X-Info": safe_header(info),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"pdfpages xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"pdfpages: {type(e).__name__}: {str(e)[:160]}")

# ─── PDF: Text extraction ─────────────────────────────────────────────────────

_PDFTEXT_MAX_PAGES = 50

def _do_pdftext(data: bytes) -> str:
    import fitz

    doc = fitz.open(stream=data, filetype="pdf")
    if doc.is_encrypted:
        doc.close()
        raise ValueError("PDF parol bilan himoyalangan.")
    n = doc.page_count
    if n == 0:
        doc.close()
        return "PDF bo'sh (0 sahifa)."

    render_n = min(n, _PDFTEXT_MAX_PAGES)
    parts = []
    for i in range(render_n):
        page_text = doc[i].get_text("text", sort=True).strip()
        if page_text:
            if n > 1:
                parts.append(f"── Sahifa {i + 1} ──")
            parts.append(page_text)
    doc.close()

    result = re.sub(r'\n{3,}', '\n\n', "\n\n".join(parts)).strip()

    if not result:
        try:
            import pdfplumber
            pb_parts = []
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                for i, page in enumerate(pdf.pages[:render_n]):
                    text = page.extract_text() or ""
                    tables = page.extract_tables() or []
                    for table in tables:
                        text += "\n" + "\n".join(
                            " | ".join(str(c or "").strip() for c in row)
                            for row in table if any(c for c in row)
                        )
                    if text.strip():
                        if n > 1:
                            pb_parts.append(f"── Sahifa {i + 1} ──")
                        pb_parts.append(text.strip())
            result = re.sub(r'\n{3,}', '\n\n', "\n\n".join(pb_parts)).strip()
        except Exception:
            pass

    if not result:
        return ("❌ Matn topilmadi. Bu skanerlangan PDF bo'lishi mumkin — "
                "OCR xizmatidan foydalaning.")
    if n > _PDFTEXT_MAX_PAGES:
        result += (f"\n\n⚠️ Faqat birinchi {_PDFTEXT_MAX_PAGES} sahifa ko'rsatildi "
                   f"(PDF jami {n} sahifali).")
    return result

@router.post("/api/pdftext")
@limiter.limit("20/minute")
async def pdf_text(request: Request, file: UploadFile = File(...)):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/pdftext")
        if data[:4] != b'%PDF':
            raise HTTPException(status_code=422, detail="Bu fayl PDF emas.")
        loop = asyncio.get_running_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(_io_pool, _do_pdftext, data),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail="Matn ajratish 30 soniyadan oshdi. Kichikroq PDF tanlang.")
        logger.info(f"pdftext: {len(result)} belgi, {time.time()-t0:.1f}s")
        return JSONResponse({"result": result, "text": result})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"pdftext xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"pdftext: {type(e).__name__}: {str(e)[:160]}")

# ─── PDF: Lock ────────────────────────────────────────────────────────────────

def _do_pdflock(data: bytes, user_pwd: str, owner_pwd: str,
                allow_print: bool, allow_copy: bool, allow_modify: bool) -> tuple:
    import pikepdf

    try:
        doc = pikepdf.open(io.BytesIO(data))
    except pikepdf.PasswordError:
        raise ValueError("PDF allaqachon parol bilan himoyalangan.")
    n = len(doc.pages)
    if n == 0:
        doc.close()
        raise ValueError("PDF bo'sh (0 sahifa).")
    if n > 200:
        doc.close()
        raise ValueError(f"PDF {n} sahifa. Maksimal 200 sahifa qabul qilinadi.")

    enc = pikepdf.Encryption(
        owner=owner_pwd,
        user=user_pwd,
        aes=True,
        allow=pikepdf.Permissions(
            print_lowres=allow_print,
            print_highres=allow_print,
            extract=allow_copy,
            modify_other=allow_modify,
            modify_annotation=allow_modify,
        ),
    )
    buf = io.BytesIO()
    doc.save(buf, encryption=enc, linearize=True)
    doc.close()

    perms = []
    if allow_print:  perms.append("chop")
    if allow_copy:   perms.append("nusxa")
    if allow_modify: perms.append("tahrir")
    perm_str = ", ".join(perms) if perms else "faqat o'qish"
    info = f"{n} sahifa • AES-256 • {perm_str}"
    return buf.getvalue(), info


@router.post("/api/pdflock")
@limiter.limit("15/minute")
async def lock_pdf(
    request: Request,
    file: UploadFile = File(...),
    password: str = Form(""),
    allow_print: bool = Form(True),
    allow_copy: bool = Form(False),
    allow_modify: bool = Form(False),
):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/pdflock")
        if data[:4] != b'%PDF':
            raise HTTPException(status_code=422, detail="Bu fayl PDF emas.")
        raw_pwd   = password.strip()[:64]
        user_pwd  = raw_pwd if raw_pwd else ""
        owner_pwd = secrets.token_urlsafe(16)
        display_pwd = raw_pwd if raw_pwd else "no-password-required"
        loop = asyncio.get_running_loop()
        try:
            out_bytes, info = await asyncio.wait_for(
                loop.run_in_executor(
                    _io_pool,
                    functools.partial(_do_pdflock, data, user_pwd, owner_pwd,
                                      allow_print, allow_copy, allow_modify),
                ),
                timeout=45.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail="Parol qo'yish 45 soniyadan oshdi. Kichikroq fayl tanlang.")
        logger.info(f"pdflock: {len(data)//1024}KB, {info}, {time.time()-t0:.1f}s")
        import base64 as _b64
        pwd_b64 = _b64.b64encode(display_pwd.encode("utf-8")).decode("ascii")
        return Response(
            content=out_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=locked.pdf",
                "X-Password-B64": pwd_b64,
                "X-Info": safe_header(info),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"pdflock xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"pdflock: {type(e).__name__}: {str(e)[:160]}")

# ─── PDF: Watermark ───────────────────────────────────────────────────────────

_wm_font_cached: str = ""

def _get_wm_font() -> str:
    global _wm_font_cached
    if _wm_font_cached:
        return _wm_font_cached
    import os as _os
    _DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    if _os.path.exists(_DEJAVU):
        try:
            from reportlab.pdfbase import pdfmetrics as _pm
            from reportlab.pdfbase.ttfonts import TTFont as _TTF
            _pm.registerFont(_TTF("DejaVuSans-Bold", _DEJAVU))
            _wm_font_cached = "DejaVuSans-Bold"
            return _wm_font_cached
        except Exception:
            pass
    _wm_font_cached = "Helvetica-Bold"
    return _wm_font_cached


def _make_wm_page(pw: float, ph: float, text: str,
                   opacity: float = 0.22, angle: int = 42, repeat: bool = True):
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.colors import Color
    from pypdf import PdfReader as _PR

    font_size = max(20, min(56, int(pw * 0.07)))
    spacing = max(pw, ph) * 0.38

    wm_buf = io.BytesIO()
    c = rl_canvas.Canvas(wm_buf, pagesize=(pw, ph))
    c.saveState()
    c.translate(pw / 2, ph / 2)
    c.rotate(angle)
    c.setFillColor(Color(0.5, 0.5, 0.5, alpha=max(0.05, min(0.9, opacity))))
    c.setFont(_get_wm_font(), font_size)
    offsets = (-spacing, 0, spacing) if repeat else (0,)
    for offset in offsets:
        c.drawCentredString(0, offset, text)
    c.restoreState()
    c.save()
    return _PR(io.BytesIO(wm_buf.getvalue())).pages[0]

def _do_watermark(data: bytes, wm_text: str,
                  opacity: float = 0.22, angle: int = 42, repeat: bool = True) -> tuple:
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
            wm_cache[key] = _make_wm_page(pw, ph, text, opacity, angle, repeat)
        page.merge_page(wm_cache[key])
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    info = f"{n} sahifa • \"{text}\" watermark • {int(opacity*100)}% shaffof"
    return out.getvalue(), info


@router.post("/api/watermark")
@limiter.limit("15/minute")
async def watermark_pdf(
    request: Request,
    file: UploadFile = File(...),
    text: str = Form(""),
    opacity: float = Form(0.22),
    angle: int = Form(42),
    repeat: bool = Form(True),
):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/watermark")
        if data[:4] != b'%PDF':
            raise HTTPException(status_code=422, detail="Bu fayl PDF emas.")
        opacity = max(0.05, min(0.9, opacity))
        angle   = angle % 360
        loop = asyncio.get_running_loop()
        try:
            out_bytes, info = await asyncio.wait_for(
                loop.run_in_executor(
                    _io_pool,
                    functools.partial(_do_watermark, data, text, opacity, angle, repeat),
                ),
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
                "X-Info": safe_header(info),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"watermark xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"watermark: {type(e).__name__}: {str(e)[:160]}")

# ─── PDF: To image ────────────────────────────────────────────────────────────

_PDF2IMG_MAX_PAGES = 25
_PDF2IMG_VALID_DPI = {72, 96, 150, 300}
_PDF2IMG_VALID_FMT = {"png", "jpeg", "webp"}


def _do_pdf2img(data: bytes, dpi: int = 150, fmt: str = "png", quality: int = 85) -> tuple:
    import fitz

    dpi     = dpi if dpi in _PDF2IMG_VALID_DPI else 150
    fmt     = fmt if fmt in _PDF2IMG_VALID_FMT else "png"
    quality = max(50, min(95, quality))
    zoom    = dpi / 72
    mat     = fitz.Matrix(zoom, zoom)
    ext     = "jpg" if fmt == "jpeg" else fmt

    doc = fitz.open(stream=data, filetype="pdf")
    if doc.is_encrypted:
        doc.close()
        raise ValueError("PDF parol bilan himoyalangan. Avval parolini oching.")
    total_pages = doc.page_count
    if total_pages == 0:
        doc.close()
        raise ValueError("PDF bo'sh (0 sahifa).")

    render_n  = min(total_pages, _PDF2IMG_MAX_PAGES)
    truncated = total_pages > _PDF2IMG_MAX_PAGES

    if render_n == 1:
        pix       = doc[0].get_pixmap(matrix=mat, alpha=False)
        img_bytes = pix.tobytes(fmt, jpg_quality=quality) if fmt != "png" else pix.tobytes("png")
        doc.close()
        media = f"image/{fmt}"
        info  = f"✅ 1 sahifa · {dpi} DPI · {fmt.upper()}"
        return img_bytes, info, media, f"page_1.{ext}"

    padding = len(str(render_n))
    zf_buf  = io.BytesIO()
    total_size = 0
    zip_mode = zipfile.ZIP_STORED if fmt == "png" else zipfile.ZIP_DEFLATED
    with zipfile.ZipFile(zf_buf, "w", zip_mode) as zf:
        for i in range(render_n):
            pix       = doc[i].get_pixmap(matrix=mat, alpha=False)
            img_bytes = pix.tobytes(fmt, jpg_quality=quality) if fmt != "png" else pix.tobytes("png")
            total_size += len(img_bytes)
            zf.writestr(f"page_{str(i + 1).zfill(padding)}.{ext}", img_bytes)
            del pix
    doc.close()

    avg_kb     = total_size // 1024 // render_n if render_n else 0
    info_parts = [f"✅ {render_n} sahifa · {dpi} DPI · {fmt.upper()} · ~{avg_kb} KB/sahifa"]
    if truncated:
        info_parts.append(f"⚠️ Faqat {_PDF2IMG_MAX_PAGES} sahifa (PDF jami {total_pages})")
    return zf_buf.getvalue(), " · ".join(info_parts), "application/zip", "pages.zip"


@router.post("/api/pdf2img")
@limiter.limit("10/minute")
async def pdf_to_img(
    request: Request,
    file: UploadFile = File(...),
    dpi: int = Form(150),
    fmt: str = Form("png"),
    quality: int = Form(85),
):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/pdf2img")

        loop = asyncio.get_running_loop()
        try:
            content, info, media_type, filename = await asyncio.wait_for(
                loop.run_in_executor(
                    _io_pool,
                    functools.partial(_do_pdf2img, data, dpi, fmt, quality),
                ),
                timeout=90.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail=f"Konversiya 90 soniyadan oshdi — maksimal {_PDF2IMG_MAX_PAGES} sahifa.")

        logger.info(f"pdf2img: {len(data)//1024}KB → {len(content)//1024}KB, {time.time()-t0:.1f}s")
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "X-Info": safe_header(info),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"pdf2img xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"pdf2img: {type(e).__name__}: {str(e)[:160]}")

# ─── PDF: Compress ────────────────────────────────────────────────────────────

_COMPRESSPDF_LEVELS = {
    "screen":   (52,  96),
    "ebook":    (65, 110),
    "printer":  (82, 150),
    "prepress": (92, 200),
}


def _do_compresspdf(data: bytes, level: str = "ebook") -> tuple:
    import fitz, subprocess, os as _os

    orig_size = len(data)

    _GS_SETTINGS = {
        "screen":   "/screen",
        "ebook":    "/ebook",
        "printer":  "/printer",
        "prepress": "/prepress",
    }
    gs_level = _GS_SETTINGS.get(level, "/ebook")
    fin_path = fout_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fin:
            fin.write(data)
            fin_path = fin.name
        fout_path = fin_path.replace(".pdf", "_gs_out.pdf")
        proc = subprocess.run(
            ["gs", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pdfwrite",
             f"-dPDFSETTINGS={gs_level}", "-dCompatibilityLevel=1.6",
             f"-sOutputFile={fout_path}", fin_path],
            timeout=60, capture_output=True,
        )
        if proc.returncode == 0 and _os.path.exists(fout_path):
            with open(fout_path, "rb") as _gs_f:
                gs_bytes = _gs_f.read()
            if len(gs_bytes) < orig_size:
                saved = max(0, round((1 - len(gs_bytes) / orig_size) * 100))
                _gs_doc = fitz.open(stream=gs_bytes, filetype="pdf")
                try:
                    n_gs = _gs_doc.page_count
                finally:
                    _gs_doc.close()
                return (gs_bytes,
                        f"{n_gs} sahifa • {orig_size // 1024} KB → {len(gs_bytes) // 1024} KB"
                        f" • {saved}% tejaldi (Ghostscript {level})",
                        saved)
    except Exception:
        pass
    finally:
        for _p in (fin_path, fout_path):
            if _p and _os.path.exists(_p):
                try: _os.unlink(_p)
                except Exception: pass

    doc = fitz.open(stream=data, filetype="pdf")
    n = doc.page_count

    if n == 0:
        doc.close()
        raise ValueError("PDF bo'sh (0 sahifa).")
    if n > 100:
        doc.close()
        raise ValueError(f"PDF {n} sahifa. Maksimal 100 sahifa qabul qilinadi.")

    sample_chars = sum(len(doc[i].get_text()) for i in range(min(3, n)))
    is_text_pdf = sample_chars > 150

    try:
        doc.scrub()
    except Exception:
        pass
    buf_a = io.BytesIO()
    doc.save(buf_a, garbage=4, deflate=True, clean=True)
    doc.close()
    result_a = buf_a.getvalue()

    result_b = None
    if not is_text_pdf:
        if level in _COMPRESSPDF_LEVELS:
            quality, dpi = _COMPRESSPDF_LEVELS[level]
        else:
            orig_mb = orig_size / (1024 * 1024)
            if orig_mb > 5:
                quality, dpi = 52, 96
            elif orig_mb > 2:
                quality, dpi = 62, 110
            else:
                quality, dpi = 72, 130
        zoom = dpi / 72
        mat  = fitz.Matrix(zoom, zoom)

        doc2    = fitz.open(stream=data, filetype="pdf")
        out_doc = fitz.open()
        for page in doc2:
            pix       = page.get_pixmap(matrix=mat, alpha=False)
            img_bytes = pix.tobytes("jpeg", jpg_quality=quality)
            del pix
            new_page = out_doc.new_page(width=page.rect.width, height=page.rect.height)
            new_page.insert_image(new_page.rect, stream=img_bytes)
        doc2.close()
        buf_b    = io.BytesIO()
        out_doc.save(buf_b, garbage=4, deflate=True)
        result_b = buf_b.getvalue()

    if result_b is not None and len(result_b) < len(result_a):
        out = result_b
        method = "rasterize"
    else:
        out = result_a
        method = "deflate"

    if len(out) >= orig_size:
        out    = data
        method = "original"

    saved = max(0, round((1 - len(out) / orig_size) * 100))
    info  = (f"{n} sahifa • {orig_size // 1024} KB → {len(out) // 1024} KB"
             f" • {saved}% tejaldi"
             + (" (matn saqlanadi)" if method == "deflate" else ""))
    return out, info, saved

@router.post("/api/compresspdf")
@limiter.limit("10/minute")
async def compress_pdf(
    request: Request,
    file: UploadFile = File(...),
    level: str = Form("ebook"),
):
    t0 = time.time()
    try:
        data = await file.read()
        check_size(data, "/api/compresspdf")
        if data[:4] != b'%PDF':
            raise HTTPException(status_code=422, detail="Bu fayl PDF emas.")
        if level not in _COMPRESSPDF_LEVELS:
            level = "ebook"
        loop = asyncio.get_running_loop()
        fn = functools.partial(_do_compresspdf, data, level)
        try:
            out_bytes, info, saved = await asyncio.wait_for(
                loop.run_in_executor(_io_pool, fn),
                timeout=60.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408,
                detail="Siqish 60 soniyadan oshdi. Kichikroq fayl yoki kamroq sahifa tanlang.")
        logger.info(f"compresspdf: {info}, {time.time()-t0:.1f}s")
        return Response(
            content=out_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=compressed.pdf",
                "X-Saved-Percent": str(saved),
                "X-Info": safe_header(info),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"compresspdf xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500,
            detail=f"compresspdf: {type(e).__name__}: {str(e)[:160]}")
