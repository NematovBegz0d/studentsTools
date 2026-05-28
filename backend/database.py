"""
Database layer — PostgreSQL (asyncpg) birlamchi, SQLite (aiosqlite) local dev uchun.

Muhit o'zgaruvchisi:
  DATABASE_URL=postgresql://user:pass@host:port/dbname  → PostgreSQL
  (bo'sh)                                               → SQLite (edubot.db)
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

DATABASE_URL = os.environ.get("DATABASE_URL", "")
_USE_PG = bool(DATABASE_URL)


# ═══════════════════════════════════════════════════════════════════════════════
#  PostgreSQL (asyncpg)
# ═══════════════════════════════════════════════════════════════════════════════
if _USE_PG:
    import asyncpg

    _pool: "asyncpg.Pool | None" = None

    async def _get_pool() -> "asyncpg.Pool":
        global _pool
        if _pool is None:
            # Railway injects sslmode=require; asyncpg needs ssl= param instead
            dsn = DATABASE_URL
            needs_ssl = "sslmode=require" in dsn
            if needs_ssl:
                dsn = (dsn
                       .replace("?sslmode=require", "")
                       .replace("&sslmode=require", "")
                       .replace("sslmode=require", "")
                       .rstrip("?&"))
            _pool = await asyncpg.create_pool(
                dsn, ssl="require" if needs_ssl else None,
                min_size=2, max_size=10, command_timeout=30,
            )
        return _pool

    async def init_db():
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id          BIGINT PRIMARY KEY,
                    username    TEXT,
                    first_name  TEXT,
                    plan        TEXT        NOT NULL DEFAULT 'free',
                    plan_until  TIMESTAMPTZ,
                    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    usage_count INTEGER     NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS usage_log (
                    id         BIGSERIAL PRIMARY KEY,
                    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    service_id TEXT        NOT NULL,
                    success    BOOLEAN     NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS payments (
                    id           TEXT        PRIMARY KEY,
                    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    plan         TEXT        NOT NULL,
                    amount       INTEGER     NOT NULL,
                    status       TEXT        NOT NULL DEFAULT 'pending',
                    payme_id     TEXT,
                    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    completed_at TIMESTAMPTZ
                );

                CREATE INDEX IF NOT EXISTS idx_usage_user    ON usage_log(user_id);
                CREATE INDEX IF NOT EXISTS idx_usage_service ON usage_log(service_id);
                CREATE INDEX IF NOT EXISTS idx_usage_date    ON usage_log(created_at);
                CREATE INDEX IF NOT EXISTS idx_pay_user      ON payments(user_id);
                CREATE INDEX IF NOT EXISTS idx_pay_payme     ON payments(payme_id);

                CREATE TABLE IF NOT EXISTS history (
                    id         BIGSERIAL PRIMARY KEY,
                    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    service_id TEXT        NOT NULL,
                    title      TEXT        NOT NULL,
                    preview    TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_hist_user ON history(user_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS certs (
                    id         TEXT        PRIMARY KEY,
                    name       TEXT        NOT NULL,
                    course     TEXT        NOT NULL,
                    issuer     TEXT        NOT NULL,
                    theme      TEXT        NOT NULL DEFAULT 'classic',
                    issued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    user_id    BIGINT
                );
                CREATE INDEX IF NOT EXISTS idx_cert_user ON certs(user_id);
            """)

    async def upsert_user(user_id: int, username: Optional[str], first_name: Optional[str]):
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO users (id, username, first_name)
                VALUES ($1, $2, $3)
                ON CONFLICT (id) DO UPDATE SET
                    username   = EXCLUDED.username,
                    first_name = EXCLUDED.first_name
            """, user_id, username, first_name)

    async def get_user(user_id: int) -> Optional[dict]:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
            return dict(row) if row else None

    async def is_premium(user_id: int) -> bool:
        user = await get_user(user_id)
        if not user or user["plan"] == "free":
            return False
        until = user["plan_until"]
        if until is None:
            return True
        if isinstance(until, str):
            until = datetime.fromisoformat(until)
        now = datetime.now(timezone.utc)
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        return until > now

    async def update_plan(user_id: int, plan: str, plan_until: Optional[datetime] = None):
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET plan = $1, plan_until = $2 WHERE id = $3",
                plan, plan_until, user_id,
            )

    async def log_usage(user_id: int, service_id: str, success: bool = True):
        pool = await _get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    "INSERT INTO usage_log (user_id, service_id, success) VALUES ($1, $2, $3)",
                    user_id, service_id, success,
                )
                await conn.execute(
                    "UPDATE users SET usage_count = usage_count + 1 WHERE id = $1",
                    user_id,
                )

    async def create_payment(payment_id: str, user_id: int, plan: str, amount: int):
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO payments (id, user_id, plan, amount) VALUES ($1, $2, $3, $4)",
                payment_id, user_id, plan, amount,
            )

    async def get_payment(payment_id: str) -> Optional[dict]:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM payments WHERE id = $1", payment_id)
            return dict(row) if row else None

    async def get_payment_by_payme(payme_id: str) -> Optional[dict]:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM payments WHERE payme_id = $1", payme_id)
            return dict(row) if row else None

    async def confirm_payment(payment_id: str, payme_id: str) -> Optional[dict]:
        payment = await get_payment(payment_id)
        if not payment:
            return None
        from dateutil.relativedelta import relativedelta
        plan_until = datetime.now(timezone.utc) + (
            relativedelta(years=1) if payment["plan"] == "yearly"
            else relativedelta(months=1)
        )
        pool = await _get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    "UPDATE payments SET status='paid', payme_id=$1, completed_at=NOW() WHERE id=$2",
                    payme_id, payment_id,
                )
                await conn.execute(
                    "UPDATE users SET plan=$1, plan_until=$2 WHERE id=$3",
                    payment["plan"], plan_until, payment["user_id"],
                )
        return payment

    async def cancel_payment(payment_id: str, payme_id: str):
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE payments SET status='cancelled', payme_id=$1 WHERE id=$2",
                payme_id, payment_id,
            )

    async def get_stats() -> dict:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            total_users    = await conn.fetchval("SELECT COUNT(*) FROM users")
            premium_users  = await conn.fetchval("SELECT COUNT(*) FROM users WHERE plan != 'free'")
            today_requests = await conn.fetchval(
                "SELECT COUNT(*) FROM usage_log WHERE created_at >= CURRENT_DATE"
            )
            top_services = [dict(r) for r in await conn.fetch("""
                SELECT service_id, COUNT(*) AS cnt
                FROM usage_log
                GROUP BY service_id
                ORDER BY cnt DESC
                LIMIT 5
            """)]
            today_revenue = await conn.fetchval(
                "SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid' AND created_at >= CURRENT_DATE"
            )
            total_revenue = await conn.fetchval(
                "SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid'"
            )
        return {
            "total_users":    total_users,
            "premium_users":  premium_users,
            "today_requests": today_requests,
            "top_services":   top_services,
            "today_revenue":  today_revenue,
            "total_revenue":  total_revenue,
        }

    async def get_users(offset: int = 0, limit: int = 50, search: str = "") -> list:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            if search:
                rows = await conn.fetch("""
                    SELECT id, username, first_name, plan, plan_until, created_at, usage_count
                    FROM users
                    WHERE username ILIKE $1 OR CAST(id AS TEXT) LIKE $1
                    ORDER BY created_at DESC LIMIT $2 OFFSET $3
                """, f"%{search}%", limit, offset)
            else:
                rows = await conn.fetch("""
                    SELECT id, username, first_name, plan, plan_until, created_at, usage_count
                    FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2
                """, limit, offset)
            total = await conn.fetchval("SELECT COUNT(*) FROM users")
            return {"users": [dict(r) for r in rows], "total": total}

    async def get_payments(offset: int = 0, limit: int = 50) -> list:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT p.id, p.user_id, p.plan, p.amount, p.status,
                       p.payme_id, p.created_at, p.completed_at,
                       u.username, u.first_name
                FROM payments p LEFT JOIN users u ON p.user_id = u.id
                ORDER BY p.created_at DESC LIMIT $1 OFFSET $2
            """, limit, offset)
            total = await conn.fetchval("SELECT COUNT(*) FROM payments")
            return {"payments": [dict(r) for r in rows], "total": total}

    async def admin_set_plan(user_id: int, plan: str, days: int = 30):
        from datetime import timedelta
        plan_until = datetime.now(timezone.utc) + timedelta(days=days) if plan != "free" else None
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET plan=$1, plan_until=$2 WHERE id=$3",
                plan, plan_until, user_id,
            )

    async def add_history(user_id: int, service_id: str, title: str, preview: Optional[str] = None):
        pool = await _get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    "INSERT INTO history (user_id, service_id, title, preview) VALUES ($1, $2, $3, $4)",
                    user_id, service_id, title[:200], (preview or "")[:500],
                )
                # Keep only last 50 entries per user
                await conn.execute("""
                    DELETE FROM history
                    WHERE id IN (
                        SELECT id FROM history WHERE user_id=$1
                        ORDER BY created_at DESC OFFSET 50
                    )
                """, user_id)

    async def get_history(user_id: int, limit: int = 20) -> list:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, service_id, title, preview, created_at FROM history "
                "WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
                user_id, limit,
            )
            return [dict(r) for r in rows]

    async def delete_history(user_id: int, history_id: Optional[int] = None):
        pool = await _get_pool()
        async with pool.acquire() as conn:
            if history_id is None:
                await conn.execute("DELETE FROM history WHERE user_id=$1", user_id)
            else:
                await conn.execute(
                    "DELETE FROM history WHERE user_id=$1 AND id=$2",
                    user_id, history_id,
                )

    async def save_cert(cert_id: str, name: str, course: str, issuer: str,
                        theme: str = "classic", user_id: Optional[int] = None):
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO certs (id, name, course, issuer, theme, user_id) "
                "VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
                cert_id, name[:120], course[:160], issuer[:120], theme[:24], user_id,
            )

    async def get_cert(cert_id: str) -> Optional[dict]:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM certs WHERE id = $1", cert_id)
            return dict(row) if row else None


# ═══════════════════════════════════════════════════════════════════════════════
#  SQLite fallback (local development — DATABASE_URL yo'q bo'lganda)
# ═══════════════════════════════════════════════════════════════════════════════
else:
    import aiosqlite

    _RAW_DB_PATH = os.environ.get("DB_PATH", "edubot.db")
    # aiosqlite opens a new connection for every operation; plain ':memory:'
    # would create a fresh empty DB per connection. Use an OS temp file for tests.
    import tempfile
    DB_PATH = (
    os.path.join(tempfile.gettempdir(), f"edubot_test_{os.getpid()}.sqlite3")
    if _RAW_DB_PATH == ":memory:"
    else _RAW_DB_PATH
    )
    async def init_db():
        async with aiosqlite.connect(DB_PATH) as db:
            await db.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id          INTEGER PRIMARY KEY,
                    username    TEXT,
                    first_name  TEXT,
                    plan        TEXT    NOT NULL DEFAULT 'free',
                    plan_until  TEXT,
                    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                    usage_count INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS usage_log (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id    INTEGER NOT NULL REFERENCES users(id),
                    service_id TEXT    NOT NULL,
                    success    INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS payments (
                    id           TEXT    PRIMARY KEY,
                    user_id      INTEGER NOT NULL REFERENCES users(id),
                    plan         TEXT    NOT NULL,
                    amount       INTEGER NOT NULL,
                    status       TEXT    NOT NULL DEFAULT 'pending',
                    payme_id     TEXT,
                    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
                    completed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_usage_user    ON usage_log(user_id);
                CREATE INDEX IF NOT EXISTS idx_usage_service ON usage_log(service_id);
                CREATE INDEX IF NOT EXISTS idx_usage_date    ON usage_log(created_at);
                CREATE INDEX IF NOT EXISTS idx_pay_user      ON payments(user_id);
                CREATE INDEX IF NOT EXISTS idx_pay_payme     ON payments(payme_id);

                CREATE TABLE IF NOT EXISTS history (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id    INTEGER NOT NULL REFERENCES users(id),
                    service_id TEXT    NOT NULL,
                    title      TEXT    NOT NULL,
                    preview    TEXT,
                    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
                );
                CREATE INDEX IF NOT EXISTS idx_hist_user ON history(user_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS certs (
                    id        TEXT PRIMARY KEY,
                    name      TEXT NOT NULL,
                    course    TEXT NOT NULL,
                    issuer    TEXT NOT NULL,
                    theme     TEXT NOT NULL DEFAULT 'classic',
                    issued_at TEXT NOT NULL DEFAULT (datetime('now')),
                    user_id   INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_cert_user ON certs(user_id);
            """)
            await db.commit()

    async def upsert_user(user_id: int, username: Optional[str], first_name: Optional[str]):
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("""
                INSERT INTO users (id, username, first_name) VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    username   = excluded.username,
                    first_name = excluded.first_name
            """, (user_id, username, first_name))
            await db.commit()

    async def get_user(user_id: int) -> Optional[dict]:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def is_premium(user_id: int) -> bool:
        user = await get_user(user_id)
        if not user or user["plan"] == "free":
            return False
        if user["plan_until"] is None:
            return True
        until = datetime.fromisoformat(user["plan_until"])
        now = datetime.now(timezone.utc)
        if until.tzinfo is None:
            now = now.replace(tzinfo=None)
        return until > now

    async def update_plan(user_id: int, plan: str, plan_until: Optional[datetime] = None):
        until_str = plan_until.isoformat() if plan_until else None
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE users SET plan = ?, plan_until = ? WHERE id = ?",
                (plan, until_str, user_id),
            )
            await db.commit()

    async def log_usage(user_id: int, service_id: str, success: bool = True):
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT INTO usage_log (user_id, service_id, success) VALUES (?, ?, ?)",
                (user_id, service_id, int(success)),
            )
            await db.execute(
                "UPDATE users SET usage_count = usage_count + 1 WHERE id = ?",
                (user_id,),
            )
            await db.commit()

    async def create_payment(payment_id: str, user_id: int, plan: str, amount: int):
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT INTO payments (id, user_id, plan, amount) VALUES (?, ?, ?, ?)",
                (payment_id, user_id, plan, amount),
            )
            await db.commit()

    async def get_payment(payment_id: str) -> Optional[dict]:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM payments WHERE id = ?", (payment_id,)) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def get_payment_by_payme(payme_id: str) -> Optional[dict]:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM payments WHERE payme_id = ?", (payme_id,)
            ) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def confirm_payment(payment_id: str, payme_id: str) -> Optional[dict]:
        payment = await get_payment(payment_id)
        if not payment:
            return None
        now_str = datetime.now().isoformat()
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE payments SET status='paid', payme_id=?, completed_at=? WHERE id=?",
                (payme_id, now_str, payment_id),
            )
            await db.commit()
        from dateutil.relativedelta import relativedelta
        plan_until = datetime.now() + (
            relativedelta(years=1) if payment["plan"] == "yearly"
            else relativedelta(months=1)
        )
        await update_plan(payment["user_id"], payment["plan"], plan_until)
        return payment

    async def cancel_payment(payment_id: str, payme_id: str):
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE payments SET status='cancelled', payme_id=? WHERE id=?",
                (payme_id, payment_id),
            )
            await db.commit()

    async def get_stats() -> dict:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT COUNT(*) as n FROM users") as cur:
                total_users = (await cur.fetchone())["n"]
            async with db.execute(
                "SELECT COUNT(*) as n FROM users WHERE plan != 'free'"
            ) as cur:
                premium_users = (await cur.fetchone())["n"]
            today = datetime.now().strftime("%Y-%m-%d")
            async with db.execute(
                "SELECT COUNT(*) as n FROM usage_log WHERE created_at >= ?", (today,)
            ) as cur:
                today_requests = (await cur.fetchone())["n"]
            async with db.execute("""
                SELECT service_id, COUNT(*) as cnt
                FROM usage_log GROUP BY service_id ORDER BY cnt DESC LIMIT 5
            """) as cur:
                top_services = [dict(r) for r in await cur.fetchall()]
            async with db.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='paid' AND created_at >= ?",
                (today,),
            ) as cur:
                today_revenue = (await cur.fetchone())["total"]
            async with db.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='paid'"
            ) as cur:
                total_revenue = (await cur.fetchone())["total"]
        return {
            "total_users":    total_users,
            "premium_users":  premium_users,
            "today_requests": today_requests,
            "top_services":   top_services,
            "today_revenue":  today_revenue,
            "total_revenue":  total_revenue,
        }

    async def get_users(offset: int = 0, limit: int = 50, search: str = "") -> dict:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            if search:
                q = f"%{search}%"
                async with db.execute("""
                    SELECT id, username, first_name, plan, plan_until, created_at, usage_count
                    FROM users WHERE username LIKE ? OR CAST(id AS TEXT) LIKE ?
                    ORDER BY created_at DESC LIMIT ? OFFSET ?
                """, (q, q, limit, offset)) as cur:
                    users = [dict(r) for r in await cur.fetchall()]
            else:
                async with db.execute("""
                    SELECT id, username, first_name, plan, plan_until, created_at, usage_count
                    FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?
                """, (limit, offset)) as cur:
                    users = [dict(r) for r in await cur.fetchall()]
            async with db.execute("SELECT COUNT(*) as n FROM users") as cur:
                total = (await cur.fetchone())["n"]
        return {"users": users, "total": total}

    async def get_payments(offset: int = 0, limit: int = 50) -> dict:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT p.id, p.user_id, p.plan, p.amount, p.status,
                       p.payme_id, p.created_at, p.completed_at,
                       u.username, u.first_name
                FROM payments p LEFT JOIN users u ON p.user_id = u.id
                ORDER BY p.created_at DESC LIMIT ? OFFSET ?
            """, (limit, offset)) as cur:
                payments = [dict(r) for r in await cur.fetchall()]
            async with db.execute("SELECT COUNT(*) as n FROM payments") as cur:
                total = (await cur.fetchone())["n"]
        return {"payments": payments, "total": total}

    async def admin_set_plan(user_id: int, plan: str, days: int = 30):
        from datetime import timedelta
        plan_until = (datetime.now() + timedelta(days=days)).isoformat() if plan != "free" else None
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE users SET plan=?, plan_until=? WHERE id=?",
                (plan, plan_until, user_id),
            )
            await db.commit()

    async def add_history(user_id: int, service_id: str, title: str, preview: Optional[str] = None):
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT INTO history (user_id, service_id, title, preview) VALUES (?, ?, ?, ?)",
                (user_id, service_id, title[:200], (preview or "")[:500]),
            )
            await db.execute("""
                DELETE FROM history WHERE id IN (
                    SELECT id FROM history WHERE user_id=?
                    ORDER BY created_at DESC LIMIT -1 OFFSET 50
                )
            """, (user_id,))
            await db.commit()

    async def get_history(user_id: int, limit: int = 20) -> list:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id, service_id, title, preview, created_at FROM history "
                "WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit),
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def delete_history(user_id: int, history_id: Optional[int] = None):
        async with aiosqlite.connect(DB_PATH) as db:
            if history_id is None:
                await db.execute("DELETE FROM history WHERE user_id=?", (user_id,))
            else:
                await db.execute(
                    "DELETE FROM history WHERE user_id=? AND id=?",
                    (user_id, history_id),
                )
            await db.commit()

    async def save_cert(cert_id: str, name: str, course: str, issuer: str,
                        theme: str = "classic", user_id: Optional[int] = None):
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT OR IGNORE INTO certs (id, name, course, issuer, theme, user_id) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (cert_id, name[:120], course[:160], issuer[:120], theme[:24], user_id),
            )
            await db.commit()

    async def get_cert(cert_id: str) -> Optional[dict]:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM certs WHERE id = ?", (cert_id,)) as cur:
                row = await cur.fetchone()
            return dict(row) if row else None
