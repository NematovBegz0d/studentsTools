from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from loguru import logger

import database as db
import payment as pay
from shared import limiter, _get_user_id

router = APIRouter()


@router.post("/api/payment/create")
@limiter.limit("10/minute")
async def payment_create(request: Request):
    user_id = _get_user_id(request)

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON format noto'g'ri")

    plan = body.get("plan", "")
    if plan not in pay.PLAN_PRICES:
        raise HTTPException(status_code=400, detail="plan (monthly/yearly) kerak")

    amount     = pay.PLAN_PRICES[plan]
    payment_id = pay.new_payment_id()

    try:
        await db.create_payment(payment_id, int(user_id), plan, amount)
    except Exception as e:
        logger.error(f"DB create_payment xatosi: {e}")
        raise HTTPException(status_code=500, detail="To'lov yaratishda xatolik")

    checkout_url = pay.build_checkout_url(payment_id, plan)
    logger.info(f"To'lov yaratildi: {payment_id} user={user_id} plan={plan}")
    return {"payment_id": payment_id, "checkout_url": checkout_url, "amount": amount}


@router.post("/api/payment/payme")
async def payment_payme(request: Request):
    authorization = request.headers.get("Authorization", "")
    if not pay.verify_payme_auth(authorization):
        return JSONResponse(
            status_code=401,
            content={"error": {"code": -32504, "message": {
                "uz": "Ruxsat yo'q", "ru": "Доступ запрещён", "en": "Unauthorized",
            }}},
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            content={"error": {"code": pay.PaymeError.PARSE_ERROR, "message": {
                "uz": "JSON xatosi", "ru": "Ошибка JSON", "en": "Parse error",
            }}}
        )

    rpc_id = body.get("id", 1)
    method = body.get("method", "")
    params = body.get("params", {})

    db_fns = {
        "get_payment":          db.get_payment,
        "get_payment_by_payme": db.get_payment_by_payme,
        "confirm_payment":      db.confirm_payment,
        "cancel_payment":       db.cancel_payment,
    }

    result = await pay.handle_rpc(method, params, db_fns)
    return JSONResponse({"jsonrpc": "2.0", "id": rpc_id, **result})


@router.get("/api/payment/status/{payment_id}")
@limiter.limit("30/minute")
async def payment_status(request: Request, payment_id: str):
    payment = await db.get_payment(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="To'lov topilmadi")
    return {
        "status":  payment["status"],
        "plan":    payment["plan"],
        "amount":  payment["amount"],
        "paid_at": payment.get("completed_at"),
    }
