from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.models.signing_log import SigningLog
from app.schemas.document import SigningLogCreate, SigningLogResponse
from app.middleware.auth_middleware import get_current_user

router = APIRouter(prefix="/signing", tags=["Signing Events"])

@router.post("/log", response_model=SigningLogResponse, status_code=status.HTTP_201_CREATED)
async def log_signing_event(
    payload: SigningLogCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Log a new physical document signing event.
    
    Receives only identical metadata and cryptographic hashes (never the raw document).
    Requires a valid JWT Access Token (User must be verified to sign).
    """

    # Create the db record
    new_log = SigningLog(
        user_id=current_user.id,
        document_hash=payload.document_hash,
        digital_signature=payload.digital_signature,
        signer_public_key_id=payload.signer_public_key_id
    )

    db.add(new_log)
    try:
        await db.commit()
        await db.refresh(new_log)
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to log signing event: {str(e)}"
        )

    return new_log
