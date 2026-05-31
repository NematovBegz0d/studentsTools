FROM python:3.11-slim

# Tesseract + til paketlari + OpenCV + LibreOffice (Writer+Calc) dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-rus \
    tesseract-ocr-uzb \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    fonts-dejavu \
    fonts-dejavu-core \
    ghostscript \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    shared-mime-info \
    libheif1 \
    libde265-0 \
    fontconfig \
    fonts-liberation2 \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-noto-core \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ENV SAL_USE_VCLPLUGIN=svp \
    PYTHONUNBUFFERED=1

RUN groupadd -r -g 1000 appgroup && useradd -r -u 1000 -g appgroup appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py database.py payment.py cache.py shared.py startup_checks.py admin.html ./
COPY routers ./routers

RUN chown -R appuser:appgroup /app

USER 1000

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f\"http://localhost:{os.environ.get('PORT','8000')}/health\")"

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
