import io
import os
import re
import time
import asyncio
import functools
import zipfile
from collections import Counter
from datetime import datetime
from typing import List, Optional
from urllib.parse import quote as url_quote

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from loguru import logger

import cache as _cache
from shared import (
    limiter, _io_pool,
    safe_header,
    BOT_TOKEN, APP_URL,
    read_upload, read_uploads,
    safe_url_fetcher,
    FONT_REGULAR, FONT_BOLD,
    _get_user_id,
    tg_send,
)

router = APIRouter()

# ─── Send file to Telegram ────────────────────────────────────────────────────

@router.post("/api/send-file")
@limiter.limit("20/minute")
async def send_file(
    request: Request,
    filename: str    = Form(...),
    file: UploadFile = File(...),
):
    # Auth FIRST — BOT_TOKEN-missing should not be discoverable by anonymous
    # callers (info disclosure). 401 takes precedence over 503.
    user_id = _get_user_id(request)
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot sozlanmagan")
    data = await read_upload(file, "/api/send-file")

    t0 = time.time()
    timeout = httpx.Timeout(connect=15.0, read=180.0, write=180.0, pool=15.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument",
                data={
                    "chat_id": user_id,
                    "caption": f"📎 {filename}\n\n🤖 EduBot",
                },
                files={
                    "document": (
                        filename,
                        data,
                        file.content_type or "application/octet-stream",
                    )
                },
            )
    except httpx.TimeoutException:
        logger.error(f"sendDocument timeout: user={user_id} filename={filename}")
        raise HTTPException(
            status_code=504,
            detail="Telegramga fayl yuborish vaqti tugadi. Faylni kichikroq qilib qayta urinib ko‘ring.",
        )
    except httpx.HTTPError as e:
        logger.error(f"sendDocument network xato: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=502,
            detail="Telegram bilan aloqa xatosi. Keyinroq qayta urinib ko‘ring.",
        )

    try:
        result = r.json()
    except Exception:
        logger.error(f"sendDocument noto‘g‘ri javob: status={r.status_code} text={r.text[:200]!r}")
        raise HTTPException(status_code=502, detail="Telegram noto‘g‘ri javob qaytardi.")

    if not result.get("ok"):
        detail = result.get("description", "Telegram faylni qabul qilmadi")
        logger.error(f"sendDocument Telegram xatosi: {detail}")
        raise HTTPException(status_code=500, detail=detail)

    logger.info(f"sendDocument: user={user_id} {filename} {time.time() - t0:.1f}s")
    return {"ok": True}

# ─── Translit ─────────────────────────────────────────────────────────────────

_LTR_MAP = {
    "sh": "ш", "ch": "ч",
    "yo": "ё", "ye": "е", "yu": "ю", "ya": "я",
    "ts": "ц",
    "o'": "ў", "oʻ": "ў", "oʼ": "ў", "o'": "ў",
    "g'": "ғ", "gʻ": "ғ", "gʼ": "ғ", "g'": "ғ",
    "a": "а", "b": "б", "v": "в", "d": "д", "e": "е",
    "f": "ф", "g": "г", "h": "ҳ", "i": "и", "j": "ж",
    "k": "к", "l": "л", "m": "м", "n": "н", "o": "о",
    "p": "п", "q": "қ", "r": "р", "s": "с", "t": "т",
    "u": "у", "x": "х", "y": "й", "z": "з",
    "'": "ъ", "ʻ": "ъ", "ʼ": "ъ", "’": "ъ",
}
_LTR_MULTI = [k for k in _LTR_MAP if len(k) == 2]

_RTL_MAP = {
    "ш": "sh", "ч": "ch",
    "ё": "yo", "ю": "yu", "я": "ya",
    "ц": "ts", "ў": "o'", "ғ": "g'",
    "а": "a",  "б": "b",  "в": "v",  "г": "g",  "д": "d",
    "е": "e",  "э": "e",  "ж": "j",  "з": "z",
    "и": "i",  "й": "y",  "к": "k",  "л": "l",  "м": "m",
    "н": "n",  "о": "o",  "п": "p",  "р": "r",  "с": "s",
    "т": "t",  "у": "u",  "ф": "f",  "х": "x",
    "қ": "q",  "ҳ": "h",  "ъ": "'",  "ь": "",
}


def _translit_ltr(text: str) -> str:
    out = []
    i = 0
    n = len(text)
    while i < n:
        matched = False
        for key in _LTR_MULTI:
            kl = len(key)
            if text[i:i + kl].lower() == key:
                cyr = _LTR_MAP[key]
                out.append(cyr.upper() if text[i].isupper() else cyr)
                i += kl
                matched = True
                break
        if not matched:
            c = text[i]
            m = _LTR_MAP.get(c.lower(), c)
            out.append(m.upper() if c.isupper() else m)
            i += 1
    return "".join(out)


def _translit_rtl(text: str) -> str:
    out   = []
    chars = list(text)
    n     = len(chars)
    for idx, c in enumerate(chars):
        lc = c.lower()
        m  = _RTL_MAP.get(lc, c)
        if not m:
            continue
        if c.isupper() and lc != c:
            next_alpha = next(
                (chars[j] for j in range(idx + 1, min(idx + 4, n)) if chars[j].isalpha()),
                None,
            )
            if next_alpha and next_alpha.isupper():
                out.append(m.upper())
            else:
                out.append(m[0].upper() + m[1:])
        else:
            out.append(m)
    return "".join(out)


@router.post("/api/translit")
@limiter.limit("60/minute")
async def translit(request: Request):
    user_id = _get_user_id(request)
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        return JSONResponse({"result": ""})
    if len(text) > 50_000:
        text = text[:50_000]
    is_cyr = bool(re.search(r'[а-яёА-ЯЁўқғҳ]', text))
    result = _translit_rtl(text) if is_cyr else _translit_ltr(text)
    return JSONResponse({"result": result})


# ─── Readtime ─────────────────────────────────────────────────────────────────

_READTIME_WPM = {
    "en": 238, "de": 260, "fr": 250, "es": 230, "it": 240,
    "ru": 184, "uz": 160, "kk": 160, "tr": 200,
    "ar": 138,
    "zh": 255, "ja": 357, "ko": 250,
}
_CJK_LANGS = {"zh", "ja", "ko"}


def _detect_lang_quick(text: str) -> str:
    total = max(len(text), 1)
    cyr = sum(1 for c in text if "Ѐ" <= c <= "ӿ")
    cjk = sum(1 for c in text if "一" <= c <= "鿿")
    if cjk / total > 0.3:
        return "zh"
    if cyr / total > 0.3:
        return "ru"
    return "en"


@router.post("/api/readtime")
@limiter.limit("60/minute")
async def readtime(request: Request):
    user_id = _get_user_id(request)
    body = await request.json()
    text = (body.get("text") or "").strip()
    lang = (body.get("lang") or "").lower().strip()[:2]
    if not text:
        return JSONResponse({"result": "❌ Matn kiriting"})

    words      = len(text.split())
    chars      = len(text.replace(" ", ""))
    sentences  = len(re.findall(r'[.!?]+', text)) or 1
    paragraphs = len([p for p in text.split("\n") if p.strip()])

    if not lang:
        lang = _detect_lang_quick(text)

    if lang in _CJK_LANGS:
        rate      = _READTIME_WPM.get(lang, 255)
        mins      = max(1, round(chars / rate))
        rate_note = f"{rate} belgi/daqiqa · {lang.upper()}"
    else:
        rate      = _READTIME_WPM.get(lang, 200)
        mins      = max(1, round(words / rate))
        rate_note = f"{rate} so'z/daqiqa · {lang.upper()}"

    return JSONResponse({
        "result": (
            f"📖 {words:,} so'z · {chars:,} belgi\n"
            f"📝 {sentences} gap · {paragraphs} paragraf\n"
            f"⏱ O'qish vaqti: ~{mins} daqiqa\n"
            f"({rate_note})"
        ),
        "minutes": mins,
        "words":   words,
        "chars":   chars,
        "lang":    lang,
    })


# ─── Deadline ─────────────────────────────────────────────────────────────────

@router.post("/api/deadline")
@limiter.limit("60/minute")
async def deadline(request: Request):
    user_id = _get_user_id(request)
    body = await request.json()
    text = (body.get("text") or body.get("date") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Sana kiriting: 31.12.2025, 2025-12-31 yoki next Monday")

    d = None
    try:
        import dateparser
        d = dateparser.parse(
            text,
            languages=["uz", "ru", "en"],
            settings={"PREFER_DATES_FROM": "future", "RETURN_AS_TIMEZONE_AWARE": False},
        )
    except Exception:
        pass

    if d is None:
        m = re.search(r'(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})', text) or \
            re.search(r'(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})', text)
        if m:
            try:
                g = m.groups()
                if len(g[0]) == 4:
                    d = datetime(int(g[0]), int(g[1]), int(g[2]))
                else:
                    yr = int(g[2])
                    if yr < 100:
                        yr += 2000
                    d = datetime(yr, int(g[1]), int(g[0]))
            except ValueError:
                pass

    if d is None:
        raise HTTPException(
            status_code=400,
            detail="Sana formatini aniqlab bo'lmadi. Misollar: 31.12.2025, 2025-12-31, next Monday",
        )

    now  = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    d0   = d.replace(hour=0, minute=0, second=0, microsecond=0)
    days = (d0 - now).days
    emoji = "🔴" if days < 0 else ("🚨" if days <= 3 else ("🟡" if days <= 7 else "🟢"))
    msg   = f"{abs(days)} kun oldin o'tdi!" if days < 0 else ("BUGUN!" if days == 0 else f"{days} kun qoldi")
    message = f"📅 {d.strftime('%d.%m.%Y')}\n{emoji} {msg}"
    return JSONResponse({"result": message, "message": message, "text": message, "days": days})


# ─── Stats ────────────────────────────────────────────────────────────────────

@router.post("/api/stats")
@limiter.limit("60/minute")
async def stats(request: Request):
    user_id = _get_user_id(request)
    body = await request.json()
    raw_text = body.get("text") or ""
    nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', raw_text)]
    if not nums:
        words = re.findall(r"\b\w+\b", raw_text, flags=re.UNICODE)
        chars = len(raw_text)
        chars_no_spaces = len(re.sub(r"\s+", "", raw_text))
        return JSONResponse({
            "result": f"📝 So'zlar: {len(words)}\nBelgilar: {chars}\nBo'sh joysiz: {chars_no_spaces}",
            "words": len(words),
            "chars": chars,
            "chars_no_spaces": chars_no_spaces,
        })

    n     = len(nums)
    total = sum(nums)
    mean  = total / n
    s     = sorted(nums)
    median = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
    var   = sum((x - mean) ** 2 for x in nums) / n
    std   = var ** 0.5

    def _percentile(data, p):
        idx = (len(data) - 1) * p / 100
        lo, hi = int(idx), min(int(idx) + 1, len(data) - 1)
        return data[lo] + (data[hi] - data[lo]) * (idx - lo)

    q1  = _percentile(s, 25)
    q3  = _percentile(s, 75)
    iqr = q3 - q1

    freq = Counter(nums)
    top_val, top_cnt = freq.most_common(1)[0]
    mode_str = f"{top_val:g} ({top_cnt} marta)" if top_cnt > 1 else "—"

    extra = ""
    try:
        from scipy import stats as _sp
        skew = _sp.skew(nums)
        kurt = _sp.kurtosis(nums)
        extra += f"\n📐 Asimmetriya: {skew:.4f}"
        extra += f"\n⛰️  Kurtosis: {kurt:.4f}"
        if n >= 8:
            _, norm_p = _sp.normaltest(nums)
            norm_label = "Ha ✓" if norm_p > 0.05 else f"Yo'q (p={norm_p:.3f})"
            extra += f"\n🔔 Normal taqsimot: {norm_label}"
    except Exception:
        pass

    result_text = (
        f"📊 n = {n}\n"
        f"∑  Yig'indi: {total:g}\n"
        f"x̄  O'rtacha: {mean:.4f}\n"
        f"M  Mediana: {median:g}\n"
        f"Mo Moda: {mode_str}\n"
        f"σ² Dispersiya: {var:.4f}\n"
        f"σ  Standart og'ish: {std:.4f}\n"
        f"Q1 / Q3: {q1:g} / {q3:g}\n"
        f"IQR: {iqr:g}\n"
        f"Min: {s[0]:g}  Max: {s[-1]:g}"
        + extra
    )
    return JSONResponse({
        "result": result_text,
        "n": n,
        "sum": total,
        "mean": mean,
        "median": median,
        "variance": var,
        "stddev": std,
        "min": s[0],
        "max": s[-1],
    })


# ─── QR Code ──────────────────────────────────────────────────────────────────

def _do_qr(text: str, size: int = 400, ec_level: str = "M", fmt: str = "png") -> tuple:
    import segno
    from PIL import Image

    ec_map = {"L": "l", "M": "m", "Q": "q", "H": "h"}
    ec     = ec_map.get(ec_level.upper(), "m")

    qr = segno.make(text, error=ec, micro=False)

    if fmt == "svg":
        buf = io.BytesIO()
        qr.save(buf, kind="svg", scale=4, dark="#0f172a", light="#f8f7ff", border=4)
        return buf.getvalue(), "image/svg+xml", "qrcode.svg"

    modules = qr.symbol_size()[0]
    scale   = max(1, size // modules)
    buf     = io.BytesIO()
    qr.save(buf, kind="png", scale=scale, dark="#4f46e5", light="#eef2ff", border=4)
    img = Image.open(buf)
    if img.width != size:
        img = img.resize((size, size), Image.NEAREST)
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue(), "image/png", "qrcode.png"


@router.post("/api/qr")
@limiter.limit("30/minute")
async def make_qr(request: Request):
    user_id = _get_user_id(request)
    try:
        body     = await request.json()
        text     = (body.get("text") or "EduBot").strip() or "EduBot"
        size     = max(100, min(1000, int(body.get("size", 400))))
        ec_level = str(body.get("ec", "M")).upper()
        fmt      = str(body.get("format", "png")).lower()
        if fmt not in ("png", "svg"):
            fmt = "png"
        if len(text) > 2000:
            raise HTTPException(status_code=400, detail="Matn 2000 belgidan oshmasligi kerak")
        loop = asyncio.get_running_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    _io_pool,
                    functools.partial(_do_qr, text, size, ec_level, fmt),
                ),
                timeout=15.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="QR generation timed out")
        content, media_type, filename = result
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"qr xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"qr: {type(e).__name__}: {str(e)[:160]}")


# ─── Certificate ──────────────────────────────────────────────────────────────

_CERT_THEMES = {
    "classic": {"bg_top": (10, 8, 45),    "bg_bot": (35, 20, 75),   "accent": (251, 191, 36),  "text": (255, 255, 255), "sub": (167, 139, 250)},
    "modern":  {"bg_top": (15, 23, 42),   "bg_bot": (30, 50, 80),   "accent": (96, 165, 250),  "text": (255, 255, 255), "sub": (148, 210, 252)},
    "minimal": {"bg_top": (245, 245, 250), "bg_bot": (220, 220, 235),"accent": (79, 70, 229),   "text": (30, 30, 50),    "sub": (100, 80, 200)},
    "dark":    {"bg_top": (5, 5, 15),     "bg_bot": (20, 10, 30),   "accent": (167, 139, 250), "text": (240, 240, 255), "sub": (120, 100, 220)},
}


def _do_cert(name: str, course: str, issuer: str, theme: str = "classic") -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    th   = _CERT_THEMES.get(theme, _CERT_THEMES["classic"])
    W, H = 900, 620
    img  = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)

    r0, g0, b0 = th["bg_top"]
    r1, g1, b1 = th["bg_bot"]
    for i in range(H):
        t = i / H
        draw.line([(0, i), (W, i)], fill=(
            int(r0 + t * (r1 - r0)),
            int(g0 + t * (g1 - g0)),
            int(b0 + t * (b1 - b0)),
        ))

    GOLD   = th["accent"]
    GOLD2  = tuple(max(0, c - 70) for c in GOLD)
    WHITE  = th["text"]
    SILVER = (190, 190, 200)
    PURPLE = th["sub"]

    draw.rectangle([(16, 16), (W - 16, H - 16)], outline=GOLD,  width=3)
    draw.rectangle([(26, 26), (W - 26, H - 26)], outline=GOLD2, width=1)

    for cx_, cy_ in [(42, 42), (W - 42, 42), (42, H - 42), (W - 42, H - 42)]:
        draw.ellipse([(cx_ - 8, cy_ - 8), (cx_ + 8, cy_ + 8)], outline=GOLD, width=2)
        draw.line([(cx_ - 14, cy_), (cx_ + 14, cy_)], fill=GOLD2, width=1)
        draw.line([(cx_, cy_ - 14), (cx_, cy_ + 14)], fill=GOLD2, width=1)

    draw.line([(60, 90), (W - 60, 90)],         fill=GOLD2, width=1)
    draw.line([(60, 92), (W - 60, 92)],         fill=GOLD,  width=1)
    draw.line([(60, H - 90), (W - 60, H - 90)], fill=GOLD,  width=1)
    draw.line([(60, H - 88), (W - 60, H - 88)], fill=GOLD2, width=1)

    def load_fonts():
        try:
            return (
                ImageFont.truetype(FONT_BOLD,    48),
                ImageFont.truetype(FONT_BOLD,    44),
                ImageFont.truetype(FONT_REGULAR, 22),
                ImageFont.truetype(FONT_REGULAR, 15),
                ImageFont.truetype(FONT_REGULAR, 13),
            )
        except Exception:
            d = ImageFont.load_default()
            return d, d, d, d, d

    fn_title, fn_name, fn_course, fn_sub, fn_sm = load_fonts()

    def center_x(text, font):
        try:
            bb = draw.textbbox((0, 0), text, font=font)
            return (W - (bb[2] - bb[0])) // 2
        except Exception:
            return W // 4

    draw.text((center_x("SERTIFIKAT", fn_title), 108), "SERTIFIKAT", font=fn_title, fill=GOLD)
    sub = "ushbu kurs muvaffaqiyatli yakunlanganligi tasdiqlanganligi uchun beriladi"
    draw.text((center_x(sub, fn_sm), 168), sub, font=fn_sm, fill=SILVER)
    draw.text((center_x(name, fn_name), 230), name, font=fn_name, fill=WHITE)
    draw.line([(W // 2 - 200, 295), (W // 2 + 200, 295)], fill=GOLD2, width=1)

    label = "kurs:"
    draw.text((center_x(label, fn_sm), 308), label, font=fn_sm, fill=SILVER)
    draw.text((center_x(course, fn_course), 328), course, font=fn_course, fill=PURPLE)

    sc, sr = W // 2, H - 140
    draw.ellipse([(sc - 46, sr - 46), (sc + 46, sr + 46)], outline=GOLD2, width=2)
    draw.ellipse([(sc - 38, sr - 38), (sc + 38, sr + 38)], outline=GOLD,  width=1)
    seal_text = "✓"
    draw.text((center_x(seal_text, fn_sub), sr - 14), seal_text, font=fn_sub, fill=GOLD)

    date_str = datetime.now().strftime("%d.%m.%Y")
    draw.text((70,  H - 75), issuer,   font=fn_sm, fill=SILVER)
    draw.text((70,  H - 58), "Mudir",  font=fn_sm, fill=SILVER)
    draw.line([(70, H - 50), (200, H - 50)], fill=GOLD2, width=1)
    draw.text((W - 200, H - 75), date_str, font=fn_sm, fill=SILVER)
    draw.text((W - 200, H - 58), "Sana",   font=fn_sm, fill=SILVER)
    draw.line([(W - 200, H - 50), (W - 70, H - 50)], fill=GOLD2, width=1)
    draw.text((center_x("EduBot", fn_sm), H - 40), "EduBot", font=fn_sm, fill=(100, 100, 120))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _do_cert_with_qr(name: str, course: str, issuer: str,
                     theme: str, cert_id: str, verify_url: str) -> bytes:
    import segno
    from PIL import Image as _PImage, ImageDraw as _PDraw, ImageFont as _PFont

    png = _do_cert(name, course, issuer, theme)
    try:
        qr_buf = io.BytesIO()
        segno.make(verify_url, error="M").save(qr_buf, kind="png", scale=4, border=2)
        qr_img   = _PImage.open(qr_buf).convert("RGB")
        cert_img = _PImage.open(io.BytesIO(png)).convert("RGB")
        qx = cert_img.width  - qr_img.width  - 24
        qy = cert_img.height - qr_img.height - 24
        cert_img.paste(qr_img, (qx, qy))

        try:
            font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
            fnt = _PFont.truetype(font_path, 14) if os.path.exists(font_path) else _PFont.load_default()
            draw  = _PDraw.Draw(cert_img)
            label = f"ID: {cert_id}"
            tw    = draw.textlength(label, font=fnt) if hasattr(draw, "textlength") else len(label) * 7
            draw.text((qx + (qr_img.width - tw) // 2, qy + qr_img.height + 4),
                      label, fill=(110, 110, 110), font=fnt)
        except Exception:
            pass

        out = io.BytesIO()
        cert_img.save(out, format="PNG")
        return out.getvalue()
    except Exception as e:
        logger.debug(f"cert QR qo'shilmadi: {e}")
        return png



def _do_cert_pdf_reportlab(name: str, course: str, issuer: str, theme: str,
                           cert_id: str, verify_url: str, issue_dt: str) -> bytes:
    from reportlab.lib.pagesizes import A5, landscape
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas

    th = _CERT_THEMES.get(theme, _CERT_THEMES["classic"])
    bg = colors.Color(*(c / 255 for c in th["bg_bot"]))
    accent = colors.Color(*(c / 255 for c in th["accent"]))
    text_color = colors.Color(*(c / 255 for c in th["text"]))
    sub_color = colors.Color(0.72, 0.72, 0.78)

    buf = io.BytesIO()
    page_size = landscape(A5)
    c = canvas.Canvas(buf, pagesize=page_size)
    w, h = page_size

    c.setFillColor(bg)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    c.setStrokeColor(accent)
    c.setLineWidth(2)
    c.roundRect(22, 22, w - 44, h - 44, 8, stroke=1, fill=0)

    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(w / 2, h - 76, "SERTIFIKAT")

    c.setFillColor(sub_color)
    c.setFont("Helvetica", 10)
    c.drawCentredString(w / 2, h - 104, "Ushbu sertifikat taqdim etiladi")

    c.setFillColor(text_color)
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(w / 2, h - 150, (name or "")[:60])

    c.setFillColor(sub_color)
    c.setFont("Helvetica", 10)
    c.drawCentredString(w / 2, h - 174, "muvaffaqiyatli tugatgani uchun")

    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(w / 2, h - 203, (course or "")[:80])

    c.setStrokeColor(accent)
    c.setLineWidth(0.8)
    c.line(w * 0.25, h - 222, w * 0.75, h - 222)

    c.setFillColor(sub_color)
    c.setFont("Helvetica", 9)
    c.drawString(48, 54, (issuer or "EduBot")[:60])
    c.drawRightString(w - 48, 54, issue_dt or datetime.now().strftime("%Y-%m-%d"))
    c.setFont("Helvetica", 7)
    c.drawCentredString(w / 2, 34, f"ID: {cert_id}")
    c.drawCentredString(w / 2, 24, (verify_url or "")[:110])

    c.showPage()
    c.save()
    return buf.getvalue()

def _do_cert_pdf(name: str, course: str, issuer: str, theme: str,
                 cert_id: str, verify_url: str, issue_dt: str) -> bytes:
    try:
        from weasyprint import HTML
    except Exception as e:
        logger.warning(f"WeasyPrint unavailable, using ReportLab fallback: {type(e).__name__}: {e}")
        return _do_cert_pdf_reportlab(name, course, issuer, theme, cert_id, verify_url, issue_dt)
    from html import escape as _esc
    import segno, base64 as _b64

    th         = _CERT_THEMES.get(theme, _CERT_THEMES["classic"])
    r0, g0, b0 = th["bg_top"]
    r1, g1, b1 = th["bg_bot"]
    accent     = "#{:02x}{:02x}{:02x}".format(*th["accent"])
    bg_grad    = f"linear-gradient(180deg, rgb({r0},{g0},{b0}), rgb({r1},{g1},{b1}))"

    name_s    = _esc(name or "")
    course_s  = _esc(course or "")
    issuer_s  = _esc(issuer or "")
    cert_id_s = _esc(cert_id or "")
    issue_s   = _esc(issue_dt or "")

    qr_buf = io.BytesIO()
    segno.make(verify_url, error="M").save(qr_buf, kind="png", scale=4, border=1)
    qr_b64 = _b64.b64encode(qr_buf.getvalue()).decode()

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page {{ size: A5 landscape; margin: 0; }}
  body {{ margin:0; padding:0; background:{bg_grad};
         font-family:'DejaVu Sans',sans-serif; width:210mm; height:148mm;
         display:flex; align-items:center; justify-content:center; }}
  .cert {{ border: 3px solid {accent}; border-radius:10px;
           padding: 22px 30px; text-align:center; width:188mm;
           position:relative; }}
  .title {{ font-size:11pt; color:{accent}; letter-spacing:.12em;
            text-transform:uppercase; margin-bottom:8px; font-weight:700; }}
  .name  {{ font-size:24pt; font-weight:700; color:white; margin:10px 0; }}
  .course{{ font-size:14pt; color:{accent}; margin:8px 0 12px; font-weight:600; }}
  .issuer{{ font-size:10pt; color:rgba(255,255,255,.75); }}
  .meta {{ font-size:8pt; color:rgba(255,255,255,.5);
           margin-top:8px; font-family:'DejaVu Sans Mono', monospace; }}
  .line {{ border:none; border-top:1px solid {accent}55;
           margin: 8px auto; width:75%; }}
  .qr {{ position:absolute; bottom:14px; right:18px; text-align:center; }}
  .qr img {{ width:60px; height:60px; background:#fff; padding:2px; border-radius:4px; }}
  .qr-label {{ font-size:6.5pt; color:rgba(255,255,255,.6); margin-top:2px; }}
</style></head><body>
<div class="cert">
  <div class="title">🏆 Sertifikat</div>
  <hr class="line">
  <div style="font-size:9pt;color:rgba(255,255,255,.7)">Ushbu sertifikat taqdim etiladi</div>
  <div class="name">{name_s}</div>
  <div style="font-size:9pt;color:rgba(255,255,255,.7)">muvaffaqiyatli tugatgani uchun</div>
  <div class="course">{course_s}</div>
  <hr class="line">
  <div class="issuer">{issuer_s} · {issue_s}</div>
  <div class="meta">ID: {cert_id_s}</div>
  <div class="qr">
    <img src="data:image/png;base64,{qr_b64}" alt="QR">
    <div class="qr-label">verify</div>
  </div>
</div>
</body></html>"""

    # SSRF guard: cert HTML embeds QR as data: URI — block any other resource
    # (external images, fonts, file://) the template (or future edits) may reference.
    return HTML(string=html, url_fetcher=safe_url_fetcher).write_pdf()


@router.post("/api/cert")
@limiter.limit("20/minute")
async def make_cert(request: Request):
    cert_user_id = _get_user_id(request)
    try:
        body = await request.json()
        if body.get("text"):
            lines  = (body.get("text") or "").strip().split("\n")
            name   = lines[0].strip()[:120] if lines else ""
            course = lines[1].strip()[:160] if len(lines) > 1 else "Kurs nomi"
            issuer = lines[2].strip()[:120] if len(lines) > 2 else "EduBot"
        else:
            name   = (body.get("name") or "").strip()[:120]
            course = (body.get("course") or "Kurs nomi").strip()[:160]
            issuer = (body.get("issuer") or "EduBot").strip()[:120]
        theme  = str(body.get("theme", "classic"))
        fmt    = str(body.get("format", "png")).lower()
        if theme not in _CERT_THEMES:
            theme = "classic"
        if not name:
            raise HTTPException(status_code=400, detail="Ism bo'sh bo'lmasligi kerak")
        if fmt not in ("png", "pdf"):
            fmt = "png"

        import uuid
        cert_id  = uuid.uuid4().hex[:12].upper()
        issue_dt = datetime.now().strftime("%Y-%m-%d")
        try:
            import database as _db
            await _db.save_cert(cert_id, name, course, issuer, theme, cert_user_id)
        except Exception as _e:
            logger.warning(f"cert DB save xato: {_e}")

        base_url   = os.environ.get("BACKEND_URL", "https://studenttools-production.up.railway.app")
        verify_url = f"{base_url}/api/cert/verify/{cert_id}"

        loop = asyncio.get_running_loop()
        try:
            if fmt == "pdf":
                pdf_bytes = await asyncio.wait_for(
                    loop.run_in_executor(
                        _io_pool,
                        functools.partial(
                            _do_cert_pdf, name, course, issuer, theme,
                            cert_id, verify_url, issue_dt,
                        ),
                    ),
                    timeout=25.0,
                )
                return Response(
                    content=pdf_bytes,
                    media_type="application/pdf",
                    headers={
                        "Content-Disposition": f"attachment; filename=certificate_{cert_id}.pdf",
                        "X-Cert-Id":    cert_id,
                        "X-Verify-Url": verify_url,
                    },
                )
            png_bytes = await asyncio.wait_for(
                loop.run_in_executor(
                    _io_pool,
                    functools.partial(
                        _do_cert_with_qr, name, course, issuer, theme,
                        cert_id, verify_url,
                    ),
                ),
                timeout=25.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="Certificate generation timed out")
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition": f"attachment; filename=certificate_{cert_id}.png",
                "X-Cert-Id":    cert_id,
                "X-Verify-Url": verify_url,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"cert xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"cert: {type(e).__name__}: {str(e)[:160]}")


@router.get("/api/cert/verify/{cert_id}")
@limiter.limit("60/minute")
async def verify_cert(request: Request, cert_id: str):
    cert_id = re.sub(r"[^A-Z0-9]", "", cert_id.upper())[:12]
    if not cert_id:
        raise HTTPException(status_code=400, detail="Noto'g'ri cert ID")
    try:
        import database as _db
        cert = await _db.get_cert(cert_id)
        if not cert:
            return JSONResponse(
                {"valid": False, "id": cert_id, "message": "❌ Sertifikat topilmadi"},
                status_code=404,
            )
        issued = cert.get("issued_at")
        if hasattr(issued, "isoformat"):
            issued = issued.isoformat()
        return JSONResponse({
            "valid":     True,
            "id":        cert.get("id"),
            "name":      cert.get("name"),
            "course":    cert.get("course"),
            "issuer":    cert.get("issuer"),
            "theme":     cert.get("theme"),
            "issued_at": issued,
            "message":   "✅ Sertifikat haqiqiy",
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"verify_cert xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Verifikatsiya xato")


# ─── Schedule ─────────────────────────────────────────────────────────────────

_TIME_RE = re.compile(r'\b(\d{1,2}:\d{2})\b')


def _parse_schedule(text: str) -> list:
    result = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        if ':' in line:
            colon = line.index(':')
            day   = line[:colon].strip()
            rest  = line[colon + 1:].strip()
        else:
            result.append((line, []))
            continue

        lessons = []
        for num, part in enumerate(rest.split(','), 1):
            part = part.strip()
            if not part:
                continue
            m = _TIME_RE.search(part)
            if m:
                time_str = m.group(1)
                subject  = (part[:m.start()] + part[m.end():]).strip() or part
            else:
                subject  = part
                time_str = ""
            lessons.append((num, subject[:45], time_str))
        result.append((day[:20], lessons))
    return result


def _do_schedule(text: str) -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    schedule = _parse_schedule(text)
    if not schedule:
        raise ValueError("Bo'sh jadval. Format:\nDushanba: Matematika 8:00, Fizika 10:00")

    flat = []
    for day, lessons in schedule:
        if not lessons:
            flat.append((day, "", "", ""))
        else:
            for idx, (num, subject, time_str) in enumerate(lessons):
                flat.append((day if idx == 0 else "", f"{num}.", subject, time_str))

    W       = 720
    PAD     = 14
    ROW_H   = 46
    TITLE_H = 56
    HDR_H   = 32
    H       = TITLE_H + HDR_H + ROW_H * len(flat) + PAD

    COL_X = [PAD, PAD + 148, PAD + 148 + 32, PAD + 148 + 32 + 400]
    COL_W = [148, 32, 400, 100]  # noqa: F841

    C_BG      = (10,  10,  20)
    C_HDR_BG  = (22,  14,  48)
    C_ROW_A   = (18,  14,  38)
    C_ROW_B   = (12,  10,  26)
    C_BORDER  = (55,  42,  88)
    C_ACCENT  = (139, 92,  246)
    C_DAY     = (180, 150, 255)
    C_TEXT    = (225, 220, 255)
    C_TIME    = (251, 191, 36)
    C_NUM     = (100, 95,  155)
    C_HDR_TXT = (160, 140, 210)

    img  = Image.new("RGB", (W, H), C_BG)
    draw = ImageDraw.Draw(img)

    try:
        fn_title = ImageFont.truetype(FONT_BOLD,    22)
        fn_hdr   = ImageFont.truetype(FONT_BOLD,    13)
        fn_day   = ImageFont.truetype(FONT_BOLD,    15)
        fn_body  = ImageFont.truetype(FONT_REGULAR, 14)
        fn_time  = ImageFont.truetype(FONT_BOLD,    14)
        fn_num   = ImageFont.truetype(FONT_REGULAR, 13)
    except Exception:
        fn_title = fn_hdr = fn_day = fn_body = fn_time = fn_num = ImageFont.load_default()

    def cx(t, f):
        bb = draw.textbbox((0, 0), t, font=f)
        return (W - (bb[2] - bb[0])) // 2

    draw.text((cx("Dars Jadvali", fn_title), 17), "Dars Jadvali", font=fn_title, fill=C_ACCENT)

    y_hdr = TITLE_H
    draw.rectangle([(0, y_hdr), (W, y_hdr + HDR_H)], fill=C_HDR_BG)
    for col, label in enumerate(["Kun", "#", "Fan / Dars", "Vaqt"]):
        draw.text((COL_X[col] + 4, y_hdr + 9), label, font=fn_hdr, fill=C_HDR_TXT)
    draw.line([(0, y_hdr + HDR_H), (W, y_hdr + HDR_H)], fill=C_BORDER)

    y0 = TITLE_H + HDR_H
    for i, (day_label, num_str, subject, time_str) in enumerate(flat):
        y  = y0 + i * ROW_H
        vy = y + (ROW_H - 16) // 2
        draw.rectangle([(0, y), (W, y + ROW_H)], fill=C_ROW_A if i % 2 == 0 else C_ROW_B)
        draw.line([(0, y + ROW_H - 1), (W, y + ROW_H - 1)], fill=C_BORDER)
        if day_label:
            draw.text((COL_X[0] + 4, vy), day_label, font=fn_day, fill=C_DAY)
        if num_str:
            draw.text((COL_X[1], vy), num_str, font=fn_num, fill=C_NUM)
        if subject:
            draw.text((COL_X[2], vy), subject, font=fn_body, fill=C_TEXT)
        if time_str:
            draw.text((COL_X[3], vy), time_str, font=fn_time, fill=C_TIME)

    for col in range(1, 4):
        x_div = COL_X[col] - 2
        draw.line([(x_div, y_hdr), (x_div, H - PAD)], fill=C_BORDER)

    draw.rectangle([(0, 0), (W - 1, H - 1)], outline=C_ACCENT, width=2)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


_SCHEDULE_DAY_IDX = {
    "dushanba": 0, "seshanba": 1, "chorshanba": 2,
    "payshanba": 3, "juma": 4, "shanba": 5, "yakshanba": 6,
    "monday": 0, "tuesday": 1, "wednesday": 2,
    "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
    "понедельник": 0, "вторник": 1, "среда": 2,
    "четверг": 3, "пятница": 4, "суббота": 5, "воскресенье": 6,
}


def _do_schedule_ics(schedule: list, weeks: int = 16) -> bytes:
    from icalendar import Calendar, Event
    import datetime as _dt
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("Asia/Tashkent")
    except Exception:
        tz = _dt.timezone(_dt.timedelta(hours=5))

    cal = Calendar()
    cal.add("prodid",       "-//EduBot Schedule//UZ")
    cal.add("version",      "2.0")
    cal.add("x-wr-calname", "EduBot · Dars jadvali")
    cal.add("x-wr-timezone","Asia/Tashkent")

    today      = _dt.date.today()
    week_start = today - _dt.timedelta(days=today.weekday())

    for day_name, lessons in schedule:
        day_idx = _SCHEDULE_DAY_IDX.get(day_name.lower().strip())
        if day_idx is None:
            continue
        for num, subject, time_str in lessons:
            if not time_str:
                continue
            try:
                h, m = map(int, time_str.split(":"))
                if not (0 <= h <= 23 and 0 <= m <= 59):
                    continue
                dt = _dt.datetime.combine(
                    week_start + _dt.timedelta(days=day_idx),
                    _dt.time(h, m, tzinfo=tz),
                )
            except (ValueError, AttributeError):
                continue

            ev = Event()
            ev.add("uid",     f"{day_idx}-{num}-{h:02d}{m:02d}@edubot.uz")
            ev.add("summary", subject.strip() or f"Dars {num}")
            if subject and subject.strip():
                ev.add("description", f"EduBot · {subject.strip()}")
            ev.add("dtstart", dt)
            ev.add("dtend",   dt + _dt.timedelta(minutes=90))
            ev.add("rrule",   {"freq": "weekly", "count": weeks})
            cal.add_component(ev)

    return cal.to_ical()


@router.post("/api/schedule")
@limiter.limit("20/minute")
async def make_schedule(request: Request):
    user_id = _get_user_id(request)
    try:
        body = await request.json()
        text = (body.get("text") or "").strip()
        fmt  = str(body.get("format", "png")).lower()
        if not text:
            raise HTTPException(status_code=400,
                detail="Jadval kiriting.\nFormat: Dushanba: Matematika 8:00, Fizika 10:00")
        if len(text) > 3000:
            text = text[:3000]
        if fmt not in ("png", "ics"):
            fmt = "png"

        if fmt == "ics":
            try:
                schedule = _parse_schedule(text)
                if not schedule:
                    raise HTTPException(status_code=400,
                        detail="Jadval tushunarsiz. Format: Dushanba: Matematika 8:00")
                loop      = asyncio.get_running_loop()
                ics_bytes = await loop.run_in_executor(_io_pool, _do_schedule_ics, schedule)
                return Response(
                    content=ics_bytes,
                    media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=schedule.ics"},
                )
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(f"schedule ics xato: {e} — PNG fallback")

        loop   = asyncio.get_running_loop()
        result = await loop.run_in_executor(_io_pool, _do_schedule, text)
        return Response(
            content=result,
            media_type="image/png",
            headers={"Content-Disposition": "attachment; filename=schedule.png"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"schedule xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"schedule: {type(e).__name__}: {str(e)[:160]}")


# ─── Translate ────────────────────────────────────────────────────────────────

_LANG_ALIASES = {
    "uzb": "uz", "rus": "ru", "eng": "en", "tur": "tr",
    "deu": "de", "fra": "fr", "zho": "zh-CN", "jpn": "ja",
    "kor": "ko", "ara": "ar", "kaz": "kk", "kir": "ky",
    "spa": "es", "por": "pt", "ita": "it", "pol": "pl",
    "nld": "nl", "swe": "sv", "nor": "no", "dan": "da",
    "fin": "fi", "hin": "hi", "ben": "bn", "tha": "th",
    "vie": "vi", "ind": "id", "fas": "fa", "ukr": "uk",
}


def _do_translate(query: str, lang: str) -> str:
    try:
        from deep_translator import GoogleTranslator
        result = GoogleTranslator(source="auto", target=lang).translate(query)
        if result and result.strip():
            return result.strip()
    except Exception as google_err:
        logger.warning(f"translate google xato: {google_err}")

    # argostranslate (offline NMT) is heavy on RAM and rarely has models
    # installed on Railway's basic tier — opt-in only via ARGOS_TRANSLATE=1.
    if os.environ.get("ARGOS_TRANSLATE", "").strip().lower() in ("1", "true", "yes"):
        try:
            import argostranslate.translate as _at
            installed = _at.get_installed_languages()
            lang_map  = {l.code: l for l in installed}
            for src_code in ("en", "ru", "uz"):
                if src_code == lang:
                    continue
                if src_code in lang_map and lang in lang_map:
                    translation = lang_map[src_code].get_translation(lang_map[lang])
                    if translation:
                        result = translation.translate(query)
                        if result and result.strip():
                            return result.strip()
        except Exception as argo_err:
            logger.debug(f"argostranslate xato: {argo_err}")

    chunk  = query[:500]
    suffix = "\n⚠️ Faqat 500 belgi tarjima qilindi (MyMemory chegarasi)" if len(query) > 500 else ""
    # Cumulative deadline so the 3-source fallback can't exceed the outer 20s
    # budget and leak a busy worker thread on a slow network.
    deadline = time.monotonic() + 12.0
    for src in ("uz", "ru", "en"):
        if src == lang:
            continue
        remaining = deadline - time.monotonic()
        if remaining <= 1.0:
            break
        try:
            r   = httpx.get(
                "https://api.mymemory.translated.net/get",
                params={"q": chunk, "langpair": f"{src}|{lang}"},
                timeout=min(6.0, remaining),
            )
            d   = r.json()
            txt = (d.get("responseData") or {}).get("translatedText", "")
            if d.get("responseStatus") == 200 and txt and txt.strip() != chunk.strip():
                return txt + suffix
        except Exception:
            continue
    raise RuntimeError("Tarjima amalga oshmadi. Keyinroq urinib ko'ring.")


@router.post("/api/translate")
@limiter.limit("20/minute")
async def translate(request: Request):
    user_id = _get_user_id(request)
    body = await request.json()
    raw  = (body.get("text") or "").strip()
    if not raw:
        return JSONResponse({"result": "❌ Matn kiriting.\n\nFormat:\nTarjima qilinadigan matn\nen  (til kodi — ixtiyoriy, default: en)"})

    lines = raw.split("\n")
    last  = lines[-1].strip()
    if len(lines) >= 2 and last and len(last) <= 7 and " " not in last:
        lang  = _LANG_ALIASES.get(last.lower(), last.lower())
        query = "\n".join(lines[:-1]).strip()
    else:
        lang  = "en"
        query = raw

    if not query:
        return JSONResponse({"result": "❌ Matn kiriting."})
    if len(query) > 4500:
        query = query[:4500]

    try:
        loop   = asyncio.get_running_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(_io_pool, _do_translate, query, lang),
            timeout=20.0,
        )
        logger.info(f"translate: {len(query)} belgi → {lang}")
        return JSONResponse({"result": f"🌐 → {lang}\n\n{result}"})
    except asyncio.TimeoutError:
        return JSONResponse({"result": "❌ Tarjima vaqti tugadi (20s). Matnni qisqartiring."})
    except Exception as e:
        return JSONResponse({"result": f"❌ {e}"})


# ─── Wikipedia (proxy) ────────────────────────────────────────────────────────

_WIKI_HEADERS = {
    "User-Agent": "EduBot/1.0 (https://t.me/edubot; contact@edubot.uz) httpx/0.27",
    "Accept":     "application/json",
}


async def _wiki_search_titles(client, lang: str, q: str) -> list:
    titles = []
    try:
        sr = await client.get(
            f"https://{lang}.wikipedia.org/w/api.php",
            params={"action": "opensearch", "search": q, "limit": 5,
                    "namespace": 0, "format": "json"},
        )
        if sr.status_code == 200:
            j = sr.json()
            if isinstance(j, list) and len(j) > 1 and isinstance(j[1], list):
                titles = [t for t in j[1] if t]
    except Exception:
        pass

    if not titles:
        try:
            sr2 = await client.get(
                f"https://{lang}.wikipedia.org/w/api.php",
                params={"action": "query", "list": "search", "srsearch": q,
                        "srlimit": 5, "format": "json"},
            )
            if sr2.status_code == 200:
                data   = sr2.json().get("query", {}).get("search", [])
                titles = [s["title"] for s in data if s.get("title")]
        except Exception:
            pass
    return titles


async def _wiki_fetch_full(client, lang: str, title: str) -> Optional[dict]:
    encoded = url_quote(title, safe="")
    try:
        r = await client.get(f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{encoded}")
        if r.status_code != 200:
            return None
        d = r.json()
        if not d.get("extract"):
            return None
        thumb   = d.get("thumbnail") or {}
        urls    = d.get("content_urls") or {}
        desktop = urls.get("desktop") or {}
        return {
            "title":       d.get("title", title),
            "extract":     d.get("extract", ""),
            "description": d.get("description", "") or "",
            "thumbnail":   thumb.get("source", "") or "",
            "url":         desktop.get("page", "") or "",
            "type":        d.get("type", "standard"),
            "lang":        lang,
        }
    except Exception:
        return None


async def _wiki_fetch_related(client, lang: str, title: str, limit: int = 5) -> list:
    encoded = url_quote(title, safe="")
    try:
        r = await client.get(
            f"https://{lang}.wikipedia.org/api/rest_v1/page/related/{encoded}"
        )
        if r.status_code == 200:
            pages = r.json().get("pages", [])
            return [p.get("title", "") for p in pages[:limit] if p.get("title")]
    except Exception:
        pass
    return []


@_cache.cached(ttl=3600, key_prefix="wiki_v2")
async def _wiki_lookup(q: str, pref_lang: str) -> dict:
    langs = ([pref_lang] + [l for l in ["uz", "ru", "en"] if l != pref_lang]) if pref_lang else ["uz", "ru", "en"]
    async with httpx.AsyncClient(timeout=15, headers=_WIKI_HEADERS, follow_redirects=True) as client:
        for lang in langs:
            try:
                titles = await _wiki_search_titles(client, lang, q)
                if not titles:
                    titles = [q]

                primary     = None
                alts_titles = []
                for title in titles[:5]:
                    info = await _wiki_fetch_full(client, lang, title)
                    if not info:
                        continue
                    if info["type"] == "disambiguation":
                        continue
                    if primary is None:
                        primary = info
                    else:
                        alts_titles.append(info["title"])
                    if len(alts_titles) >= 3:
                        break

                if not primary:
                    continue

                related = await _wiki_fetch_related(client, lang, primary["title"], limit=5)

                return {
                    "title":        primary["title"],
                    "extract":      primary["extract"],
                    "description":  primary["description"],
                    "thumbnail":    primary["thumbnail"],
                    "url":          primary["url"],
                    "lang":         lang.upper(),
                    "alternatives": alts_titles,
                    "related":      related,
                }
            except Exception as e:
                logger.warning(f"wiki [{lang}] xato: {type(e).__name__}: {str(e)[:80]}")
                continue
    return {}


def _wiki_format_text(d: dict) -> str:
    if not d:
        return ""
    parts = [f"📖 {d['title']} [{d['lang']}]"]
    if d.get("description"):
        parts.append(f"_{d['description']}_")
    parts.append("")
    parts.append(d["extract"])
    if d.get("url"):
        parts.append(f"\n🔗 {d['url']}")
    if d.get("alternatives"):
        parts.append(f"\n📚 Boshqa natijalar: " + " · ".join(d["alternatives"]))
    if d.get("related"):
        parts.append(f"📎 Tegishli: " + " · ".join(d["related"][:3]))
    return "\n".join(parts)


@router.post("/api/wiki")
@limiter.limit("20/minute")
async def wiki(request: Request):
    user_id   = _get_user_id(request)
    body      = await request.json()
    q         = (body.get("text") or "").strip()[:200]
    pref_lang = (body.get("lang") or "").strip().lower()[:5]
    if not q:
        return JSONResponse({"result": "❌ Qidiruv so'zini kiriting"})
    data = await _wiki_lookup(q, pref_lang)
    if not data:
        return JSONResponse({"result": "❌ Wikipedia'da topilmadi. Boshqa so'z bilan qidiring."})
    return JSONResponse({
        "result":       _wiki_format_text(data),
        "title":        data["title"],
        "extract":      data["extract"],
        "description":  data.get("description", ""),
        "thumbnail":    data.get("thumbnail", ""),
        "url":          data.get("url", ""),
        "lang":         data["lang"],
        "alternatives": data.get("alternatives", []),
        "related":      data.get("related", []),
    })


# ─── Books (proxy) ────────────────────────────────────────────────────────────

@_cache.cached(ttl=21600, key_prefix="books")
async def _books_lookup(q: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            gb_task = client.get(
                "https://www.googleapis.com/books/v1/volumes",
                params={"q": q, "maxResults": 6, "printType": "books"},
            )
            ol_task = client.get(
                "https://openlibrary.org/search.json",
                params={"q": q, "limit": 6,
                        "fields": "title,author_name,first_publish_year"},
            )
            gb_r, ol_r = await asyncio.gather(gb_task, ol_task, return_exceptions=True)

        lines = []
        seen  = set()
        if not isinstance(gb_r, Exception) and gb_r.status_code == 200:
            for item in (gb_r.json().get("items") or [])[:6]:
                info  = item.get("volumeInfo", {})
                title = info.get("title", "")
                if not title or title.lower() in seen:
                    continue
                seen.add(title.lower())
                line    = f"📗 {title}"
                authors = info.get("authors", [])
                if authors:
                    line += f"\n   ✍️ {', '.join(authors[:2])}"
                year = (info.get("publishedDate") or "")[:4]
                if year:
                    line += f"  📅 {year}"
                preview = info.get("previewLink", "")
                if preview:
                    line += f"\n   🔗 {preview}"
                lines.append(line)
        if not isinstance(ol_r, Exception) and ol_r.status_code == 200:
            for b in (ol_r.json().get("docs") or [])[:6]:
                title = b.get("title", "")
                if not title or title.lower() in seen:
                    continue
                seen.add(title.lower())
                line = f"📘 {title}"
                if b.get("author_name"):
                    line += f"\n   ✍️ {b['author_name'][0]}"
                if b.get("first_publish_year"):
                    line += f"  📅 {b['first_publish_year']}"
                lines.append(line)
        if not lines:
            return ""
        return "📚 Natijalar:\n\n" + "\n\n".join(lines[:8])
    except Exception:
        return ""


@router.post("/api/books")
@limiter.limit("20/minute")
async def books(request: Request):
    user_id = _get_user_id(request)
    body   = await request.json()
    q      = (body.get("text") or "").strip()[:200]
    if not q:
        return JSONResponse({"result": "❌ Kitob nomi yoki muallifni kiriting"})
    result = await _books_lookup(q)
    if not result:
        return JSONResponse({"result": "📚 Kitob topilmadi"})
    return JSONResponse({"result": result})


# ─── ZIP ──────────────────────────────────────────────────────────────────────

@router.post("/api/zip")
@limiter.limit("20/minute")
async def make_zip(
    request: Request,
    files: List[UploadFile] = File(...),
    password: Optional[str] = Form(None),
):
    user_id = _get_user_id(request)
    _ZIP_MAX_FILES = 100
    try:
        if password is not None and len(password) > 128:
            raise HTTPException(status_code=400, detail="Parol 128 belgidan oshmasligi kerak")
        if len(files) > _ZIP_MAX_FILES:
            raise HTTPException(status_code=400,
                detail=f"Maksimal {_ZIP_MAX_FILES} fayl ZIP ga qo'shilishi mumkin")

        buf      = io.BytesIO()
        data_list = await read_uploads(files, "/api/zip")
        entries  = [
            (os.path.basename(f.filename or "file") or "file", data)
            for f, data in zip(files, data_list)
        ]
        count    = len(entries)

        if password:
            import pyzipper
            with pyzipper.AESZipFile(buf, "w",
                                     compression=pyzipper.ZIP_DEFLATED,
                                     encryption=pyzipper.WZ_AES) as zf:
                zf.setpassword(password.encode("utf-8"))
                for name, content in entries:
                    zf.writestr(name, content)
        else:
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
                for name, content in entries:
                    zf.writestr(name, content)

        info = f"{count} fayl → archive.zip" + (" (parollangan)" if password else "")
        return Response(
            content=buf.getvalue(),
            media_type="application/zip",
            headers={
                "Content-Disposition": "attachment; filename=archive.zip",
                "X-Info": safe_header(info),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"zip xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"zip: {type(e).__name__}: {str(e)[:160]}")


# ─── Unzip ────────────────────────────────────────────────────────────────────

_UNZIP_MAX_FILES     = 500
_UNZIP_MAX_UNCOMP_MB = 200
_UNZIP_MAX_RATIO     = 50


def _build_response_from_entries(entries: list) -> Response:
    if len(entries) == 1:
        name, content = entries[0]
        safe = os.path.basename(name) or "file"
        return Response(
            content=content,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={url_quote(safe)}"},
        )
    out = io.BytesIO()
    name_counts: dict = {}
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for name, content in entries:
            safe = os.path.basename(name) or "file"
            if safe in name_counts:
                name_counts[safe] += 1
                dot = safe.rfind(".")
                if dot > 0:
                    safe = f"{safe[:dot]}_{name_counts[safe]}{safe[dot:]}"
                else:
                    safe = f"{safe}_{name_counts[safe]}"
            else:
                name_counts[safe] = 0
            zout.writestr(safe, content)
    return Response(
        content=out.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=extracted.zip",
            "X-Info": safe_header(f"{len(entries)} fayl"),
        },
    )


@router.post("/api/unzip")
@limiter.limit("20/minute")
async def unzip_file(request: Request, file: UploadFile = File(...)):
    user_id = _get_user_id(request)
    try:
        data  = await read_upload(file, "/api/unzip")
        fname = (file.filename or "").lower()

        is_7z = fname.endswith(".7z") or data[:6] == b"7z\xbc\xaf'\x1c"
        if is_7z:
            try:
                import py7zr
                with py7zr.SevenZipFile(io.BytesIO(data), mode="r") as sz:
                    names = sz.getnames()
                    if not names:
                        raise HTTPException(status_code=400, detail="7z ichida fayl yo'q")
                    if len(names) > _UNZIP_MAX_FILES:
                        raise HTTPException(status_code=400,
                            detail=f"7z ichida {len(names)} fayl — maksimal {_UNZIP_MAX_FILES}")
                    # 7z achieves extreme ratios — guard the uncompressed size and
                    # the compression ratio BEFORE readall() loads everything to RAM.
                    try:
                        total_uncomp = sum(
                            getattr(fi, "uncompressed", 0) or 0 for fi in sz.list()
                        )
                    except Exception:
                        total_uncomp = 0
                    if total_uncomp > _UNZIP_MAX_UNCOMP_MB * 1024 * 1024:
                        raise HTTPException(status_code=400,
                            detail=f"Siqilmagan hajm {total_uncomp // (1024*1024)} MB — maksimal {_UNZIP_MAX_UNCOMP_MB} MB")
                    if len(data) > 0 and total_uncomp / len(data) > _UNZIP_MAX_RATIO:
                        raise HTTPException(status_code=400, detail="7z bomb aniqlandi — fayl xavfsiz emas")
                    all_data_dict = sz.readall() or {}
                entries = [
                    (os.path.basename(n) or "file", buf.read())
                    for n, buf in all_data_dict.items()
                    if buf is not None
                ]
                return _build_response_from_entries(entries)
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=422, detail=f"7z ochib bo'lmadi: {e}")

        import tarfile as _tarfile
        is_tar = (
            fname.endswith((".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz", ".txz"))
            or data[:5] == b"ustar"
            or data[:2] == b"\x1f\x8b"
        )
        if is_tar:
            try:
                tf      = _tarfile.open(fileobj=io.BytesIO(data))
                members = [m for m in tf.getmembers() if m.isfile()]
                if not members:
                    raise HTTPException(status_code=400, detail="TAR ichida fayl yo'q")
                if len(members) > _UNZIP_MAX_FILES:
                    raise HTTPException(status_code=400,
                        detail=f"TAR ichida {len(members)} fayl — maksimal {_UNZIP_MAX_FILES}")
                total_uncomp = sum(m.size for m in members)
                if total_uncomp > _UNZIP_MAX_UNCOMP_MB * 1024 * 1024:
                    raise HTTPException(status_code=400,
                        detail=f"Siqilmagan hajm {total_uncomp // (1024*1024)} MB — maksimal {_UNZIP_MAX_UNCOMP_MB} MB")
                entries = []
                for m in members:
                    f_obj = tf.extractfile(m)
                    if f_obj:
                        safe = os.path.basename(m.name) or "file"
                        entries.append((safe, f_obj.read()))
                tf.close()
                return _build_response_from_entries(entries)
            except HTTPException:
                raise
            except Exception:
                pass

        if data[:2] != b'PK':
            raise HTTPException(status_code=400,
                detail="Bu fayl ZIP arxivi emas. .zip fayl yuklang.")
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400,
                detail="ZIP fayl buzilgan yoki noto'g'ri format. Boshqa .zip fayl yuklang.")

        with zf:
            all_infos = [i for i in zf.infolist() if not i.filename.endswith("/")]
            if not all_infos:
                raise HTTPException(status_code=400, detail="ZIP ichida fayl yo'q")
            if len(all_infos) > _UNZIP_MAX_FILES:
                raise HTTPException(status_code=400,
                    detail=f"ZIP ichida {len(all_infos)} fayl — maksimal {_UNZIP_MAX_FILES}")

            total_uncomp = sum(i.file_size for i in all_infos)
            if total_uncomp > _UNZIP_MAX_UNCOMP_MB * 1024 * 1024:
                raise HTTPException(status_code=400,
                    detail=f"Siqilmagan hajm {total_uncomp // (1024*1024)} MB — maksimal {_UNZIP_MAX_UNCOMP_MB} MB")
            if len(data) > 0 and total_uncomp / len(data) > _UNZIP_MAX_RATIO:
                raise HTTPException(status_code=400, detail="ZIP bomb aniqlandi — fayl xavfsiz emas")

            entries = [(i.filename, zf.read(i.filename)) for i in all_infos]
        return _build_response_from_entries(entries)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"unzip xato: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"unzip: {type(e).__name__}: {str(e)[:160]}")
