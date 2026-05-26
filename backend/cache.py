"""
Lightweight cache layer.

Backends:
  • Redis (if REDIS_URL env var is set) — shared across replicas
  • In-memory LRU + TTL (fallback) — works without dependencies

Usage:
    from cache import cached, get_async, set_async

    @cached(ttl=600, key_prefix="wiki")
    async def fetch_wiki(query, lang):
        ...

The decorator hashes (args, kwargs) → key; returns cached value if fresh.
"""
from __future__ import annotations

import os
import time
import json
import asyncio
import hashlib
import functools
from typing import Any, Optional, Callable
from loguru import logger

REDIS_URL = os.environ.get("REDIS_URL", "")
_USE_REDIS = bool(REDIS_URL)

_redis_client: Any = None
_redis_init_lock = asyncio.Lock()

# In-memory fallback (per-process)
_MEM_MAX_KEYS = 5000
_mem_store: dict[str, tuple[float, Any]] = {}


# ═══════════════════════════════════════════════════════════════════════════
#  Redis init (lazy)
# ═══════════════════════════════════════════════════════════════════════════

async def _get_redis():
    global _redis_client
    if _redis_client is not None or not _USE_REDIS:
        return _redis_client
    async with _redis_init_lock:
        if _redis_client is None:
            try:
                import redis.asyncio as aioredis
                _redis_client = aioredis.from_url(
                    REDIS_URL, encoding="utf-8", decode_responses=True,
                    socket_timeout=2, socket_connect_timeout=2,
                )
                # Ping to verify connection
                await _redis_client.ping()
                logger.info("Redis cache ulandi")
            except Exception as e:
                logger.warning(f"Redis ulanish xatosi, in-memory ga o'tildi: {e}")
                _redis_client = False
    return _redis_client if _redis_client is not False else None


# ═══════════════════════════════════════════════════════════════════════════
#  In-memory helpers
# ═══════════════════════════════════════════════════════════════════════════

def _mem_get(key: str) -> Optional[Any]:
    rec = _mem_store.get(key)
    if rec is None:
        return None
    expires_at, value = rec
    if expires_at < time.time():
        _mem_store.pop(key, None)
        return None
    return value


def _mem_set(key: str, value: Any, ttl: int) -> None:
    if len(_mem_store) >= _MEM_MAX_KEYS:
        # Drop ~10% oldest entries (cheap LRU approximation)
        for k in list(_mem_store.keys())[: _MEM_MAX_KEYS // 10]:
            _mem_store.pop(k, None)
    _mem_store[key] = (time.time() + ttl, value)


# ═══════════════════════════════════════════════════════════════════════════
#  Public async API
# ═══════════════════════════════════════════════════════════════════════════

async def get_async(key: str) -> Optional[Any]:
    """Try Redis → fall back to in-memory."""
    if _USE_REDIS:
        client = await _get_redis()
        if client is not None:
            try:
                raw = await client.get(key)
                if raw is not None:
                    return json.loads(raw)
            except Exception as e:
                logger.debug(f"redis get xato: {e}")
    return _mem_get(key)


async def set_async(key: str, value: Any, ttl: int = 300) -> None:
    """Write to Redis (if available) AND in-memory."""
    if _USE_REDIS:
        client = await _get_redis()
        if client is not None:
            try:
                await client.setex(key, ttl, json.dumps(value, ensure_ascii=False))
            except Exception as e:
                logger.debug(f"redis set xato: {e}")
    _mem_set(key, value, ttl)


# ═══════════════════════════════════════════════════════════════════════════
#  Decorator
# ═══════════════════════════════════════════════════════════════════════════

def _make_key(prefix: str, args: tuple, kwargs: dict) -> str:
    payload = json.dumps([args, kwargs], ensure_ascii=False, sort_keys=True, default=str)
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]
    return f"edubot:{prefix}:{digest}"


def cached(ttl: int = 300, key_prefix: str = "fn"):
    """
    Decorator: cache async function results.

    Example:
        @cached(ttl=3600, key_prefix="wiki")
        async def fetch_wiki(query, lang): ...
    """
    def wrap(fn: Callable):
        @functools.wraps(fn)
        async def inner(*args, **kwargs):
            key = _make_key(key_prefix, args, kwargs)
            hit = await get_async(key)
            if hit is not None:
                return hit
            result = await fn(*args, **kwargs)
            if result is not None:
                await set_async(key, result, ttl)
            return result
        return inner
    return wrap


# ═══════════════════════════════════════════════════════════════════════════
#  Stats (for /admin)
# ═══════════════════════════════════════════════════════════════════════════

def stats() -> dict:
    return {
        "backend": "redis" if _USE_REDIS and _redis_client else "memory",
        "memory_keys": len(_mem_store),
        "redis_url_set": bool(REDIS_URL),
    }
