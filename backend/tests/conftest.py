"""Pytest configuration — adds backend/ to sys.path, provides shared fixtures,
file-verification helpers, and realistic disk-based PDF fixtures.
"""
import io
import os
import sys
import struct
import zipfile
import zlib

import pytest

# ─── sys.path ─────────────────────────────────────────────────────────────────

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# ─── Environment (must happen before any app import) ─────────────────────────

os.environ.setdefault("DB_PATH", ":memory:")
# Clear BOT_TOKEN so _get_user_id falls back to X-User-Id (easy test auth).
# Auth tests that need BOT_TOKEN set must patch shared.BOT_TOKEN themselves.
os.environ["BOT_TOKEN"] = ""


# ─── Fixtures dir ─────────────────────────────────────────────────────────────

_FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.fixture(scope="session")
def fixtures_dir() -> str:
    return _FIXTURES_DIR


_IN_CI = bool(os.environ.get("CI"))


@pytest.fixture(scope="session", autouse=True)
def _ensure_fixtures():
    """Generate realistic fixture PDFs on first run.

    In CI (CI env var set) any generation failure is a hard error — the test
    run must not silently skip endpoint tests that depend on real fixtures.
    Locally, failures are non-fatal so developers without all deps can still
    run the fast subset of tests.
    """
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from make_fixtures import ensure_fixtures
        failed = ensure_fixtures()
        if failed and _IN_CI:
            pytest.fail(
                f"Fixture generation failed in CI for: {', '.join(failed)}. "
                f"Run `python tests/make_fixtures.py` locally to debug."
            )
    except Exception as exc:
        if _IN_CI:
            pytest.fail(f"make_fixtures import/run failed in CI: {exc}")
        else:
            import warnings
            warnings.warn(f"make_fixtures failed — disk fixtures will be skipped: {exc}")


# ─── App / HTTP client ────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    from main import app as _app
    return _app


@pytest.fixture(scope="session")
def client(app):
    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ─── Auth helpers ─────────────────────────────────────────────────────────────

# With BOT_TOKEN="" the backend accepts X-User-Id header.
AUTH_HEADERS = {"X-User-Id": "123456"}


# ─── File-verification helpers ───────────────────────────────────────────────
# These are plain functions (not fixtures) — import them in test files with:
#   from conftest import assert_valid_pdf, assert_valid_zip, …

def assert_valid_pdf(content: bytes, min_pages: int = 1) -> None:
    """Assert `content` is a parseable PDF with at least `min_pages`."""
    assert content[:4] == b"%PDF", f"Not a PDF — magic bytes: {content[:8]!r}"
    import pikepdf
    with pikepdf.open(io.BytesIO(content)) as doc:
        assert len(doc.pages) >= min_pages, (
            f"PDF has {len(doc.pages)} pages, expected ≥ {min_pages}"
        )


def assert_valid_zip(content: bytes) -> zipfile.ZipFile:
    """Assert `content` is a valid ZIP and return an open ZipFile object."""
    assert content[:2] == b"PK", f"Not a ZIP — magic bytes: {content[:4]!r}"
    zf = zipfile.ZipFile(io.BytesIO(content))
    assert zf.namelist(), "ZIP archive is empty"
    return zf


def assert_valid_png(content: bytes) -> None:
    """Assert `content` is a parseable PNG image."""
    assert content[:4] == b"\x89PNG", f"Not a PNG — magic bytes: {content[:4]!r}"
    from PIL import Image
    img = Image.open(io.BytesIO(content))
    img.verify()  # raises on corruption


def assert_valid_jpeg(content: bytes) -> None:
    """Assert `content` is a parseable JPEG image."""
    assert content[:2] == b"\xff\xd8", f"Not a JPEG — magic bytes: {content[:4]!r}"
    from PIL import Image
    img = Image.open(io.BytesIO(content))
    img.verify()


def assert_valid_docx(content: bytes) -> None:
    """Assert `content` is a DOCX file (ZIP containing a word/ directory)."""
    assert content[:2] == b"PK", f"Not a DOCX/ZIP — magic bytes: {content[:4]!r}"
    zf = zipfile.ZipFile(io.BytesIO(content))
    names = zf.namelist()
    assert any(n.startswith("word/") or n == "word" for n in names), (
        f"No word/ directory in ZIP — entries: {names[:8]}"
    )


def assert_valid_ics(content: bytes) -> None:
    """Assert `content` is a valid iCalendar file."""
    assert b"BEGIN:VCALENDAR" in content, "Not a valid iCalendar (missing BEGIN:VCALENDAR)"
    assert b"END:VCALENDAR" in content, "Truncated iCalendar (missing END:VCALENDAR)"


def assert_content_type(headers: dict, expected_fragment: str) -> None:
    ct = headers.get("content-type", "")
    assert expected_fragment in ct, (
        f"Expected Content-Type to contain {expected_fragment!r}, got: {ct!r}"
    )


def assert_content_disposition(headers: dict, filename_fragment: str) -> None:
    cd = headers.get("content-disposition", "")
    assert cd, "Content-Disposition header is missing"
    assert filename_fragment in cd, (
        f"Expected {filename_fragment!r} in Content-Disposition, got: {cd!r}"
    )


def assert_x_header(headers: dict, name: str) -> str:
    """Assert that response header `name` is present and return its value."""
    val = headers.get(name.lower(), headers.get(name, ""))
    assert val, f"Header {name!r} is missing or empty"
    return val


# ─── Generated binary fixtures (session-scoped, created in-memory) ────────────

def _make_minimal_pdf(pages: int = 1) -> bytes:
    import pikepdf
    pdf = pikepdf.new()
    for _ in range(pages):
        pdf.add_blank_page(page_size=(595, 842))
    buf = io.BytesIO()
    pdf.save(buf)
    pdf.close()
    return buf.getvalue()


def _make_password_protected_pdf() -> bytes:
    import pikepdf
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(595, 842))
    buf = io.BytesIO()
    pdf.save(buf, encryption=pikepdf.Encryption(owner="secret", user="secret", R=4))
    pdf.close()
    return buf.getvalue()


def _make_minimal_png(w: int = 10, h: int = 10) -> bytes:
    def _chunk(ctype: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(ctype + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + ctype + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw  = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(raw))
        + _chunk(b"IEND", b"")
    )


def _make_minimal_jpeg() -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(200, 200, 200)).save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _make_too_large_bytes() -> bytes:
    return b"A" * (21 * 1024 * 1024)


def _make_minimal_zip(filename: str = "hello.txt", content: bytes = b"hello") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(filename, content)
    return buf.getvalue()


# ─── Session-scoped in-memory fixtures ───────────────────────────────────────

@pytest.fixture(scope="session")
def minimal_pdf() -> bytes:
    return _make_minimal_pdf(pages=3)


@pytest.fixture(scope="session")
def single_page_pdf() -> bytes:
    return _make_minimal_pdf(pages=1)


@pytest.fixture(scope="session")
def password_pdf() -> bytes:
    return _make_password_protected_pdf()


@pytest.fixture(scope="session")
def minimal_png() -> bytes:
    return _make_minimal_png()


@pytest.fixture(scope="session")
def minimal_jpeg() -> bytes:
    return _make_minimal_jpeg()


@pytest.fixture(scope="session")
def too_large_bytes() -> bytes:
    return _make_too_large_bytes()


@pytest.fixture(scope="session")
def minimal_zip() -> bytes:
    return _make_minimal_zip()


# ─── Session-scoped disk fixtures (skip if generation failed) ─────────────────

def _load_fixture(name: str) -> bytes:
    fp = os.path.join(_FIXTURES_DIR, name)
    if not os.path.exists(fp):
        pytest.skip(f"Fixture {name!r} not available (run: python tests/make_fixtures.py)")
    with open(fp, "rb") as f:
        return f.read()


@pytest.fixture(scope="session")
def scanned_pdf() -> bytes:
    return _load_fixture("scanned.pdf")


@pytest.fixture(scope="session")
def table_pdf() -> bytes:
    return _load_fixture("table.pdf")


@pytest.fixture(scope="session")
def cyrillic_pdf() -> bytes:
    return _load_fixture("cyrillic.pdf")


@pytest.fixture(scope="session")
def image_heavy_pdf() -> bytes:
    return _load_fixture("image_heavy.pdf")


@pytest.fixture(scope="session")
def broken_pdf() -> bytes:
    return _load_fixture("broken.pdf")
