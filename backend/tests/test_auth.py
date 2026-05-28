"""Auth tests — verify HMAC-SHA256 Telegram initData validation end-to-end.

Why patch("shared.BOT_TOKEN") works
-------------------------------------
shared.py sets `BOT_TOKEN = os.environ.get(...)` at import time as a module
global. Every function in shared.py that references `BOT_TOKEN` looks it up
in `shared.__dict__` on every call — so patch("shared.BOT_TOKEN", VALUE)
replaces the module-global for the duration of the `with` block and is
visible to _get_user_id and _verify_telegram_init_data at call time.

Why routers.tools_ops.BOT_TOKEN must also be patched for /api/send-file
------------------------------------------------------------------------
tools_ops.py does `from shared import BOT_TOKEN` which creates a separate
binding: tools_ops.BOT_TOKEN points to the same str object at import time,
but is NOT updated when shared.BOT_TOKEN is patched later. Therefore any
endpoint that does `if not BOT_TOKEN:` using the tools_ops local name
requires a second patch target: patch("routers.tools_ops.BOT_TOKEN", VALUE).

Thread safety of patch inside TestClient
-----------------------------------------
FastAPI's TestClient (Starlette/httpx) processes each request synchronously
using anyio's blocking portal in a background thread. Python's GIL ensures
module __dict__ writes are atomic and visible across threads, so the patch
applied in the main test thread is seen by the handler thread.

Tests that verify the real auth code path
------------------------------------------
GET  /api/history          — calls _get_user_id(request) in user_router.py
POST /api/send-file        — calls _get_user_id(request) in tools_ops.py
GET  /api/user/{id}/plan   — calls _get_user_id AND enforces caller==id
"""

import hashlib
import hmac
import io
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ─── Constants ────────────────────────────────────────────────────────────────

_TEST_TOKEN   = "9999999999:AAAAAAtest_bot_token_for_auth_tests"
_WRONG_TOKEN  = "8888888888:BBBBBBwrong_token_must_always_fail"
_TEST_USER_ID = 789_012

_HISTORY_EP   = "/api/history"       # uses _get_user_id from shared (user_router)
_SEND_FILE_EP = "/api/send-file"     # uses _get_user_id from shared + local BOT_TOKEN


# ─── initData builder ─────────────────────────────────────────────────────────

def _make_init_data(
    bot_token: str,
    user_id: int = _TEST_USER_ID,
    age_seconds: int = 0,
    corrupt_hash: bool = False,
    omit_hash: bool = False,
) -> str:
    """Return URL-encoded Telegram WebApp initData signed with bot_token.

    Parameters
    ----------
    age_seconds:    seconds in the past for auth_date — use > 86400 to expire
    corrupt_hash:   flip last 4 chars to make the signature invalid
    omit_hash:      exclude the hash field entirely
    """
    from urllib.parse import urlencode

    auth_date = int(time.time()) - age_seconds
    user_obj  = {"id": user_id, "first_name": "Test", "username": "testuser"}
    params: dict = {
        "auth_date": str(auth_date),
        "user":      json.dumps(user_obj, separators=(",", ":")),
    }
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    hash_val   = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()

    if corrupt_hash:
        hash_val = hash_val[:-4] + ("0000" if hash_val[-4:] != "0000" else "ffff")

    if not omit_hash:
        params["hash"] = hash_val

    return urlencode(params)


# ─── /api/history — auth code path (user_router → shared._get_user_id) ───────

class TestAuthWithBotToken:
    """All tests run with shared.BOT_TOKEN = _TEST_TOKEN.

    The autouse fixture applies the patch before each test and restores
    shared.BOT_TOKEN="" (conftest default) after each test. This isolation
    prevents any state leak between TestAuthWithBotToken and TestAuthDevMode.
    """

    @pytest.fixture(autouse=True)
    def _patch_shared_bot_token(self):
        # user_router.py uses `from shared import _get_user_id`.
        # _get_user_id reads shared.BOT_TOKEN at call time → one patch target.
        with patch("shared.BOT_TOKEN", _TEST_TOKEN):
            yield
        # shared.BOT_TOKEN is restored to "" by patch's __exit__

    # ── Happy path ────────────────────────────────────────────────────────────

    def test_valid_init_data_returns_200(self, client):
        init_data = _make_init_data(_TEST_TOKEN)
        r = client.get(_HISTORY_EP, headers={"X-Telegram-Init-Data": init_data})
        assert r.status_code == 200, r.text

    def test_valid_init_data_response_has_items_key(self, client):
        init_data = _make_init_data(_TEST_TOKEN, user_id=_TEST_USER_ID)
        r = client.get(_HISTORY_EP, headers={"X-Telegram-Init-Data": init_data})
        assert r.status_code == 200
        assert "items" in r.json()

    # ── Signature failures → 401 ──────────────────────────────────────────────

    def test_corrupted_hash_returns_401(self, client):
        init_data = _make_init_data(_TEST_TOKEN, corrupt_hash=True)
        r = client.get(_HISTORY_EP, headers={"X-Telegram-Init-Data": init_data})
        assert r.status_code == 401, r.text

    def test_wrong_signing_token_returns_401(self, client):
        """Data signed with a different bot token must be rejected."""
        init_data = _make_init_data(_WRONG_TOKEN)
        r = client.get(_HISTORY_EP, headers={"X-Telegram-Init-Data": init_data})
        assert r.status_code == 401, r.text

    def test_missing_hash_field_returns_401(self, client):
        init_data = _make_init_data(_TEST_TOKEN, omit_hash=True)
        r = client.get(_HISTORY_EP, headers={"X-Telegram-Init-Data": init_data})
        assert r.status_code == 401, r.text

    # ── Expiry ────────────────────────────────────────────────────────────────

    def test_expired_auth_date_returns_401(self, client):
        """auth_date older than 24 h must be rejected."""
        init_data = _make_init_data(_TEST_TOKEN, age_seconds=90_001)
        r = client.get(_HISTORY_EP, headers={"X-Telegram-Init-Data": init_data})
        assert r.status_code == 401, r.text

    def test_fresh_auth_date_within_limit_returns_200(self, client):
        init_data = _make_init_data(_TEST_TOKEN, age_seconds=3600)  # 1 h ago — fine
        r = client.get(_HISTORY_EP, headers={"X-Telegram-Init-Data": init_data})
        assert r.status_code == 200, r.text

    # ── Spoofing attempts → 401 ───────────────────────────────────────────────

    def test_x_user_id_spoofing_rejected_when_bot_token_set(self, client):
        """X-User-Id header must be ignored when BOT_TOKEN is configured."""
        r = client.get(_HISTORY_EP, headers={"X-User-Id": "999999"})
        assert r.status_code == 401, r.text

    def test_no_auth_header_returns_401(self, client):
        r = client.get(_HISTORY_EP)
        assert r.status_code == 401, r.text

    def test_empty_init_data_header_returns_401(self, client):
        r = client.get(_HISTORY_EP, headers={"X-Telegram-Init-Data": ""})
        assert r.status_code == 401, r.text

    # ── Cross-user access control ─────────────────────────────────────────────

    def test_user_plan_cross_user_access_forbidden(self, client):
        """User authenticated as 111 must not read plan for user 222."""
        init_data = _make_init_data(_TEST_TOKEN, user_id=111)
        r = client.get("/api/user/222/plan", headers={"X-Telegram-Init-Data": init_data})
        assert r.status_code == 403, r.text

    def test_user_plan_own_access_allowed(self, client):
        init_data = _make_init_data(_TEST_TOKEN, user_id=_TEST_USER_ID)
        r = client.get(
            f"/api/user/{_TEST_USER_ID}/plan",
            headers={"X-Telegram-Init-Data": init_data},
        )
        assert r.status_code == 200, r.text


# ─── Dev mode — X-User-Id accepted when BOT_TOKEN="" ─────────────────────────

class TestAuthDevMode:
    """When BOT_TOKEN is unset (conftest sets it to ""), X-User-Id is accepted.

    These tests confirm the dev fallback works and also that the autouse patch
    in TestAuthWithBotToken did NOT leak into this class (shared.BOT_TOKEN == "").
    """

    def test_confirm_bot_token_is_empty_in_dev_mode(self):
        import shared
        assert shared.BOT_TOKEN == "", (
            "shared.BOT_TOKEN was not restored to '' after TestAuthWithBotToken. "
            "The patch.autouse fixture may have leaked state."
        )

    def test_x_user_id_accepted_without_bot_token(self, client):
        r = client.get(_HISTORY_EP, headers={"X-User-Id": "123456"})
        assert r.status_code == 200, r.text

    def test_non_integer_x_user_id_returns_400(self, client):
        r = client.get(_HISTORY_EP, headers={"X-User-Id": "not-a-number"})
        assert r.status_code == 400, r.text

    def test_no_header_without_bot_token_returns_401(self, client):
        r = client.get(_HISTORY_EP)
        assert r.status_code == 401, r.text


# ─── /api/send-file — auth code path (tools_ops local BOT_TOKEN + shared) ────

class TestSendFileAuth:
    """Tests for /api/send-file authentication.

    This endpoint has TWO separate BOT_TOKEN checks:
      1. `if not BOT_TOKEN:` on line 40 → reads tools_ops.BOT_TOKEN
                                          (local binding from `from shared import`)
      2. `_get_user_id(request)` → reads shared.BOT_TOKEN at call time

    Both must be patched for tests that exercise the authenticated path.
    Tests that verify the 503 "no bot configured" path need NO patches.
    """

    _FORM_FILE = [("file", ("test.txt", b"hello world", "text/plain"))]
    _FORM_DATA = {"filename": "test.txt"}

    # Helper: build a minimal mock for httpx.AsyncClient async context manager
    @staticmethod
    def _mock_httpx(response_body: dict):
        """Return (mock_client_class, captured_calls dict).

        captured_calls["post_kwargs"] is populated when post() is awaited.
        """
        captured: dict = {}

        async def _fake_post(url, **kwargs):
            captured["url"]      = url
            captured["data"]     = kwargs.get("data", {})
            captured["files"]    = kwargs.get("files", {})
            resp = MagicMock()
            resp.json.return_value = response_body
            return resp

        inner_client = MagicMock()
        inner_client.post = AsyncMock(side_effect=_fake_post)

        async_cm = MagicMock()
        async_cm.__aenter__ = AsyncMock(return_value=inner_client)
        async_cm.__aexit__  = AsyncMock(return_value=None)

        mock_cls = MagicMock(return_value=async_cm)
        return mock_cls, captured

    # ── No BOT_TOKEN → 503 (tools_ops check, no patches needed) ─────────────

    def test_no_bot_token_returns_503(self, client):
        """With BOT_TOKEN="" (conftest default) endpoint refuses immediately."""
        r = client.post(
            _SEND_FILE_EP,
            files=self._FORM_FILE,
            data=self._FORM_DATA,
            headers={"X-User-Id": "123456"},
        )
        assert r.status_code == 503, r.text

    # ── BOT_TOKEN set → auth enforced ─────────────────────────────────────────

    def test_no_auth_header_returns_401(self, client):
        with patch("shared.BOT_TOKEN", _TEST_TOKEN), \
             patch("routers.tools_ops.BOT_TOKEN", _TEST_TOKEN):
            r = client.post(_SEND_FILE_EP, files=self._FORM_FILE, data=self._FORM_DATA)
        assert r.status_code == 401, r.text

    def test_x_user_id_spoofing_rejected(self, client):
        """X-User-Id must not bypass initData requirement when BOT_TOKEN is set."""
        with patch("shared.BOT_TOKEN", _TEST_TOKEN), \
             patch("routers.tools_ops.BOT_TOKEN", _TEST_TOKEN):
            r = client.post(
                _SEND_FILE_EP,
                files=self._FORM_FILE,
                data=self._FORM_DATA,
                headers={"X-User-Id": "999999"},
            )
        assert r.status_code == 401, r.text

    def test_invalid_init_data_signature_returns_401(self, client):
        init_data = _make_init_data(_TEST_TOKEN, corrupt_hash=True)
        with patch("shared.BOT_TOKEN", _TEST_TOKEN), \
             patch("routers.tools_ops.BOT_TOKEN", _TEST_TOKEN):
            r = client.post(
                _SEND_FILE_EP,
                files=self._FORM_FILE,
                data=self._FORM_DATA,
                headers={"X-Telegram-Init-Data": init_data},
            )
        assert r.status_code == 401, r.text

    # ── Verified user.id used as chat_id (not a spoofed form value) ──────────

    def test_chat_id_derived_from_initdata_user_id(self, client):
        """The Telegram sendDocument call must use the verified user.id as chat_id."""
        init_data = _make_init_data(_TEST_TOKEN, user_id=_TEST_USER_ID)
        mock_cls, captured = self._mock_httpx({"ok": True})

        with patch("shared.BOT_TOKEN", _TEST_TOKEN), \
             patch("routers.tools_ops.BOT_TOKEN", _TEST_TOKEN), \
             patch("httpx.AsyncClient", mock_cls):
            r = client.post(
                _SEND_FILE_EP,
                files=[("file", ("report.pdf", b"%PDF-1.4", "application/pdf"))],
                data={"filename": "report.pdf"},
                headers={"X-Telegram-Init-Data": init_data},
            )

        assert r.status_code == 200, r.text
        assert captured.get("data", {}).get("chat_id") == _TEST_USER_ID, (
            f"Expected chat_id={_TEST_USER_ID!r}, got {captured.get('data')!r}"
        )

    def test_no_spoofed_form_user_id_in_request(self, client):
        """There is no user_id Form field — trying to pass one must be ignored."""
        init_data = _make_init_data(_TEST_TOKEN, user_id=_TEST_USER_ID)
        mock_cls, captured = self._mock_httpx({"ok": True})

        with patch("shared.BOT_TOKEN", _TEST_TOKEN), \
             patch("routers.tools_ops.BOT_TOKEN", _TEST_TOKEN), \
             patch("httpx.AsyncClient", mock_cls):
            r = client.post(
                _SEND_FILE_EP,
                # Attacker tries to inject a different user_id via form
                files=[("file", ("x.txt", b"x", "text/plain"))],
                data={"filename": "x.txt", "user_id": "666666"},
                headers={"X-Telegram-Init-Data": init_data},
            )

        assert r.status_code == 200, r.text
        # chat_id must still be _TEST_USER_ID (from initData), not 666666
        assert captured.get("data", {}).get("chat_id") == _TEST_USER_ID, (
            f"Spoofed user_id leaked into chat_id: {captured.get('data')!r}"
        )

    def test_telegram_api_failure_returns_500(self, client):
        """When Telegram returns ok=false, the endpoint raises 500."""
        init_data = _make_init_data(_TEST_TOKEN, user_id=_TEST_USER_ID)
        mock_cls, _ = self._mock_httpx({"ok": False, "description": "bot was blocked"})

        with patch("shared.BOT_TOKEN", _TEST_TOKEN), \
             patch("routers.tools_ops.BOT_TOKEN", _TEST_TOKEN), \
             patch("httpx.AsyncClient", mock_cls):
            r = client.post(
                _SEND_FILE_EP,
                files=[("file", ("x.txt", b"x", "text/plain"))],
                data={"filename": "x.txt"},
                headers={"X-Telegram-Init-Data": init_data},
            )

        assert r.status_code == 500, r.text
