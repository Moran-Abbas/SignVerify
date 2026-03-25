import sys
import os
import asyncio
import json
import base64
from uuid import uuid4
from unittest.mock import MagicMock, AsyncMock, patch

# Add app to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.routers.search import verify_document, confirm_reference, VerifyDocumentRequest, ConfirmReferenceRequest
from app.models.anchor import DocumentAnchor
from app.models.user import User

class MockResult:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

async def run_verify_tests():
    print("🚀 Starting Unified Verification (T3) Tests...")
    
    # 1. Setup Mock Data
    user_id = uuid4()
    mock_user = User(id=user_id, phone_number="+15559999")
    anchor_id = uuid4()
    pk_id = uuid4()
    mock_anchor = DocumentAnchor(
        id=anchor_id,
        user_id=user_id,
        signer_public_key_id=pk_id,
        phash="a1b2c3d4e5f6a1b2", # 16-char hex
        reference_id="ABC123",
        orb_descriptors={"descriptors": [[0]*32], "keypoints": [[100, 100]]},
        normalized_content={"parties": ["Alice", "Bob"]},
        signed_payload_json='{"v":1}',
        digital_signature="sig-dummy"
    )
    
    mock_pk = MagicMock()
    mock_pk.public_key_pem = "dummy-pem"

    # 2. Mock DB with Query-Aware Dispatcher
    def db_execute_mock(stmt, *args, **kwargs):
        stmt_str = str(stmt).lower()
        res = MagicMock()
        if "document_anchors" in stmt_str or "documentanchor" in stmt_str:
            res.scalar_one_or_none.return_value = mock_anchor
            res.scalars.return_value.all.return_value = [mock_anchor]
        elif "users" in stmt_str or "user" in stmt_str:
            res.scalar_one_or_none.return_value = mock_user
        elif "public_keys" in stmt_str or "publickey" in stmt_str:
            res.scalar_one_or_none.return_value = mock_pk
        else:
            res.scalar_one_or_none.return_value = None
            res.scalars.return_value.all.return_value = []
        return res

    mock_db = AsyncMock()
    mock_db.execute.side_effect = db_execute_mock

    # 3. Mock Services
    with patch("app.services.document_rectification_service.rectification_service.rectify", new_callable=AsyncMock) as mock_rect, \
         patch("app.services.image_quality_service.image_quality_service.validate") as mock_qual, \
         patch("app.routers.search.dhash_hex_from_base64_data_uri_or_raw") as mock_dhash, \
         patch("app.routers.search.create_verification_candidate_token") as mock_create_token, \
         patch("app.routers.search.decode_verification_candidate_token") as mock_decode_token, \
         patch("app.services.extraction_service.extraction_service.verify_document_id", new_callable=AsyncMock) as mock_semantic, \
         patch("app.routers.search.cryptographic_attestation", new_callable=AsyncMock) as mock_crypto, \
         patch("app.routers.search.perform_liveness_check") as mock_liveness:

        # --- Test Case 1: Discovery Mode ---
        print("\nCase 1: Discovery Mode -> TOKEN ISSUED")
        mock_rect.return_value = MockResult(passed=True, rectified_image="cmVjdC1iNjQ=", confidence=0.9, details={})
        mock_qual.return_value = MockResult(passed=True, score=0.95, details={})
        mock_dhash.return_value = "a1b2c3d4e5f6a1b2" # Exact match
        mock_create_token.return_value = "dummy-token-123"

        req_discovery = VerifyDocumentRequest(image_base64="input-b64", mode="discovery")
        res_discovery = await verify_document(req_discovery, mock_db, mock_user)
        
        print(f"DEBUG: res_discovery = {res_discovery}")
        assert res_discovery["match_found"] is True
        assert res_discovery["candidate_token"] == "dummy-token-123"

        # --- Test Case 2: Full Mode via Token ---
        print("\nCase 2: Full Mode (Token) -> VERIFIED")
        mock_decode_token.return_value = {"anchor_id": str(anchor_id)}
        mock_semantic.return_value = True
        mock_liveness.return_value = {"is_liveness_passing": True, "detail": "PAPER"}
        mock_crypto.return_value = {"signature_valid": True, "signer_public_key_id": str(pk_id)}
        
        with patch("app.routers.search._verify_orb_homography", new_callable=AsyncMock) as mock_orb:
            mock_orb.return_value = {"confidence": 0.85, "inliers": 25}
            
            req_full = VerifyDocumentRequest(image_base64="input-b64", mode="full", candidate_token="dummy-token-123")
            res_full = await verify_document(req_full, mock_db, mock_user)
            
            print(f"✅ Full Mode Success! Confidence: {res_full['confidence']:.2f}, State: {res_full['verification_state']}")
            assert res_full["match_found"] is True
            assert res_full["verification_state"] == "verified"
            assert res_full["confidence"] > 0.7

        # --- Test Case 3: Reference Confirmation Fallback ---
        print("\nCase 3: Reference Confirmation -> SUCCESS")
        req_confirm = ConfirmReferenceRequest(candidate_token="dummy-token-123", reference_id="ABC123")
        res_confirm = await confirm_reference(req_confirm, mock_db, mock_user)
        
        print("✅ Confirm Reference Success!")
        assert res_confirm["verified"] is True
        assert res_confirm["verification_state"] == "verified"

        # --- Test Case 4: Liveness Rejection ---
        print("\nCase 4: Liveness Screen Spoof -> LOW CONFIDENCE")
        mock_liveness.return_value = {"is_liveness_passing": False, "detail": "SCREEN_SPOOF_DETECTED"}
        with patch("app.routers.search._verify_orb_homography", new_callable=AsyncMock) as mock_orb:
            mock_orb.return_value = {"confidence": 0.8, "inliers": 20}
            
            req_live = VerifyDocumentRequest(image_base64="input-b64", mode="full", candidate_token="dummy-token-123")
            res_live = await verify_document(req_live, mock_db, mock_user)
            
            print(f"✅ Liveness Rejected! Confidence: {res_live['confidence']:.2f}")
            assert res_live["liveness_passed"] is False
            assert res_live["confidence"] < 0.4 

    print("\n🎉 ALL T3 Unified Verification tests passed!")

if __name__ == "__main__":
    asyncio.run(run_verify_tests())
