"""Smoke tests — hardening sanity checks.

Goal: verify the security-critical helpers behave as expected without spinning
up the full FastAPI app. Each test is self-contained and runs in milliseconds.

Run:
    cd backend
    pytest tests/test_smoke.py -v
"""
from __future__ import annotations

import asyncio
import io
import pytest
from fastapi import HTTPException


# ═══════════════════════════════════════════════════════════════════════════
#  WeasyPrint SSRF guard
# ═══════════════════════════════════════════════════════════════════════════

class TestSafeUrlFetcher:
    """`safe_url_fetcher` must reject everything except `data:` URIs."""

    def test_blocks_http(self):
        from shared import safe_url_fetcher
        with pytest.raises(ValueError, match="bloklandi"):
            safe_url_fetcher("http://example.com/img.png")

    def test_blocks_https(self):
        from shared import safe_url_fetcher
        with pytest.raises(ValueError, match="bloklandi"):
            safe_url_fetcher("https://example.com/font.ttf")

    def test_blocks_file_protocol(self):
        from shared import safe_url_fetcher
        with pytest.raises(ValueError, match="bloklandi"):
            safe_url_fetcher("file:///etc/passwd")

    def test_blocks_localhost(self):
        from shared import safe_url_fetcher
        with pytest.raises(ValueError, match="bloklandi"):
            safe_url_fetcher("http://localhost:8000/admin")

    def test_blocks_private_ip(self):
        from shared import safe_url_fetcher
        with pytest.raises(ValueError, match="bloklandi"):
            safe_url_fetcher("http://192.168.1.1/")

    def test_blocks_aws_metadata(self):
        from shared import safe_url_fetcher
        with pytest.raises(ValueError, match="bloklandi"):
            safe_url_fetcher("http://169.254.169.254/latest/meta-data/")

    def test_blocks_gcp_metadata(self):
        from shared import safe_url_fetcher
        with pytest.raises(ValueError, match="bloklandi"):
            safe_url_fetcher("http://metadata.google.internal/")

    def test_blocks_empty_url(self):
        from shared import safe_url_fetcher
        with pytest.raises(ValueError):
            safe_url_fetcher("")

    def test_allows_data_uri_text(self):
        """Inline data: URIs must pass through (used by cert QR + CV themes)."""
        from shared import safe_url_fetcher
        # Tiny PNG (1×1 transparent) as data URI
        url = ("data:image/png;base64,"
               "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
        result = safe_url_fetcher(url)
        assert isinstance(result, dict)
        assert "mime_type" in result or "string" in result or "file_obj" in result


# ═══════════════════════════════════════════════════════════════════════════
#  Upload helpers
# ═══════════════════════════════════════════════════════════════════════════

class _FakeUpload:
    """Minimal UploadFile-shaped stub for tests (FastAPI's UploadFile needs a SpooledTemporaryFile)."""
    def __init__(self, data: bytes, filename: str = "f.bin"):
        self._data = data
        self.filename = filename

    async def read(self) -> bytes:
        return self._data


class TestUploadHelpers:
    """`read_upload` / `read_uploads` must enforce missing/empty/oversize cleanly."""

    def test_missing_file_rejected(self):
        from shared import read_upload
        with pytest.raises(HTTPException) as exc:
            asyncio.run(read_upload(None, "/api/test"))
        assert exc.value.status_code == 400
        assert "yuborilmadi" in exc.value.detail

    def test_empty_file_rejected(self):
        from shared import read_upload
        f = _FakeUpload(b"")
        with pytest.raises(HTTPException) as exc:
            asyncio.run(read_upload(f, "/api/test"))
        assert exc.value.status_code == 400
        assert "bo'sh" in exc.value.detail

    def test_oversized_file_rejected(self):
        from shared import read_upload, MAX_FILE_BYTES
        f = _FakeUpload(b"x" * (MAX_FILE_BYTES + 1))
        with pytest.raises(HTTPException) as exc:
            asyncio.run(read_upload(f, "/api/test"))
        assert exc.value.status_code == 413

    def test_normal_file_returns_bytes(self):
        from shared import read_upload
        payload = b"hello world"
        result = asyncio.run(read_upload(_FakeUpload(payload), "/api/test"))
        assert result == payload

    def test_empty_list_rejected(self):
        from shared import read_uploads
        with pytest.raises(HTTPException) as exc:
            asyncio.run(read_uploads([], "/api/test"))
        assert exc.value.status_code == 400

    def test_multi_total_size_rejected(self):
        from shared import read_uploads, MAX_FILE_BYTES
        # Each file < per-file limit, but combined exceeds the 3× multi cap.
        chunk = b"x" * (MAX_FILE_BYTES - 1)
        files = [_FakeUpload(chunk) for _ in range(5)]
        with pytest.raises(HTTPException) as exc:
            asyncio.run(read_uploads(files, "/api/test"))
        assert exc.value.status_code == 413
        # 1-Bosqich: foydalanuvchi-friendly xato matni — limit MB raqami xabarda
        # bo'lishi kifoya (xato turini aniqlash uchun stabil belgi).
        assert "MB" in exc.value.detail

    def test_multi_empty_file_rejected(self):
        from shared import read_uploads
        files = [_FakeUpload(b"ok"), _FakeUpload(b""), _FakeUpload(b"ok2")]
        with pytest.raises(HTTPException) as exc:
            asyncio.run(read_uploads(files, "/api/test"))
        assert exc.value.status_code == 400

    def test_multi_normal_returns_all(self):
        from shared import read_uploads
        files = [_FakeUpload(b"a"), _FakeUpload(b"bb"), _FakeUpload(b"ccc")]
        result = asyncio.run(read_uploads(files, "/api/test"))
        assert result == [b"a", b"bb", b"ccc"]


# ═══════════════════════════════════════════════════════════════════════════
#  Body-size middleware (ASGI level)
# ═══════════════════════════════════════════════════════════════════════════

class TestBodySizeMiddleware:
    """Reject oversized Content-Length BEFORE the body is read."""

    def _run(self, scope, content_length=None):
        from shared import BodySizeLimitMiddleware
        mw = BodySizeLimitMiddleware(app=_dummy_asgi_app, max_bytes=1024)
        headers = []
        if content_length is not None:
            headers.append((b"content-length", str(content_length).encode()))
        scope = {**scope, "headers": headers}

        sent = []
        async def send(msg):
            sent.append(msg)
        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        asyncio.run(mw(scope, receive, send))
        return sent

    def test_oversized_content_length_returns_413(self):
        sent = self._run({"type": "http", "method": "POST", "path": "/api/x"}, content_length=2048)
        start = next(m for m in sent if m["type"] == "http.response.start")
        assert start["status"] == 413

    def test_within_limit_passes_through(self):
        sent = self._run({"type": "http", "method": "POST", "path": "/api/x"}, content_length=500)
        start = next(m for m in sent if m["type"] == "http.response.start")
        assert start["status"] == 200  # dummy app returns 200

    def test_missing_content_length_passes_through(self):
        sent = self._run({"type": "http", "method": "POST", "path": "/api/x"}, content_length=None)
        start = next(m for m in sent if m["type"] == "http.response.start")
        assert start["status"] == 200

    def test_get_request_not_size_checked(self):
        # GET requests don't carry bodies; middleware must skip the check even
        # if a (spurious) Content-Length header claims otherwise.
        sent = self._run({"type": "http", "method": "GET", "path": "/health"}, content_length=99999)
        start = next(m for m in sent if m["type"] == "http.response.start")
        assert start["status"] == 200


async def _dummy_asgi_app(scope, receive, send):
    """Trivial ASGI app: always 200 with empty body."""
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok", "more_body": False})


# ═══════════════════════════════════════════════════════════════════════════
#  track_usage — must never raise even when DB is unavailable
# ═══════════════════════════════════════════════════════════════════════════

class TestTrackUsage:
    def test_swallows_db_errors(self, monkeypatch):
        """If log_usage/add_history raise, track_usage logs and returns normally."""
        # database.py imports aiosqlite/asyncpg lazily based on env — skip cleanly
        # when neither driver is available (the runtime Docker image has them).
        pytest.importorskip("aiosqlite")
        from shared import track_usage
        import database as db

        async def boom(*a, **kw):
            raise RuntimeError("DB down")

        monkeypatch.setattr(db, "log_usage", boom)
        monkeypatch.setattr(db, "add_history", boom)

        # Must not raise.
        asyncio.run(track_usage(12345, "mergepdf"))

    def test_calls_log_and_history(self, monkeypatch):
        pytest.importorskip("aiosqlite")
        from shared import track_usage
        import database as db

        log_calls = []
        history_calls = []

        async def fake_log(uid, sid, success=True):
            log_calls.append((uid, sid, success))

        async def fake_history(uid, sid, title, preview=None):
            history_calls.append((uid, sid, title, preview))

        monkeypatch.setattr(db, "log_usage", fake_log)
        monkeypatch.setattr(db, "add_history", fake_history)

        asyncio.run(track_usage(42, "mergepdf", preview="3 fayl"))

        assert log_calls == [(42, "mergepdf", True)]
        assert len(history_calls) == 1
        # Title is auto-resolved from _SERVICE_TITLES map.
        assert history_calls[0][2] == "PDF birlashtirish"
        assert history_calls[0][3] == "3 fayl"


# ═══════════════════════════════════════════════════════════════════════════
#  Auth — X-User-Id fallback must NOT work in default (production) env
# ═══════════════════════════════════════════════════════════════════════════

class TestAuthFallback:
    def test_x_user_id_rejected_in_production(self, monkeypatch):
        """Without ENV=development + ALLOW_INSECURE_AUTH=true, X-User-Id must 401.

        Forces ALLOW_INSECURE_AUTH=False at the module level — needed because
        test_endpoints.py flips the flag on for its own dev-auth scenarios.
        """
        import shared
        from shared import _get_user_id
        monkeypatch.setattr(shared, "ALLOW_INSECURE_AUTH", False)

        # Fake a request with only X-User-Id (no initData).
        class _Req:
            def __init__(self):
                self.headers = {"X-User-Id": "123"}
                class _S: pass
                self.state = _S()
        with pytest.raises(HTTPException) as exc:
            _get_user_id(_Req())
        assert exc.value.status_code == 401
