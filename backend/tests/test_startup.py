"""Tests for /health and /health/ready endpoints, and STRICT_STARTUP_CHECKS logic.

/health       — always 200 (liveness probe)
/health/ready — 200 when is_ready() returns True, 503 otherwise (readiness probe)

startup_checks._is_ready is a module-level bool read by is_ready() at call time.
Patching it directly via patch("startup_checks._is_ready", …) exercises the
/health/ready response path without needing to restart the app or set env vars.

The STRICT_STARTUP_CHECKS unit tests call run_all_checks() directly (not via HTTP)
so we can mock every sub-check and verify only the readiness decision logic.

AsyncMock is used explicitly for check_redis because it is an `async def`
function — plain MagicMock would produce a non-awaitable return value.
"""
from contextlib import ExitStack, contextmanager
from unittest.mock import AsyncMock, patch

import pytest


# ─── /health — liveness probe ─────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_200(self, client):
        r = client.get("/health")
        assert r.status_code == 200

    def test_health_root_alias_returns_200(self, client):
        r = client.get("/")
        assert r.status_code == 200

    def test_health_response_shape(self, client):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert "version" in body
        assert "uptime" in body
        assert isinstance(body["uptime"], int)
        assert body["uptime"] >= 0
        assert "max_file_mb" in body
        assert body["max_file_mb"] > 0


# ─── /health/ready — readiness probe ─────────────────────────────────────────

class TestHealthReady:
    def test_ready_returns_200_when_is_ready_true(self, client):
        with patch("startup_checks._is_ready", True):
            r = client.get("/health/ready")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ready"
        assert "checks" in body

    def test_ready_returns_503_when_is_ready_false(self, client):
        with patch("startup_checks._is_ready", False):
            r = client.get("/health/ready")
        assert r.status_code == 503
        body = r.json()
        assert body["status"] == "not_ready"
        assert "checks" in body

    def test_ready_503_surfaces_check_details(self, client):
        """Ops must be able to see which dependency caused the 503."""
        sentinel = {
            "db":    False,
            "fonts": False,
            "tools": {"ghostscript": False, "libreoffice": True, "tesseract": True},
            "redis": True,
        }
        with patch("startup_checks._is_ready", False), \
             patch("startup_checks._last_results", sentinel):
            r = client.get("/health/ready")
        assert r.status_code == 503
        body = r.json()
        assert body["checks"]["db"] is False
        assert body["checks"]["fonts"] is False

    def test_ready_200_in_normal_test_run(self, client):
        """After app startup with in-memory SQLite and no STRICT, app must be ready."""
        r = client.get("/health/ready")
        assert r.status_code == 200, (
            f"App not ready in test environment. "
            f"Ensure in-memory DB init succeeded. Body: {r.json()}"
        )

    def test_ready_response_contains_checks_dict(self, client):
        with patch("startup_checks._is_ready", True):
            r = client.get("/health/ready")
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("checks"), dict)


# ─── STRICT_STARTUP_CHECKS — readiness decision unit tests ────────────────────
# These call run_all_checks() directly, mocking every sub-check function,
# so we only test the readiness decision logic — not the tool-detection logic.

@contextmanager
def _patch_all_checks(sc, *, strict, db_ok, gs_ok, fonts_ok, redis_ok=True):
    """Patch every dependency used by run_all_checks() as one context manager."""
    patches = (
        patch.object(sc, "STRICT", strict),
        patch.object(sc, "_db_ok", db_ok),
        patch.object(sc, "check_env_vars",     return_value={}),
        patch.object(sc, "check_system_tools", return_value={
            "ghostscript": gs_ok, "libreoffice": True, "tesseract": True,
        }),
        patch.object(sc, "check_fonts",  return_value=fonts_ok),
        patch.object(sc, "check_redis",  AsyncMock(return_value=redis_ok)),
    )
    with ExitStack() as stack:
        for item in patches:
            stack.enter_context(item)
        yield


class TestStrictStartupChecks:
    @pytest.mark.asyncio
    async def test_strict_not_ready_when_fonts_missing(self):
        import startup_checks as sc
        with _patch_all_checks(sc, strict=True, db_ok=True, gs_ok=True, fonts_ok=False):
            await sc.run_all_checks()
        assert sc._is_ready is False

    @pytest.mark.asyncio
    async def test_strict_not_ready_when_ghostscript_missing(self):
        import startup_checks as sc
        with _patch_all_checks(sc, strict=True, db_ok=True, gs_ok=False, fonts_ok=True):
            await sc.run_all_checks()
        assert sc._is_ready is False

    @pytest.mark.asyncio
    async def test_strict_not_ready_when_both_missing(self):
        import startup_checks as sc
        with _patch_all_checks(sc, strict=True, db_ok=True, gs_ok=False, fonts_ok=False):
            await sc.run_all_checks()
        assert sc._is_ready is False

    @pytest.mark.asyncio
    async def test_strict_ready_when_all_required_present(self):
        import startup_checks as sc
        with _patch_all_checks(sc, strict=True, db_ok=True, gs_ok=True, fonts_ok=True):
            await sc.run_all_checks()
        assert sc._is_ready is True

    @pytest.mark.asyncio
    async def test_db_failure_always_not_ready_strict(self):
        import startup_checks as sc
        with _patch_all_checks(sc, strict=True, db_ok=False, gs_ok=True, fonts_ok=True):
            await sc.run_all_checks()
        assert sc._is_ready is False

    @pytest.mark.asyncio
    async def test_db_failure_always_not_ready_non_strict(self):
        import startup_checks as sc
        with _patch_all_checks(sc, strict=False, db_ok=False, gs_ok=True, fonts_ok=True):
            await sc.run_all_checks()
        assert sc._is_ready is False

    @pytest.mark.asyncio
    async def test_non_strict_ready_despite_all_tools_missing(self):
        """Missing optional tools must not block readiness in non-strict mode."""
        import startup_checks as sc
        with _patch_all_checks(sc, strict=False, db_ok=True, gs_ok=False, fonts_ok=False, redis_ok=False):
            await sc.run_all_checks()
        assert sc._is_ready is True

    @pytest.mark.asyncio
    async def test_run_all_checks_stores_results(self):
        """run_all_checks() must populate _last_results so /health/ready can surface them."""
        import startup_checks as sc
        with _patch_all_checks(sc, strict=False, db_ok=True, gs_ok=True, fonts_ok=True):
            result = await sc.run_all_checks()
        assert "tools" in result
        assert "fonts" in result
        assert "db" in result
        assert sc._last_results is not None
        assert sc._last_results.get("db") is True
