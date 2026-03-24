"""
SignVerify Backend – Users Router

Endpoints for registering a public key (post-onboarding) and looking up
public keys for the verifier flow.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from uuid import UUID

from app.database import get_db
from app.models.user import User
from app.models.public_key import PublicKey
from app.schemas.user import UserUpdate, UserResponse, PublicKeyResponse
from app.middleware.auth_middleware import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("/register-key", response_model=UserResponse)
async def register_public_key(
    request: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Register the ECDSA public key for the authenticated user.
    This completes the onboarding flow. Supports key rotation natively.
    """
    # Deactivate existing active keys for this user
    await db.execute(
        update(PublicKey)
        .where(PublicKey.user_id == current_user.id)
        .where(PublicKey.is_active == True)
        .values(is_active=False)
    )

    # Insert new active key
    new_key = PublicKey(
        user_id=current_user.id,
        public_key_pem=request.public_key,
        is_active=True
    )
    db.add(new_key)
    
    await db.commit()
    await db.refresh(current_user)
    
    return current_user


@router.get("/{user_id}/public-key", response_model=PublicKeyResponse)
async def get_public_key(
    user_id: UUID, 
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve the ACTIVE public key for a specific user ID.
    Used by the Verifier flow to validate signatures securely.
    """
    stmt = select(PublicKey).where(
        PublicKey.user_id == user_id,
        PublicKey.is_active == True
    )
    result = await db.execute(stmt)
    key_record = result.scalars().first()
    
    if not key_record:
        raise HTTPException(status_code=404, detail="User has no active registered public key")
        
    return PublicKeyResponse(public_key=key_record.public_key_pem)

