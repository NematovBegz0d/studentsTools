"""
Rasm(lar) → PDF — professional darajada
=========================================
Format: JPEG (lossless), PNG, WebP, GIF, BMP, TIFF, HEIC/HEIF, AVIF
Page: A4, A3, A5, Letter, Legal, original
Mode: fit/fill/center, margin 0-30mm, DPI 72/96/150/300
Modes:
  - normal     — oddiy PDF
  - document   — auto-enhance: deskew + contrast + denoise (skan qog'oz uchun)
  - searchable — OCR text layer qo'shilgan (qidirish mumkin)
"""
from __future__ import annotations

import io
from PIL import Image, ImageOps

# ─── HEIC/HEIF (iPhone) qo'llab-quvvatlash ────────────────────────────────────
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    _HAS_HEIC = True
except ImportError:
    _HAS_HEIC = False

# ─── AVIF qo'llab-quvvatlash ──────────────────────────────────────────────────
try:
    import pillow_avif  # noqa: F401  (registers AVIF opener on import)
    _HAS_AVIF = True
except ImportError:
    _HAS_AVIF = False

try:
    import img2pdf as _img2pdf_lib
    _MM = _img2pdf_lib.mm_to_pt
    _HAS_IMG2PDF = True
except ImportError:
    _img2pdf_lib = None  # type: ignore
    _MM = lambda mm: mm * 2.8346  # fallback: mm → pt
    _HAS_IMG2PDF = False

# ─── Sahifa o'lchamlari (pt) ──────────────────────────────────────────────────

PAGE_SIZES: dict[str, tuple[float, float]] = {
    "a4":     (_MM(210),   _MM(297)),
    "a3":     (_MM(297),   _MM(420)),
    "a5":     (_MM(148),   _MM(210)),
    "letter": (_MM(215.9), _MM(279.4)),
    "legal":  (_MM(215.9), _MM(355.6)),
}

# img2pdf shorthand for use inside functions
def _get_img2pdf():
    if not _HAS_IMG2PDF:
        raise ImportError("img2pdf o'rnatilmagan. requirements.txt ga qo'shing.")
    return _img2pdf_lib

VALID_PAGES = set(PAGE_SIZES) | {"original"}
VALID_FITS  = {"fit", "fill", "center"}
VALID_DPIS  = {72, 96, 150, 300}

MAGIC = (
    b'\xff\xd8\xff',        # JPEG
    b'\x89PNG',             # PNG
    b'RIFF',                # WebP
    b'GIF8',                # GIF
    b'II*\x00', b'MM\x00*', # TIFF
    b'BM',                  # BMP
)

# HEIC/HEIF/AVIF: 4-7 baytda "ftyp" + 8-11 baytda brand
_HEIC_BRANDS = (b'heic', b'heix', b'mif1', b'msf1', b'heim', b'hevc', b'hevx')
_AVIF_BRANDS = (b'avif', b'avis')


# ─── Parametr tekshirish ──────────────────────────────────────────────────────

def validate_params(
    page_size: str, margin_mm: float, fit_mode: str, dpi: int
) -> tuple[str, float, str, int]:
    page_size = page_size.lower() if page_size.lower() in VALID_PAGES else "a4"
    fit_mode  = fit_mode.lower()  if fit_mode.lower()  in VALID_FITS  else "fit"
    dpi       = dpi if dpi in VALID_DPIS else 150
    margin_mm = max(0.0, min(30.0, float(margin_mm)))
    return page_size, margin_mm, fit_mode, dpi


def is_image_bytes(data: bytes) -> bool:
    if any(data[:len(s)] == s for s in MAGIC):
        return True
    # HEIC/HEIF/AVIF — faqat decoder o'rnatilgan bo'lsa qabul qilamiz
    if len(data) >= 12 and data[4:8] == b'ftyp':
        brand = data[8:12]
        if brand in _HEIC_BRANDS and _HAS_HEIC:
            return True
        if brand in _AVIF_BRANDS and _HAS_AVIF:
            return True
    return False


def detect_format(data: bytes) -> str:
    """JPEG/PNG/WEBP/GIF/TIFF/BMP/HEIC/AVIF/UNKNOWN qaytaradi."""
    if data[:3] == b'\xff\xd8\xff': return "JPEG"
    if data[:4] == b'\x89PNG':      return "PNG"
    if data[:4] == b'RIFF':         return "WEBP"
    if data[:4] == b'GIF8':         return "GIF"
    if data[:4] in (b'II*\x00', b'MM\x00*'): return "TIFF"
    if data[:2] == b'BM':           return "BMP"
    if len(data) >= 12 and data[4:8] == b'ftyp':
        brand = data[8:12]
        if brand in _HEIC_BRANDS: return "HEIC"
        if brand in _AVIF_BRANDS: return "AVIF"
    return "UNKNOWN"


# ─── Rasm tayyorlash ──────────────────────────────────────────────────────────

def _document_enhance(img: Image.Image) -> Image.Image:
    """
    Skan hujjat uchun auto-enhance: deskew + auto-contrast + denoise.
    Katta rasmlarda performans uchun:
      - deskew: kichraytirilgan nusxada qiyalik topish, asl rasmga qo'llash
      - denoise: faqat <2000px tomonli rasmlarda (aks holda juda sekin)
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return img  # OpenCV yo'q bo'lsa, originalni qaytaradi

    arr = np.array(img.convert("RGB"))
    h, w = arr.shape[:2]
    max_dim = max(h, w)

    # 1. Deskew — kichraytirilgan rasmda topib, originalga qo'llaymiz
    try:
        # Deskew uchun maks 1500px gacha kichraytirish
        if max_dim > 1500:
            scale = 1500 / max_dim
            small = cv2.resize(arr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        else:
            small = arr

        gray_s = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
        _, bw = cv2.threshold(gray_s, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Coords yiqilishi xavfini oldini olish — random sample
        ys, xs = np.where(bw > 0)
        if len(ys) > 100:
            # Maks 50K nuqta — minAreaRect uchun yetarli
            if len(ys) > 50000:
                idx = np.random.choice(len(ys), 50000, replace=False)
                ys, xs = ys[idx], xs[idx]
            coords = np.column_stack((xs, ys))  # (x, y) format
            angle = cv2.minAreaRect(coords)[-1]
            if angle < -45:
                angle = 90 + angle
            else:
                angle = -angle
            # Faqat sezilarli qiyalik (>0.5°), lekin <15° (>15° — boshqa problem)
            if 0.5 < abs(angle) < 15:
                M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
                arr = cv2.warpAffine(arr, M, (w, h),
                                     flags=cv2.INTER_CUBIC,
                                     borderMode=cv2.BORDER_REPLICATE)
    except Exception:
        pass

    # 2. Denoise — faqat kichik rasmlarda (katta rasmlarda 60+ soniya oladi)
    if max_dim < 2000:
        try:
            arr = cv2.fastNlMeansDenoisingColored(arr, None, 5, 5, 7, 15)
        except Exception:
            pass

    # 3. Auto-contrast — har holatda tezroq va silliqroq
    out = Image.fromarray(arr)
    out = ImageOps.autocontrast(out, cutoff=1)
    return out


def _prepare_single(data: bytes, max_px: int = 6000, mode: str = "normal") -> bytes:
    """
    Rasmni img2pdf uchun tayyorlaydi.
    mode='normal'   → JPEG lossless agar imkon bo'lsa
    mode='document' → auto-enhance (deskew + contrast + denoise) → JPEG
    """
    probe = Image.open(io.BytesIO(data))
    fmt   = (probe.format or "").upper()
    probe.close()

    # JPEG lossless: faqat 'normal' rejimda, EXIF rotatsiya bo'lmaganda
    if fmt == "JPEG" and mode == "normal":
        img = Image.open(io.BytesIO(data))
        original_size = img.size
        # ✅ Pillow 10+: _getexif() o'rniga getexif() (public API)
        has_exif = bool(img.getexif())
        transposed = ImageOps.exif_transpose(img)
        # exif_transpose yangi obyekt qaytarganda eski referensni yopish
        if transposed is not img:
            img.close()
            img = transposed
        if not has_exif and img.size == original_size:
            img.close()
            return data  # hech narsa o'zgarmadi — lossless
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=95, optimize=True, subsampling=0)
        img.close()
        return buf.getvalue()

    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)

    w, h = img.size
    if max(w, h) > max_px:
        r = max_px / max(w, h)
        img = img.resize((int(w * r), int(h * r)), Image.LANCZOS)

    # Alpha → oq fon
    if img.mode in ("RGBA", "LA", "PA"):
        if img.mode == "PA":
            img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Document mode → auto-enhance
    if mode == "document":
        img = _document_enhance(img)

    buf = io.BytesIO()
    quality = 92 if mode == "document" else 95
    img.save(buf, format="JPEG", quality=quality, optimize=True, subsampling=0)
    return buf.getvalue()


def _tiff_frames(data: bytes) -> list[bytes]:
    """Ko'p sahifali TIFF → JPEG list."""
    frames = []
    img = Image.open(io.BytesIO(data))
    try:
        while True:
            f = ImageOps.exif_transpose(img.copy())
            if f.mode in ("RGBA", "LA", "PA"):
                bg = Image.new("RGB", f.size, (255, 255, 255))
                bg.paste(f, mask=f.split()[-1])
                f = bg
            elif f.mode != "RGB":
                f = f.convert("RGB")
            buf = io.BytesIO()
            f.save(buf, format="JPEG", quality=95, optimize=True)
            frames.append(buf.getvalue())
            img.seek(img.tell() + 1)
    except EOFError:
        pass
    return frames


def _gif_frames(data: bytes, max_frames: int = 30) -> list[bytes]:
    """Animatsiyali GIF → JPEG list (maks 30 kadr)."""
    frames = []
    gif = Image.open(io.BytesIO(data))
    try:
        while len(frames) < max_frames:
            f = gif.copy().convert("RGB")
            buf = io.BytesIO()
            f.save(buf, format="JPEG", quality=90)
            frames.append(buf.getvalue())
            gif.seek(gif.tell() + 1)
    except EOFError:
        pass
    return frames or [data]


# ─── OCR text layer (searchable PDF) ─────────────────────────────────────────

# Unicode font (Cyrillic, Uzbek lotin/kirill, Latin) uchun
_OCR_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
_OCR_FONT_NAME = "dvocr"


def _add_ocr_text_layer(pdf_bytes: bytes, prepared_images: list[bytes]) -> bytes:
    """
    PDF sahifalariga ko'rinmas OCR matn qatlamini qo'shadi.
    Natija: rasm aynan o'zicha qoladi, lekin matn qidirish/copy mumkin.
    Unicode (Kirill, O'zbek, Lotin) qo'llab-quvvatlanadi — DejaVu TTF.
    """
    try:
        import os as _os
        import fitz
        import pytesseract
        from PIL import Image as PILImage
    except ImportError:
        return pdf_bytes  # fallback: oddiy PDF

    has_unicode_font = _os.path.exists(_OCR_FONT_PATH)

    pdf = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if len(pdf) != len(prepared_images):
            # Sahifa va rasm soni mos kelmasa, OCR'siz qaytar
            return pdf_bytes

        for page_idx, img_bytes in enumerate(prepared_images):
            try:
                img = PILImage.open(io.BytesIO(img_bytes))
                page = pdf[page_idx]
                page_w = page.rect.width
                page_h = page.rect.height
                img_w, img_h = img.size

                # Har sahifaga Unicode font o'rnatish (DejaVu)
                if has_unicode_font:
                    try:
                        page.insert_font(fontname=_OCR_FONT_NAME, fontfile=_OCR_FONT_PATH)
                    except Exception:
                        pass

                # Tesseract — har so'z uchun bbox + matn
                try:
                    osd_data = pytesseract.image_to_data(
                        img, lang="uzb+rus+eng", output_type=pytesseract.Output.DICT,
                        timeout=30,
                    )
                except Exception:
                    osd_data = pytesseract.image_to_data(
                        img, lang="eng", output_type=pytesseract.Output.DICT,
                        timeout=30,
                    )
                img.close()

                # Scale: rasm pikseldan PDF nuqtaga
                sx = page_w / img_w if img_w > 0 else 1
                sy = page_h / img_h if img_h > 0 else 1

                texts = osd_data.get("text", [])
                for i, txt in enumerate(texts):
                    # Tesseract'dan whitespace/control chars tozalash
                    txt = (txt or "").strip()
                    if not txt or not any(c.isalnum() for c in txt):
                        continue
                    try:
                        conf = int(osd_data["conf"][i])
                    except (ValueError, KeyError, IndexError):
                        conf = 0
                    if conf < 30:  # past ishonchli — o'tkazib yuborish
                        continue
                    try:
                        x = osd_data["left"][i] * sx
                        y = osd_data["top"][i] * sy
                        h = osd_data["height"][i] * sy
                    except (KeyError, IndexError):
                        continue
                    # Font o'lcham — minimal cheklov
                    fs = max(4.0, min(h * 0.85, 72.0))
                    # Ko'rinmas matn (render_mode=3 = invisible)
                    try:
                        kwargs = dict(
                            point=(x, y + h * 0.85),  # baseline approximation
                            text=txt,
                            fontsize=fs,
                            color=(0, 0, 0),
                            render_mode=3,
                        )
                        if has_unicode_font:
                            kwargs["fontname"] = _OCR_FONT_NAME
                        page.insert_text(**kwargs)
                    except Exception:
                        # Ba'zi mahsus belgilar yoki bo'sh font glyph yo'qligida
                        # — sahifa ishlamasligi sababli butun PDF buzilmasin
                        continue
            except Exception:
                continue  # bitta sahifa OCR ishlamasligi boshqalarni buzmasin

        # PyMuPDF API uyg'unligi: save(BytesIO) ishonchli — har versiyada ishlaydi
        out_buf = io.BytesIO()
        pdf.save(out_buf)
        out = out_buf.getvalue()
        return out if out else pdf_bytes
    finally:
        pdf.close()


# ─── img2pdf layout ───────────────────────────────────────────────────────────

def _build_layout(page_size: str, margin_mm: float, fit_mode: str, dpi: int):
    lib = _get_img2pdf()
    margin_pt = lib.mm_to_pt(margin_mm)
    fit_map = {
        "fit":    lib.FitMode.into,
        "fill":   lib.FitMode.fill,
        "center": lib.FitMode.into,
    }
    fit = fit_map.get(fit_mode, lib.FitMode.into)

    if page_size == "original":
        return lib.get_layout_fun(
            pagesize=None, border=margin_pt if margin_mm > 0 else None,
            fit=fit, auto_orient=True,
        )

    pw, ph = PAGE_SIZES[page_size]
    return lib.get_layout_fun(
        pagesize=(pw, ph), border=margin_pt if margin_mm > 0 else None,
        fit=fit, auto_orient=True,
    )


# ─── Asosiy funksiyalar (thread pool'da chaqiriladi) ─────────────────────────

VALID_MODES = {"normal", "document", "searchable"}


def do_img2pdf_single(
    data: bytes,
    page_size: str   = "a4",
    margin_mm: float = 10.0,
    fit_mode: str    = "fit",
    dpi: int         = 150,
    filename: str    = "",
    mode: str        = "normal",
) -> tuple[bytes, str]:
    """
    Bitta rasm → PDF (JPEG lossless imkon bo'lsa).
    mode: normal | document (auto-enhance) | searchable (OCR text layer)
    """
    if mode not in VALID_MODES:
        mode = "normal"

    probe = Image.open(io.BytesIO(data))
    fmt      = (probe.format or "").upper()
    n_frames = getattr(probe, "n_frames", 1)
    w, h     = probe.size
    probe.close()

    layout = _build_layout(page_size, margin_mm, fit_mode, dpi)
    # 'document' rejimi uchun prepare mode'ni o'tkazamiz
    prep_mode = "document" if mode == "document" else "normal"

    if fmt == "TIFF" and n_frames > 1:
        frames = _tiff_frames(data)
        pdf = _get_img2pdf().convert(frames, layout_fun=layout)
        if mode == "searchable":
            pdf = _add_ocr_text_layer(pdf, frames)
        return pdf, f"✅ TIFF · {n_frames} kadr · {page_size.upper()} · {_mode_label(mode)}"

    if fmt == "GIF" and n_frames > 1:
        frames = _gif_frames(data)
        pdf = _get_img2pdf().convert(frames, layout_fun=layout)
        # GIF animatsiya — OCR mantiqsiz
        return pdf, f"✅ GIF · {min(n_frames, 30)} kadr · {page_size.upper()}"

    img_bytes = _prepare_single(data, mode=prep_mode)
    pdf = _get_img2pdf().convert(img_bytes, layout_fun=layout)
    if mode == "searchable":
        pdf = _add_ocr_text_layer(pdf, [img_bytes])
    orient = "Landscape" if w > h else "Portrait"
    ps = page_size.upper() if page_size != "original" else "Original"
    return pdf, f"✅ {detect_format(data)} · {w}×{h}px · {ps} · {orient} · {_mode_label(mode)}"


def do_imgs2pdf_multi(
    all_data: list[bytes],
    all_names: list[str],
    page_size: str   = "a4",
    margin_mm: float = 10.0,
    fit_mode: str    = "fit",
    dpi: int         = 150,
    mode: str        = "normal",
) -> tuple[bytes, str]:
    """
    Ko'p rasm → ko'p sahifali PDF.
    mode: normal | document (auto-enhance) | searchable (OCR text layer)
    """
    if mode not in VALID_MODES:
        mode = "normal"
    if not all_data:
        raise ValueError("Hech qanday rasm yuklanmadi.")

    layout   = _build_layout(page_size, margin_mm, fit_mode, dpi)
    prep_mode = "document" if mode == "document" else "normal"
    prepared: list[bytes] = []
    total_pages = 0
    used_count = 0

    for i, (data, name) in enumerate(zip(all_data, all_names)):
        try:
            probe    = Image.open(io.BytesIO(data))
            fmt      = (probe.format or "").upper()
            n_frames = getattr(probe, "n_frames", 1)
            probe.close()
        except Exception:
            continue  # buzilgan fayl o'tkazib yuboriladi

        try:
            if fmt == "TIFF" and n_frames > 1:
                frames = _tiff_frames(data)
                prepared.extend(frames)
                total_pages += len(frames)
            elif fmt == "GIF" and n_frames > 1:
                frames = _gif_frames(data, max_frames=10)
                prepared.extend(frames)
                total_pages += len(frames)
            else:
                prepared.append(_prepare_single(data, mode=prep_mode))
                total_pages += 1
            used_count += 1
        except Exception:
            continue  # bitta rasm xato bo'lsa boshqasi davom etadi

    if not prepared:
        raise ValueError("Yuklangan fayllar ichida rasm topilmadi.")

    pdf = _get_img2pdf().convert(prepared, layout_fun=layout)
    if mode == "searchable":
        pdf = _add_ocr_text_layer(pdf, prepared)
    ps  = page_size.upper() if page_size != "original" else "Original"
    info_extra = ""
    if used_count < len(all_data):
        info_extra = f" · {len(all_data) - used_count} ta fayl o'tkazib yuborildi"
    return pdf, f"✅ {used_count} rasm · {total_pages} sahifa · {ps} · {_mode_label(mode)}{info_extra}"


def _mode_label(mode: str) -> str:
    return {
        "normal":     "oddiy",
        "document":   "📑 Skan rejimi (deskew + contrast)",
        "searchable": "🔍 Searchable PDF (OCR)",
    }.get(mode, "oddiy")
