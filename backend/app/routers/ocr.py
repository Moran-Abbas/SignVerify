from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from google.cloud import vision
from app.models.user import User
from app.middleware.auth_middleware import get_current_user

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
    Secure Proxy for Google Cloud Vision OCR.
    Accepts a multipart image upload, processes strictly in memory,
    and returns the raw extracted text payload.
    """
    try:
        # 1. Enforce strict memory constraints to prevent DoS payloads
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File size exceeds the highly secure 5MB memory limit."
            )
        
        # 2. Strict in-memory parsing (No FS persistence to protect document PII)
        client = vision.ImageAnnotatorClient()
        image = vision.Image(content=content)

        # 3. Request Google Cloud Vision document extraction
        response = client.document_text_detection(image=image)
        
        if response.error.message:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Vision API Error: {response.error.message}"
            )
            
        full_text = response.full_text_annotation.text

        # 4. Return strictly text. Memory buffer terminates cleanly.
        return {"text": full_text}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = f"OCR Error: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_msg
        )
