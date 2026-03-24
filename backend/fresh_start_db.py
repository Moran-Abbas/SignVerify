import asyncio
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

# Add the current directory to sys.path so we can import 'app'
sys.path.append(os.getcwd())

from app.database import Base
# Import all models to ensure they are registered with Base.metadata
from app.models.user import User
from app.models.anchor import DocumentAnchor, ForensicLog
from app.models.public_key import PublicKey

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def fresh_start():
    if not DATABASE_URL:
        print("❌ Error: DATABASE_URL not found in .env")
        return

    print(f"--- DATABASE FRESH START ---")
    print(f"Target: {DATABASE_URL}")
    print("🚨 WARNING: THIS WILL DELETE ALL DATA AND RECREATE THE SCHEMA.")
    
    if "--force" not in sys.argv:
        confirm = input("Type 'KILL_ALL_DATA' to confirm: ")
        if confirm != 'KILL_ALL_DATA':
            print("Operation cancelled.")
            return
    else:
        print("🚀 Force mode activated. Bypassing confirmation.")

    # For safety, we'll use a sync-compatible engine for some inspection if needed, 
    # but Base.metadata.create_all works best with a sync engine or a specific async wrapper.
    # Since we are using asyncpg, we need to use the run_sync method.
    
    engine = create_async_engine(DATABASE_URL)

    async with engine.begin() as conn:
        print("Dropping all existing tables...")
        # We use raw SQL for drop to ensure everything is gone even if models changed names
        await conn.execute(text("DROP TABLE IF EXISTS forensic_logs CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS document_anchors CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS public_keys CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS users CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS alembic_version CASCADE;"))
        
        print("Recreating schema from SQLAlchemy models...")
        # This is the 'Magic' part that ensures parity
        await conn.run_sync(Base.metadata.create_all)
        
    print("\n✅ Database has been reset and schema is now synchronized.")
    await engine.dispose()

if __name__ == "__main__":
    try:
        asyncio.run(fresh_start())
    except KeyboardInterrupt:
        print("\nInterrupted.")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
