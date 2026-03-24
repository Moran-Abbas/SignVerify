import asyncio
from app.database import async_session
from sqlalchemy import select

# Import all models to resolve string references in relationships
from app.models.user import User
from app.models.anchor import DocumentAnchor
from app.models.public_key import PublicKey

async def get_user():
    async with async_session() as db:
        res = await db.execute(select(User).limit(1))
        user = res.scalar_one_or_none()
        if user:
            print(user.id)
        else:
            print("NONE")

if __name__ == "__main__":
    asyncio.run(get_user())
