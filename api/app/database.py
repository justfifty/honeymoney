"""
Database setup — SQLite (local), future-proof for PostgreSQL via env swap.
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

# SQLite locally; swap DATABASE_URL to postgresql+asyncpg://... for Oracle/Neon
raw_url = os.getenv("DATABASE_URL", "sqlite:///./honeymoney.db")
# Make async-compatible
if raw_url.startswith("sqlite"):
    ASYNC_DATABASE_URL = raw_url.replace("sqlite://", "sqlite+aiosqlite://", 1)
else:
    ASYNC_DATABASE_URL = raw_url

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in ASYNC_DATABASE_URL else {},
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def init_db():
    """Create all tables on first run."""
    from app import models  # noqa: F401 — import so models register
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    """Dependency: yields a DB session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
