from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
import io
import os
import tempfile
import httpx

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
APP_URL = os.environ.get("APP_URL", "https://nematovbegz0d.github.io/studentsTools/EduBot.html")

app = FastAPI(title="EduBot Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Webhook setup ───────────────────────────────────────────────

@app.on_event("startup")
async def set_webhook():
    domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
    if not BOT_TOKEN or not domain:
        return
    webhook_url = f"https://{domain}/webhook"
    async with httpx.AsyncClient() as client:
        await client.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook",
            json={"url": webhook_url, "drop_pending_updates": True},
        )


async def tg_send(chat_id: int, text: str, reply_markup: dict = None):
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    async with httpx.AsyncClient() as client:
        await client.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            json=payload,
        )


@app.post("/webhook")
async def webhook(request: Request):
    if not BOT_TOKEN:
        return {"ok": False}

    update = await request.json()
    message = update.get("message") or update.get("edited_message")
    if not message:
        return {"ok": True}

    chat_id = message.get("chat", {}).get("id")
    text = message.get("text", "")
    user = message.get("from", {})
    first_name = user.get("first_name", "Do'st")

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
            reply_markup={
                "inline_keyboard": [[
                    {"text": "📱 Ilovani ochish", "web_app": {"url": APP_URL}}
                ]]
            },
        )
    else:
        await tg_send(
            chat_id,
            "📱 Barcha xizmatlar ilovada mavjud:",
            reply_markup={
                "inline_keyboard": [[
                    {"text": "📱 Ilovani ochish", "web_app": {"url": APP_URL}}
                ]]
            },
        )

    return {"ok": True}


# ─── Health ──────────────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "service": "EduBot Backend"}


# ─── Send file to user via bot ───────────────────────────────────

@app.post("/api/send-file")
async def send_file_to_user(
    user_id: str = Form(...),
    filename: str = Form(...),
    file: UploadFile = File(...),
):
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot sozlanmagan")
    data = await file.read()
    mime = file.content_type or "application/octet-stream"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument",
            data={"chat_id": user_id, "caption": f"📎 {filename}\n\n🤖 EduBot"},
            files={"document": (filename, data, mime)},
        )
    result = r.json()
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("description", "Xatolik"))
    return {"ok": True}


# ─── File processing endpoints ───────────────────────────────────

_rembg_session = None

def get_rembg_session():
    global _rembg_session
    if _rembg_session is None:
        from rembg import new_session
        _rembg_session = new_session("u2netp")  # 4MB, Railway memory-safe
    return _rembg_session

@app.post("/api/bgremove")
async def bgremove(request: Request):
    try:
        from rembg import remove
        import base64
        ct = request.headers.get("content-type", "")
        if "multipart" in ct:
            form = await request.form()
            file = form.get("file")
            data = await file.read()
        else:
            body = await request.json()
            data = base64.b64decode(body["data"])
        result = remove(data, session=get_rembg_session())
        return Response(
            content=result,
            media_type="image/png",
            headers={"Content-Disposition": "attachment; filename=no-bg.png"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ocr")
async def ocr(request: Request):
    try:
        import pytesseract
        from PIL import Image
        import base64
        ct = request.headers.get("content-type", "")
        if "multipart" in ct:
            form = await request.form()
            file = form.get("file")
            data = await file.read()
        else:
            body = await request.json()
            data = base64.b64decode(body["data"])
        img = Image.open(io.BytesIO(data))
        text = pytesseract.image_to_string(img, lang="rus+eng+uzb")
        return JSONResponse({"text": text.strip() or "Matn topilmadi"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/pdf2docx")
async def pdf_to_docx(file: UploadFile = File(...)):
    try:
        from pdf2docx import Converter

        data = await file.read()
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(data)
            pdf_path = tmp.name

        docx_path = pdf_path.replace(".pdf", ".docx")
        try:
            cv = Converter(pdf_path)
            cv.convert(docx_path, start=0, end=None)
            cv.close()
            with open(docx_path, "rb") as f:
                docx_data = f.read()
            return Response(
                content=docx_data,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": "attachment; filename=converted.docx"},
            )
        finally:
            os.unlink(pdf_path)
            if os.path.exists(docx_path):
                os.unlink(docx_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
