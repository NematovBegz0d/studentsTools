"""Fast, dependency-light unit tests for pure logic.

No network, no heavy ML deps — these run in milliseconds and exercise the
business logic that the endpoint suite can only reach through a full request.

Covered:
  • Payme JSON-RPC dispatch (payment.handle_rpc) against an in-memory fake DB
  • PDF page-range parser (_parse_page_ranges)
  • image magic-byte detection (is_image_bytes)
  • ASCII response-header sanitisation (safe_header)

Run:
    cd backend
    pytest tests/test_logic.py -v
"""
from __future__ import annotations

import asyncio
import pytest


# ═══════════════════════════════════════════════════════════════════════════
#  Payme JSON-RPC dispatch
# ═══════════════════════════════════════════════════════════════════════════

class _FakePaymentDB:
    """In-memory stand-in for the database payment functions."""

    def __init__(self):
        self.rows: dict = {}

    def add(self, pid, plan="monthly", status="pending", payme_id=None,
            created_at="2026-06-10 10:00:00", completed_at=None, user_id=1):
        import payment as pay
        self.rows[pid] = {
            "id": pid, "user_id": user_id, "plan": plan,
            "amount": pay.PLAN_PRICES[plan], "status": status,
            "payme_id": payme_id, "created_at": created_at,
            "completed_at": completed_at,
        }

    def fns(self) -> dict:
        async def get_payment(pid):
            return self.rows.get(pid)

        async def get_payment_by_payme(tid):
            return next((r for r in self.rows.values() if r["payme_id"] == tid), None)

        async def set_payment_payme_id(pid, tid):
            r = self.rows.get(pid)
            if r and r["payme_id"] is None:
                r["payme_id"] = tid
                return True
            return False

        async def confirm_payment(pid, tid):
            r = self.rows[pid]
            r["status"] = "paid"
            r["payme_id"] = tid
            r["completed_at"] = "2026-06-10 10:05:00"
            return r

        async def cancel_payment(pid, tid):
            r = self.rows[pid]
            r["status"] = "cancelled"
            r["payme_id"] = tid

        return {
            "get_payment": get_payment,
            "get_payment_by_payme": get_payment_by_payme,
            "set_payment_payme_id": set_payment_payme_id,
            "confirm_payment": confirm_payment,
            "cancel_payment": cancel_payment,
        }


def _rpc(method, params, db: _FakePaymentDB):
    import payment as pay
    return asyncio.run(pay.handle_rpc(method, params, db.fns()))


class TestPaymeRPC:
    def test_check_perform_not_found(self):
        import payment as pay
        r = _rpc("CheckPerformTransaction",
                 {"amount": 1, "account": {"payment_id": "missing"}}, _FakePaymentDB())
        assert r["error"]["code"] == pay.PaymeError.TRANS_NOT_FOUND

    def test_check_perform_wrong_amount(self):
        import payment as pay
        db = _FakePaymentDB(); db.add("P1")
        r = _rpc("CheckPerformTransaction",
                 {"amount": 1, "account": {"payment_id": "P1"}}, db)
        assert r["error"]["code"] == pay.PaymeError.INVALID_PARAMS

    def test_check_perform_ok(self):
        import payment as pay
        db = _FakePaymentDB(); db.add("P1")
        amt = pay.PLAN_PRICES["monthly"]
        r = _rpc("CheckPerformTransaction",
                 {"amount": amt, "account": {"payment_id": "P1"}}, db)
        assert r["result"]["allow"] is True

    def test_create_wrong_amount(self):
        import payment as pay
        db = _FakePaymentDB(); db.add("P1")
        r = _rpc("CreateTransaction",
                 {"id": "TX1", "amount": 7, "account": {"payment_id": "P1"}}, db)
        assert r["error"]["code"] == pay.PaymeError.INVALID_PARAMS

    def test_create_then_perform_then_check(self):
        import payment as pay
        db = _FakePaymentDB(); db.add("P1")
        amt = pay.PLAN_PRICES["monthly"]

        rc = _rpc("CreateTransaction",
                  {"id": "TX1", "amount": amt, "account": {"payment_id": "P1"}}, db)
        assert rc["result"]["state"] == pay.TxState.PENDING
        assert isinstance(rc["result"]["create_time"], int) and rc["result"]["create_time"] > 0

        rp = _rpc("PerformTransaction",
                  {"id": "TX1", "account": {"payment_id": "P1"}}, db)
        assert rp["result"]["state"] == pay.TxState.PAID
        assert db.rows["P1"]["status"] == "paid"

        rk = _rpc("CheckTransaction",
                  {"id": "TX1", "account": {"payment_id": "P1"}}, db)
        assert rk["result"]["state"] == pay.TxState.PAID

    def test_cancel_sets_cancelled(self):
        import payment as pay
        db = _FakePaymentDB(); db.add("P1")
        r = _rpc("CancelTransaction",
                 {"id": "TX1", "account": {"payment_id": "P1"}}, db)
        assert r["result"]["state"] in (pay.TxState.CANCELLED, pay.TxState.CANCELLED_AFTER_PAY)
        assert db.rows["P1"]["status"] == "cancelled"

    def test_unknown_method(self):
        import payment as pay
        r = _rpc("NoSuchMethod", {}, _FakePaymentDB())
        assert r["error"]["code"] == pay.PaymeError.METHOD_NOT_FOUND


# ═══════════════════════════════════════════════════════════════════════════
#  PDF page-range parser
# ═══════════════════════════════════════════════════════════════════════════

class TestPageRanges:
    def test_basic_range_and_single(self):
        from routers.pdf_ops import _parse_page_ranges
        assert _parse_page_ranges("1-3,5", 10) == [0, 1, 2, 4]

    def test_empty_returns_all(self):
        from routers.pdf_ops import _parse_page_ranges
        assert _parse_page_ranges("", 3) == [0, 1, 2]

    def test_out_of_range_clamped(self):
        from routers.pdf_ops import _parse_page_ranges
        assert _parse_page_ranges("1,99", 3) == [0]

    def test_reversed_range_raises(self):
        from routers.pdf_ops import _parse_page_ranges
        with pytest.raises(ValueError):
            _parse_page_ranges("5-1", 10)

    def test_zero_page_raises(self):
        from routers.pdf_ops import _parse_page_ranges
        with pytest.raises(ValueError):
            _parse_page_ranges("0", 10)


# ═══════════════════════════════════════════════════════════════════════════
#  Image magic-byte detection
# ═══════════════════════════════════════════════════════════════════════════

class TestImageDetect:
    def test_png(self):
        from shared import is_image_bytes
        assert is_image_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16)

    def test_jpeg(self):
        from shared import is_image_bytes
        assert is_image_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 16)

    def test_text_rejected(self):
        from shared import is_image_bytes
        assert not is_image_bytes(b"this is plain text, not an image")


# ═══════════════════════════════════════════════════════════════════════════
#  Response-header sanitisation
# ═══════════════════════════════════════════════════════════════════════════

class TestSafeHeader:
    def test_ascii_passthrough(self):
        from shared import safe_header
        assert safe_header("Hello 123") == "Hello 123"

    def test_unicode_arrow_replaced(self):
        from shared import safe_header
        assert "->" in safe_header("PDF → Word")

    def test_all_non_ascii_falls_back_to_ok(self):
        from shared import safe_header
        assert safe_header("Привет") == "ok"
