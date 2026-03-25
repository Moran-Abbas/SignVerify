import json
import base64
from datetime import datetime
from google import genai
from google.genai import types
from app.config import settings

class ExtractionService:
    def __init__(self):
        # Configure the modern AI client using the API key from settings
        self.api_key = settings.GOOGLE_API_KEY
        self.client = None
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)

    async def extract_semantic_from_image(self, image_base64: str) -> dict:
        """
        Multimodal Extraction: Directly processes the base64 image with Gemini 3 Flash
        to extract structured 'Truth'. This is the standard for 2026 SignVerify anchoring.
        """
        if not self.client or not image_base64:
            return self._get_fallback_data()

        # Strip data URI prefix if present
        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]

        current_date = datetime.now().strftime("%Y-%m-%d")
        prompt = f"""
        You are a forensic document analyzer. Analyze this document image meticulously.
        Extract the core 'Semantic Truth' as a structured JSON object.
        
        Today's Date (Reference): {current_date}

        Instructions:
        1. amount: The total numerical value mentioned in the document. If multiple amounts, pick the "Final Total" or "Amount Due". 
        2. currency: ISO 4217 code (USD, ILS, EUR, etc.). If not visible, guess based on context/entities.
        3. date: Primary date in YYYY-MM-DD format. IMPORTANT: If no date is found or unclear, use {current_date}. NEVER use 1970-01-01.
        4. parties: Array of names/entities (Signers, Recipients, Issuers).
        5. confidence: A float from 0.0 to 1.0 representing your certainty that the numbers (amount/date) were read correctly.
        
        Rules:
        - If a field is not explicitly visible but can be logically inferred, include it.
        - Return ONLY valid JSON. 
        - DO NOT guess 23.0 for the amount unless it's clearly on the paper.
        - If text is blurry or handwriting is ambiguous, lower the confidence score.
        """
        
        try:
            # Decode base64 to bytes for the multimodal part
            image_data = base64.b64decode(image_base64)
            
            # Using Gemini 3 Flash for peak 2026-standard intelligence
            response = await self.client.aio.models.generate_content(
                model='gemini-3-flash-preview',
                contents=[
                    types.Part.from_bytes(
                        data=image_data,
                        mime_type="image/jpeg"
                    ),
                    prompt
                ]
            )
            
            return self._parse_json_response(response.text)
        except Exception as e:
            print(f"[ExtractionService] Gemini 3 Multimodal error: {str(e)}")
            return self._get_fallback_data()

    async def extract_semantic_truth(self, raw_ocr: str) -> dict:
        """
        Legacy/Text-only Extraction: Extracts structured JSON from raw OCR text.
        """
        if not self.client or not raw_ocr:
            return self._get_fallback_data()

        prompt = f"""
        Extract a structured 'Truth' JSON object from the following raw OCR text.
        
        Raw OCR Text:
        {raw_ocr}
        
        Required JSON Format:
        {{
            "amount": float,
            "currency": "ISO code",
            "date": "YYYY-MM-DD",
            "parties": [],
            "confidence": float
        }}
        """
        
        try:
            response = await self.client.aio.models.generate_content(
                model='gemini-3-flash-preview',
                contents=prompt
            )
            return self._parse_json_response(response.text)
        except Exception as e:
            print(f"[ExtractionService] Text extraction error: {str(e)}")
            return self._get_fallback_data()

    def _parse_json_response(self, text: str) -> dict:
        if not text:
            return self._get_fallback_data()
            
        # Strip potential markdown wrappers
        clean_text = text.strip()
        if clean_text.startswith("```"):
            clean_text = clean_text.split("\n", 1)[1] if "\n" in clean_text else clean_text
            clean_text = clean_text.rsplit("```", 1)[0].strip()
        if clean_text.startswith("json"):
            clean_text = clean_text.split("json", 1)[1].strip()
        
        try:
            data = json.loads(clean_text)
            fallback = self._get_fallback_data()
            
            # 2026 Validation Layer: Guard against '1970-01-01' hallucinations
            current_date = fallback["date"]
            if data.get("date") == "1970-01-01" or not data.get("date"):
                data["date"] = current_date
            
            # Ensure required keys exist and are not null
            for key in ["amount", "currency", "date", "parties", "confidence"]:
                if data.get(key) is None:
                    data[key] = fallback[key]
            
            # Ensure amount and confidence are floats
            try:
                data["amount"] = float(data["amount"])
                data["confidence"] = float(data.get("confidence", 0.0))
            except:
                data["amount"] = fallback["amount"]
                data["confidence"] = 0.0
                
            return data
        except Exception as e:
            print(f"[ExtractionService] JSON parse error: {str(e)} | Raw: {text}")
            return self._get_fallback_data()

    async def verify_document_id(self, image_base64: str, expected_id: str) -> bool:
        """
        Targeted Multimodal Verification: Specifically looks for a Reference ID 
        on the physical document. used for High-Confidence Production Verification.
        """
        if not self.client or not image_base64 or not expected_id:
            return False

        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]

        prompt = f"""
        Does the alphanumeric shortcode "{expected_id}" appear anywhere on this document image?
        
        Answer ONLY: "YES" if it definitely appears, or "NO" if it is not visible.
        Look closely at corners, headers, or any stamped/printed IDs.
        """
        
        try:
            image_data = base64.b64decode(image_base64)
            response = await self.client.aio.models.generate_content(
                model='gemini-3-flash-preview',
                contents=[
                    types.Part.from_bytes(data=image_data, mime_type="image/jpeg"),
                    prompt
                ]
            )
            
            answer = response.text.strip().upper()
            print(f"[ExtractionService] Semantic ID Check for {expected_id}: {answer}")
            return "YES" in answer
        except Exception as e:
            print(f"[ExtractionService] ID Verification error: {str(e)}")
            # 2026 Re-hardening: return False on error to trigger manual reference check
            return False 
            
    def reconcile_semantic(self, signed: dict, scanned: dict) -> dict:
        """
        Forensic Reconciliation: Compares the 'Truth' of the signed document
        against the newly 'read' truth of the scanned frame.
        
        This prevents the '$54.50 -> $5.45' forgery reported in 2026.
        """
        is_amount_match = False
        is_date_match = False
        
        # 1. Amount Check (with 1.0% tolerance for OCR jitter)
        s_amt = float(signed.get("amount", 0.0))
        n_amt = float(scanned.get("amount", 0.0))
        
        if s_amt > 0 and n_amt > 0:
            diff = abs(s_amt - n_amt)
            # Threshold: 1% variation is acceptable for jitter, 
            # but $54.50 vs $5.45 is a 90% variation.
            is_amount_match = diff <= (s_amt * 0.01)
        elif s_amt == 0 and n_amt == 0:
            is_amount_match = True
            
        # 2. Date Check
        s_date = str(signed.get("date", "")).strip()
        n_date = str(scanned.get("date", "")).strip()
        is_date_match = (s_date == n_date)
        
        # Determine status
        # Critical Fix: If the signed document has a value, it MUST match the scan.
        if s_amt > 0 and not is_amount_match:
            print(f"[Forensic] FORGERY DETECTED: Amount mismatch (Signed: {s_amt}, Scanned: {n_amt})")
            return {
                "status": "forged", 
                "reason": f"AMOUNT_MISMATCH: Signed value {s_amt} does not match current scan {n_amt}."
            }
        
        # For now, we Log but don't hard-reject on Date mismatch (too much OCR noise)
        if s_date and not is_date_match:
            print(f"[Forensic] Date Mismatch Warning: Signed: {s_date}, Scanned: {n_date}")
        
        return {
            "status": "passed", 
            "is_amount_match": is_amount_match, 
            "is_date_match": is_date_match
        }

    def _get_fallback_data(self) -> dict:
        return {
            "amount": 0.0,
            "currency": "UNKNOWN",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "parties": [],
            "confidence": 0.0
        }

extraction_service = ExtractionService()
