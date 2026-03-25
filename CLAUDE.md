# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SignVerify** is an enterprise-grade physical document digitization and cryptographic signing system. Users sign physical documents using hardware-backed ECDSA keys (Secure Enclave/Keystore), and verifiers can later authenticate those documents using visual + cryptographic verification.

## Commands

### Backend (FastAPI)

```bash
cd backend

# Setup
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run dev server
uvicorn main:app --reload --port 8000

# Database migrations
alembic upgrade head
alembic revision --autogenerate -m "description"

# Run all tests
pytest tests/

# Run a single test file
pytest tests/test_signing.py

# Run a single test
pytest tests/test_signing.py::test_function_name -v
```

### Mobile (React Native / Expo)

```bash
cd mobile

# Install dependencies
npm install

# Start Expo dev server
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android

# Build with EAS
eas build --platform ios
eas build --platform android
```

## Architecture

### Core Cryptographic Flow

**Signing (mobile → backend):**
1. User scans physical document with native document scanner (perspective correction applied)
2. Gemini 3 Flash AI extracts semantic fields: amount, currency, date, parties
3. SHA-256 hash computed from normalized document text (Policy v2: deterministic binary hash)
4. Biometric auth unlocks private key in Secure Enclave/Keystore — key never leaves device
5. ECDSA secp256r1 signature produced on device
6. `POST /anchors/sign` sends: `image_base64`, `digital_signature`, `payload_json`, `transaction_uuid`
7. Backend verifies signature, runs image quality gate, stores `DocumentAnchor` with phash + binding_vhash

**Verification (mobile → backend):**
1. Verifier scans document; client computes perceptual hash (dhash)
2. `GET /signatures/search?hash=<phash>` — backend finds candidates within Hamming distance 14
3. Backend runs ORB feature matching (≥15 matches, ≥8 inliers, ratio 0.35)
4. Perspective homography computed → 4-point AR overlay sent back to mobile
5. FFT liveness check rejects re-photographs of screens (Moiré detection, freq ratio threshold 2.8)
6. ECDSA cryptographic attestation re-verifies signature over stored `signed_payload_json`

### Backend Structure (`backend/`)

- `main.py` — FastAPI app init, CORS, security headers, router registration
- `app/config.py` — All settings via `pydantic-settings` (DB URL, JWT, Twilio, Google Cloud, image quality thresholds)
- `app/database.py` — Async PostgreSQL engine via `asyncpg`
- `app/models/` — SQLAlchemy ORM: `User`, `PublicKey`, `DocumentAnchor`, `ForensicLog`
- `app/routers/anchors.py` — Primary signing endpoint (`POST /anchors/sign`) and semantic extraction
- `app/routers/search.py` — Full verification pipeline (visual search → ORB → homography → liveness → crypto)
- `app/services/crypto_service.py` — PEM normalization, polymorphic signature verification (RSA or ECDSA)
- `app/services/extraction_service.py` — Gemini 3 Flash multimodal extraction
- `app/services/image_quality_service.py` — Laplacian blur, brightness, resolution scoring
- `app/utils/visual_hash.py` — dhash (64-bit difference hash), Hamming distance

### Mobile Structure (`mobile/src/`)

- `screens/ScannerScreen.tsx` — Full signing flow orchestration
- `screens/VerifierScannerScreen.tsx` — Full verification flow with dual camera (text + QR)
- `services/keyManager.ts` — Secure Enclave ECDSA key lifecycle
- `services/imageProcessingService.ts` — JPEG encoding and base64 conversion
- `services/imageQualityService.ts` — Client-side quality pre-check before backend submission
- `components/ARProjectionOverlay.tsx` — Renders perspective homography result as AR overlay
- `config/api.ts` — All API endpoint definitions; base URL from `EXPO_PUBLIC_API_URL` env var

### Key Data Models

**`DocumentAnchor`** — the core binding record:
- `file_hash` (SHA-256 of document text)
- `digital_signature` (ECDSA over `signed_payload_json`)
- `signed_payload_json` (exact JSON that was signed — canonical for verification)
- `phash` / `binding_vhash` (perceptual hashes for visual search)
- `reference_id` (6-digit human-readable code)
- `transaction_uuid` (replay protection — unique constraint)
- `normalized_content` (JSONB semantic fields from Gemini)

**`ForensicLog`** — security event audit trail:
- `event_type`: `TAMPER_ALERT`, `REPLAY_ATTACK`, `SIGNATURE_VIOLATION`

### Security Architecture

- **Replay protection**: `transaction_uuid` with DB uniqueness constraint
- **Image quality gate**: Blocks signing if Laplacian variance, brightness, or resolution below thresholds (configured in `app/config.py`)
- **Liveness detection**: FFT-based Moiré pattern check rejects screen re-photographs during verification
- **JWT**: 10-min access tokens, 7-day refresh; `app/middleware/auth_middleware.py` via `get_current_user()` dependency
- **Forensic logging**: All security violations written to `ForensicLog` before returning errors

### Environment Variables

Backend requires (via `.env` or environment):
- `DATABASE_URL` — async PostgreSQL (`postgresql+asyncpg://...`)
- `SECRET_KEY` — JWT signing key
- `TWILIO_*` — OTP delivery
- `GOOGLE_APPLICATION_CREDENTIALS` — for Gemini + Cloud Vision
- `FIREBASE_*` — Firebase Admin SDK

Mobile requires (`.env` in `mobile/`):
- `EXPO_PUBLIC_API_URL` — defaults to `http://localhost:8000`
