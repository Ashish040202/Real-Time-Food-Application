import os
import json
import redis.asyncio as redis
from dotenv import load_dotenv

load_dotenv()

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))


async def publish(channel: str, data: dict) -> None:
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    try:
        await r.publish(channel, json.dumps(data))
    finally:
        await r.aclose()


async def create_pubsub():
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    pubsub = r.pubsub()
    return r, pubsub
