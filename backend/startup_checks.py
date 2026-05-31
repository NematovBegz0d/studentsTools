"""Startup dependency checks — run once during app lifespan.

Each check logs a WARNING (not a fatal error) so the app can still start
on a machine where some optional tools are absent. Only the database
(handled separately in main.py lifespan) is truly fatal.

STRICT_STARTUP_CHECKS=true → /health/ready returns 503 when any required
dependency (fonts, Ghostscript) is missing in addition to the DB.
"""
import os
import shutil
import subprocess

from loguru import logger

# ─── Module-level state ───────────────────────────────────────────────────────

_last_results: dict = {}
_db_ok: bool        = False
_is_ready: bool     = False

STRICT = os.environ.get("STRICT_STARTUP_CHECKS", "").lower() in ("1", "true", "yes")


def set_db_ok(ok: bool) -> None:
    """Called by main.py lifespan after db.init_db() succeeds or fails."""
    global _db_ok
    _db_ok = ok


def is_ready() -> bool:
    return _is_ready


def get_last_results() -> dict:
    return dict(_last_results)


# ─── Individual checks ────────────────────────────────────────────────────────

def _run_binary(name: str, *args: str) -> bool:
    path = shutil.which(name)
    if not path:
        return False
    try:
        subprocess.run(
            [path, *args],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
        return True
    except Exception:
        return False


def check_system_tools() -> dict[str, bool]:
    results: dict[str, bool] = {}

    # Ghostscript — used by compresspdf for best-quality compression
    gs = _run_binary("gs", "--version") or _run_binary("gswin64c", "--version")
    results["ghostscript"] = gs
    (logger.info if gs else logger.warning)(
        "Ghostscript: OK" if gs else "Ghostscript (gs) not found — compresspdf quality degraded"
    )

    # LibreOffice — pdf2docx / docx2pdf conversion chain
    lo = _run_binary("libreoffice", "--version") or _run_binary("soffice", "--version")
    results["libreoffice"] = lo
    (logger.info if lo else logger.warning)(
        "LibreOffice: OK" if lo else "LibreOffice not found — pdf2docx/docx2pdf use fallbacks"
    )

    # Tesseract — OCR engine (/api/ocr)
    tess = _run_binary("tesseract", "--version")
    results["tesseract"] = tess
    (logger.info if tess else logger.warning)(
        "Tesseract OCR: OK" if tess else "Tesseract not found — /api/ocr will fail"
    )

    return results


def check_fonts() -> bool:
    from shared import FONT_REGULAR, FONT_BOLD
    ok = True
    for p in (FONT_REGULAR, FONT_BOLD):
        if os.path.isfile(p):
            logger.info(f"Font OK: {os.path.basename(p)}")
        else:
            logger.warning(f"Font missing: {p} — fallback font used")
            ok = False
    return ok


async def check_redis() -> bool:
    redis_url = os.environ.get("REDIS_URL", "")
    if not redis_url:
        logger.info("Redis: not configured (optional)")
        return True
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(redis_url, socket_connect_timeout=5)
        await r.ping()
        await r.aclose()
        logger.info("Redis: OK")
        return True
    except ImportError:
        logger.warning("redis package not installed — cache disabled")
        return False
    except Exception as e:
        logger.warning(f"Redis connection failed: {e} — cache disabled")
        return False


def check_env_vars() -> dict[str, bool]:
    results: dict[str, bool] = {}
    for key in ("BOT_TOKEN", "ADMIN_TOKEN"):
        val = bool(os.environ.get(key, ""))
        results[key] = val
        (logger.info if val else logger.warning)(
            f"{key}: set" if val else f"{key}: NOT SET"
        )
    for key in ("SENTRY_DSN", "REDIS_URL", "ANTHROPIC_API_KEY"):
        val = bool(os.environ.get(key, ""))
        results[key] = val
        logger.info(f"{key}: {'set' if val else 'not configured (optional)'}")
    return results


# ─── Orchestrator ─────────────────────────────────────────────────────────────

async def run_all_checks() -> dict:
    """Run env / tool / font / redis checks; update readiness flag.

    NOTE: database init is owned by main.py lifespan — call set_db_ok()
    before or after this function so is_ready() has the correct DB state.
    """
    global _last_results, _is_ready

    summary: dict = {}
    summary["env"]   = check_env_vars()
    summary["tools"] = check_system_tools()
    summary["fonts"] = check_fonts()
    summary["redis"] = await check_redis()
    summary["db"]    = _db_ok

    miss = [k for k, v in summary["tools"].items() if not v]
    if miss:
        logger.warning(f"Startup: {len(miss)} tool(s) missing: {', '.join(miss)}")
    else:
        logger.info("Startup: all system tools present")

    # Readiness decision
    if not _db_ok:
        _is_ready = False
        logger.error("Startup: database unreachable — /health/ready will return 503")
    elif STRICT:
        # In strict mode also require fonts and Ghostscript (core PDF features)
        fonts_ok = summary["fonts"]
        gs_ok    = summary["tools"].get("ghostscript", False)
        _is_ready = fonts_ok and gs_ok
        if not _is_ready:
            logger.warning(
                "STRICT_STARTUP_CHECKS=true — missing fonts or Ghostscript → "
                "/health/ready will return 503"
            )
    else:
        _is_ready = True

    _last_results = summary
    return summary
