from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
import io
import os
import tempfile

app = FastAPI(title="EduBot Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health():
    return {"status": "ok", "service": "EduBot Backend"}


@app.post("/api/bgremove")
async def bgremove(file: UploadFile = File(...)):
    try:
        from rembg import remove
        data = await file.read()
        result = remove(data)
        return Response(
            content=result,
            media_type="image/png",
            headers={"Content-Disposition": "attachment; filename=no-bg.png"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ocr")
async def ocr(file: UploadFile = File(...)):
    try:
        import pytesseract
        from PIL import Image

        data = await file.read()
        img = Image.open(io.BytesIO(data))
        # rus+eng+uzb — Railway Dockerfile'da o'rnatiladi
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
