import os
import time

from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi import APIRouter
from loguru import logger

import database as db
from shared import limiter, _get_user_id, _check_admin, _start_time

router = APIRouter()


# ─── User plan ────────────────────────────────────────────────────────────────

@router.get("/api/user/{user_id}/plan")
@limiter.limit("30/minute")
async def user_plan(request: Request, user_id: int):
    caller_id = _get_user_id(request)
    if caller_id != user_id:
        raise HTTPException(status_code=403, detail="Ruxsat yo'q")
    user = await db.get_user(user_id)
    if not user:
        return {"plan": "free", "plan_until": None, "is_premium": False, "usage_count": 0}
    premium = await db.is_premium(user_id)
    return {
        "plan":        user["plan"],
        "plan_until":  user["plan_until"],
        "is_premium":  premium,
        "usage_count": user["usage_count"],
    }


# ─── History ──────────────────────────────────────────────────────────────────

@router.get("/api/history")
@limiter.limit("30/minute")
async def history_list(request: Request, limit: int = 20):
    user_id = _get_user_id(request)
    items   = await db.get_history(user_id, limit=min(limit, 50))
    return {"items": items}


@router.delete("/api/history")
@limiter.limit("20/minute")
async def history_clear(request: Request):
    user_id = _get_user_id(request)
    await db.delete_history(user_id)
    return {"ok": True}


@router.delete("/api/history/{history_id}")
@limiter.limit("60/minute")
async def history_delete(request: Request, history_id: int):
    user_id = _get_user_id(request)
    await db.delete_history(user_id, history_id)
    return {"ok": True}


# ─── Admin panel ──────────────────────────────────────────────────────────────

@router.get("/admin", include_in_schema=False)
async def admin_panel():
    html_path = os.path.join(os.path.dirname(__file__), "..", "admin.html")
    if not os.path.exists(html_path):
        raise HTTPException(status_code=404, detail="admin.html topilmadi")
    with open(html_path, encoding="utf-8") as f:
        return HTMLResponse(f.read())


@router.get("/api/admin/stats")
@limiter.limit("30/minute")
async def admin_stats(request: Request):
    _check_admin(request)
    result = await db.get_stats()
    result["uptime_seconds"] = int(time.time() - _start_time)
    return result


@router.get("/api/admin/users")
@limiter.limit("30/minute")
async def admin_users(
    request: Request,
    offset: int = 0,
    limit: int  = 50,
    search: str = "",
):
    _check_admin(request)
    return await db.get_users(offset=offset, limit=min(limit, 200), search=search)


@router.get("/api/admin/payments")
@limiter.limit("30/minute")
async def admin_payments(
    request: Request,
    offset: int = 0,
    limit: int  = 50,
):
    _check_admin(request)
    return await db.get_payments(offset=offset, limit=min(limit, 200))


@router.post("/api/admin/user/{user_id}/plan")
@limiter.limit("20/minute")
async def admin_set_plan(request: Request, user_id: int):
    _check_admin(request)
    body = await request.json()
    plan = body.get("plan", "free")
    days = int(body.get("days", 30))
    if plan not in ("free", "monthly", "yearly"):
        raise HTTPException(status_code=400, detail="plan: free | monthly | yearly")
    await db.admin_set_plan(user_id, plan, days)
    return {"ok": True, "user_id": user_id, "plan": plan, "days": days}
