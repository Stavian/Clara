import logging
from fastapi import APIRouter, Request, HTTPException

logger = logging.getLogger(__name__)

webhook_router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

_manager = None


def init_webhook_routes(manager):
    global _manager
    _manager = manager


@webhook_router.post("/incoming/{name}")
async def receive_webhook(name: str, request: Request):
    if not _manager:
        raise HTTPException(503, "Webhook system not initialized")

    # Token from query param or Authorization header
    token = request.query_params.get("token", "")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]

    if not _manager.verify_token(name, token):
        raise HTTPException(403, "Invalid webhook token")

    try:
        payload = await request.json()
    except Exception:
        payload = {"raw": (await request.body()).decode("utf-8", errors="replace")}

    await _manager.handle_incoming(name, payload)
    logger.info(f"Webhook received: {name}")
    return {"status": "ok", "webhook": name}


@webhook_router.get("/list")
async def list_webhooks():
    if not _manager:
        return {"webhooks": []}
    webhooks = await _manager.list_all()
    safe = [
        {"name": w["name"], "description": w["description"], "token_prefix": w["token"][:8] + "..."}
        for w in webhooks
    ]
    return {"webhooks": safe}
