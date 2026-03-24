import asyncio
import os
from sqlalchemy import text
from app.database import engine

async def add_indexes():
    print("🚀 Starting Database Indexing optimization...")
    async with engine.begin() as conn:
        # Add index for reference_id (Unique lookup)
        try:
            await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_anchors_reference_id ON document_anchors (reference_id);"))
            print("✅ Unique Index added for reference_id")
        except Exception as e:
            print(f"⚠️ Reference ID index error (might already exist): {e}")

        # Add index for phash (Search performance)
        try:
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_anchors_phash ON document_anchors (phash);"))
            print("✅ Index added for phash")
        except Exception as e:
            print(f"⚠️ pHash index error: {e}")

    print("🏁 Optimization complete.")

if __name__ == "__main__":
    asyncio.run(add_indexes())
