import sys
import os
import asyncio
import cv2
import numpy as np
import base64
from uuid import uuid4

# Add app to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.document_rectification_service import rectification_service
from app.services.image_quality_service import image_quality_service
from app.services.jwt_service import (
    create_verification_candidate_token, 
    decode_verification_candidate_token
)

def create_synthetic_image():
    # Create a 1280x960 image with a white rectangle inside
    img = np.zeros((960, 1280, 3), dtype=np.uint8)
    # Background: dark gray
    img[:] = (50, 50, 50)
    
    # Document: white rotated rectangle
    points = np.array([[200, 150], [1000, 200], [1100, 800], [150, 850]], np.int32)
    cv2.fillPoly(img, [points], (255, 255, 255))
    
    # Some "text" inside
    cv2.putText(img, "SIGNVERIFY TEST DOC", (400, 400), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 0), 3)
    
    _, buffer = cv2.imencode('.jpg', img)
    return buffer.tobytes()

async def test_rectification():
    print("--- Testing Rectification ---")
    img_bytes = create_synthetic_image()
    result = await rectification_service.rectify(img_bytes)
    print(f"Passed: {result.passed}")
    print(f"Confidence: {result.confidence:.2f}")
    if result.passed:
        print(f"Rectified Image Size: {len(result.rectified_image)} bytes (base64)")
    else:
        print(f"Error: {result.details.get('error')}")
    assert result.passed == True
    assert result.confidence > 0.4

async def test_quality():
    print("\n--- Testing Image Quality ---")
    img_bytes = create_synthetic_image()
    result = image_quality_service.validate(img_bytes)
    print(f"Passed: {result.passed}")
    print(f"Score: {result.score:.2f}")
    print(f"Details: {result.details}")
    assert result.passed == True
    assert result.score > 0.5

async def test_jwt_candidate():
    print("\n--- Testing JWT Candidate Tokens ---")
    anchor_id = str(uuid4())
    nonce = "test-nonce-123"
    token = create_verification_candidate_token(anchor_id, nonce)
    print(f"Generated Token: {token[:20]}...")
    
    decoded = decode_verification_candidate_token(token)
    print(f"Decoded Anchor ID: {decoded['anchor_id']}")
    print(f"Decoded Nonce: {decoded['nonce']}")
    
    assert decoded['anchor_id'] == anchor_id
    assert decoded['nonce'] == nonce
    assert decoded['type'] == "verification_candidate"

async def main():
    try:
        await test_rectification()
        await test_quality()
        await test_jwt_candidate()
        print("\n✅ All Foundation Layer tests PASSED!")
    except Exception as e:
        print(f"\n❌ Test FAILED: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
