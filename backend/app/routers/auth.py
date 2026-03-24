"""
SignVerify Backend – Auth Router

Endpoints for requesting OTPs and verifying them to receive JWTs.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.schemas.auth import FirebaseVerify, TokenResponse, TokenRefreshRequest
from app.services import otp_service, jwt_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(request: FirebaseVerify, db: AsyncSession = Depends(get_db)):
    """
    Verify the Firebase ID Token. If valid, register the user (if new)
    and return access and refresh JWTs.
    """
    try:
        verified_phone = otp_service.verify_token(request.id_token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )
        
    # Check if user exists based on verified phone number
    stmt = select(User).where(User.phone_number == verified_phone)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        # Create new user
        user = User(phone_number=verified_phone, is_verified=True)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Ensure verified flag is set
        if not user.is_verified:
            user.is_verified = True
            await db.commit()
            
    # Generate tokens
    access_token = jwt_service.create_access_token(user.id)
    refresh_token = jwt_service.create_refresh_token(user.id)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=str(user.id)
    )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: TokenRefreshRequest, db: AsyncSession = Depends(get_db)):
    """
    Rotates the session tokens natively. Expects a valid `refresh` typed JWT
    and returns a fresh access/refresh pair to prevent silent session expirations.
    """
    try:
        payload = jwt_service.decode_token(request.refresh_token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid refresh token: {str(e)}",
        )
        
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is not a valid refresh token",
        )
        
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid token subject"
        )
        
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user or not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="User not found or inactive"
        )

    # Generate new tokens
    access_token = jwt_service.create_access_token(user.id)
    new_refresh_token = jwt_service.create_refresh_token(user.id)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user_id=str(user.id)
    )
