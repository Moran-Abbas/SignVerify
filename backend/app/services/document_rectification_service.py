import cv2
import numpy as np
import base64
from typing import Optional, Tuple, List
from pydantic import BaseModel

class RectificationResult(BaseModel):
    passed: bool
    rectified_image: Optional[str] = None  # Base64 string
    confidence: float
    details: dict

class DocumentRectificationService:
    @staticmethod
    def _order_points(pts: np.ndarray) -> np.ndarray:
        """
        Orders points in [top-left, top-right, bottom-right, bottom-left] 
        order for perspective transform.
        """
        rect = np.zeros((4, 2), dtype="float32")
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        
        return rect

    async def rectify(self, image_bytes: bytes) -> RectificationResult:
        """
        Detects document edges and performs 4-point perspective transform.
        Returns a canonical 1024x1024 rectified image.
        """
        # Decode image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return RectificationResult(
                passed=False, 
                confidence=0.0, 
                details={"error": "Failed to decode image bytes"}
            )

        orig = img.copy()
        height, width = img.shape[:2]
        
        # ── Pre-processing ──────────────────────────────────
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edged = cv2.Canny(blur, 75, 200)

        # ── Contour Detection ───────────────────────────────
        cnts, _ = cv2.findContours(edged.copy(), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        cnts = sorted(cnts, key=cv2.contourArea, reverse=True)[:5]

        doc_cnt = None
        for c in cnts:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            
            if len(approx) == 4:
                doc_cnt = approx
                break

        if doc_cnt is None:
            return RectificationResult(
                passed=False,
                confidence=0.0,
                details={"error": "No 4-corner document detected", "contours_found": len(cnts)}
            )

        # ── Perspective Transform ──────────────────────────
        rect = self._order_points(doc_cnt.reshape(4, 2))
        
        # Target: Canonical 1024x1024
        dst = np.array([
            [0, 0],
            [1023, 0],
            [1023, 1023],
            [0, 1023]], dtype="float32")

        M = cv2.getPerspectiveTransform(rect, dst)
        warped = cv2.warpPerspective(orig, M, (1024, 1024))

        # ── Confidence Calculation ─────────────────────────
        # Heuristic: Ratio of detected doc area to total image area
        doc_area = cv2.contourArea(doc_cnt)
        total_area = width * height
        coverage = doc_area / total_area
        
        # Convexity check
        is_convex = cv2.isContourConvex(doc_cnt)
        
        confidence = coverage * (1.0 if is_convex else 0.5)
        
        # Encode result
        _, buffer = cv2.imencode('.jpg', warped, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        rectified_base64 = base64.b64encode(buffer).decode('utf-8')

        return RectificationResult(
            passed=True,
            rectified_image=rectified_base64,
            confidence=float(confidence),
            details={
                "original_size": [width, height],
                "coverage_ratio": float(coverage),
                "is_convex": bool(is_convex),
                "transform_method": "OpenCV-4Point"
            }
        )

rectification_service = DocumentRectificationService()
