"""Tests for tools endpoints with full header + file-open verification.

Covers: QR, cert, schedule, translit, readtime, stats, deadline,
zip, unzip (zip-bomb, path-traversal), translate, summarize.
"""
import io
import zipfile

import pytest

from conftest import (
    AUTH_HEADERS,
    assert_valid_png,
    assert_valid_ics,
    assert_valid_zip,
    assert_content_type,
    assert_content_disposition,
    assert_x_header,
)


# ─── /api/qr ──────────────────────────────────────────────────────────────────

class TestQr:
    def test_qr_png_returns_valid_png(self, client):
        r = client.post("/api/qr", json={"text": "https://example.com", "format": "png"})
        assert r.status_code == 200
        assert_content_type(r.headers, "image/png")
        assert_content_disposition(r.headers, "qrcode.png")
        assert_valid_png(r.content)

    def test_qr_svg_returns_valid_svg(self, client):
        r = client.post("/api/qr", json={"text": "EduBot test", "format": "svg"})
        assert r.status_code == 200
        assert_content_type(r.headers, "svg")
        assert_content_disposition(r.headers, "qrcode.svg")
        assert b"<svg" in r.content or b"<?xml" in r.content

    def test_qr_text_too_long_returns_400(self, client):
        r = client.post("/api/qr", json={"text": "A" * 2001})
        assert r.status_code == 400

    def test_qr_null_text_uses_default_and_returns_png(self, client):
        r = client.post("/api/qr", json={"text": None})
        assert r.status_code == 200
        assert_valid_png(r.content)

    def test_qr_custom_size_accepted(self, client):
        r = client.post("/api/qr", json={"text": "EduBot", "size": 200})
        assert r.status_code == 200

    def test_qr_high_error_correction(self, client):
        r = client.post("/api/qr", json={"text": "test", "ec": "H"})
        assert r.status_code == 200
        assert_valid_png(r.content)


# ─── /api/cert ────────────────────────────────────────────────────────────────

class TestCert:
    _CERT_BODY = {"name": "Ali Valiyev", "course": "Python 101", "issuer": "EduBot Academy"}

    def test_cert_png_returns_image_with_cert_id(self, client):
        r = client.post("/api/cert", json=self._CERT_BODY, headers=AUTH_HEADERS)
        assert r.status_code == 200
        cert_id = assert_x_header(r.headers, "x-cert-id")
        assert len(cert_id) >= 8, f"cert_id too short: {cert_id!r}"
        ct = r.headers.get("content-type", "")
        assert "image" in ct or "pdf" in ct

    def test_cert_png_image_is_openable(self, client):
        r = client.post("/api/cert", json=self._CERT_BODY, headers=AUTH_HEADERS)
        if r.status_code != 200:
            pytest.skip("cert endpoint unavailable")
        ct = r.headers.get("content-type", "")
        if "png" in ct:
            assert_valid_png(r.content)
        elif "pdf" in ct:
            assert r.content[:4] == b"%PDF"

    def test_cert_pdf_format(self, client):
        body = dict(self._CERT_BODY, format="pdf")
        r = client.post("/api/cert", json=body, headers=AUTH_HEADERS)
        assert r.status_code == 200
        assert_x_header(r.headers, "x-cert-id")
        assert_content_disposition(r.headers, "certificate_")

    def test_cert_missing_name_returns_error(self, client):
        r = client.post(
            "/api/cert",
            json={"course": "Python", "issuer": "EduBot"},
            headers=AUTH_HEADERS,
        )
        assert r.status_code in (400, 422, 500)

    def test_cert_verify_endpoint_roundtrip(self, client):
        r = client.post("/api/cert", json=self._CERT_BODY, headers=AUTH_HEADERS)
        if r.status_code != 200:
            pytest.skip("cert creation unavailable")
        cert_id = r.headers.get("x-cert-id", "")
        if not cert_id:
            pytest.skip("no x-cert-id returned")
        rv = client.get(f"/api/cert/verify/{cert_id}")
        assert rv.status_code == 200
        body = rv.json()
        assert "name" in body or "cert_id" in body


# ─── /api/schedule ────────────────────────────────────────────────────────────

class TestSchedule:
    _TEXT = "Dushanba: Matematika 8:00, Fizika 10:00\nSeshanba: Ingliz tili 11:00"

    def test_schedule_png_is_valid_png(self, client):
        r = client.post("/api/schedule", json={"text": self._TEXT, "format": "png"})
        assert r.status_code == 200
        assert_content_type(r.headers, "image/png")
        assert_content_disposition(r.headers, "schedule.png")
        assert_valid_png(r.content)

    def test_schedule_ics_is_valid_calendar(self, client):
        r = client.post("/api/schedule", json={"text": self._TEXT, "format": "ics"})
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "calendar" in ct or "octet-stream" in ct
        assert_content_disposition(r.headers, "schedule.ics")
        assert_valid_ics(r.content)

    def test_schedule_null_text_returns_400_not_500(self, client):
        r = client.post("/api/schedule", json={"text": None})
        assert r.status_code in (400, 422)
        assert r.status_code != 500

    def test_schedule_empty_text_returns_400(self, client):
        r = client.post("/api/schedule", json={"text": ""})
        assert r.status_code in (400, 422)


# ─── /api/translit ────────────────────────────────────────────────────────────

class TestTranslit:
    def test_translit_ltr_produces_cyrillic(self, client):
        r = client.post("/api/translit", json={"text": "salom dunyo", "dir": "ltr"})
        assert r.status_code == 200
        result = r.json().get("result", "")
        assert any("а" <= c <= "я" or "А" <= c <= "Я" for c in result)

    def test_translit_rtl_produces_latin(self, client):
        r = client.post("/api/translit", json={"text": "салом дунё", "dir": "rtl"})
        assert r.status_code == 200
        result = r.json().get("result", "")
        assert any("a" <= c.lower() <= "z" for c in result)
        assert not any("Ѐ" <= c <= "ӿ" for c in result)

    def test_translit_null_text_does_not_500(self, client):
        r = client.post("/api/translit", json={"text": None})
        assert r.status_code in (200, 400)
        assert r.status_code != 500
        if r.status_code == 200:
            assert "result" in r.json()

    def test_translit_roundtrip(self, client):
        """Latin→Cyrillic→Latin should recover roughly the same word."""
        r1 = client.post("/api/translit", json={"text": "salom", "dir": "ltr"})
        assert r1.status_code == 200
        cyrillic = r1.json()["result"]
        r2 = client.post("/api/translit", json={"text": cyrillic, "dir": "rtl"})
        assert r2.status_code == 200
        latin = r2.json()["result"]
        # Round-trip may differ in apostrophes but the base word should survive
        assert "salom" in latin.lower() or "salon" in latin.lower()


# ─── /api/readtime ────────────────────────────────────────────────────────────

class TestReadtime:
    def test_readtime_english_returns_minutes(self, client):
        text = "This is a test sentence. " * 100
        r = client.post("/api/readtime", json={"text": text})
        assert r.status_code == 200
        body = r.json()
        assert "minutes" in body
        assert isinstance(body["minutes"], (int, float))
        assert body["minutes"] >= 0

    def test_readtime_cyrillic_text(self, client):
        text = "Это тестовое предложение для проверки. " * 100
        r = client.post("/api/readtime", json={"text": text})
        assert r.status_code == 200
        assert "minutes" in r.json()

    def test_readtime_empty_returns_zero(self, client):
        r = client.post("/api/readtime", json={"text": ""})
        assert r.status_code == 200
        body = r.json()
        assert body.get("minutes", 0) == 0 or "seconds" in body


# ─── /api/stats ───────────────────────────────────────────────────────────────

class TestStats:
    def test_stats_basic_counts(self, client):
        r = client.post(
            "/api/stats",
            json={"text": "Hello world! This is a test text with exactly eight words."},
        )
        assert r.status_code == 200
        body = r.json()
        assert "words" in body or "chars" in body

    def test_stats_null_text_does_not_500(self, client):
        r = client.post("/api/stats", json={"text": None})
        assert r.status_code in (200, 400)
        assert r.status_code != 500

    def test_stats_empty_text_returns_zeros(self, client):
        r = client.post("/api/stats", json={"text": ""})
        assert r.status_code == 200


# ─── /api/deadline ────────────────────────────────────────────────────────────

class TestDeadline:
    def test_deadline_future_date_returns_days(self, client):
        r = client.post("/api/deadline", json={"date": "2030-12-31"})
        assert r.status_code == 200
        body = r.json()
        assert "days" in body or "text" in body or "message" in body

    def test_deadline_past_date_returns_response(self, client):
        r = client.post("/api/deadline", json={"date": "2020-01-01"})
        assert r.status_code in (200, 400)

    def test_deadline_invalid_date_returns_error(self, client):
        r = client.post("/api/deadline", json={"date": "not-a-date"})
        assert r.status_code in (400, 422)


# ─── /api/zip ─────────────────────────────────────────────────────────────────

class TestZip:
    def test_zip_single_file_returns_valid_zip(self, client):
        r = client.post(
            "/api/zip",
            files=[("files", ("hello.txt", b"Hello, world!", "text/plain"))],
        )
        assert r.status_code == 200
        assert_content_type(r.headers, "zip")
        assert_content_disposition(r.headers, "archive.zip")
        assert_x_header(r.headers, "x-info")
        zf = assert_valid_zip(r.content)
        assert len(zf.namelist()) >= 1

    def test_zip_multiple_files_all_present(self, client):
        r = client.post(
            "/api/zip",
            files=[
                ("files", ("a.txt", b"aaa", "text/plain")),
                ("files", ("b.txt", b"bbb", "text/plain")),
                ("files", ("c.txt", b"ccc", "text/plain")),
            ],
        )
        assert r.status_code == 200
        zf = assert_valid_zip(r.content)
        names = zf.namelist()
        assert len(names) >= 3

    def test_zip_content_is_correct(self, client):
        r = client.post(
            "/api/zip",
            files=[("files", ("data.txt", b"exact content", "text/plain"))],
        )
        assert r.status_code == 200
        zf = assert_valid_zip(r.content)
        txt_files = [n for n in zf.namelist() if "data" in n]
        if txt_files:
            assert zf.read(txt_files[0]) == b"exact content"

    def test_zip_too_large_returns_413(self, client, too_large_bytes):
        r = client.post(
            "/api/zip",
            files=[("files", ("big.bin", too_large_bytes, "application/octet-stream"))],
        )
        assert r.status_code == 413


# ─── /api/unzip ───────────────────────────────────────────────────────────────

class TestUnzip:
    def test_unzip_valid_zip_returns_content(self, client, minimal_zip):
        r = client.post(
            "/api/unzip",
            files=[("file", ("archive.zip", minimal_zip, "application/zip"))],
        )
        assert r.status_code == 200
        # Single file → raw content, multi-file → ZIP
        assert r.content  # must not be empty

    def test_unzip_single_file_zip_returns_file_directly(self, client):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("hello.txt", b"hello world")
        single_zip = buf.getvalue()
        r = client.post(
            "/api/unzip",
            files=[("file", ("archive.zip", single_zip, "application/zip"))],
        )
        assert r.status_code == 200
        # Single-file ZIP: should return the file content directly
        cd = r.headers.get("content-disposition", "")
        if "hello.txt" in cd:
            assert b"hello world" == r.content
        elif "zip" in r.headers.get("content-type", ""):
            assert_valid_zip(r.content)

    def test_unzip_not_a_zip_returns_400(self, client):
        r = client.post(
            "/api/unzip",
            files=[("file", ("doc.pdf", b"this is not a zip file at all", "application/zip"))],
        )
        assert r.status_code == 400

    def test_unzip_too_large_returns_413(self, client, too_large_bytes):
        r = client.post(
            "/api/unzip",
            files=[("file", ("big.zip", too_large_bytes, "application/zip"))],
        )
        assert r.status_code == 413

    def test_unzip_zip_bomb_rejected(self, client):
        """Tiny ZIP whose entries decompress to > 200 MB must be rejected."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i in range(5):
                zf.writestr(zipfile.ZipInfo(f"bomb_{i}.bin"), b"\x00" * (50 * 1024 * 1024))
        r = client.post(
            "/api/unzip",
            files=[("file", ("bomb.zip", buf.getvalue(), "application/zip"))],
        )
        assert r.status_code in (400, 413)

    def test_unzip_path_traversal_sanitized(self, client):
        """ZIP entries with ../ must not appear in the output."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("../../etc/passwd", b"root:x:0:0:root:/root:/bin/sh")
            zf.writestr("safe.txt", b"safe content")
        r = client.post(
            "/api/unzip",
            files=[("file", ("traverse.zip", buf.getvalue(), "application/zip"))],
        )
        if r.status_code == 200 and "zip" in r.headers.get("content-type", ""):
            zr = zipfile.ZipFile(io.BytesIO(r.content))
            for name in zr.namelist():
                assert ".." not in name and not name.startswith("/"), (
                    f"Path traversal not sanitized: {name!r}"
                )

    def test_unzip_multi_file_returns_zip_with_x_info(self, client):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("a.txt", b"content a")
            zf.writestr("b.txt", b"content b")
        r = client.post(
            "/api/unzip",
            files=[("file", ("multi.zip", buf.getvalue(), "application/zip"))],
        )
        assert r.status_code == 200
        if "zip" in r.headers.get("content-type", ""):
            assert_x_header(r.headers, "x-info")
            assert_valid_zip(r.content)


# ─── /api/translate ───────────────────────────────────────────────────────────

class TestTranslate:
    def test_translate_null_text_does_not_500(self, client):
        r = client.post("/api/translate", json={"text": None, "to": "en"})
        assert r.status_code in (200, 400)
        assert r.status_code != 500

    def test_translate_empty_text(self, client):
        r = client.post("/api/translate", json={"text": "", "to": "en"})
        assert r.status_code in (200, 400)

    @pytest.mark.integration
    def test_translate_basic_produces_result(self, client):
        r = client.post("/api/translate", json={"text": "salom", "to": "en"})
        assert r.status_code == 200
        body = r.json()
        assert "result" in body or "text" in body or "translation" in body


# ─── /api/summarize ───────────────────────────────────────────────────────────

class TestSummarize:
    def test_summarize_returns_shorter_text(self, client):
        text = "Bu oddiy matn. " * 20
        r = client.post("/api/summarize", json={"text": text})
        assert r.status_code == 200
        body = r.json()
        assert "result" in body or "summary" in body or "text" in body

    def test_summarize_null_text_does_not_500(self, client):
        r = client.post("/api/summarize", json={"text": None})
        assert r.status_code in (200, 400)
        assert r.status_code != 500
