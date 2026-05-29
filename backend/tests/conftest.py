"""Pytest config: make `backend/` importable so `import shared`, `import database` work."""
import os
import sys

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
