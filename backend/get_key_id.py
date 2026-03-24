import asyncio
from app.database import async_session
from app.models.public_key import PublicKey
from sqlalchemy import select
import uuid

USER_ID = "1f993b3f-727f-40ca-879c-9175fa788b1b"

async def get_key():
    async with async_session() as db:
        res = await db.execute(select(PublicKey).where(PublicKey.user_id == uuid.UUID(USER_ID)).limit(1))
        key = res.scalar_one_or_none()
        if key:
            print(key.id)
        else:
            print("NONE")

if __name__ == "__main__":
    asyncio.run(get_key())
