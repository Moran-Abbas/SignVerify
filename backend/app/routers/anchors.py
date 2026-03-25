"""
SignVerify Backend – Anchors Router

Handles the primary "Signer Flow" API boundary.
Receives raw images and cryptographic signatures, mathematically re-verifies 
bounds to prevent Man-in-the-Middle attacks, and simulates an AWS S3 Object Lock upload.
"""
import base64
import hashlib
import asyncio
import json
from cryptography.exceptions import InvalidSignature
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.models.anchor import DocumentAnchor, ForensicLog

from app.database import get_db
from app.models.user import User
from app.models.public_key import PublicKey
from app.schemas.anchor import AnchorCreateRequest, AnchorResponse, AnchorPayload, SemanticContent, AmountVerifyRequest
from app.middleware.auth_middleware import get_current_user
from app.services.crypto_service import crypto_service
from app.services.s3_service import s3_service
from app.services.extraction_service import extraction_service
from app.services.image_quality_service import image_quality_service
from app.services.document_rectification_service import rectification_service
from app.utils.normalizer import normalize_semantic_text
from app.utils.visual_hash import dhash_hex_from_base64_data_uri_or_raw, hamming_hex64
import cv2
import numpy as np

# Max Hamming distance between server dHash and client-signed v_hash (bits).
# Relaxed to 18 to accommodate gallery upload variance and pixel reconstruction.
MAX_VISUAL_COMMITMENT_GAP_BITS = 18

router = APIRouter(prefix="/anchors", tags=["Anchors"])

@router.post("/extract-semantic", response_model=SemanticContent)
async def extract_document_semantic(
    image_base64: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """
    Ingests raw document scan and uses Gemini 1.5 Flash (Multimodal) 
    to extract structured 'Truth'.
    """
    try:
        extracted = await extraction_service.extract_semantic_from_image(image_base64)
        return SemanticContent(**extracted)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic extraction failed: {str(e)}"
        )

@router.post("/forensic-log", status_code=status.HTTP_201_CREATED)
async def create_forensic_log(
    request: Request,
    log_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submits a high-severity forensic event from the client vision pipeline.
    Captures TAMPER_ALERT, SIGNATURE_VIOLATION, etc.
    """
    forensic = ForensicLog(
        event_type=log_data.get("event_type", "UNKNOWN"),
        severity=log_data.get("severity", "HIGH"),
        user_id=current_user.id,
        details=log_data.get("details"),
        client_ip=request.client.host if request.client else "unknown"
    )
    db.add(forensic)
    await db.commit()
    return {"status": "recorded", "id": str(forensic.id)}

@router.post("/sign", response_model=AnchorResponse)
async def sign_document(
    request: Request,
    anchor_req: AnchorCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Finalizes the 'Universal Cryptographic Binding' process.
    - Verifies the Hardware Enclave signature against the raw payload.
    - Enforces Replay Protection via Transaction_UUID.
    - Automatically enriches anchor with Semantic Truth if missing.
    """
    # ── Level 1: Replay Protection ──────────────────────────
    # Check if this Transaction UUID has already been used
    existing_uuid = await db.execute(
        select(DocumentAnchor).where(DocumentAnchor.transaction_uuid == anchor_req.transaction_uuid)
    )
    if existing_uuid.scalar_one_or_none():
        # Forensic Log: Potential Replay Attack
        forensic = ForensicLog(
            event_type="REPLAY_ATTACK",
            severity="CRITICAL",
            user_id=current_user.id,
            details={
                "transaction_uuid": anchor_req.transaction_uuid,
                "payload_json": anchor_req.payload_json
            },
            client_ip=request.client.host if request.client else "unknown"
        )
        db.add(forensic)
        await db.commit()
        
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="REPLAY ATTACK DETECTED: This transaction nonce has already been consumed."
        )

    # ── Level 2: Cryptographic Verification ──────────────────
    try:
        # Get the signer's ACTIVE public key from the database
        pub_key_record = await db.execute(
            select(PublicKey).where(
                PublicKey.user_id == current_user.id,
                PublicKey.is_active == True
            )
        )
        pub_key = pub_key_record.scalars().first()
        if not pub_key:
            raise HTTPException(status_code=404, detail="Hardware public key not found for current user")

        # Verify the signature against the raw payload_json string (ECDSA/RSA + SHA-256)
        try:
            crypto_service.verify_signature(
                pub_key.public_key_pem,
                anchor_req.digital_signature,
                anchor_req.payload_json.encode("utf-8"),
            )
        except InvalidSignature:
            forensic = ForensicLog(
                event_type="SIGNATURE_FORGERY",
                severity="CRITICAL",
                user_id=current_user.id,
                details={"transaction_uuid": anchor_req.transaction_uuid},
                client_ip=request.client.host if request.client else "unknown",
            )
            db.add(forensic)
            await db.commit()
            raise HTTPException(status_code=400, detail="INVALID SIGNATURE: Payload commitment failed.")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # ── Level 2b: Pixel-accurate visual hash vs signed v_hash (anti-tamper image / wrong crop) ──
    image_bytes = base64.b64decode(anchor_req.image_base64)
    
    # Authoritative Quality Gate (T1 Foundation)
    quality_result = image_quality_service.validate(image_bytes)
    if not quality_result.passed:
        # Flatten flags for mobile display
        failed_reasons = []
        f = quality_result.details.get("flags", {})
        if f.get("is_blurry"): failed_reasons.append("too blurry")
        if f.get("is_too_dark"): failed_reasons.append("too dark")
        if f.get("is_too_bright"): failed_reasons.append("too bright")
        if f.get("is_low_res"): failed_reasons.append("low resolution")
        
        reason_str = ", ".join(failed_reasons) if failed_reasons else "poor image quality"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"IMAGE_QUALITY_REJECTED: The photo is {reason_str}. Please steady your device and ensure good lighting."
        )

    server_vh = dhash_hex_from_base64_data_uri_or_raw(anchor_req.image_base64)
    if not server_vh:
        raise HTTPException(status_code=400, detail="Invalid image: could not decode for visual binding.")

    try:
        payload_obj = json.loads(anchor_req.payload_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=401, detail="payload_json must be valid JSON")

    policy_version = payload_obj.get("policy_version", 1)
    
    # ── Policy-Specific Verification ────────────────────────
    if policy_version == 2:
        # Policy V2: Deterministic SHA-256 binary hash binding
        signed_doc_hash = str(payload_obj.get("document_hash", "")).strip().lower()
        actual_doc_hash = hashlib.sha256(anchor_req.image_base64.encode()).hexdigest()
        
        if signed_doc_hash != actual_doc_hash:
            raise HTTPException(
                status_code=401,
                detail="CRYPTOGRAPHIC BINDING ERROR: Signed document_hash does not match image payload."
            )
        # Skip Hamming distance check for V2 (authorized by spec)
    else:
        # Policy V1: Perceptual Hamming distance check
        client_vh = str(payload_obj.get("v_hash", "")).strip().lower()
        if len(client_vh) != 16 or any(c not in "0123456789abcdef" for c in client_vh):
            raise HTTPException(status_code=401, detail="Signed payload must include a valid 16-char hex v_hash")

        vdist = hamming_hex64(client_vh, server_vh)
        if vdist > MAX_VISUAL_COMMITMENT_GAP_BITS:
            raise HTTPException(
                status_code=401,
                detail=(
                    f"Visual commitment mismatch (bit distance {vdist}). "
                    "Keep the document centered in the frame, add light, and retry."
                ),
            )

        th = str(payload_obj.get("text_hash", "")).strip().lower()
        if len(th) != 64 or any(c not in "0123456789abcdef" for c in th):
            raise HTTPException(
                status_code=401,
                detail="policy_version >= 1 requires a 64-char lowercase hex text_hash",
            )

    # ── Level 3: Semantic Enrichment ────────────────────────
    # If the client didn't provide semantic content, automate it now
    semantic_data = anchor_req.semantic_content.model_dump() if anchor_req.semantic_content else None
    if not semantic_data:
        print(f"[Anchors] Automating semantic extraction for anchor {anchor_req.transaction_uuid}")
        try:
            semantic_data = await asyncio.wait_for(
                extraction_service.extract_semantic_from_image(anchor_req.image_base64),
                timeout=12.0
            )
        except Exception as e:
            print(f"[Anchors] Semantic extraction failed: {str(e)}")
            # Never block anchor finalization on semantic AI latency/failure.
            semantic_data = {
                "amount": 0.0,
                "currency": "UNKNOWN",
                "date": "1970-01-01",
                "parties": []
            }
    
    # Hash the image for S3 and record reference
    image_hash = hashlib.sha256(anchor_req.image_base64.encode()).hexdigest()

    # 2026 Spec: Compute ORB Descriptors on a CANONICAL RECTIFIED FRAME
    # This ensures coordinate synchronization with the Verifier's rectified crops.
    # 2026 Policy Alignment: Manual crops are already "Precision-Aligned" by the client.
    # Running 'rectify' (perspective warping) on an already-cropped square frame 
    # is unpredictable and causes ORB mismatch in the Verifier loop.
    orb_data = None
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        raw_img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        img_rect = None
        
        if raw_img is not None:
            h, w = raw_img.shape[:2]
            # Detect 1024x1024 precision crop
            if h == w == 1024:
                img_rect = raw_img
                print("[Anchors] Detected precision crop - skipping rectification for 1:1 parity.")
            else:
                rect_res = await rectification_service.rectify(image_bytes)
                if rect_res.passed:
                    rect_nparr = np.frombuffer(base64.b64decode(rect_res.rectified_image), np.uint8)
                    img_rect = cv2.imdecode(rect_nparr, cv2.IMREAD_GRAYSCALE)
                else:
                    print(f"[Anchors] Rectification failed: {rect_res.details}. Using raw resize.")
                    img_rect = cv2.resize(raw_img, (1024, 1024))
        
        if img_rect is not None:
            orb = cv2.ORB_create(nfeatures=1000)
            keypoints, descriptors = orb.detectAndCompute(img_rect, None)
            if descriptors is not None:
                # Forensic Safeguard: If we don't see enough features, it's NOT a document
                if len(keypoints) < 15:
                    raise HTTPException(
                        status_code=400,
                        detail="DOCUMENT_NOT_DETECTED: No valid document features found in the frame. Please align the document properly."
                    )
                orb_data = {
                    "keypoints": [[float(kp.pt[0]), float(kp.pt[1])] for kp in keypoints],
                    "descriptors": descriptors.tolist()
                }
            else:
                # No descriptors at all (e.g. solid color wall)
                raise HTTPException(
                    status_code=400, 
                    detail="DOCUMENT_NOT_DETECTED: The image contains no recognizable document patterns."
                )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Anchors] ORB Computation Failed: {str(e)}")
        # Non-fatal: fall back to phash matching if ORB fails
    
    # Store the anchor
    new_anchor = DocumentAnchor(
        user_id=current_user.id,
        s3_uri=f"s3://signverify-anchors/{current_user.id}/{image_hash}.jpg",
        file_hash=image_hash,
        digital_signature=anchor_req.digital_signature,
        signed_payload_json=anchor_req.payload_json,
        binding_vhash=server_vh,
        normalized_content=semantic_data,
        transaction_uuid=anchor_req.transaction_uuid,
        signer_public_key_id=pub_key.id,
        phash=server_vh,
        reference_id=anchor_req.reference_id,
        orb_descriptors=orb_data,
        image_quality_score=quality_result.score,
        image_quality_details=quality_result.details
    )
    
    db.add(new_anchor)
    try:
        await db.commit()
        await db.refresh(new_anchor)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Duplicate anchor or idempotency failure")

    return AnchorResponse(
        id=str(new_anchor.id),
        s3_uri=new_anchor.s3_uri,
        file_hash=new_anchor.file_hash,
        created_at=new_anchor.created_at,
        reference_id=new_anchor.reference_id,
        payload=AnchorPayload(
            document_hash=new_anchor.file_hash,
            digital_signature=new_anchor.digital_signature,
            signer_public_key_id=str(new_anchor.signer_public_key_id),
            binding_vhash=new_anchor.binding_vhash,
            semantic_content=new_anchor.normalized_content,
            image_quality_score=new_anchor.image_quality_score,
            image_quality_details=new_anchor.image_quality_details
        )
    )

@router.get("/", response_model=list[AnchorResponse])
async def list_anchors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetches the document history for the authenticated user.
    """
    stmt = select(DocumentAnchor).where(
        DocumentAnchor.user_id == current_user.id
    ).order_by(DocumentAnchor.created_at.desc())
    
    result = await db.execute(stmt)
    anchors = result.scalars().all()
    
    return [
        AnchorResponse(
            id=str(a.id),
            s3_uri=a.s3_uri,
            file_hash=a.file_hash,
            created_at=a.created_at,
            reference_id=a.reference_id,
            payload=AnchorPayload(
                document_hash=a.file_hash,
                digital_signature=a.digital_signature,
                signer_public_key_id=str(a.signer_public_key_id),
                binding_vhash=a.binding_vhash,
                semantic_content=a.normalized_content,
                image_quality_score=a.image_quality_score,
                image_quality_details=a.image_quality_details
            )
        ) for a in anchors
    ]

@router.post("/verify-amount")
async def verify_amount(
    req: AmountVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Forensic Reconciliation Fallback: Manually verifies high-severity amounts 
    when AI confidence is < 95%.
    """
    stmt = select(DocumentAnchor).where(DocumentAnchor.id == req.anchor_id)
    res = await db.execute(stmt)
    anchor = res.scalar_one_or_none()
    
    if not anchor:
        raise HTTPException(status_code=404, detail="ANCHOR_NOT_FOUND")
        
    signed_amt = float(anchor.normalized_content.get("amount", 0.0))
    user_amt = float(req.amount)
    
    # Strict matching (No tolerance for manual human entry)
    if abs(signed_amt - user_amt) < 0.001:
        # Success - Return the metadata for the Results screen
        user_stmt = select(User).where(User.id == anchor.user_id)
        user_res = await db.execute(user_stmt)
        user = user_res.scalar_one_or_none()
        
        return {
            "match": True,
            "verification_state": "verified",
            "metadata": {
                "anchor_id": str(anchor.id),
                "signer_name": user.phone_number if user else "Unknown",
                "reference_id": anchor.reference_id,
                "timestamp": anchor.created_at.isoformat() if anchor.created_at else None,
                "parties": anchor.normalized_content.get("parties", []) if anchor.normalized_content else []
            }
        }
    else:
        # Forgery or Human Error
        print(f"[Forensic] Manual Rejection: Scanned {user_amt} != Signed {signed_amt}")
        return {
            "match": False,
            "verification_state": "forged",
            "detail": f"INTEGRITY_VIOLATION: Manual input {user_amt} does not match signed ledger value."
        }
