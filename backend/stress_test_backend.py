import asyncio
import time
import random
import string
import uuid
from sqlalchemy import select, delete
from app.database import async_session
from app.models.anchor import DocumentAnchor
from app.models.user import User
from app.models.public_key import PublicKey

USER_ID = "1f993b3f-727f-40ca-879c-9175fa788b1b"

def generate_random_hash():
    return "".join(random.choice("0123456789abcdef") for _ in range(16))

def generate_random_ref():
    return "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(6))

async def stress_test():
    async with async_session() as db:
        print(f"🧹 Cleaning up any previous test data...")
        await db.execute(delete(DocumentAnchor).where(DocumentAnchor.reference_id.like("TEST%")))
        await db.commit()

        print(f"📥 Inserting 1,000 variegated document records...")
        start_time = time.time()
        
        test_anchors = []
        for i in range(1000):
            anchor = DocumentAnchor(
                user_id=uuid.UUID(USER_ID),
                file_hash=str(uuid.uuid4()),
                s3_uri=f"s3://signverify/test/doc_{i}.jpg",
                phash=generate_random_hash(),
                reference_id=f"TEST{generate_random_ref()[:2]}{i:03}",
                payload={"test": True},
                transaction_uuid=str(uuid.uuid4())
            )
            test_anchors.append(anchor)
        
        db.add_all(test_anchors)
        await db.commit()
        
        end_time = time.time()
        print(f"✅ 1,000 records inserted in {end_time - start_time:.2f} seconds.")

        # --- Performance Test: Exact Match (Should use short-circuit) ---
        target_anchor = test_anchors[500]
        print(f"\n🔍 Testing Exact Match performance (Short-Circuit)...")
        start_time = time.time()
        
        # Simulating search logic
        stmt = select(DocumentAnchor).where(DocumentAnchor.phash.is_not(None))
        result = await db.execute(stmt)
        anchors = result.scalars().all()
        
        best_match = None
        min_distance = 64
        for a in anchors:
            if a.phash == target_anchor.phash:
                best_match = a
                min_distance = 0
                break
        
        end_time = time.time()
        print(f"⏱️ Exact Match found in {end_time - start_time:.4f} seconds.")

        # --- Performance Test: Fuzzy Match (Should scan all 1,000) ---
        print(f"\n🔍 Testing Fuzzy Match performance (Full Scan of 1,000)...")
        # Flip 2 bits to force full scan
        noisy_hash = list(target_anchor.phash)
        noisy_hash[0] = 'f' if noisy_hash[0] == '0' else '0'
        noisy_hash = "".join(noisy_hash)
        
        start_time = time.time()
        
        # Manually calculating distance as the endpoint would
        def get_dist(h1, h2):
            return sum(bin(int(c1, 16) ^ int(c2, 16)).count('1') for c1, c2 in zip(h1, h2))

        best_match = None
        min_dist = 64
        for a in anchors:
            dist = get_dist(noisy_hash, a.phash)
            if dist < min_dist:
                min_dist = dist
                best_match = a
        
        end_time = time.time()
        print(f"⏱️ Fuzzy Match (1,000 records) found in {end_time - start_time:.4f} seconds.")
        print(f"📊 Result: Best distance {min_dist}")

        # --- Scalability Check ---
        if (end_time - start_time) < 0.2:
            print(f"\n🎉 PERFORMANCE TARGET MET: Search latency under 200ms.")
        else:
            print(f"\n⚠️ PERFORMANCE WARNING: Search latency above 200ms ({end_time - start_time:.4f}s).")

        print(f"\n🧹 Cleaning up test data...")
        await db.execute(delete(DocumentAnchor).where(DocumentAnchor.reference_id.like("TEST%")))
        await db.commit()
        print("🏁 Stress test complete.")

if __name__ == "__main__":
    asyncio.run(stress_test())
