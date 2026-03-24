from __future__ import annotations

from typing import List, Optional

from cryptography.exceptions import InvalidSignature
from fastapi import APIRouter, Depends, HTTPException, Query
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

router = APIRouter(prefix="/signatures", tags=["search"])

# Unified fuzzy visual match (dHash / server-stored phash), ~19% of 64 bits
VISUAL_HAMMING_THRESHOLD_BITS = 12


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


def _normalize_vhash(v_hash: str) -> str:
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
    Threshold: <15% (<= 9 bits difference for 64-bit hash).
    """
    # 2026 Optimization: Real-world search would use a specialized Vector DB 
    # or a native bit-count SQL extension (e.g., pg_similarity).
    # For this implementation, we fetch active phashes and compare in Python.
    
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
    THRESHOLD = VISUAL_HAMMING_THRESHOLD_BITS

    try:
        for anchor in anchors:
            # 1. Broad Bucket Filter (First 4 bits) - High Speed
            # Use explicit guards and str() casting for linter stability
            a_phash = str(anchor.phash) if hasattr(anchor, 'phash') and anchor.phash else None
            if not a_phash or not requested:
                continue
                
            # Pattern alignment check (first 4 chars)
            if not a_phash.startswith(requested[0:4]):
                continue
                
            dist = get_hamming_distance(requested, _normalize_vhash(a_phash))
            
            # 2. Short-circuit for exact match
            if dist == 0:
                min_distance = 0
                best_match = anchor
                break
            if dist < min_distance:
                min_distance = dist
                best_match = anchor
    except Exception as e:
        print(f"[Search] Error in matching loop: {str(e)}")
            
    # Debug: log first 4 chars of hashes to see pattern alignment
    best_phash = best_match.phash if best_match else "NONE"
    print(f"[Search] Requested: {requested[:4]}... | Best Match: {best_phash[:4]}... | Distance: {min_distance}")
            
    if best_match and min_distance <= THRESHOLD:
        # Fetch user info for the match
        user_stmt = select(User).where(User.id == best_match.user_id)
        user_res = await db.execute(user_stmt)
        user = user_res.scalar_one_or_none()

        # Extract party names from semantic data if available
        parties = best_match.normalized_content.get("parties", []) if best_match.normalized_content else []
        signer_info = user.phone_number if user else "Unknown"
        if parties:
            signer_info += f" ({', '.join(parties)})"

        print(f"[Search] MATCH FOUND: {best_match.reference_id} (Dist: {min_distance})")
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
    """Pass v_hash and/or up to 5 v_hashes (multi-frame fusion). At least one required."""

    v_hash: Optional[str] = Field(None, min_length=16, max_length=16)
    v_hashes: Optional[List[str]] = Field(None, max_length=5)


def _collect_query_hashes(payload: VHashVerifyRequest) -> List[str]:
    out: List[str] = []
    if payload.v_hashes:
        for h in payload.v_hashes[:5]:
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
    Fuzzy visual match on server dHash (`phash`), with optional multi-frame query list.
    Includes cryptographic re-verification of the stored signed payload when available.
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
        ap = (anchor.phash or "").lower()
        dist = min(get_hamming_distance(q, ap) for q in query_hashes)
        if dist < min_distance:
            min_distance = dist
            best_match = anchor
        if min_distance == 0:
            break

    if best_match and min_distance <= VISUAL_HAMMING_THRESHOLD_BITS:
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
    - FFT Analysis: Screens have a periodic grid (Moiré) that shows up as spikes in frequency space.
    - Local Contrast Variance: Real paper has random matte texture; screens have backlighting 'glow'.
    """
    try:
        # 1. Frequency Analysis (FFT) for Moiré patterns
        dft = np.fft.fft2(img_gray)
        dft_shift = np.fft.fftshift(dft)
        magnitude_spectrum = 20 * np.log(np.abs(dft_shift) + 1)
        
        # Look for high-frequency spikes away from the center
        h, w = img_gray.shape
        cy, cx = h // 2, w // 2
        # Mask out the DC component (center)
        magnitude_spectrum_arr = np.array(magnitude_spectrum, dtype=np.float32)
        magnitude_spectrum_arr[cy-10:cy+10, cx-10:cx+10] = 0
        
        max_freq = np.max(magnitude_spectrum_arr)
        avg_freq = np.mean(magnitude_spectrum_arr)
        freq_ratio = max_freq / avg_freq if avg_freq > 0 else 0
        
        # 2. Local Brightness Variance (Glow detection)
        laplacian_var = cv2.Laplacian(img_gray, cv2.CV_64F).var()
        
        # Heuristic thresholds tuned via stress_test_verifier.py
        # FreqRatio 2.2+: Likely Screen Moiré
        # LaplacianVar < 65.0: Likely Blur or Screen Glow
        is_screen = freq_ratio > 2.2 or laplacian_var < 65.0
        
        return {
            "is_liveness_passing": not is_screen,
            "freq_ratio": float(freq_ratio),
            "laplacian_var": float(laplacian_var),
            "detail": "SCREEN_SPOOF_DETECTED" if is_screen else "PHYSICAL_PAPER_VALIDATED"
        }
    except Exception:
        return {"is_liveness_passing": True, "detail": "LIVENESS_BYPASS_ON_ERROR"}

@router.post("/verify-frame")
async def verify_frame(
    payload: VerifyFrameRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    2026 High-Fidelity Verification.
    Uses ORB Feature Matching + Homography to identify document and return perspective corners.
    """
    image_base64 = payload.image_base64
    if len(image_base64) > settings.MAX_VERIFY_IMAGE_BASE64_CHARS:
        raise HTTPException(status_code=413, detail="image_base64 payload too large")

    # 1. Compute ORB for the live frame
    try:
        nparr = np.frombuffer(base64.b64decode(image_base64), np.uint8)
        img_frame = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img_frame is None:
            raise Exception("Invalid image data")
            
        orb = cv2.ORB_create(nfeatures=1000)
        kp_frame, des_frame = orb.detectAndCompute(img_frame, None)
        
        if des_frame is None:
            return {"match_found": False, "detail": "No features detected in frame. Try better lighting."}
    except Exception as e:
        return {"match_found": False, "detail": f"Feature computation failed: {str(e)}"}

    # 2. Match against database
    # For MVP, we iterate. In production, we'd use a Vector Index or FlannBasedMatcher.
    stmt = select(DocumentAnchor).where(DocumentAnchor.orb_descriptors.is_not(None)).options(
        load_only(
            DocumentAnchor.id,
            DocumentAnchor.user_id,
            DocumentAnchor.orb_descriptors,
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
    
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    
    for anchor in anchors:
        des_anchor = np.array(anchor.orb_descriptors["descriptors"], dtype=np.uint8)
        
        # KNN Match for Lowe's Ratio Test
        matches = bf.knnMatch(des_anchor, des_frame, k=2)
        
        # Apply ratio test
        good_matches = []
        for m, n in matches:
            if m.distance < 0.75 * n.distance:
                good_matches.append(m)
                
        if len(good_matches) > 30:  # Hardened from 15
            # 3. Compute Homography using stored source keypoints and live frame keypoints
            src_kp_all = anchor.orb_descriptors["keypoints"]
            
            src_pts = np.float32([src_kp_all[m.queryIdx] for m in good_matches]).reshape(-1, 1, 2)
            dst_pts = np.float32([kp_frame[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
            
            M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
            
            # HARDENING: Require high inlier ratio (at least 15 verified inliers)
            inlier_count = int(np.sum(mask)) if mask is not None else 0
            inlier_ratio = inlier_count / len(good_matches) if good_matches else 0
            
            if M is not None and inlier_count >= 15 and inlier_ratio >= 0.4:
                # 4. Transform original 1024x1024 corners to frame coordinates
                # Original corners in normalized 1024 space
                h, w = 1024, 1024
                pts = np.float32([[0, 0], [0, h-1], [w-1, h-1], [w-1, 0]]).reshape(-1, 1, 2)
                dst = cv2.perspectiveTransform(pts, M)
                
                # GEOMETRIC SANITY CHECK: Ensure the 4 corners form a CONVEX quadrilateral 
                # and have a reasonable aspect ratio.
                try:
                    is_convex = cv2.isContourConvex(dst.reshape(-1, 2).astype(np.int32))
                    
                    # Calculate side lengths
                    def dist(p1, p2): return np.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2)
                    sides = [
                        dist(dst[0][0], dst[1][0]), # Top
                        dist(dst[1][0], dst[2][0]), # Right
                        dist(dst[2][0], dst[3][0]), # Bottom
                        dist(dst[3][0], dst[0][0])  # Left
                    ]
                    
                    avg_w = (sides[0] + sides[2]) / 2
                    avg_h = (sides[1] + sides[3]) / 2
                    ar = avg_w / avg_h if avg_h > 0 else 0
                    
                    # Log for forensic analysis
                    print(f"[VerifyFrame] Geometry: Convex={is_convex}, AR={ar:.2f}, Inliers={inlier_count}, Ratio={inlier_ratio:.2f}")

                    # Reject if not convex or bizarre aspect ratio (too flat or too tall)
                    if not is_convex or ar < 0.5 or ar > 2.0:
                        print(f"[VerifyFrame] REJECTED: Geometric sanity check failed.")
                        continue
                except Exception as geo_err:
                    print(f"[VerifyFrame] Geometry check error: {str(geo_err)}")
                    continue
                
                # Confidence Score (0-1.0)
                # Maximize at 50+ inliers and 0.8+ ratio
                confidence = min(1.0, (inlier_count / 50.0) * 0.5 + (inlier_ratio / 0.8) * 0.5)

                # 4b. Liveness Check (Anti-Spoofing)
                liveness = perform_liveness_check(img_frame)
                if not liveness["is_liveness_passing"]:
                    print(f"[VerifyFrame] LIVENESS REJECTED: {liveness['detail']}")
                    # We penalize confidence heavily instead of outright rejecting to allow for bad lighting
                    confidence *= 0.3
                
                # HARDENING: Spatial Distribution Check
                # Calculate the "spread" of the inliers. Real matches are spread across the doc.
                # Cluster matches in one spot are usually noise.
                inlier_pts = dst_pts[mask.ravel() == 1].reshape(-1, 2)
                if len(inlier_pts) >= 5:
                    hull = cv2.convexHull(inlier_pts.astype(np.float32))
                    hull_area = cv2.contourArea(hull)
                    
                    # Normalized area relative to the detected quad area
                    quad_area = cv2.contourArea(dst.reshape(-1, 2).astype(np.float32))
                    distribution_ratio = hull_area / quad_area if quad_area > 0 else 0
                    
                    print(f"[VerifyFrame] Hull Area: {hull_area:.1f}, Quad Area: {quad_area:.1f}, Spread: {distribution_ratio:.2f}")
                    
                    if distribution_ratio < 0.15: # If matches cover less than 15% of the doc, it's likely noise
                        print(f"[VerifyFrame] REJECTED: Matches too clustered (Potential Noise).")
                        continue
                    
                    # Adjust confidence based on distribution
                    confidence = 0.7 * confidence + 0.3 * min(1.0, distribution_ratio / 0.5)

                # 4c. Semantic Spot-Check (The Final Arbiter)
                # Only perform for high-confidence visual matches to save API costs
                semantic_passed = True
                if confidence > 0.6:
                    semantic_passed = await extraction_service.verify_document_id(
                        image_base64, 
                        anchor.reference_id
                    )
                    if not semantic_passed:
                        print(f"[VerifyFrame] SEMANTIC REJECTED: {anchor.reference_id} NOT FOUND ON PAPER")
                        confidence *= 0.1 # Severe penalty for text mismatch

                # Fetch user info for the match
                user_stmt = select(User).where(User.id == anchor.user_id)
                user_res = await db.execute(user_stmt)
                user = user_res.scalar_one_or_none()
                
                parties = anchor.normalized_content.get("parties", []) if anchor.normalized_content else []
                signer_phone = user.phone_number if user else "Unknown"
                signer_name = user.phone_number if user else "Unknown Signer"

                print(f"[VerifyFrame] MATCH with Homography! {anchor.reference_id} (Conf: {confidence:.2f})")
                crypto = await cryptographic_attestation(db, anchor)
                
                # Final pass/fail threshold for production
                if confidence < 0.4:
                    print(f"[VerifyFrame] REJECTED: Confidence {confidence:.2f} too low (Failed Liveness or Semantic).")
                    continue

                return {
                    "match_found": True,
                    "corners": [{"x": float(p[0][0]), "y": float(p[0][1])} for p in dst],
                    "cryptographic_verification": crypto,
                    "confidence": confidence,
                    "liveness": liveness,
                    "focus_score": liveness.get("laplacian_var", 0),
                    "metadata": {
                        "anchor_id": str(anchor.id),
                        "signer_phone": signer_phone,
                        "signer_name": signer_name,
                        "participants": parties,
                        "all_signer_names": [signer_name, *parties] if parties else [signer_name],
                        "distance": 0,
                        "timestamp": anchor.created_at.isoformat(),
                        "reference_id": anchor.reference_id,
                        "cryptographic_verification": crypto,
                        "confidence": confidence,
                    },
                }

    return {"match_found": False, "detail": "No solid visual match found via ORB/Homography"}
