from pydantic import BaseModel, Field


class FirebaseVerify(BaseModel):
    id_token: str

class TokenRefreshRequest(BaseModel):
    """
    Request payload to rotate to a new access + refresh token
    """
    refresh_token: str = Field(..., description="The non-expired long-lived refresh JWT")

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str = ""
