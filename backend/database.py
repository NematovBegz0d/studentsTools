from __future__ import annotations

import aiosqlite
import os
from datetime import datetime, timezone
from typing import Optional

DB_PATH = os.environ.get("DB_PATH", "edubot.db")


# ─── Init ────────────────────────────────────────────────────────────────────

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
        """)
        await db.commit()


# ─── User helpers ─────────────────────────────────────────────────────────────

async def upsert_user(user_id: int, username: str | None, first_name: str | None):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO users (id, username, first_name)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                username   = excluded.username,
                first_name = excluded.first_name
        """, (user_id, username, first_name))
        await db.commit()


async def get_user(user_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def is_premium(user_id: int) -> bool:
    user = await get_user(user_id)
    if not user:
        return False
    if user["plan"] == "free":
        return False
    if user["plan_until"] is None:
        return True
    until = datetime.fromisoformat(user["plan_until"])
    return until > datetime.now(timezone.utc).replace(tzinfo=None)


async def update_plan(user_id: int, plan: str, plan_until: datetime | None = None):
    until_str = plan_until.isoformat() if plan_until else None
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET plan = ?, plan_until = ? WHERE id = ?",
            (plan, until_str, user_id),
        )
        await db.commit()


# ─── Usage helpers ────────────────────────────────────────────────────────────

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


# ─── Payment helpers ──────────────────────────────────────────────────────────

async def create_payment(payment_id: str, user_id: int, plan: str, amount: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO payments (id, user_id, plan, amount) VALUES (?, ?, ?, ?)",
            (payment_id, user_id, plan, amount),
        )
        await db.commit()


async def get_payment(payment_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM payments WHERE id = ?", (payment_id,)
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def get_payment_by_payme(payme_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM payments WHERE payme_id = ?", (payme_id,)
        ) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def confirm_payment(payment_id: str, payme_id: str) -> dict | None:
    payment = await get_payment(payment_id)
    if not payment:
        return None
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE payments SET status='paid', payme_id=?, completed_at=? WHERE id=?",
            (payme_id, now, payment_id),
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


# ─── Admin stats ──────────────────────────────────────────────────────────────

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
            "SELECT COUNT(*) as n FROM usage_log WHERE created_at >= ?",
            (today,),
        ) as cur:
            today_requests = (await cur.fetchone())["n"]

        async with db.execute("""
            SELECT service_id, COUNT(*) as cnt
            FROM usage_log
            GROUP BY service_id
            ORDER BY cnt DESC
            LIMIT 5
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
