import os
import json
import redis.asyncio as redis
from dotenv import load_dotenv

load_dotenv()

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT") or "6379")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)


def _client() -> redis.Redis:
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True,
    )


async def publish(channel: str, data: dict) -> None:
    r = _client()
    try:
        result = await r.publish(channel, json.dumps(data))
        print(f"[redis_client] published to {channel}, subscribers={result}", flush=True)
    finally:
        await r.close()


async def create_pubsub():
    r = _client()
    pubsub = r.pubsub()
    return r, pubsub
