from __future__ import annotations

from typing import List, Optional, Any
from uuid import uuid4

from cryptography.exceptions import InvalidSignature
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.database import get_db
from app.models.anchor import DocumentAnchor
from app.models.user import User
from app.models.public_key import PublicKey
from pydantic import BaseModel, Field
from app.middleware.auth_middleware import get_current_user
from app.config import settings
from app.services.crypto_service import crypto_service
import cv2
import numpy as np
import base64
import math
from app.services.extraction_service import extraction_service
from app.services.document_rectification_service import rectification_service as doc_rectification_service
from app.services.image_quality_service import image_quality_service as quality_validator
from app.services.jwt_service import (
    create_verification_candidate_token, 
    decode_verification_candidate_token
)
from app.utils.visual_hash import dhash_hex_from_base64_data_uri_or_raw

router = APIRouter(prefix="/signatures", tags=["search"])

# 2026 Verification Thresholds
VISUAL_HAMMING_THRESHOLD_DISCOVERY = 16  # Relaxed for coarse discovery
VISUAL_HAMMING_THRESHOLD_STRICT = 10     # Strict for forensic resolution
ORB_MIN_MATCHES = 12                     # Lowered slightly for rectified-to-rectified matching
ORB_MIN_INLIERS = 10                     # Increased for homography consensus
ORB_MIN_RATIO = 0.40                    # Increased for precision
LIVENESS_FREQ_RATIO = 2.8
LIVENESS_LAPLACIAN_VAR = 40.0


async def cryptographic_attestation(db: AsyncSession, anchor: DocumentAnchor) -> dict:
    """Re-verify ECDSA/RSA signature over stored payload (proves ledger row integrity)."""
    if not getattr(anchor, "signed_payload_json", None):
        return {"signature_valid": None, "detail": "Legacy anchor: signed payload not stored"}
    pk_res = await db.execute(select(PublicKey).where(PublicKey.id == anchor.signer_public_key_id))
    pk = pk_res.scalar_one_or_none()
    if not pk:
        return {"signature_valid": False, "detail": "Public key missing"}
    try:
        crypto_service.verify_signature(
            pk.public_key_pem,
            anchor.digital_signature,
            anchor.signed_payload_json.encode("utf-8"),
        )
        return {"signature_valid": True, "signer_public_key_id": str(anchor.signer_public_key_id)}
    except InvalidSignature:
        return {"signature_valid": False, "detail": "Signature invalid or payload tampered"}
    except Exception as e:
        return {"signature_valid": False, "detail": str(e)}

def get_hamming_distance(h1: str, h2: str) -> int:
    """Calculates Hamming Distance between two 64-bit hex strings."""
    if len(h1) != 16 or len(h2) != 16:
        return 64
    try:
        return (int(h1, 16) ^ int(h2, 16)).bit_count()
    except ValueError:
        return 64


def _normalize_vhash(v_hash: Optional[str]) -> str:
    if not v_hash:
        return ""
    return v_hash.strip().lower()

@router.get("/search")
async def search_signature(
    hash: str = Query(..., description="64-bit pHash in hex format"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Visual Search Discovery.
    Performs Hamming Distance matching against registered document phashes.
    """
    requested = _normalize_vhash(hash)
    if len(requested) != 16 or any(ch not in "0123456789abcdef" for ch in requested):
        raise HTTPException(status_code=400, detail="hash must be a 16-char lowercase hex string")

    stmt = select(DocumentAnchor).where(DocumentAnchor.phash.is_not(None)).options(
        load_only(
            DocumentAnchor.id,
            DocumentAnchor.user_id,
            DocumentAnchor.phash,
            DocumentAnchor.created_at,
            DocumentAnchor.reference_id,
            DocumentAnchor.s3_uri,
            DocumentAnchor.transaction_uuid,
            DocumentAnchor.normalized_content,
        )
    )
    result = await db.execute(stmt)
    anchors = result.scalars().all()
    
    best_match = None
    min_distance = 64
    THRESHOLD = VISUAL_HAMMING_THRESHOLD_DISCOVERY

    try:
        for anchor in anchors:
            a_phash = str(anchor.phash) if hasattr(anchor, 'phash') and anchor.phash else None
            if not a_phash or not requested:
                continue
                
            dist = get_hamming_distance(requested, _normalize_vhash(a_phash))
            
            if dist == 0:
                min_distance = 0
                best_match = anchor
                break
            if dist < min_distance:
                min_distance = dist
                best_match = anchor
    except Exception as e:
        print(f"[Search] Error in matching loop: {str(e)}")
            
    best_phash = str(best_match.phash) if best_match and hasattr(best_match, 'phash') else "NONE"
    print(f"[Search] Requested: {str(requested)[:4]}... | Best Match: {best_phash[:4]}... | Distance: {min_distance}")
            
    if best_match and min_distance <= THRESHOLD:
        user_stmt = select(User).where(User.id == best_match.user_id)
        user_res = await db.execute(user_stmt)
        user = user_res.scalar_one_or_none()

        parties = best_match.normalized_content.get("parties", []) if best_match.normalized_content else []
        signer_info = user.phone_number if user else "Unknown"
        if parties:
            signer_info += f" ({', '.join(parties)})"

        return {
            "match": True,
            "distance": min_distance,
            "signer_name": signer_info,
            "timestamp": best_match.created_at,
            "s3_uri": best_match.s3_uri,
            "transaction_uuid": best_match.transaction_uuid,
            "reference_id": best_match.reference_id,
            "parties": parties
        }
    
    return {"match": False, "dist_found": min_distance, "detail": "No visual match within threshold"}

@router.get("/reference/{ref_id}")
async def get_by_reference(
    ref_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manual Override: Lookup signature by 6-digit alphanumeric Reference ID."""
    stmt = select(DocumentAnchor).where(DocumentAnchor.reference_id == ref_id)
    result = await db.execute(stmt)
    anchor = result.scalar_one_or_none()
    
    if not anchor:
        raise HTTPException(status_code=404, detail="Reference ID not found")
        
    user_stmt = select(User).where(User.id == anchor.user_id)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()
    return {
        "match": True,
        "signer_name": user.phone_number if user else "Unknown Signer",
        "timestamp": anchor.created_at,
        "s3_uri": anchor.s3_uri,
        "transaction_uuid": anchor.transaction_uuid,
        "reference_id": anchor.reference_id
    }

class VHashVerifyRequest(BaseModel):
    v_hash: Optional[str] = Field(None, min_length=16, max_length=16)
    v_hashes: Optional[List[str]] = Field(None, max_length=5)


def _collect_query_hashes(payload: VHashVerifyRequest) -> List[str]:
    out: List[str] = []
    if payload.v_hashes:
        for h in (payload.v_hashes or [])[:5]:
            nh = _normalize_vhash(h or "")
            if len(nh) == 16 and all(c in "0123456789abcdef" for c in nh):
                out.append(nh)
    if payload.v_hash:
        nh = _normalize_vhash(payload.v_hash)
        if len(nh) == 16 and all(c in "0123456789abcdef" for c in nh):
            out.append(nh)
    return list(dict.fromkeys(out))


@router.post("/verify-vhash")
async def verify_vhash(
    payload: VHashVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    DEPRECATED (Use /verify-document).
    Fuzzy visual match on server dHash (`phash`), with optional multi-frame query list.
    """
    query_hashes = _collect_query_hashes(payload)
    if not query_hashes:
        raise HTTPException(
            status_code=400,
            detail="Provide v_hash or v_hashes (16-char hex each)",
        )

    stmt = select(DocumentAnchor).where(DocumentAnchor.phash.is_not(None)).options(
        load_only(
            DocumentAnchor.id,
            DocumentAnchor.user_id,
            DocumentAnchor.phash,
            DocumentAnchor.created_at,
            DocumentAnchor.reference_id,
            DocumentAnchor.normalized_content,
            DocumentAnchor.signed_payload_json,
            DocumentAnchor.digital_signature,
            DocumentAnchor.signer_public_key_id,
        )
    )
    result = await db.execute(stmt)
    anchors = result.scalars().all()

    best_match = None
    min_distance = 64

    for anchor in anchors:
        ap = str(anchor.phash or "").lower()
        if not ap: continue
        dist = min(get_hamming_distance(q, ap) for q in query_hashes)
        if dist < min_distance:
            min_distance = dist
            best_match = anchor
        if min_distance == 0:
            break

    if best_match and min_distance <= VISUAL_HAMMING_THRESHOLD_DISCOVERY:
        user_stmt = select(User).where(User.id == best_match.user_id)
        user_res = await db.execute(user_stmt)
        user = user_res.scalar_one_or_none()

        parties = best_match.normalized_content.get("parties", []) if best_match.normalized_content else []
        signer_phone = user.phone_number if user else "Unknown"
        signer_name = user.phone_number if user else "Unknown Signer"
        crypto = await cryptographic_attestation(db, best_match)

        return {
            "match_found": True,
            "distance": min_distance,
            "query_frames_used": len(query_hashes),
            "cryptographic_verification": crypto,
            "metadata": {
                "anchor_id": str(best_match.id),
                "signer_phone": signer_phone,
                "signer_name": signer_name,
                "participants": parties,
                "all_signer_names": [signer_name, *parties] if parties else [signer_name],
                "timestamp": best_match.created_at.isoformat() if best_match.created_at else None,
                "reference_id": best_match.reference_id,
                "cryptographic_verification": crypto,
            },
        }

    return {
        "match_found": False,
        "detail": f"No match within threshold (Min Dist: {min_distance})",
    }

class VerifyFrameRequest(BaseModel):
    image_base64: str = Field(..., min_length=256)


def perform_liveness_check(img_gray: np.ndarray) -> dict:
    """
    2026 Anti-Spoofing: Detects if the image is a physical document or a digital screen.
    """
    try:
        dft = np.fft.fft2(img_gray)
        dft_shift = np.fft.fftshift(dft)
        magnitude_spectrum = 20 * np.log(np.abs(dft_shift) + 1)
        
        h, w = img_gray.shape
        cy, cx = h // 2, w // 2
        magnitude_spectrum_arr = np.array(magnitude_spectrum, dtype=np.float32)
        magnitude_spectrum_arr[cy-10:cy+10, cx-10:cx+10] = 0
        
        max_freq = float(np.max(magnitude_spectrum_arr))
        avg_freq = float(np.mean(magnitude_spectrum_arr))
        freq_ratio = max_freq / avg_freq if avg_freq > 0 else 0.0
        
        laplacian_var = float(cv2.Laplacian(img_gray, cv2.CV_64F).var())
        
        is_screen = freq_ratio > LIVENESS_FREQ_RATIO or laplacian_var < LIVENESS_LAPLACIAN_VAR
        
        return {
            "is_liveness_passing": not is_screen,
            "freq_ratio": freq_ratio,
            "laplacian_var": laplacian_var,
            "detail": "SCREEN_SPOOF_DETECTED" if is_screen else "PHYSICAL_PAPER_VALIDATED"
        }
    except Exception:
        return {"is_liveness_passing": True, "detail": "LIVENESS_BYPASS_ON_ERROR"}

class VerifyDocumentRequest(BaseModel):
    image_base64: str
    mode: str = "full"
    candidate_token: Optional[str] = None

class ConfirmReferenceRequest(BaseModel):
    candidate_token: str
    reference_id: str

@router.post("/verify-document")
async def verify_document(
    payload: VerifyDocumentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    2026 Unified Verification Endpoint.
    """
    try:
        image_data = base64.b64decode(payload.image_base64.split(",")[-1])
    except Exception as e:
        return {"match_found": False, "detail": "INVALID_IMAGE_BASE64"}

    # 2026 Unified Consistency: Detect if client already pre-cropped (1024x1024)
    nparr = np.frombuffer(image_data, np.uint8)
    raw_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    use_raw = False
    if raw_img is not None:
        h, w = raw_img.shape[:2]
        if h == w == 1024:
            print("[Verify] Detected 1024x1024 precision crop - bypassing rectification for 1:1 match.")
            use_raw = True
            
    if use_raw:
        rect_image_b64 = base64.b64encode(image_data).decode('utf-8')
        # Stub for rect_result
        from pydantic import BaseModel
        class StubRectResult: passed = True; confidence = 1.0; details = {"method": "precision_crop"}
        rect_result = StubRectResult()
    else:
        rect_result = await doc_rectification_service.rectify(image_data)
        if not rect_result.passed:
            print(f"[Verify] Rectification failed: {rect_result.details}. Using raw fallback.")
            rect_image_b64 = base64.b64encode(image_data).decode('utf-8')
            rect_result.confidence = 0.5
        else:
            rect_image_b64 = str(rect_result.rectified_image)
    
    rect_bytes = base64.b64decode(rect_image_b64)
    
    quality = quality_validator.validate(rect_bytes)
    if not quality.passed:
        # Flatten flags for mobile display
        failed_reasons = []
        f = quality.details.get("flags", {})
        if f.get("is_blurry"): failed_reasons.append("too blurry")
        if f.get("is_too_dark"): failed_reasons.append("too dark")
        if f.get("is_too_bright"): failed_reasons.append("too bright")
        if f.get("is_low_res"): failed_reasons.append("low resolution")
        
        reason_str = ", ".join(failed_reasons) if failed_reasons else "poor image quality"
        return {
            "match_found": False, 
            "detail": f"IMAGE_QUALITY_REJECTED: The photo is {reason_str}. Please steady your device and ensure good lighting."
        }

    if payload.mode == "discovery":
        query_hash = dhash_hex_from_base64_data_uri_or_raw(rect_image_b64) or ""
        if not query_hash:
             return {"match_found": False, "detail": "HASH_COMPUTATION_FAILED"}

        stmt = select(DocumentAnchor).where(DocumentAnchor.phash.is_not(None)).options(
            load_only(DocumentAnchor.id, DocumentAnchor.phash)
        )
        res = await db.execute(stmt)
        anchors = res.scalars().all()
        
        best_match = None
        min_dist = 64
        for a in anchors:
            ap = str(a.phash).lower()
            d = get_hamming_distance(query_hash, ap)
            if d < min_dist:
                min_dist = d
                best_match = a
            if d == 0: break
            
        if best_match and min_dist <= VISUAL_HAMMING_THRESHOLD_DISCOVERY:
            token = create_verification_candidate_token(str(best_match.id), nonce=str(uuid4()))
            return {
                "match_found": True,
                "confidence": float(max(0.0, 1.0 - (min_dist / 64.0))),
                "candidate_token": token,
                "verification_state": "discovery_complete",
                "detail": "COARSE_MATCH_CONFIRMED"
            }
        return {"match_found": False, "detail": "NO_DISCOVERY_MATCH"}

    anchor = None
    if payload.candidate_token:
        try:
            payload_data = decode_verification_candidate_token(payload.candidate_token)
            anchor_stmt = select(DocumentAnchor).where(DocumentAnchor.id == payload_data["anchor_id"])
            anchor_res = await db.execute(anchor_stmt)
            anchor = anchor_res.scalar_one_or_none()
        except ValueError:
            raise HTTPException(status_code=401, detail="INVALID_OR_EXPIRED_CANDIDATE_TOKEN")
    else:
        query_hash = dhash_hex_from_base64_data_uri_or_raw(rect_image_b64) or ""
        stmt = select(DocumentAnchor).where(DocumentAnchor.phash.is_not(None))
        res = await db.execute(stmt)
        anchors = res.scalars().all()
        best_match = None
        min_dist = 64
        for a in anchors:
            ap = str(a.phash).lower()
            d = get_hamming_distance(query_hash, ap)
            if d < min_dist:
                min_dist = d
                best_match = a
        if best_match and min_dist <= VISUAL_HAMMING_THRESHOLD_STRICT:
            anchor = best_match

    if not anchor:
        return {"match_found": False, "detail": "NO_ANCHOR_RESOLVED"}

    orb_res = await _verify_orb_homography(rect_image_b64, anchor)
    nparr = np.frombuffer(rect_bytes, np.uint8)
    rect_gray = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    liveness = perform_liveness_check(rect_gray)
    crypto = await cryptographic_attestation(db, anchor)
    
    # 2026 Semantic Audit: Compare Signed Truth vs Scanned Truth
    # This detects "Local Content Forgery" (e.g. $54.50 -> $5.45)
    signed_semantic = anchor.normalized_content or {}
    scanned_semantic = await extraction_service.extract_semantic_from_image(rect_image_b64)
    reconciliation = extraction_service.reconcile_semantic(signed_semantic, scanned_semantic)
    
    # Check for specific shortcode match as extra signal
    id_match = await extraction_service.verify_document_id(rect_image_b64, anchor.reference_id)
    
    scanned_certainty = scanned_semantic.get("confidence", 0.0)
    semantic_passed = (reconciliation["status"] == "passed")
    forgery_detected = (reconciliation["status"] == "forged")
    forgery_reason = reconciliation.get("reason", "Unknown integrity violation")
    
    # 2026 Trust Elevation: If AI is unsure (< 95%), escalate to human manually
    is_ambiguous = (scanned_certainty < 0.95)
    
    print(f"[Verify] Anchor: {anchor.id} | ORB: {orb_res['confidence']:.2f} | Certainty: {scanned_certainty:.2f}")
    
    # 2026 Verification Strategy (Refinement): 
    # Visual (ORB) and Cryptographic proof are the primary high-confidence drivers.
    # Semantic (OCR ID) is now a secondary 'bonus' as the ID is often digital-only.
    
    # 0.4 is a healthy cross-device threshold for consistent 1024 grids.
    visual_match = (orb_res["confidence"] > 0.4)
    
    if forgery_detected:
        v_state = "forged"
        print(f"[Forensic] Overriding to FORGED: {forgery_reason}")
    elif visual_match:
        # High-trust verification requires BOTH visual parity and semantic harmony
        if semantic_passed:
            if is_ambiguous:
                v_state = "pending_manual_confirmation"
                print(f"[Forensic] Visual Match but AI Certainty Low ({scanned_certainty}) - Escalating to Human")
            else:
                v_state = "verified"
        else:
            # If visual is high but semantic reconciliation failed (non-forgery error)
            v_state = "pending_reference_confirmation"
    elif orb_res["confidence"] > 0.15 or semantic_passed:
        # Some visual similarity or OCR match -> manual fallout
        v_state = "pending_reference_confirmation"
    else:
        v_state = "inconclusive"

    confidence = float(orb_res["confidence"] * 0.5) + float(quality.score * 0.2) + (0.3 if crypto["signature_valid"] else 0.0)
    if forgery_detected:
        confidence = 0.05 # Near zero for explicit integrity violation
        
    if not liveness["is_liveness_passing"]:
        # Spoofing detected: override to inconclusive
        v_state = "inconclusive"
        confidence *= 0.1

    user_stmt = select(User).where(User.id == anchor.user_id)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()
    
    return {
        "match_found": True,
        "verification_state": v_state,
        "confidence": confidence,
        "liveness_passed": liveness["is_liveness_passing"],
        "crypto_passed": crypto["signature_valid"],
        "semantic_passed": semantic_passed,
        "forgery_detected": forgery_detected,
        "forgery_reason": forgery_reason if forgery_detected else None,
        "orb_confidence": orb_res["confidence"],
        "rectification_confidence": rect_result.confidence,
        "metadata": {
            "anchor_id": str(anchor.id),
            "signer_name": user.phone_number if user else "Unknown",
            "reference_id": anchor.reference_id,
            "timestamp": anchor.created_at.isoformat() if anchor.created_at else None,
            "parties": anchor.normalized_content.get("parties", []) if anchor.normalized_content else []
        }
    }

@router.post("/confirm-reference")
async def confirm_reference(
    payload: ConfirmReferenceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manual Confirmation Fallout."""
    try:
        payload_data = decode_verification_candidate_token(payload.candidate_token)
        stmt = select(DocumentAnchor).where(DocumentAnchor.id == payload_data["anchor_id"])
        res = await db.execute(stmt)
        anchor = res.scalar_one_or_none()
        
        if not anchor:
            raise HTTPException(status_code=404, detail="ANCHOR_NOT_FOUND")
            
        if str(anchor.reference_id).upper() != str(payload.reference_id).upper():
            return {
                "verified": False,
                "detail": "REFERENCE_ID_MISMATCH",
                "verification_state": "failed"
            }
            
        user_stmt = select(User).where(User.id == anchor.user_id)
        user_res = await db.execute(user_stmt)
        user = user_res.scalar_one_or_none()
        
        return {
            "verified": True,
            "verification_state": "verified",
            "metadata": {
                "anchor_id": str(anchor.id),
                "signer_name": user.phone_number if user else "Unknown",
                "reference_id": anchor.reference_id,
                "timestamp": anchor.created_at.isoformat() if anchor.created_at else None
            }
        }
    except ValueError:
        raise HTTPException(status_code=401, detail="INVALID_OR_EXPIRED_CANDIDATE_TOKEN")

async def _verify_orb_homography(rect_image_b64: str, anchor: DocumentAnchor) -> dict:
    """Internal helper."""
    try:
        if not anchor.orb_descriptors:
            return {"confidence": 0.0, "detail": "NO_ANCHOR_ORB"}
            
        nparr = np.frombuffer(base64.b64decode(rect_image_b64), np.uint8)
        img_rect = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        
        orb = cv2.ORB_create(nfeatures=1000)
        kp_frame, des_frame = orb.detectAndCompute(img_rect, None)
        
        if des_frame is None:
             return {"confidence": 0.0, "detail": "NO_RECT_FEATURES"}
             
        des_anchor = np.array(anchor.orb_descriptors["descriptors"], dtype=np.uint8)
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        matches = bf.knnMatch(des_anchor, des_frame, k=2)
        
        good_matches = []
        for m, n in matches:
            if m.distance < 0.75 * n.distance:
                good_matches.append(m)
                
        if len(good_matches) < ORB_MIN_MATCHES:
             return {"confidence": 0.0, "matches": len(good_matches)}
             
        src_kp_all = anchor.orb_descriptors["keypoints"]
        src_pts = np.float32([src_kp_all[m.queryIdx] for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp_frame[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        
        M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
        inlier_count = int(np.sum(mask)) if mask is not None else 0
        inlier_ratio = float(inlier_count) / len(good_matches) if good_matches else 0.0
        
        if M is None or inlier_count < ORB_MIN_INLIERS or inlier_ratio < ORB_MIN_RATIO:
            return {"confidence": 0.0, "inliers": inlier_count, "ratio": inlier_ratio}
            
        conf = float(min(1.0, (inlier_count / 50.0) * 0.5 + (inlier_ratio / 0.8) * 0.5))
        return {"confidence": conf, "inliers": inlier_count}
    except Exception as e:
        return {"confidence": 0.0, "error": str(e)}

@router.post("/verify-frame")
async def verify_frame(
    payload: VerifyFrameRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """DEPRECATED."""
    return {"match_found": False, "detail": "DEPRECATED: Use /verify-document"}
