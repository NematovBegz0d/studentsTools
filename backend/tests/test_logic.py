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



# ═══════════════════════════════════════════════════════════════════════════
#  Feature-regression tests (security & quality fixes)
#  These live here because they assert behaviour introduced by the fix PRs.
# ═══════════════════════════════════════════════════════════════════════════

class TestPaymeIdempotency:
    """CreateTransaction must bind exactly one Payme tx per order and stay
    idempotent on retries (one-transaction-per-order rule)."""

    def test_same_tx_is_idempotent_other_tx_rejected(self):
        import payment as pay
        db = _FakePaymentDB(); db.add("P1")
        amt = pay.PLAN_PRICES["monthly"]

        r1 = _rpc("CreateTransaction",
                  {"id": "TX1", "amount": amt, "account": {"payment_id": "P1"}}, db)
        ct1 = r1["result"]["create_time"]

        # Same transaction id again → idempotent (stable create_time, no error).
        r2 = _rpc("CreateTransaction",
                  {"id": "TX1", "amount": amt, "account": {"payment_id": "P1"}}, db)
        assert r2["result"]["create_time"] == ct1

        # A DIFFERENT transaction id for the same order → rejected.
        r3 = _rpc("CreateTransaction",
                  {"id": "TX2", "amount": amt, "account": {"payment_id": "P1"}}, db)
        assert r3["error"]["code"] == pay.PaymeError.CANT_PERFORM


class TestLikeEscape:
    """Admin user-search must escape LIKE/ILIKE wildcards (no pattern injection)."""

    def test_percent_escaped(self):
        from database import _like_escape
        assert _like_escape("100%") == "100\\%"

    def test_underscore_escaped(self):
        from database import _like_escape
        assert _like_escape("a_b") == "a\\_b"

    def test_backslash_escaped(self):
        from database import _like_escape
        assert _like_escape("a\\b") == "a\\\\b"

    def test_plain_text_unchanged(self):
        from database import _like_escape
        assert _like_escape("john") == "john"


class TestParseHexColor:
    """Watermark color parser must tolerate junk and fall back to gray."""

    def test_full_hex(self):
        from routers.pdf_ops import _parse_hex_color
        assert _parse_hex_color("#ff0000") == (1.0, 0.0, 0.0)

    def test_short_hex(self):
        from routers.pdf_ops import _parse_hex_color
        r = _parse_hex_color("c00")
        assert round(r[0], 2) == 0.8 and r[1] == 0.0 and r[2] == 0.0

    def test_empty_defaults_gray(self):
        from routers.pdf_ops import _parse_hex_color
        assert _parse_hex_color("") == (0.5, 0.5, 0.5)

    def test_invalid_defaults_gray(self):
        from routers.pdf_ops import _parse_hex_color
        assert _parse_hex_color("zzz") == (0.5, 0.5, 0.5)


class TestDocxHasContent:
    """pdf2docx success is decided by real content, not byte size."""

    def test_doc_with_text_is_content(self):
        docx = pytest.importorskip("docx")
        import io as _io
        from routers.convert_ops import _docx_has_content
        d = docx.Document()
        d.add_paragraph("Hello world")
        buf = _io.BytesIO(); d.save(buf); buf.seek(0)
        assert _docx_has_content(buf) is True

    def test_empty_doc_is_not_content(self):
        docx = pytest.importorskip("docx")
        import io as _io
        from routers.convert_ops import _docx_has_content
        d = docx.Document()
        buf = _io.BytesIO(); d.save(buf); buf.seek(0)
        assert _docx_has_content(buf) is False
