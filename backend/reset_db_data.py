import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def reset_database():
    if not DATABASE_URL:
        print("❌ Error: DATABASE_URL not found in .env")
        return

    print(f"--- DATABASE DATA RESET ---")
    print(f"Target: {DATABASE_URL}")
    print("⚠️  This will PERMANENTLY delete all record in 'document_anchors' and 'signing_logs'.")
    
    confirm = input("Are you sure you want to proceed? (type 'yes' to confirm): ")
    if confirm.lower() != 'yes':
        print("Operation cancelled.")
        return

    engine = create_async_engine(DATABASE_URL)

    async with engine.begin() as conn:
        print("Cleaning document_anchors...")
        await conn.execute(text("TRUNCATE TABLE document_anchors CASCADE;"))
        
        print("Cleaning signing_logs...")
        await conn.execute(text("TRUNCATE TABLE signing_logs CASCADE;"))
        
        print("Cleaning public_keys (optional, but keeping users)...")
        # await conn.execute(text("TRUNCATE TABLE public_keys CASCADE;")) # Usually kept per user
        
    print("\n✅ Database data reset successfully.")
    await engine.dispose()

if __name__ == "__main__":
    try:
        asyncio.run(reset_database())
    except KeyboardInterrupt:
        print("\nInterrupted.")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
