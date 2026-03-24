"""
SignVerify Backend - Pytest Cryptographic Validation Module
Tests standard ECDSA secp256r1 signature verification against SHA-256 document payloads.
"""

import pytest
from ecdsa import SigningKey, VerifyingKey, NIST256p, BadSignatureError
import hashlib
import json

def test_ecdsa_signature_verification():
    # 1. Generate a mock Hardware Keypair (secp256r1 / NIST256p)
    mock_private_key = SigningKey.generate(curve=NIST256p)
    mock_public_key = mock_private_key.get_verifying_key()
    
    # 2. Extract Document Hash
    raw_document_text = "This is a strictly confidential legal contract. Value: $10,000."
    document_hash = hashlib.sha256(raw_document_text.encode('utf-8')).hexdigest()
    
    # 3. Simulate Mobile Device Signing
    # Note: `expo-crypto` and `elliptic` operate on hex strings or raw bytes.
    # We sign the raw hash bytes.
    signature_bytes = mock_private_key.sign(bytes.fromhex(document_hash))
    signature_hex = signature_bytes.hex()
    
    # 4. Simulate Backend/Verifier Context
    # Verify the signature mathematically
    is_valid = False
    try:
        is_valid = mock_public_key.verify(bytes.fromhex(signature_hex), bytes.fromhex(document_hash))
    except BadSignatureError:
        is_valid = False
        
    assert is_valid is True, "Cryptographic verification must pass for a valid signature against the identical payload."


def test_ecdsa_forgery_rejection():
    # 1. Generate Keypair
    mock_private_key = SigningKey.generate(curve=NIST256p)
    
    # 2. Sign Original Document
    raw_document_text = "This is a strictly confidential legal contract. Value: $10,000."
    original_hash = hashlib.sha256(raw_document_text.encode('utf-8')).hexdigest()
    signature_bytes = mock_private_key.sign(bytes.fromhex(original_hash))
    signature_hex = signature_bytes.hex()
    
    # 3. Forger ALTERS the document text
    forged_text = "This is a strictly confidential legal contract. Value: $990,000."
    forged_hash = hashlib.sha256(forged_text.encode('utf-8')).hexdigest()
    
    # 4. Verifier attempts logic against tampered hash
    mock_public_key = mock_private_key.get_verifying_key()
    
    is_valid = False
    try:
        is_valid = mock_public_key.verify(bytes.fromhex(signature_hex), bytes.fromhex(forged_hash))
    except BadSignatureError:
        is_valid = False
        
    assert is_valid is False, "Cryptographic verification MUST fail if the document text was altered."
