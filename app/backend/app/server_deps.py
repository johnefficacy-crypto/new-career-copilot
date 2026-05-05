"""MongoDB connection and shared backend deps."""
from __future__ import annotations

import os

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase


class _DBState:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None

    async def connect(self) -> None:
        if self.client is not None:
            return
        url = os.environ["MONGO_URL"]
        name = os.environ["DB_NAME"]
        self.client = AsyncIOMotorClient(url)
        self.db = self.client[name]

    async def close(self) -> None:
        if self.client is not None:
            self.client.close()
        self.client = None
        self.db = None


db_state = _DBState()


def get_db() -> AsyncIOMotorDatabase:
    if db_state.db is None:
        raise RuntimeError("DB not initialised")
    return db_state.db
