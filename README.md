# 🛡️ SignVerify

**Enterprise-Grade Physical Document Digitization & Cryptographic Proof System**

SignVerify is a high-security platform designed to bridge the gap between physical paper and digital trust. It uses hardware-backed mobile cryptography and multimodal AI to ensure that signatures on physical documents are authentic, untampered, and verifiable across the globe.

---

## 🚀 Vision
In 2026, physical fraud remains a Multi-Billion dollar problem. SignVerify eliminates "Fake Signatures" by binding every physical stroke to a unique, biometric-authorized hardware key hidden inside a user's smartphone.

---

## ✨ Key Features

### 🔐 Hardware-Backed Identity
- **Secure Enclave Integration**: Private keys are generated and stored in isolated hardware (Apple A-Series/M-Series or Android StrongBox).
- **Biometric Authorization**: Every signature requires a real-time FaceID or fingerprint check.
- **ECDSA (secp256r1)**: Standard 2026-spec cryptographic signatures.

### 🧠 Multimodal AI Extraction (Gemini 3 Flash)
- **Semantic Truth**: Automatically extracts Amount, Date, and Parties from raw scans.
- **Fraud Detection**: Cross-references physical text with stored cryptographic commitments.
- **Reference IDs**: 6-digit alphanumeric shortcodes for offline lookup.

### 🔬 High-Fidelity Forensic Verification
- **ORB Feature Matching**: Maps unique physical paper textures for 1-to-1 matching.
- **Perspective Homography**: Projects 4-point AR corners to prove a document's physical layout matches the original.
- **FFT Liveness Detection**: Detects Moiré patterns to block "Screen Replay" or "Photo of a Photo" spoofing attacks.

---

## 🛠️ Tech Stack

### Backend (FastAPI)
- **Language**: Python 3.12+
- **Database**: PostgreSQL (SQLAlchemy Async)
- **AI**: Gemini 1.5/3 Pro & Flash (via Google AI SDK)
- **Computer Vision**: OpenCV (ORB, Homography, FFT)

### Mobile (React Native / Expo)
- **Platform**: iOS & Android
- **Security**: `react-native-biometrics` (Enclave access)
- **Image handling**: `expo-image-manipulator` & `jpeg-js`

---

## 📦 Getting Started

### Backend Setup
1. `cd backend`
2. `python -m venv venv && source venv/bin/activate`
3. `pip install -r requirements.txt`
4. Create `.env`:
   ```env
   DATABASE_URL=postgresql+asyncpg://user:pass@localhost/db
   GOOGLE_API_KEY=your_gemini_api_key
   ```
5. `python main.py`

### Mobile Setup
1. `cd mobile`
2. `npm install`
3. `npx expo start`

---

## 📜 Architecture
```mermaid
graph TD
    A[Physical Document] -->|Scan| B[Mobile App]
    B -->|Biometrics| C[Secure Enclave]
    C -->|Sign| D[Digital Anchor]
    D -->|Post| E[FastAPI Backend]
    E -->|Analyze| F[Gemini AI]
    E -->|Index| G[PostgreSQL]
    H[Verifier App] -->|Search| E
    E -->|Verification Gauntlet| I[Result]
```

---

## 🛡️ License
MIT License - Copyright (c) 2026 Moran Abbas.
