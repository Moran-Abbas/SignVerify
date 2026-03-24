import asyncio
import json
from sqlalchemy import select, desc
from app.database import async_session
from app.models.anchor import DocumentAnchor
from app.models.user import User
from app.models.public_key import PublicKey

async def check_latest_anchors():
    print("--- SignVerify Database Audit: Latest Document Anchors ---")
    async with async_session() as db:
        # Fetch the last 5 anchors with user info
        stmt = select(DocumentAnchor).order_by(desc(DocumentAnchor.created_at)).limit(5)
        result = await db.execute(stmt)
        anchors = result.scalars().all()

        if not anchors:
            print("No anchors found in the database. Try signing a document in the app first!")
            return

        for i, anchor in enumerate(anchors, 1):
            print(f"\n[Anchor #{i}]")
            print(f"  ID: {anchor.id}")
            print(f"  Timestamp: {anchor.created_at}")
            print(f"  Visual Hash (vHash): {anchor.binding_vhash}")
            print(f"  Storage URI: {anchor.s3_uri}")
            print(f"  Document Hash: {anchor.file_hash[:20]}...")
            
            if anchor.normalized_content:
                print(f"  Semantic Truth (LLM): {json.dumps(anchor.normalized_content, indent=4)}")
            else:
                print("  Semantic Truth: [Not Extracted]")
            print("-" * 40)

if __name__ == "__main__":
    asyncio.run(check_latest_anchors())
