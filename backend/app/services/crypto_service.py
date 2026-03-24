from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa, ec
from cryptography.hazmat.primitives.serialization import load_pem_public_key
import base64

class CryptoService:
    @staticmethod
    def normalize_public_key(pem_str: str) -> str:
        """
        Ensures a public key string is a validly formatted PEM file with correct 
        headers, footers, and line wrapping. Handles raw base64 or single-line PEMs 
        returned by various mobile biometrics libraries.
        """
        pem_str = pem_str.strip()
        
        # 1. Strip all existing headers and whitespace to get raw base64
        content = pem_str
        headers = [
            "-----BEGIN PUBLIC KEY-----", "-----END PUBLIC KEY-----",
            "-----BEGIN RSA PUBLIC KEY-----", "-----END RSA PUBLIC KEY-----",
            "-----BEGIN CERTIFICATE-----", "-----END CERTIFICATE-----"
        ]
        for header in headers:
            content = content.replace(header, "")
        
        content = content.replace("\n", "").replace("\r", "").replace(" ", "").strip()
        
        # 2. Re-wrap at 64 characters (Standard PEM requirement)
        lines = [content[i:i+64] for i in range(0, len(content), 64)]
        
        # 3. Construct standard PEM
        return "-----BEGIN PUBLIC KEY-----\n" + "\n".join(lines) + "\n-----END PUBLIC KEY-----\n"

    @staticmethod
    def verify_signature(public_key_pem: str, signature_base64: str, data: bytes) -> bool:
        """
        Polymorphic signature verification supporting RSA and ECDSA.
        Returns True if valid, raises InvalidSignature if invalid.
        """
        normalized_pem = CryptoService.normalize_public_key(public_key_pem)
        public_key = load_pem_public_key(normalized_pem.encode('utf-8'))
        sig_bytes = base64.b64decode(signature_base64)

        if isinstance(public_key, rsa.RSAPublicKey):
            # react-native-biometrics on iOS uses PKCS1v1.5 + SHA256 by default
            public_key.verify(
                sig_bytes,
                data,
                padding.PKCS1v15(),
                hashes.SHA256()
            )
            return True
        elif isinstance(public_key, ec.EllipticCurvePublicKey):
            # Standard ECDSA (Secure Enclave EC keys)
            public_key.verify(
                sig_bytes,
                data,
                ec.ECDSA(hashes.SHA256())
            )
            return True
        else:
            raise ValueError(f"Unsupported key type: {type(public_key)}")

crypto_service = CryptoService()
