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
    # HEIC/HEIF/AVIF (ISO base media file format)
    if len(data) >= 12 and data[4:8] == b'ftyp':
        brand = data[8:12]
        if brand in _HEIC_BRANDS or brand in _AVIF_BRANDS:
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
    OpenCV ishlatadi — image processing eng yaxshi.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return img  # OpenCV yo'q bo'lsa, originalni qaytaradi

    arr = np.array(img.convert("RGB"))
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)

    # 1. Deskew — qiyalik aniqlash va to'g'irlash
    try:
        # Binary mask — matn pikselllarini topish
        _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        coords = np.column_stack(np.where(bw > 0))
        if len(coords) > 100:
            angle = cv2.minAreaRect(coords)[-1]
            if angle < -45:
                angle = 90 + angle
            else:
                angle = -angle
            # Faqat sezilarli qiyalik (>0.5°)
            if abs(angle) > 0.5 and abs(angle) < 15:
                h, w = arr.shape[:2]
                M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
                arr = cv2.warpAffine(arr, M, (w, h),
                                     flags=cv2.INTER_CUBIC,
                                     borderMode=cv2.BORDER_REPLICATE)
                gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    except Exception:
        pass

    # 2. Denoise — kichik shovqinlarni olib tashlash
    try:
        arr = cv2.fastNlMeansDenoisingColored(arr, None, 7, 7, 7, 15)
    except Exception:
        pass

    # 3. Auto-contrast — PIL ImageOps.autocontrast tezroq va silliqroq
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
        img = ImageOps.exif_transpose(img)
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

def _add_ocr_text_layer(pdf_bytes: bytes, prepared_images: list[bytes]) -> bytes:
    """
    PDF sahifalariga ko'rinmas OCR matn qatlamini qo'shadi.
    Natija: rasm aynan o'zicha qoladi, lekin matn qidirish/copy mumkin.

    Tesseract ishlatiladi (Docker'da bor). Har bir rasm uchun OCR ishga tushadi.
    """
    try:
        import fitz
        import pytesseract
        from PIL import Image as PILImage
    except ImportError:
        return pdf_bytes  # fallback: oddiy PDF

    pdf = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if len(pdf) != len(prepared_images):
            # Sahifa va rasm soni mos kelmasa (multi-frame), OCR'siz qaytar
            return pdf_bytes

        for page_idx, img_bytes in enumerate(prepared_images):
            try:
                img = PILImage.open(io.BytesIO(img_bytes))
                page = pdf[page_idx]
                page_w = page.rect.width
                page_h = page.rect.height
                img_w, img_h = img.size

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
                sx = page_w / img_w
                sy = page_h / img_h

                for i, txt in enumerate(osd_data.get("text", [])):
                    txt = (txt or "").strip()
                    if not txt:
                        continue
                    try:
                        conf = int(osd_data["conf"][i])
                    except (ValueError, KeyError):
                        conf = 0
                    if conf < 30:  # past ishonchli — o'tkazib yuborish
                        continue
                    x = osd_data["left"][i] * sx
                    y = osd_data["top"][i] * sy
                    w = osd_data["width"][i] * sx
                    h = osd_data["height"][i] * sy
                    # Ko'rinmas matn — fill_opacity=0
                    try:
                        page.insert_text(
                            (x, y + h * 0.8),  # baseline approximation
                            txt,
                            fontsize=h * 0.9,
                            color=(0, 0, 0),
                            fill_opacity=0,  # invisible
                            render_mode=3,  # invisible mode
                        )
                    except Exception:
                        pass
            except Exception:
                continue  # bitta sahifa OCR ishlamasligi boshqalarni buzmasin

        out = pdf.write()
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
