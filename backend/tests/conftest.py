"""Pytest configuration — adds backend/ to sys.path so tests can `import main`.

The main app imports many heavy deps (paddleocr, mediapipe, marker-pdf).
Tests that need only pure helpers should import them by their fully-qualified
name; the parent main module will be loaded once and shared.
"""
import os
import sys

# Tests live under backend/tests/ — ensure backend/ itself is importable.
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Force SQLite for tests (no DATABASE_URL → falls back to in-memory-ish file).
os.environ.setdefault("DB_PATH", ":memory:")
os.environ.setdefault("BOT_TOKEN", "test-token-not-real")
