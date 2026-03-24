import sys
import os
import asyncio
import json
import base64
import hashlib
from datetime import datetime
from uuid import uuid4
from unittest.mock import MagicMock, AsyncMock, patch

# Add app to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException
from app.routers.anchors import sign_document
from app.schemas.anchor import AnchorCreateRequest, SemanticContent
from app.models.user import User
from app.models.public_key import PublicKey
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization

def create_synthetic_image(blur=False):
    import cv2
    import numpy as np
    # Create a 1280x960 image
    img = np.zeros((960, 1280, 3), dtype=np.uint8)
    img[:] = (100, 100, 100) # Gray background
    cv2.putText(img, "TEST DOCUMENT", (100, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)
    
    if blur:
        img = cv2.GaussianBlur(img, (25, 25), 0)
        
    _, buffer = cv2.imencode('.jpg', img)
    return base64.b64encode(buffer).decode('utf-8')

async def run_test():
    print("🚀 Starting Signing Endpoint V2 Tests...")
    
    # 1. Setup Mock User and Key
    mock_user = User(id=uuid4(), phone_number="+15550101")
    
    # Generate an actual ECDSA key
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    
    pub_key_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode('utf-8')
    
    mock_pub_key = PublicKey(
        id=uuid4(), 
        user_id=mock_user.id, 
        public_key_pem=pub_key_pem,
        is_active=True
    )
    
    # Mock Database Session
    mock_db = AsyncMock()
    
    # Mock the return value of await db.execute(...)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None # For replay check
    
    # For pub key fetch
    mock_scalars = MagicMock()
    mock_scalars.first.return_value = mock_pub_key
    mock_result.scalars.return_value = mock_scalars
    
    mock_db.execute.return_value = mock_result
    
    # Mock refresh to set ID and created_at on the anchor
    async def mock_refresh(anchor):
        anchor.id = uuid4()
        anchor.created_at = datetime.now()
        anchor.signer_public_key_id = mock_pub_key.id
    
    mock_db.refresh = mock_refresh
    
    # Mock Request object
    mock_request = MagicMock()
    mock_request.client.host = "127.0.0.1"

    # --- Test Case 1: Policy V2 Success ---
    print("\nCase 1: Policy V2 Valid Hash -> SUCCESS")
    img_b64 = create_synthetic_image()
    doc_hash = hashlib.sha256(img_b64.encode()).hexdigest()
    
    payload = {
        "policy_version": 2,
        "document_hash": doc_hash,
        "text_hash": "a" * 64 # dummy
    }
    payload_json = json.dumps(payload, separators=(',', ':'))
    
    signature_bytes = private_key.sign(
        payload_json.encode('utf-8'),
        ec.ECDSA(hashes.SHA256())
    )
    signature_b64 = base64.b64encode(signature_bytes).decode('utf-8')
    
    req = AnchorCreateRequest(
        image_base64=img_b64,
        digital_signature=signature_b64,
        payload_json=payload_json,
        transaction_uuid=str(uuid4()),
        reference_id="TESTV2"
    )
    
    res = await sign_document(mock_request, req, mock_db, mock_user)
    print(f"✅ V2 Success! Score: {res.payload.image_quality_score}")
    assert res.payload.image_quality_score > 0.8

    # --- Test Case 2: Policy V2 Hash Mismatch ---
    print("\nCase 2: Policy V2 Hash Mismatch -> ERROR")
    bad_payload = payload.copy()
    bad_payload["document_hash"] = "wrong_hash"
    bad_payload_json = json.dumps(bad_payload, separators=(',', ':'))
    
    bad_signature_bytes = private_key.sign(
        bad_payload_json.encode('utf-8'),
        ec.ECDSA(hashes.SHA256())
    )
    bad_signature_b64 = base64.b64encode(bad_signature_bytes).decode('utf-8')
    
    req_bad = AnchorCreateRequest(
        image_base64=img_b64,
        digital_signature=bad_signature_b64,
        payload_json=bad_payload_json,
        transaction_uuid=str(uuid4())
    )
    
    try:
        await sign_document(mock_request, req_bad, mock_db, mock_user)
        print("❌ Should have failed hash mismatch")
    except HTTPException as e:
        print(f"✅ Caught expected error: {e.detail}")
        assert "CRYPTOGRAPHIC BINDING ERROR" in e.detail

    # --- Test Case 3: Low Quality Image ---
    print("\nCase 3: Low Quality (Blurry) -> ERROR")
    blurry_img = create_synthetic_image(blur=True)
    blurry_doc_hash = hashlib.sha256(blurry_img.encode()).hexdigest()
    
    p_blurry = payload.copy()
    p_blurry["document_hash"] = blurry_doc_hash
    p_blurry_json = json.dumps(p_blurry, separators=(',', ':'))
    
    s_blurry_bytes = private_key.sign(
        p_blurry_json.encode('utf-8'),
        ec.ECDSA(hashes.SHA256())
    )
    s_blurry_b64 = base64.b64encode(s_blurry_bytes).decode('utf-8')
    
    req_blurry = AnchorCreateRequest(
        image_base64=blurry_img,
        digital_signature=s_blurry_b64,
        payload_json=p_blurry_json,
        transaction_uuid=str(uuid4())
    )
    
    try:
        await sign_document(mock_request, req_blurry, mock_db, mock_user)
        print("❌ Should have failed quality gate")
    except HTTPException as e:
        print(f"✅ Caught expected quality rejection: {e.detail['error']}")
        assert e.detail["error"] == "IMAGE_QUALITY_BELOW_THRESHOLD"

    # --- Test Case 4: Policy V1 Backward Compatibility ---
    print("\nCase 4: Policy V1 Backward Compat -> SUCCESS")
    from app.utils.visual_hash import dhash_hex_from_base64_data_uri_or_raw
    v_hash = dhash_hex_from_base64_data_uri_or_raw(img_b64)
    
    p_v1 = {
        "policy_version": 1,
        "v_hash": v_hash,
        "text_hash": "b" * 64
    }
    p_v1_json = json.dumps(p_v1, separators=(',', ':'))
    
    s_v1_bytes = private_key.sign(
        p_v1_json.encode('utf-8'),
        ec.ECDSA(hashes.SHA256())
    )
    s_v1_b64 = base64.b64encode(s_v1_bytes).decode('utf-8')
    
    req_v1 = AnchorCreateRequest(
        image_base64=img_b64,
        digital_signature=s_v1_b64,
        payload_json=p_v1_json,
        transaction_uuid=str(uuid4())
    )
    
    res_v1 = await sign_document(mock_request, req_v1, mock_db, mock_user)
    print("✅ V1 Compat Success!")
    assert res_v1.payload.binding_vhash == v_hash

    print("\n🎉 ALL Policy V2 and Quality Gate tests passed!")

if __name__ == "__main__":
    asyncio.run(run_test())
