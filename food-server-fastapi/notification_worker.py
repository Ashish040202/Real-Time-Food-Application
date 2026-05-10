"""
Notification system — Redis-list queue (BullMQ semantics, no external lib).

Why no bullmq library:
  All bullmq Python releases >= 1.0.0 use `dict | str` type-union syntax
  (PEP 604) which requires Python >= 3.10.  This project runs Python 3.8,
  so we replicate the same queue contract directly on Redis primitives:
    - LPUSH  <queue-key>  <json-job>   → enqueue  (producer side)
    - BRPOP  <queue-key>  <timeout>    → dequeue  (worker side, blocks up to N sec)

This is exactly what BullMQ uses internally. Jobs are JSON blobs stored in a
Redis list; BRPOP is atomic so multiple workers could run without double-processing.

Flow:
  1. run_subscriber() listens to ORDER_CREATED / ORDER_STATUS_UPDATED pub/sub channels.
  2. For qualifying events it calls notification_queue.add() → LPUSH into Redis list.
  3. run_worker() loops with BRPOP, picks up jobs, calls _process_job().
  4. _process_job() writes NotificationModel rows to Postgres and publishes
     NOTIFICATION:{recipient_id} so the GraphQL subscription delivers them live.
"""

import os
import json
import uuid
import asyncio
import redis.asyncio as aioredis
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

# Redis list key that acts as the job queue
_QUEUE_KEY = "patiala_house:notifications:queue"


# ─── Lightweight queue ────────────────────────────────────────────────────────

class _Job:
    """Minimal job object (mirrors the bullmq Job interface used in tests)."""
    __slots__ = ("name", "data", "id")

    def __init__(self, name: str, data: dict, job_id: str):
        self.name = name
        self.data = data
        self.id = job_id


class _Queue:
    """
    Producer side: serialises the job to JSON and pushes it to the Redis list.
    A new short-lived connection is used per add() call — same as the existing
    redis_client.publish() pattern in this codebase.
    """

    async def add(self, name: str, data: dict) -> None:
        r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, password=REDIS_PASSWORD, decode_responses=True)
        try:
            payload = json.dumps({
                "id": str(uuid.uuid4()),
                "name": name,
                "data": data,
            })
            await r.lpush(_QUEUE_KEY, payload)
        finally:
            await r.close()


# Module-level queue instance — imported by run_subscriber()
notification_queue = _Queue()


# ─── Job processor ────────────────────────────────────────────────────────────

async def _process_job(job: _Job, _token) -> None:
    """
    Core notification logic.

    NEW_ORDER        → notify all ADMINs
    ORDER_CANCELLED  → notify all ADMINs (skip if triggered by ADMIN)
    ORDER_COMPLETED  → notify the specific USER who owns the order
    """
    from database import AsyncSessionLocal
    from models import UserModel, NotificationModel
    from sqlalchemy import select

    data = job.data
    job_type: str = data.get("type", "")

    # Admin-triggered cancellations: admins already know, skip notification
    if job_type == "ORDER_CANCELLED" and data.get("triggered_by_role") == "ADMIN":
        return

    r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, password=REDIS_PASSWORD, decode_responses=True)
    try:
        async with AsyncSessionLocal() as db:
            now = datetime.now(timezone.utc).isoformat()

            if job_type in ("NEW_ORDER", "ORDER_CANCELLED"):
                title = (
                    "New Order Received"
                    if job_type == "NEW_ORDER"
                    else "Order Cancelled by User"
                )
                message = (
                    f"{data.get('customer_name', 'Someone')} ordered "
                    f"{data.get('product', 'an item')}"
                    if job_type == "NEW_ORDER"
                    else
                    f"{data.get('customer_name', 'A user')} cancelled their order "
                    f"for {data.get('product', 'an item')}"
                )

                result = await db.execute(
                    select(UserModel).where(UserModel.role == "ADMIN")
                )
                admins = result.scalars().all()

                for admin in admins:
                    notif = NotificationModel(
                        id=str(uuid.uuid4()),
                        recipient_id=admin.id,
                        type=job_type,
                        title=title,
                        message=message,
                        order_id=data.get("order_id"),
                        read=False,
                        created_at=now,
                    )
                    db.add(notif)
                    await db.flush()
                    await r.publish(
                        f"NOTIFICATION:{admin.id}",
                        json.dumps(_notif_dict(notif)),
                    )

                await db.commit()

            elif job_type == "ORDER_COMPLETED":
                user_id = data.get("user_id")
                if not user_id:
                    return

                notif = NotificationModel(
                    id=str(uuid.uuid4()),
                    recipient_id=user_id,
                    type="ORDER_COMPLETED",
                    title="Your order is ready!",
                    message=f"Your order for {data.get('product', 'an item')} has been completed.",
                    order_id=data.get("order_id"),
                    read=False,
                    created_at=now,
                )
                db.add(notif)
                await db.flush()
                await db.commit()
                await r.publish(
                    f"NOTIFICATION:{user_id}",
                    json.dumps(_notif_dict(notif)),
                )

    except Exception as exc:
        print(f"[notification_worker] job processing error: {exc}")
        raise
    finally:
        await r.close()


def _notif_dict(notif) -> dict:
    return {
        "id": notif.id,
        "recipient_id": notif.recipient_id,
        "type": notif.type,
        "title": notif.title,
        "message": notif.message,
        "order_id": notif.order_id,
        "read": notif.read,
        "created_at": notif.created_at,
    }


# ─── Subscriber (producer) ────────────────────────────────────────────────────

async def run_subscriber() -> None:
    """
    Subscribes to order pub/sub channels and enqueues a notification job for
    every qualifying event.  Intentionally isolated from the mutation path —
    errors here never surface to the HTTP caller.
    """
    r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, password=REDIS_PASSWORD, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe("ORDER_CREATED", "ORDER_STATUS_UPDATED")
    print("[notification_worker] subscriber started")

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                data: dict = json.loads(message["data"])
                channel: str = message["channel"]

                if channel == "ORDER_CREATED":
                    await notification_queue.add("new_order", {
                        "type": "NEW_ORDER",
                        "order_id": data.get("id"),
                        "customer_name": data.get("customer_name", ""),
                        "product": data.get("product", ""),
                        "user_id": data.get("user_id"),
                    })

                elif channel == "ORDER_STATUS_UPDATED":
                    status = data.get("status", "")

                    if status == "CANCELLED":
                        await notification_queue.add("order_cancelled", {
                            "type": "ORDER_CANCELLED",
                            "order_id": data.get("id"),
                            "customer_name": data.get("customer_name", ""),
                            "product": data.get("product", ""),
                            "user_id": data.get("user_id"),
                            "triggered_by_role": data.get("triggered_by_role"),
                        })

                    elif status == "COMPLETED":
                        await notification_queue.add("order_completed", {
                            "type": "ORDER_COMPLETED",
                            "order_id": data.get("id"),
                            "customer_name": data.get("customer_name", ""),
                            "product": data.get("product", ""),
                            "user_id": data.get("user_id"),
                        })

            except Exception as exc:
                print(f"[notification_worker] subscriber error: {exc}")

    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.unsubscribe("ORDER_CREATED", "ORDER_STATUS_UPDATED")
        await r.close()
        print("[notification_worker] subscriber stopped")


# ─── Worker (consumer) ────────────────────────────────────────────────────────

async def run_worker() -> None:
    """
    Dequeues jobs from the Redis list using BRPOP (atomic, blocking up to 1 s).
    Runs until the lifespan task is cancelled on server shutdown.
    """
    r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, password=REDIS_PASSWORD, decode_responses=True)
    print("[notification_worker] worker started")
    try:
        while True:
            # BRPOP blocks for up to 1 s then returns None — lets the loop stay
            # responsive to CancelledError without busy-spinning.
            result = await r.brpop(_QUEUE_KEY, timeout=1)
            if result is None:
                continue
            _, raw = result
            try:
                payload = json.loads(raw)
                job = _Job(payload["name"], payload["data"], payload["id"])
                await _process_job(job, None)
            except Exception as exc:
                print(f"[notification_worker] worker job error: {exc}")

    except asyncio.CancelledError:
        pass
    finally:
        await r.close()
        print("[notification_worker] worker stopped")
