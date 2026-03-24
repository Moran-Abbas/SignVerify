"""
SignVerify Backend – Application Configuration

Loads environment variables via Pydantic BaseSettings.
Validates required Twilio, database, and JWT credentials at startup.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List


class Settings(BaseSettings):
    # ── Database ────────────────────────────────────────────
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://user:password@localhost:5432/signverify",
        description="Async PostgreSQL connection string",
    )

    # ── JWT ─────────────────────────────────────────────────
    SECRET_KEY: str = Field(
        default="CHANGE-ME-IN-PRODUCTION",
        description="HMAC secret for JWT signing",
    )
    ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=10,
        description="Short-lived access token expiry (SKILL.md: 'expire quickly')",
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)

    # ── Twilio ──────────────────────────────────────────────
    TWILIO_ACCOUNT_SID: str = Field(default="")
    TWILIO_AUTH_TOKEN: str = Field(default="")
    TWILIO_PHONE_NUMBER: str = Field(default="")

    # ── OTP ─────────────────────────────────────────────────
    OTP_LENGTH: int = Field(default=6)
    OTP_EXPIRE_SECONDS: int = Field(
        default=300,
        description="OTP validity window (5 minutes)",
    )

    # ── Google Cloud / Vertex AI ─────────────────────────────
    GOOGLE_API_KEY: str = Field(default="", description="Gemini LLM API Key")
    GOOGLE_CLOUD_PROJECT: str = Field(default="", description="GCP Project ID")

    # ── Firebase ──────────────────────────────────────────
    FIREBASE_PROJECT_ID: str = Field(default="", description="Firebase Project ID")

    # ── API Security/Hardening ──────────────────────────────
    CORS_ALLOW_ORIGINS: List[str] = Field(
        default=["http://localhost:8081", "http://localhost:19006"],
        description="Explicit list of trusted frontend origins",
    )
    MAX_VERIFY_IMAGE_BASE64_CHARS: int = Field(
        default=2_500_000,
        description="Reject oversized base64 payloads to reduce abuse and OOM risk",
    )

    # ── Image Quality Thresholds ───────────────────────────
    MIN_LAPLACIAN_VAR: float = Field(
        default=60.0,
        description="Threshold for blur detection (higher = stricter)",
    )
    MIN_BRIGHTNESS: float = Field(
        default=40.0,
        description="Minimum mean brightness (0-255)",
    )
    MAX_BRIGHTNESS: float = Field(
        default=250.0,
        description="Maximum mean brightness (0-255)",
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
