import asyncio
import time
import random
import string
import uuid
from sqlalchemy import select, delete
from app.database import async_session

# Absolute imports to ensure all relationships are mapped
import app.models.user
import app.models.public_key
import app.models.anchor
from app.models.user import User
from app.models.public_key import PublicKey
from app.models.anchor import DocumentAnchor

def generate_random_hash():
    return "".join(random.choice("0123456789abcdef") for _ in range(16))

async def run_stress_test():
    async with async_session() as db:
        # 1. Fetch a valid User and PublicKey
        print("🔍 Locating test user and key...")
        res = await db.execute(select(PublicKey).limit(1))
        key = res.scalar_one_or_none()
        
        if not key:
            print("❌ Error: No PublicKey found in DB. Please register a user first.")
            return

        user_id = key.user_id
        key_id = key.id
        print(f"✅ Using User: {user_id} | Key: {key_id}")

        # 2. Cleanup previous TEST data
        print("🧹 Cleaning up old test data...")
        # Use a prefix that fits in 6 chars: 'S' + 5 digits
        await db.execute(delete(DocumentAnchor).where(DocumentAnchor.reference_id.like("S%")))
        await db.commit()

        # 3. Insert 1,000 records
        print("📥 Inserting 1,000 document records...")
        start_time = time.time()
        
        test_anchors = []
        for i in range(1000):
            anchor = DocumentAnchor(
                user_id=user_id,
                signer_public_key_id=key_id,
                file_hash=str(uuid.uuid4()),
                s3_uri=f"s3://signverify/test/stress_{i}.jpg",
                digital_signature="test_sig_hardened_2026",
                phash=generate_random_hash(),
                reference_id=f"S{i:05}", # EXACTLY 6 CHARS
                normalized_content={"stress_test": True},
                transaction_uuid=str(uuid.uuid4())
            )
            test_anchors.append(anchor)
        
        db.add_all(test_anchors)
        await db.commit()
        
        insert_time = time.time() - start_time
        print(f"✅ 1,000 records inserted in {insert_time:.2f}s")

        # 4. Measure Search Performance
        print("\n⚡ Measuring Search Performance (Hamming Scan)...")
        # Fetch them back to simulate the /search logic which pulls all active phashes
        stmt = select(DocumentAnchor).where(DocumentAnchor.phash.is_not(None))
        res = await db.execute(stmt)
        all_anchors = res.scalars().all()
        
        target = test_anchors[random.randint(0, 999)]
        query_hash = target.phash
        
        search_start = time.time()
        
        # Simulated Search Logic from search.py
        best_match = None
        min_dist = 64
        def get_dist(h1, h2):
            return sum(bin(int(c1, 16) ^ int(c2, 16)).count('1') for c1, c2 in zip(h1, h2))

        for a in all_anchors:
            if a.phash == query_hash: # Exact Short-circuit (as implemented in search.py)
                best_match = a
                min_dist = 0
                break
            d = get_dist(query_hash, a.phash)
            if d < min_dist:
                min_dist = d
                best_match = a
        
        search_end = time.time()
        print(f"⏱️ Search time (Exact/Short-circuit): {(search_end - search_start)*1000:.2f}ms")

        # Fuzzy Search (No exact match)
        noisy_hash = list(query_hash)
        noisy_hash[0] = 'a' if noisy_hash[0] != 'a' else 'b'
        noisy_hash = "".join(noisy_hash)
        
        fuzzy_start = time.time()
        min_dist = 64
        for a in all_anchors:
            d = get_dist(noisy_hash, a.phash)
            if d < min_dist:
                min_dist = d
        fuzzy_end = time.time()
        print(f"⏱️ Search time (Fuzzy/Full-Scan): {(fuzzy_end - fuzzy_start)*1000:.2f}ms")

        # 5. Cleanup
        print("\n🧹 Final cleanup...")
        await db.execute(delete(DocumentAnchor).where(DocumentAnchor.reference_id.like("S%")))
        await db.commit()
        print("🏁 Stress test complete.")

if __name__ == "__main__":
    asyncio.run(run_stress_test())
