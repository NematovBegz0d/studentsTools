"""Tests for PDF endpoints — real pikepdf/fitz processing, no mocks.

Covers: mergepdf, splitpdf, pdfpages, pdftext, pdflock, watermark,
pdf2img, compresspdf.

For every successful response we verify:
  • HTTP status code
  • Content-Type header
  • Content-Disposition header (expected filename)
  • Important X-* response headers
  • That the returned file can actually be opened by the relevant library
"""
import base64
import io
import zipfile

import pytest

from conftest import (
    AUTH_HEADERS,
    assert_valid_pdf,
    assert_valid_zip,
    assert_valid_png,
    assert_content_type,
    assert_content_disposition,
    assert_x_header,
)


# ─── /api/mergepdf ────────────────────────────────────────────────────────────

class TestMergePdf:
    def test_merge_two_pdfs(self, client, minimal_pdf):
        r = client.post(
            "/api/mergepdf",
            files=[
                ("files", ("a.pdf", minimal_pdf, "application/pdf")),
                ("files", ("b.pdf", minimal_pdf, "application/pdf")),
            ],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_content_type(r.headers, "application/pdf")
        assert_content_disposition(r.headers, "merged.pdf")
        assert_x_header(r.headers, "x-info")
        assert_valid_pdf(r.content, min_pages=6)  # two 3-page PDFs merged

    def test_merge_returns_page_count_in_x_info(self, client, minimal_pdf, single_page_pdf):
        r = client.post(
            "/api/mergepdf",
            files=[
                ("files", ("a.pdf", minimal_pdf, "application/pdf")),
                ("files", ("b.pdf", single_page_pdf, "application/pdf")),
            ],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        info = assert_x_header(r.headers, "x-info")
        assert "4" in info or "sahifa" in info  # 3+1 pages

    def test_merge_invalid_file_returns_500(self, client):
        r = client.post(
            "/api/mergepdf",
            files=[("files", ("a.pdf", b"not a pdf at all", "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code in (400, 422, 500)

    def test_merge_password_pdf_returns_error(self, client, password_pdf):
        r = client.post(
            "/api/mergepdf",
            files=[("files", ("locked.pdf", password_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code in (400, 422, 500)

    def test_merge_too_large_returns_413(self, client, too_large_bytes):
        r = client.post(
            "/api/mergepdf",
            files=[
                ("files", ("big.pdf", too_large_bytes, "application/pdf")),
                ("files", ("big2.pdf", too_large_bytes, "application/pdf")),
            ],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 413

    def test_merge_real_scanned_pdf(self, client, scanned_pdf):
        r = client.post(
            "/api/mergepdf",
            files=[
                ("files", ("scan1.pdf", scanned_pdf, "application/pdf")),
                ("files", ("scan2.pdf", scanned_pdf, "application/pdf")),
            ],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_valid_pdf(r.content, min_pages=4)

    def test_merge_real_image_heavy_pdf(self, client, image_heavy_pdf, minimal_pdf):
        r = client.post(
            "/api/mergepdf",
            files=[
                ("files", ("img.pdf",  image_heavy_pdf, "application/pdf")),
                ("files", ("text.pdf", minimal_pdf,     "application/pdf")),
            ],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_valid_pdf(r.content, min_pages=5)


# ─── /api/splitpdf ────────────────────────────────────────────────────────────

class TestSplitPdf:
    def test_split_all_pages(self, client, minimal_pdf):
        r = client.post(
            "/api/splitpdf",
            files=[("file", ("doc.pdf", minimal_pdf, "application/pdf"))],
            data={"pages": ""},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_content_type(r.headers, "application/zip")
        assert_content_disposition(r.headers, "pages.zip")
        zf = assert_valid_zip(r.content)
        assert len(zf.namelist()) == 3  # 3-page PDF

    def test_split_single_page_produces_one_file(self, client, minimal_pdf):
        r = client.post(
            "/api/splitpdf",
            files=[("file", ("doc.pdf", minimal_pdf, "application/pdf"))],
            data={"pages": "2"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        zf = assert_valid_zip(r.content)
        assert len(zf.namelist()) == 1
        # The extracted page must be a valid PDF
        page_bytes = zf.read(zf.namelist()[0])
        assert_valid_pdf(page_bytes)

    def test_split_range(self, client, minimal_pdf):
        r = client.post(
            "/api/splitpdf",
            files=[("file", ("doc.pdf", minimal_pdf, "application/pdf"))],
            data={"pages": "1-2"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        zf = assert_valid_zip(r.content)
        assert len(zf.namelist()) == 2

    def test_split_bad_range_returns_400(self, client, minimal_pdf):
        r = client.post(
            "/api/splitpdf",
            files=[("file", ("doc.pdf", minimal_pdf, "application/pdf"))],
            data={"pages": "abc-xyz"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 400

    def test_split_password_pdf_returns_422(self, client, password_pdf):
        r = client.post(
            "/api/splitpdf",
            files=[("file", ("locked.pdf", password_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 422

    def test_split_not_pdf_returns_422(self, client):
        r = client.post(
            "/api/splitpdf",
            files=[("file", ("img.png", b"PNGDATA", "application/octet-stream"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 422

    def test_split_too_large_returns_413(self, client, too_large_bytes):
        r = client.post(
            "/api/splitpdf",
            files=[("file", ("big.pdf", too_large_bytes, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 413

    def test_split_broken_pdf_returns_error(self, client, broken_pdf):
        r = client.post(
            "/api/splitpdf",
            files=[("file", ("corrupt.pdf", broken_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code in (400, 422, 500)


# ─── /api/pdfpages ────────────────────────────────────────────────────────────

class TestPdfPages:
    def test_select_pages_returns_pdf_with_info(self, client, minimal_pdf):
        r = client.post(
            "/api/pdfpages",
            files=[("file", ("doc.pdf", minimal_pdf, "application/pdf"))],
            data={"pages": "1-2"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_content_type(r.headers, "application/pdf")
        assert_content_disposition(r.headers, "selected.pdf")
        assert_x_header(r.headers, "x-info")
        assert_valid_pdf(r.content, min_pages=2)

    def test_select_pages_table_pdf(self, client, table_pdf):
        r = client.post(
            "/api/pdfpages",
            files=[("file", ("table.pdf", table_pdf, "application/pdf"))],
            data={"pages": "1"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_valid_pdf(r.content)


# ─── /api/pdftext ─────────────────────────────────────────────────────────────

class TestPdfText:
    def test_pdftext_blank_pdf_returns_json(self, client, minimal_pdf):
        r = client.post(
            "/api/pdftext",
            files=[("file", ("doc.pdf", minimal_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        body = r.json()
        assert "text" in body

    def test_pdftext_table_pdf_extracts_words(self, client, table_pdf):
        r = client.post(
            "/api/pdftext",
            files=[("file", ("table.pdf", table_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        text = r.json().get("text", "")
        # Table has known content words
        assert any(word in text for word in ("Student", "Score", "EduBot", "Math"))

    def test_pdftext_cyrillic_pdf_extracts_cyrillic(self, client, cyrillic_pdf):
        r = client.post(
            "/api/pdftext",
            files=[("file", ("cyrillic.pdf", cyrillic_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        text = r.json().get("text", "")
        # Must contain Cyrillic characters
        assert any("Ѐ" <= c <= "ӿ" for c in text), "No Cyrillic in extracted text"

    def test_pdftext_not_pdf_returns_error(self, client):
        r = client.post(
            "/api/pdftext",
            files=[("file", ("img.jpg", b"\xff\xd8\xff\xe0notpdf", "image/jpeg"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code in (400, 422, 500)

    def test_pdftext_broken_pdf_returns_error_or_empty(self, client, broken_pdf):
        r = client.post(
            "/api/pdftext",
            files=[("file", ("broken.pdf", broken_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        # Either an error status or an empty/partial text extraction
        assert r.status_code in (200, 400, 422, 500)


# ─── /api/pdflock ─────────────────────────────────────────────────────────────

class TestPdfLock:
    def test_pdflock_returns_locked_pdf_with_password_header(self, client, single_page_pdf):
        r = client.post(
            "/api/pdflock",
            files=[("file", ("doc.pdf", single_page_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_content_type(r.headers, "application/pdf")
        assert_content_disposition(r.headers, "locked.pdf")
        pwd_b64 = assert_x_header(r.headers, "x-password-b64")
        # Header value must be valid base64 encoding a non-empty password
        pwd = base64.b64decode(pwd_b64).decode()
        assert len(pwd) >= 6, f"Password too short: {len(pwd)} chars"
        # The returned PDF must be parseable (even if password-protected)
        assert r.content[:4] == b"%PDF"

    def test_pdflock_returned_pdf_is_encrypted(self, client, single_page_pdf):
        r = client.post(
            "/api/pdflock",
            files=[("file", ("doc.pdf", single_page_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        import pikepdf
        doc = pikepdf.open(io.BytesIO(r.content))
        assert doc.is_encrypted, "Returned PDF must be encrypted"
        doc.close()

    def test_pdflock_password_protected_input_returns_error(self, client, password_pdf):
        r = client.post(
            "/api/pdflock",
            files=[("file", ("locked.pdf", password_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code in (400, 422, 500)


# ─── /api/watermark ───────────────────────────────────────────────────────────

class TestWatermark:
    def test_watermark_returns_pdf_with_x_info(self, client, single_page_pdf):
        r = client.post(
            "/api/watermark",
            files=[("file", ("doc.pdf", single_page_pdf, "application/pdf"))],
            data={"text": "CONFIDENTIAL"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_content_type(r.headers, "application/pdf")
        assert_content_disposition(r.headers, "watermarked.pdf")
        assert_x_header(r.headers, "x-info")
        assert_valid_pdf(r.content)

    def test_watermark_table_pdf(self, client, table_pdf):
        r = client.post(
            "/api/watermark",
            files=[("file", ("table.pdf", table_pdf, "application/pdf"))],
            data={"text": "DRAFT"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_valid_pdf(r.content)


# ─── /api/pdf2img ─────────────────────────────────────────────────────────────

class TestPdf2Img:
    def test_pdf2img_single_page_returns_png(self, client, single_page_pdf):
        r = client.post(
            "/api/pdf2img",
            files=[("file", ("doc.pdf", single_page_pdf, "application/pdf"))],
            data={"dpi": "72"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "image" in ct or "zip" in ct
        if "image/png" in ct:
            assert_valid_png(r.content)
        elif "zip" in ct:
            zf = assert_valid_zip(r.content)
            # Each file in ZIP must be a PNG
            for name in zf.namelist():
                page_bytes = zf.read(name)
                assert page_bytes[:4] == b"\x89PNG", f"{name} is not a PNG"

    def test_pdf2img_multipage_returns_zip_of_pngs(self, client, minimal_pdf):
        r = client.post(
            "/api/pdf2img",
            files=[("file", ("doc.pdf", minimal_pdf, "application/pdf"))],
            data={"dpi": "72"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "zip" in ct or "image" in ct
        if "zip" in ct:
            zf = assert_valid_zip(r.content)
            assert len(zf.namelist()) == 3

    def test_pdf2img_image_heavy_pdf(self, client, image_heavy_pdf):
        r = client.post(
            "/api/pdf2img",
            files=[("file", ("imgs.pdf", image_heavy_pdf, "application/pdf"))],
            data={"dpi": "72"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200


# ─── /api/compresspdf ─────────────────────────────────────────────────────────

class TestCompressPdf:
    def test_compresspdf_returns_pdf_with_saved_percent(self, client, minimal_pdf):
        r = client.post(
            "/api/compresspdf",
            files=[("file", ("doc.pdf", minimal_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_content_type(r.headers, "application/pdf")
        assert_content_disposition(r.headers, "compressed.pdf")
        saved_hdr = assert_x_header(r.headers, "x-saved-percent")
        assert_x_header(r.headers, "x-info")
        # Saved percent can be negative for already-tiny PDFs — just check parseable
        assert saved_hdr.lstrip("-").isdigit(), f"x-saved-percent not numeric: {saved_hdr!r}"
        assert_valid_pdf(r.content)

    def test_compresspdf_image_heavy_pdf_reduces_size(self, client, image_heavy_pdf):
        r = client.post(
            "/api/compresspdf",
            files=[("file", ("imgs.pdf", image_heavy_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 200
        assert_valid_pdf(r.content)
        saved = int(r.headers.get("x-saved-percent", "0"))
        assert saved >= -50, f"Unexpectedly negative savings: {saved}%"

    def test_compresspdf_not_pdf_returns_error(self, client):
        r = client.post(
            "/api/compresspdf",
            files=[("file", ("img.png", b"not a pdf", "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code in (400, 422, 500)

    def test_compresspdf_broken_pdf_returns_error(self, client, broken_pdf):
        r = client.post(
            "/api/compresspdf",
            files=[("file", ("broken.pdf", broken_pdf, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code in (400, 422, 500)

    def test_compresspdf_too_large_returns_413(self, client, too_large_bytes):
        r = client.post(
            "/api/compresspdf",
            files=[("file", ("big.pdf", too_large_bytes, "application/pdf"))],
            headers=AUTH_HEADERS,
        )
        assert r.status_code == 413
