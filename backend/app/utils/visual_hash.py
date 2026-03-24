"""
Perceptual dHash (difference hash) on decoded image pixels — aligns with mobile jpeg-js dHash.
64 bits -> 16 lowercase hex characters.
"""
from __future__ import annotations

import base64
from typing import Optional

import cv2
import numpy as np


def dhash_hex_from_grayscale(gray: np.ndarray) -> str:
    """Compute dHash from 2D uint8 grayscale image (any size)."""
    if gray is None or gray.size == 0:
        return "0" * 16
    small = cv2.resize(gray, (9, 8), interpolation=cv2.INTER_AREA)
    bits: list[int] = []
    for y in range(8):
        for x in range(8):
            bits.append(1 if int(small[y, x]) > int(small[y, x + 1]) else 0)
    out = 0
    for i, b in enumerate(bits):
        if b:
            out |= 1 << (63 - i)
    return f"{out:016x}"


def dhash_hex_from_image_bytes(image_bytes: bytes) -> Optional[str]:
    """Decode image bytes (JPEG/PNG) and return dHash hex, or None if decode fails."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    return dhash_hex_from_grayscale(img)


def dhash_hex_from_base64_data_uri_or_raw(b64: str) -> Optional[str]:
    """Strip data-URI prefix if present; decode JPEG/PNG from base64."""
    clean = b64.split(",")[-1] if "," in b64 else b64
    try:
        raw = base64.b64decode(clean, validate=True)
    except Exception:
        return None
    return dhash_hex_from_image_bytes(raw)


def hamming_hex64(a: str, b: str) -> int:
    """Hamming distance between two 16-char hex strings (64 bits)."""
    if len(a) != 16 or len(b) != 16:
        return 64
    try:
        return (int(a, 16) ^ int(b, 16)).bit_count()
    except ValueError:
        return 64
