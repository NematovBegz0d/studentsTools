FROM python:3.11-slim

# Tesseract + til paketlari + OpenCV dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-rus \
    tesseract-ocr-uzb \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
