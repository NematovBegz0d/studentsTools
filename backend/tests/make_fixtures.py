"""Generate realistic test fixture PDFs and save them to tests/fixtures/.

Run once before testing:
    python tests/make_fixtures.py
    python tests/make_fixtures.py --force   # overwrite existing

Also called automatically by conftest.py when fixtures are missing.
"""
import io
import os
import sys

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def fixture_path(name: str) -> str:
    return os.path.join(FIXTURES_DIR, name)


# ─── scanned.pdf: image-only pages (no selectable text) ─────────────────────

def make_scanned_pdf():
    """Embed JPEG images as full-page content (mimics a flatbed scanner output)."""
    import pikepdf
    from PIL import Image, ImageDraw, ImageFilter

    pdf = pikepdf.new()
    for page_num in range(2):
        img = Image.new("L", (800, 1100), color=248)
        draw = ImageDraw.Draw(img)
        # Simulate printed text lines
        for y in range(90, 1000, 38):
            shade = 100 + (y * 13 % 60)
            draw.line([(55, y), (735, y)], fill=shade, width=2)
        # Simulate a header block
        draw.rectangle([50, 40, 750, 75], fill=140)
        img = img.filter(ImageFilter.GaussianBlur(radius=0.4))

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=65)
        jpeg_bytes = buf.getvalue()

        img_obj = pikepdf.Stream(pdf, jpeg_bytes)
        img_obj.stream_dict = pikepdf.Dictionary(
            Type=pikepdf.Name("/XObject"),
            Subtype=pikepdf.Name("/Image"),
            Width=800,
            Height=1100,
            ColorSpace=pikepdf.Name("/DeviceGray"),
            BitsPerComponent=8,
            Filter=pikepdf.Name("/DCTDecode"),
        )
        page = pikepdf.Dictionary(
            Type=pikepdf.Name("/Page"),
            MediaBox=[0, 0, 595, 842],
            Resources=pikepdf.Dictionary(XObject=pikepdf.Dictionary(Im0=img_obj)),
            Contents=pikepdf.Stream(pdf, b"q 595 0 0 842 0 0 cm /Im0 Do Q"),
        )
        pdf.pages.append(pikepdf.Page(page))

    pdf.save(fixture_path("scanned.pdf"))
    pdf.close()


# ─── table.pdf: table-heavy PDF with real text content ───────────────────────

def make_table_pdf():
    """Create a PDF containing a data table via reportlab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph("EduBot — Student Results Table", styles["Heading1"]))
    elements.append(Spacer(1, 12))

    rows = [
        ["#", "Name", "Subject", "Score", "Grade", "Semester"],
        ["1", "Ali Valiyev", "Mathematics", "95", "A", "Fall 2024"],
        ["2", "Zulfiya Karimova", "Physics", "88", "B+", "Fall 2024"],
        ["3", "Bobur Toshmatov", "Chemistry", "91", "A-", "Fall 2024"],
        ["4", "Malika Yusupova", "Biology", "76", "C+", "Fall 2024"],
        ["5", "Jasur Mirzayev", "English", "98", "A+", "Fall 2024"],
        ["6", "Dilnoza Xasanova", "History", "82", "B", "Fall 2024"],
        ["7", "Sherzod Nurullayev", "Computer Sci", "97", "A+", "Fall 2024"],
        ["8", "Nargiza Isoqova", "Literature", "85", "B+", "Fall 2024"],
        ["9", "Ulugbek Rahimov", "Geography", "79", "C+", "Fall 2024"],
        ["10", "Feruza Holmatova", "Art", "93", "A", "Fall 2024"],
    ]

    t = Table(rows, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0),  colors.HexColor("#4f46e5")),
        ("TEXTCOLOR",    (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("GRID",         (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0efff")]),
        ("ALIGN",        (3, 0), (3, -1),  "CENTER"),
    ]))
    elements.append(t)
    doc.build(elements)

    with open(fixture_path("table.pdf"), "wb") as f:
        f.write(buf.getvalue())


# ─── cyrillic.pdf: Cyrillic/Uzbek text PDF ───────────────────────────────────

def make_cyrillic_pdf():
    """Create a PDF with extractable mixed Cyrillic/Uzbek text."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    try:
        pdfmetrics.registerFont(TTFont("DejaVu", font_path))
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", bold_path))
        font, bold = "DejaVu", "DejaVu-Bold"
    except Exception:
        font = bold = "Helvetica"

    c = canvas.Canvas(fixture_path("cyrillic.pdf"), pagesize=A4)
    width, height = A4
    y = height - 60
    c.setFont(bold, 16)
    c.drawString(50, y, "Ўқув жадвали / Учебное расписание")
    y -= 34
    c.setFont(font, 11)
    lines = [
        "Душанба: Математика 08:00, Физика 10:00",
        "Сешанба: Рус тили 09:00, Тарих 11:00",
        "Чоршанба: Кимё 08:30, Биология 10:30",
        "Пайшанба: Жисмоний тарбия 09:00",
        "Жума: Математика 08:00, Геометрия 10:00",
        "Понедельник: Математика 08:00, Физика 10:00",
        "Вторник: Русский язык 09:00, История 11:00",
        "Среда: Химия 08:30, Биология 10:30",
        "Четверг: Физкультура 09:00, Литература 11:00",
        "Пятница: Математика 08:00, Геометрия 10:00",
        "Talabalar reytingi / Рейтинг студентов:",
        "1. Aliyev Ali — 95 ball (Matematika)",
        "2. Karimova Zulfiya — 88 ball (Fizika)",
        "3. Тошматов Бобур — 91 балл",
    ]
    for line in lines:
        c.drawString(50, y, line)
        y -= 22
    c.save()


# ─── image_heavy.pdf: 4 pages each with a colour image ───────────────────────

def make_image_heavy_pdf():
    """Create a 4-page PDF with a large colour JPEG on each page."""
    import pikepdf
    from PIL import Image, ImageDraw

    pdf = pikepdf.new()
    subjects = [
        ((210, 55, 55),  "Mathematics"),
        ((55, 120, 210), "Physics"),
        ((55, 170, 80),  "Chemistry"),
        ((170, 90, 200), "Biology"),
    ]

    for bg_rgb, label in subjects:
        img = Image.new("RGB", (560, 400), color=bg_rgb)
        draw = ImageDraw.Draw(img)
        draw.rectangle([15, 15, 545, 385], outline=(255, 255, 255), width=5)
        # Simulate content rows
        for row in range(5):
            y0 = 60 + row * 60
            draw.rectangle([40, y0, 520, y0 + 40], fill=tuple(min(c + 40, 255) for c in bg_rgb))
            draw.text((50, y0 + 10), f"{label} — Chapter {row + 1}", fill=(255, 255, 255))

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        jpeg_bytes = buf.getvalue()

        img_obj = pikepdf.Stream(pdf, jpeg_bytes)
        img_obj.stream_dict = pikepdf.Dictionary(
            Type=pikepdf.Name("/XObject"),
            Subtype=pikepdf.Name("/Image"),
            Width=560,
            Height=400,
            ColorSpace=pikepdf.Name("/DeviceRGB"),
            BitsPerComponent=8,
            Filter=pikepdf.Name("/DCTDecode"),
        )
        page = pikepdf.Dictionary(
            Type=pikepdf.Name("/Page"),
            MediaBox=[0, 0, 595, 842],
            Resources=pikepdf.Dictionary(XObject=pikepdf.Dictionary(Im0=img_obj)),
            Contents=pikepdf.Stream(pdf, b"q 595 0 0 595 0 124 cm /Im0 Do Q"),
        )
        pdf.pages.append(pikepdf.Page(page))

    pdf.save(fixture_path("image_heavy.pdf"))
    pdf.close()


# ─── broken.pdf: a truncated / corrupted PDF ─────────────────────────────────

def make_broken_pdf():
    """Truncate a valid PDF to ~35% of its length — recognisable magic bytes, not parseable."""
    import pikepdf

    pdf = pikepdf.new()
    for _ in range(2):
        pdf.add_blank_page(page_size=(595, 842))
    buf = io.BytesIO()
    pdf.save(buf)
    pdf.close()

    data = buf.getvalue()
    # Keep first 35% — has %PDF magic but missing xref/trailer
    truncated = data[:max(8, len(data) * 35 // 100)]
    with open(fixture_path("broken.pdf"), "wb") as f:
        f.write(truncated)


# ─── Registry & entry point ───────────────────────────────────────────────────

_FIXTURES = {
    "scanned.pdf":     make_scanned_pdf,
    "table.pdf":       make_table_pdf,
    "cyrillic.pdf":    make_cyrillic_pdf,
    "image_heavy.pdf": make_image_heavy_pdf,
    "broken.pdf":      make_broken_pdf,
}


def ensure_fixtures(force: bool = False) -> list[str]:
    """Create any missing fixtures.

    Returns list of fixture *names* that FAILED to generate (empty = all OK).
    Callers in CI should treat a non-empty return as a hard error.
    """
    os.makedirs(FIXTURES_DIR, exist_ok=True)
    failed: list[str] = []
    for name, fn in _FIXTURES.items():
        dest = fixture_path(name)
        if force or not os.path.exists(dest):
            try:
                fn()
            except Exception as exc:
                import warnings
                warnings.warn(f"Fixture {name!r} failed: {exc}", stacklevel=2)
                failed.append(name)
    return failed


if __name__ == "__main__":
    force = "--force" in sys.argv
    print(f"Generating fixtures → {FIXTURES_DIR}")
    os.makedirs(FIXTURES_DIR, exist_ok=True)
    failed_names: list[str] = []
    for name, fn in _FIXTURES.items():
        dest = fixture_path(name)
        if force or not os.path.exists(dest):
            try:
                fn()
                print(f"  Created : {name}")
            except Exception as e:
                print(f"  FAILED  : {name} — {e}", file=sys.stderr)
                failed_names.append(name)
        else:
            print(f"  Exists  : {name}")
    if failed_names:
        print(f"\nERROR: {len(failed_names)} fixture(s) failed: {', '.join(failed_names)}", file=sys.stderr)
        sys.exit(1)
    print("Done.")
