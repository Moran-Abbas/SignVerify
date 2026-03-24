import os
import uuid
import base64

S3_MOCK_DIR = "/tmp/s3_mock"

class S3Service:
    """
    Simulates AWS S3 upload with Object Lock (WORM) capability constraint.
    In a real production environment, this would utilize boto3.
    """
    @staticmethod
    def upload_base64_image(image_base64: str, user_id: str) -> str:
        os.makedirs(S3_MOCK_DIR, exist_ok=True)
        file_name = f"{user_id}_{uuid.uuid4().hex}.jpg"
        file_path = os.path.join(S3_MOCK_DIR, file_name)
        
        # Guard against data URI schemes silently injected by frontends
        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]
            
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(image_base64))
            
        return f"s3://signverify-anchors-mock/{file_name}"

s3_service = S3Service()
