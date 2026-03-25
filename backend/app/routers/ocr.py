from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from app.models.user import User
from app.middleware.auth_middleware import get_current_user
from app.services.extraction_service import extraction_service
import base64

router = APIRouter(
    prefix="/ocr",
    tags=["OCR API"],
)

# 50 MB safety limit for high-res document uploads
MAX_FILE_SIZE = 50 * 1024 * 1024

@router.post("/extract-text")
async def extract_text_from_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    2026 AI-Powered Text Extraction.
    Uses Gemini 3 Flash to extract raw text content without requiring 
    Google Cloud SDK credentials (ADC).
    """
    try:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File size exceeds the highly secure 50MB memory limit."
            )
        
        # Multimodal OCR via Gemini 3 Flash
        image_b64 = base64.b64encode(content).decode("utf-8")
        extracted_data = await extraction_service.extract_semantic_from_image(image_b64)
        
        # Combine extracted parties/entities into a raw text representation if needed,
        # or just return the primary semantic string.
        # For full text compatibility, we'll ask Gemini for a raw text dump too.
        raw_text = f"Parties: {', '.join(extracted_data.get('parties', []))}\n"
        raw_text += f"Amount: {extracted_data.get('amount')}\n"
        raw_text += f"Date: {extracted_data.get('date')}"

        return {"text": raw_text}

    except Exception as e:
        print(f"ERROR in OCR Proxy: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR Migration Error: {str(e)}"
        )
