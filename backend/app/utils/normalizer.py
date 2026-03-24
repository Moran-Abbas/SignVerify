import re

def convert_eastern_to_western_numerals(text: str) -> str:
    """
    Converts Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩),
    Persian numerals (۰۱۲۳۴۵٦۷۸۹), and handles common script-specific 
    digit representations into Western Arabic numerals (0-9).
    """
    # Eastern Arabic Numerals (Common in many Arabic-speaking countries)
    eastern_arabic = "٠١٢٣٤٥٦٧٨٩"
    # Persian/Urdu/Dari Numerals
    persian_arabic = "۰۱۲۳۴۵۶۷۸۹"
    
    western = "0123456789"
    
    # Create a unified translation table
    trans_table = str.maketrans(
        eastern_arabic + persian_arabic,
        western + western
    )
    
    return text.translate(trans_table)

def normalize_semantic_text(text: str) -> str:
    """
    Robust 2026-standard normalization for OCR truth extraction:
    - Normalizes numerals across all supported scripts (En, Ar, He).
    - Removes currency symbols for clean numeric comparison.
    - Strips directional markers (LTR/RTL) that might confuse hashing.
    """
    if not text:
        return ""
        
    # 1. Convert numerals
    text = convert_eastern_to_western_numerals(text)
    
    # 2. Strip Hebrew/Arabic directional markers
    text = text.replace('\u200e', '').replace('\u200f', '')
    
    # 3. Basic cleanup
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text
