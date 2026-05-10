import asyncio
import os
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool

from alembic import context
from dotenv import load_dotenv

# Load .env if present (local dev). In Docker/Railway env vars come from the platform.
load_dotenv()

config = context.config

# ── Resolve DATABASE_URL ──────────────────────────────────────────────────────
# Railway injects postgres:// or postgresql:// — normalize to asyncpg dialect.
_db_url = os.getenv("DATABASE_URL", "")
if not _db_url:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set. "
        "Set it in your .env file or platform environment variables."
    )
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Write back so database.py (imported below) picks it up via os.getenv()
os.environ["DATABASE_URL"] = _db_url
config.set_main_option("sqlalchemy.url", _db_url)
# ─────────────────────────────────────────────────────────────────────────────

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import AFTER DATABASE_URL is set in os.environ
from database import Base  # noqa: E402
import models  # noqa: E402, F401

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
