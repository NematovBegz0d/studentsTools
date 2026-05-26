"""
Rasm(lar) → PDF — lossless yaxshilangan versiya
================================================
- img2pdf: JPEG lossless (sifat yo'qolmaydi)
- WebP, TIFF, BMP, GIF qo'llab-quvvatlash
- Sahifa o'lchami: A4, A3, A5, Letter, Legal, original
- Margin: 0–30 mm, DPI: 72/96/150/300, fit_mode: fit/fill/center
- Ko'p sahifali TIFF va animatsiyali GIF har kadr → alohida sahifa
- EXIF rotatsiya, alpha → oq fon, OOM cheklovi
"""
from __future__ import annotations

import io
from PIL import Image, ImageOps

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
    return any(data[:len(s)] == s for s in MAGIC)


# ─── Rasm tayyorlash ──────────────────────────────────────────────────────────

def _prepare_single(data: bytes, max_px: int = 6000) -> bytes:
    """
    Rasmni img2pdf uchun tayyorlaydi.
    JPEG → lossless (qayta kodlamasiz). Boshqalar → JPEG (quality=95).
    """
    probe = Image.open(io.BytesIO(data))
    fmt   = (probe.format or "").upper()
    probe.close()

    # JPEG lossless: EXIF rotatsiyani Pillow bilan to'g'irlaymiz va raw JPEG qaytaramiz
    if fmt == "JPEG":
        img = Image.open(io.BytesIO(data))
        original_size = img.size
        # ✅ Pillow 10+: _getexif() o'rniga getexif() (public API)
        # Bo'sh EXIF = falsy → rotatsiya yo'q
        has_exif = bool(img.getexif())
        img = ImageOps.exif_transpose(img)
        # Agar rotatsiya bo'lgan bo'lsa size o'zgaradi (vertical ↔ horizontal)
        if not has_exif and img.size == original_size:
            return data  # hech narsa o'zgarmadi — lossless
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=95, optimize=True, subsampling=0)
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

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95, optimize=True, subsampling=0)
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

def do_img2pdf_single(
    data: bytes,
    page_size: str  = "a4",
    margin_mm: float = 10.0,
    fit_mode: str   = "fit",
    dpi: int        = 150,
    filename: str   = "",
) -> tuple[bytes, str]:
    """Bitta rasm → PDF (JPEG lossless imkon bo'lsa)."""
    probe = Image.open(io.BytesIO(data))
    fmt      = (probe.format or "").upper()
    n_frames = getattr(probe, "n_frames", 1)
    w, h     = probe.size
    probe.close()

    layout = _build_layout(page_size, margin_mm, fit_mode, dpi)

    if fmt == "TIFF" and n_frames > 1:
        frames = _tiff_frames(data)
        pdf = _get_img2pdf().convert(frames, layout_fun=layout)
        return pdf, f"✅ TIFF · {n_frames} kadr · {page_size.upper()} · {margin_mm:.0f}mm margin"

    if fmt == "GIF" and n_frames > 1:
        frames = _gif_frames(data)
        pdf = _get_img2pdf().convert(frames, layout_fun=layout)
        return pdf, f"✅ GIF · {min(n_frames, 30)} kadr · {page_size.upper()}"

    img_bytes = _prepare_single(data)
    pdf = _get_img2pdf().convert(img_bytes, layout_fun=layout)
    orient = "Landscape" if w > h else "Portrait"
    ps = page_size.upper() if page_size != "original" else "Original"
    return pdf, f"✅ {w}×{h}px · {ps} · {orient} · {margin_mm:.0f}mm margin"


def do_imgs2pdf_multi(
    all_data: list[bytes],
    all_names: list[str],
    page_size: str  = "a4",
    margin_mm: float = 10.0,
    fit_mode: str   = "fit",
    dpi: int        = 150,
) -> tuple[bytes, str]:
    """Ko'p rasm → ko'p sahifali PDF."""
    if not all_data:
        raise ValueError("Hech qanday rasm yuklanmadi.")

    layout   = _build_layout(page_size, margin_mm, fit_mode, dpi)
    prepared: list[bytes] = []
    total_pages = 0

    for i, (data, name) in enumerate(zip(all_data, all_names)):
        try:
            probe    = Image.open(io.BytesIO(data))
            fmt      = (probe.format or "").upper()
            n_frames = getattr(probe, "n_frames", 1)
            probe.close()
        except Exception:
            continue  # buzilgan fayl o'tkazib yuboriladi

        if fmt == "TIFF" and n_frames > 1:
            frames = _tiff_frames(data)
            prepared.extend(frames)
            total_pages += len(frames)
        elif fmt == "GIF" and n_frames > 1:
            frames = _gif_frames(data, max_frames=10)
            prepared.extend(frames)
            total_pages += len(frames)
        else:
            prepared.append(_prepare_single(data))
            total_pages += 1

    if not prepared:
        raise ValueError("Yuklangan fayllar ichida rasm topilmadi.")

    pdf = _get_img2pdf().convert(prepared, layout_fun=layout)
    ps  = page_size.upper() if page_size != "original" else "Original"
    return pdf, f"✅ {len(all_data)} rasm · {total_pages} sahifa · {ps} · {margin_mm:.0f}mm margin"
