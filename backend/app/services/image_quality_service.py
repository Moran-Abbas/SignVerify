import cv2
import numpy as np
from typing import Optional, Dict, Any
from pydantic import BaseModel
from app.config import settings

class QualityResult(BaseModel):
    score: float
    passed: bool
    details: Dict[str, Any]

class ImageQualityValidator:
    def validate(self, image_bytes: bytes) -> QualityResult:
        """
        Computes composite quality score based on blur, brightness, and resolution.
        """
        # Decode image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return QualityResult(
                score=0.0,
                passed=False,
                details={"error": "Failed to decode image bytes"}
            )

        # ── Pre-processing ──────────────────────────────────
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        height, width = img.shape[:2]
        
        # ── Blur Detection (Laplacian Variance) ──────────────
        # High variance = sharp, Low variance = blurry
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        is_blurry = laplacian_var < settings.MIN_LAPLACIAN_VAR

        # ── Brightness Check ──────────────────────────────
        mean_brightness = np.mean(gray)
        is_too_dark = mean_brightness < settings.MIN_BRIGHTNESS
        is_too_bright = mean_brightness > settings.MAX_BRIGHTNESS

        # ── Resolution Check ──────────────────────────────
        # Reject images smaller than 640x480 for forensic validity
        is_low_res = (width < 640 or height < 480)

        # ── Composite Score (0.0 - 1.0) ───────────────────
        # Normalized Laplacian: 1.0 at 120.0+, linearly down to 0 at 0.0
        norm_lap = min(1.0, laplacian_var / 120.0)
        
        # Normalized Brightness: 1.0 in the "sweet spot" (80-180), down at edges
        sweet_spot_start, sweet_spot_end = 80.0, 180.0
        if sweet_spot_start <= mean_brightness <= sweet_spot_end:
            norm_bright = 1.0
        elif mean_brightness < sweet_spot_start:
            norm_bright = max(0.0, mean_brightness / sweet_spot_start)
        else:
            norm_bright = max(0.0, (255.0 - mean_brightness) / (255.0 - sweet_spot_end))

        # Composite Score (50% sharp, 50% lighting)
        score = (0.5 * norm_lap) + (0.5 * norm_bright)
        
        # Low res penalizes heavily
        if is_low_res:
            score *= 0.5

        # ── Passed Decision ───────────────────────────────
        passed = (not is_blurry) and (not is_too_dark) and (not is_too_bright) and (not is_low_res)

        return QualityResult(
            score=float(score),
            passed=passed,
            details={
                "laplacian_variance": float(laplacian_var),
                "mean_brightness": float(mean_brightness),
                "resolution": [width, height],
                "flags": {
                    "is_blurry": bool(is_blurry),
                    "is_too_dark": bool(is_too_dark),
                    "is_too_bright": bool(is_too_bright),
                    "is_low_res": bool(is_low_res)
                }
            }
        )

image_quality_service = ImageQualityValidator()
