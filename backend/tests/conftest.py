"""Pytest config: make `backend/` importable so `import shared`, `import database` work."""
import os
import sys
import asyncio

import pytest

# Ensure backend/ is on sys.path regardless of where pytest is invoked from.
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

# Force SQLite in-memory style backend for tests — no DATABASE_URL, no BOT_TOKEN
# required (handlers that need BOT_TOKEN raise 503, which tests don't exercise).
os.environ.setdefault("DB_PATH", ":memory:")
os.environ.pop("DATABASE_URL", None)
os.environ.pop("BOT_TOKEN", None)


@pytest.fixture(scope="session", autouse=True)
def _init_db():
    """Bootstrap SQLite tables once per test session.

    The FastAPI lifespan handler runs `db.init_db()` automatically when the
    server boots; TestClient (used in test_endpoints.py) does NOT trigger
    lifespan unless used as a context manager, so we run init manually here.
    """
    import database as db
    asyncio.run(db.init_db())
    yield
    # Best-effort cleanup of the per-PID test sqlite file.
    raw_path = getattr(db, "DB_PATH", None)
    if raw_path and os.path.exists(raw_path) and "edubot_test_" in os.path.basename(raw_path):
        try:
            os.unlink(raw_path)
        except OSError:
            pass
