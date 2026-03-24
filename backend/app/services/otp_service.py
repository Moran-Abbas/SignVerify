"""
SignVerify Backend – Firebase Auth Service

Verifies Firebase ID tokens returned by the React Native client after
Phone Authentication succeeds.
"""

import logging
import firebase_admin
from firebase_admin import credentials, auth

logger = logging.getLogger(__name__)

try:
    if not firebase_admin._apps:
        # User requested explicitly loading from absolute path
        cred = credentials.Certificate('/Users/moranabbas/Desktop/Moran_Files/SignVerify/backend/firebase-adminsdk.json')
        firebase_admin.initialize_app(cred)
except Exception as e:
    logger.error(f"Failed to initialize Firebase Admin SDK: {e}")

def verify_token(id_token: str) -> str:
    """
    Verify the provided Firebase ID token.
    Returns the verified phone_number.
    """
    try:
        decoded_token = auth.verify_id_token(id_token)
        phone_number = decoded_token.get("phone_number")
        if not phone_number:
            raise ValueError("Token missing phone_number payload")
        return phone_number
    except Exception as e:
        logger.error(f"Firebase verification failed: {str(e)}")
        raise ValueError(f"Invalid Firebase token: {str(e)}")
