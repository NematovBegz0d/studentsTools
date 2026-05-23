from __future__ import annotations

"""
Payme (paycom.uz) Merchant API — JSON-RPC 2.0
Docs: https://developer.paycom.uz/docs

Flow:
  1. Frontend → POST /api/payment/create  → { payment_id, checkout_url }
  2. User pays on Payme checkout page
  3. Payme → POST /api/payment/payme  (RPC callbacks)
  4. Frontend → GET /api/payment/status/{payment_id}  → { status }
"""

import base64
import hashlib
import os
import time
import uuid
from loguru import logger

# ─── Config ──────────────────────────────────────────────────────────────────

PAYME_ID       = os.environ.get("PAYME_MERCHANT_ID", "")
PAYME_KEY      = os.environ.get("PAYME_SECRET_KEY", "")
PAYME_TEST_KEY = os.environ.get("PAYME_TEST_KEY", "")
PAYME_TEST     = os.environ.get("PAYME_TEST", "true").lower() == "true"

CHECKOUT_URL = (
    "https://test.paycom.uz" if PAYME_TEST
    else "https://checkout.paycom.uz"
)

# Tarif narxlari (so'mda) → Payme tiyinda (x100)
PLAN_PRICES: dict[str, int] = {
    "monthly": 29_900 * 100,   # 29 900 so'm
    "yearly":  199_900 * 100,  # 199 900 so'm
}

# RPC error kodlari (Payme standart)
class PaymeError:
    PARSE_ERROR      = -32700
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS   = -32600
    INTERNAL_ERROR   = -32603
    TRANS_NOT_FOUND  = -31003
    CANT_PERFORM     = -31008
    ALREADY_DONE     = -31060

# To'lov holatlari
class TxState:
    PENDING   = 1
    PAID      = 2
    CANCELLED = -1
    CANCELLED_AFTER_PAY = -2


# ─── Auth ─────────────────────────────────────────────────────────────────────

def verify_payme_auth(authorization: str) -> bool:
    """Basic auth: Paycom:<key>"""
    if not authorization or not authorization.strip():
        return False
    try:
        parts = authorization.split(" ", 1)
        if len(parts) < 2:
            return False
        encoded = parts[1].strip()
        decoded = base64.b64decode(encoded).decode()
        if ":" not in decoded:
            return False
        _, key = decoded.split(":", 1)
        expected = PAYME_TEST_KEY if PAYME_TEST else PAYME_KEY
        if not expected:
            return False
        return key == expected
    except Exception:
        return False


def _parse_dt_ms(dt_str: str) -> int:
    """Safely parse SQLite datetime string to milliseconds timestamp.
    Handles both 'YYYY-MM-DD HH:MM:SS' (SQLite default) and 'YYYY-MM-DDTHH:MM:SS' (ISO 8601)."""
    if not dt_str:
        return int(time.time() * 1000)
    try:
        # Normalize: replace T separator with space for uniform parsing
        normalized = dt_str[:19].replace("T", " ")
        parsed = time.strptime(normalized, "%Y-%m-%d %H:%M:%S")
        return int(time.mktime(parsed) * 1000)
    except Exception:
        return int(time.time() * 1000)


# ─── Checkout URL ─────────────────────────────────────────────────────────────

def build_checkout_url(payment_id: str, plan: str) -> str:
    amount = PLAN_PRICES.get(plan, 0)
    params = f"m={PAYME_ID};ac.payment_id={payment_id};a={amount};l=uz"
    encoded = base64.b64encode(params.encode()).decode()
    return f"{CHECKOUT_URL}/{encoded}"


def new_payment_id() -> str:
    return uuid.uuid4().hex


# ─── RPC dispatch ─────────────────────────────────────────────────────────────

async def handle_rpc(method: str, params: dict, db_fns: dict) -> dict:
    """
    db_fns = {
      "get_payment_by_payme": ...,
      "get_payment": ...,
      "confirm_payment": ...,
      "cancel_payment": ...,
    }
    """
    handlers = {
        "CheckPerformTransaction": _check_perform,
        "CreateTransaction":       _create_transaction,
        "PerformTransaction":      _perform_transaction,
        "CancelTransaction":       _cancel_transaction,
        "CheckTransaction":        _check_transaction,
        "GetStatement":            _get_statement,
    }
    fn = handlers.get(method)
    if fn is None:
        return _err(PaymeError.METHOD_NOT_FOUND, "Method not found")
    try:
        return await fn(params, db_fns)
    except Exception as e:
        logger.error(f"Payme RPC {method} xatosi: {e}")
        return _err(PaymeError.INTERNAL_ERROR, str(e))


# ─── RPC method handlers ──────────────────────────────────────────────────────

async def _check_perform(params: dict, db_fns: dict) -> dict:
    payment_id = params.get("account", {}).get("payment_id", "")
    payment = await db_fns["get_payment"](payment_id)
    if not payment:
        return _err(PaymeError.TRANS_NOT_FOUND, "To'lov topilmadi")
    if payment["status"] in ("paid", "cancelled"):
        return _err(PaymeError.CANT_PERFORM, "Bu to'lov amalga oshirib bo'lmaydi")
    expected = PLAN_PRICES.get(payment["plan"], 0)
    if params.get("amount") != expected:
        return _err(PaymeError.INVALID_PARAMS, "Summa noto'g'ri")
    return {"result": {"allow": True}}


async def _create_transaction(params: dict, db_fns: dict) -> dict:
    payment_id = params.get("account", {}).get("payment_id", "")
    payme_id   = params.get("id", "")
    payment    = await db_fns["get_payment"](payment_id)

    if not payment:
        return _err(PaymeError.TRANS_NOT_FOUND, "To'lov topilmadi")

    expected = PLAN_PRICES.get(payment["plan"], 0)
    if params.get("amount") != expected:
        return _err(PaymeError.INVALID_PARAMS, "Summa noto'g'ri")

    if payment["status"] == "paid":
        return _err(PaymeError.ALREADY_DONE, "To'lov allaqachon bajarilgan")
    if payment["status"] == "cancelled":
        return _err(PaymeError.CANT_PERFORM, "To'lov bekor qilingan")

    now_ms = int(time.time() * 1000)
    return {
        "result": {
            "create_time":  now_ms,
            "transaction":  payment_id,
            "state":        TxState.PENDING,
        }
    }


async def _perform_transaction(params: dict, db_fns: dict) -> dict:
    payme_id = params.get("id", "")

    # Agar allaqachon confirm qilingan bo'lsa
    existing = await db_fns["get_payment_by_payme"](payme_id)
    if existing and existing["status"] == "paid":
        now_ms = int(time.time() * 1000)
        return {
            "result": {
                "transaction":  existing["id"],
                "perform_time": now_ms,
                "state":        TxState.PAID,
            }
        }

    # payment_id ni params'dan olish (account ichida)
    payment_id = params.get("account", {}).get("payment_id", "")
    if not payment_id and existing:
        payment_id = existing["id"]

    payment = await db_fns["get_payment"](payment_id) if payment_id else None
    if not payment:
        return _err(PaymeError.TRANS_NOT_FOUND, "To'lov topilmadi")
    if payment["status"] == "cancelled":
        return _err(PaymeError.CANT_PERFORM, "To'lov bekor qilingan")

    confirmed = await db_fns["confirm_payment"](payment_id, payme_id)
    logger.info(f"To'lov tasdiqlandi: {payment_id} user={payment['user_id']} plan={payment['plan']}")

    now_ms = int(time.time() * 1000)
    return {
        "result": {
            "transaction":  payment_id,
            "perform_time": now_ms,
            "state":        TxState.PAID,
        }
    }


async def _cancel_transaction(params: dict, db_fns: dict) -> dict:
    payme_id   = params.get("id", "")
    payment_id = params.get("account", {}).get("payment_id", "")

    payment = await db_fns["get_payment"](payment_id) if payment_id else None
    if not payment:
        existing = await db_fns["get_payment_by_payme"](payme_id)
        if existing:
            payment = existing
            payment_id = existing["id"]

    if not payment:
        return _err(PaymeError.TRANS_NOT_FOUND, "To'lov topilmadi")

    if payment["status"] == "paid":
        state = TxState.CANCELLED_AFTER_PAY
    else:
        state = TxState.CANCELLED

    await db_fns["cancel_payment"](payment_id, payme_id)
    logger.info(f"To'lov bekor qilindi: {payment_id}")

    now_ms = int(time.time() * 1000)
    return {
        "result": {
            "transaction":  payment_id,
            "cancel_time":  now_ms,
            "state":        state,
        }
    }


async def _check_transaction(params: dict, db_fns: dict) -> dict:
    payme_id   = params.get("id", "")
    payment_id = params.get("account", {}).get("payment_id", "")

    payment = await db_fns["get_payment"](payment_id) if payment_id else None
    if not payment:
        payment = await db_fns["get_payment_by_payme"](payme_id)
    if not payment:
        return _err(PaymeError.TRANS_NOT_FOUND, "To'lov topilmadi")

    status_map = {
        "pending":   TxState.PENDING,
        "paid":      TxState.PAID,
        "cancelled": TxState.CANCELLED,
    }
    state    = status_map.get(payment["status"], TxState.PENDING)
    now_ms   = int(time.time() * 1000)
    created  = _parse_dt_ms(payment["created_at"])
    performed = now_ms if payment["status"] == "paid"      else 0
    cancelled  = now_ms if payment["status"] == "cancelled" else 0

    return {
        "result": {
            "create_time":  created,
            "perform_time": performed,
            "cancel_time":  cancelled,
            "transaction":  payment["id"],
            "state":        state,
        }
    }


async def _get_statement(params: dict, db_fns: dict) -> dict:
    # Minimal implementation — Payme bu endpointni kamdan-kam chaqiradi
    return {"result": {"transactions": []}}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _err(code: int, message: str) -> dict:
    return {"error": {"code": code, "message": {"uz": message, "ru": message, "en": message}}}
