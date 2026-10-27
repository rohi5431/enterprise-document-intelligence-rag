"""
OCR Loader — extracts text from scanned PDFs and images via Tesseract.

Handwritten image improvements (Feature 4):
- Multi-step preprocessing: grayscale → contrast enhance → denoise →
  adaptive threshold → deskew.
- Tesseract with PSM 6 (block of text) + OEM 3 (LSTM neural net) for best
  accuracy on handwritten content.
- Confidence detection: marks output as handwritten if avg confidence < 70%.
- Optional LLM cleanup pass (Ollama) to correct OCR artefacts in
  handwritten text when HANDWRITING_OCR_CLEANUP_ENABLED=true.
- Graceful fallback chain: PaddleOCR → Tesseract enhanced → Tesseract basic.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Image pre-processing helpers
# ---------------------------------------------------------------------------

def _preprocess_for_ocr(img):
    """
    Apply a multi-step pipeline to improve OCR accuracy on handwritten images.

    Steps
    -----
    1. Grayscale conversion
    2. Contrast / CLAHE enhancement
    3. Gaussian denoising
    4. Adaptive thresholding (handles uneven lighting in handwriting)
    5. Deskewing (rotate to horizontal baseline)

    Returns the preprocessed image (numpy array, same dtype as input).
    """
    try:
        import cv2
        import numpy as np

        # ── Grayscale ────────────────────────────────────────────────────
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()

        # ── CLAHE contrast enhancement ───────────────────────────────────
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # ── Denoising ────────────────────────────────────────────────────
        denoised = cv2.fastNlMeansDenoising(enhanced, h=10, templateWindowSize=7, searchWindowSize=21)

        # ── Adaptive threshold ────────────────────────────────────────────
        thresh = cv2.adaptiveThreshold(
            denoised, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=11, C=2,
        )

        # ── Deskew ────────────────────────────────────────────────────────
        thresh = _deskew(thresh)

        return thresh

    except Exception as exc:
        logger.debug("Image preprocessing failed (%s), using original", exc)
        return img


def _deskew(img):
    """Rotate the image to correct skew using moments."""
    try:
        import cv2
        import numpy as np

        coords = np.column_stack(np.where(img > 0))
        if len(coords) < 10:
            return img
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        if abs(angle) < 0.5:
            return img
        h, w = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        return rotated
    except Exception:
        return img


def _pillow_from_numpy(arr):
    """Convert numpy array to PIL Image."""
    from PIL import Image
    import numpy as np
    if arr.dtype != np.uint8:
        arr = (arr * 255).astype(np.uint8)
    return Image.fromarray(arr)


def _parse_tesseract_confidence(tsv_output: str) -> float:
    """Parse mean confidence from pytesseract.image_to_data TSV output."""
    try:
        confidences = []
        for line in tsv_output.strip().splitlines()[1:]:
            parts = line.split("\t")
            if len(parts) >= 12:
                conf_str = parts[10]
                if conf_str.lstrip("-").isdigit():
                    conf = int(conf_str)
                    if conf >= 0:
                        confidences.append(conf)
        if confidences:
            return sum(confidences) / len(confidences)
    except Exception:
        pass
    return 50.0  # default to medium confidence


def _llm_ocr_cleanup(raw_text: str) -> str:
    """
    Send raw OCR text to the local Ollama LLM to fix OCR artefacts.
    Used for low-confidence / handwritten text only.
    """
    try:
        from app.core.config import settings
        import httpx

        prompt = (
            "The following text was extracted from a handwritten document using OCR. "
            "It may contain spelling mistakes, broken words, incorrect punctuation, "
            "or garbled characters caused by OCR errors. "
            "Please correct any OCR mistakes and return only the corrected text "
            "without any explanation or commentary:\n\n"
            f"{raw_text[:4000]}"
        )
        response = httpx.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json={"model": settings.OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=60.0,
        )
        if response.status_code == 200:
            data = response.json()
            cleaned = data.get("response", "").strip()
            if cleaned:
                logger.info("OCR cleanup via LLM: %d → %d chars", len(raw_text), len(cleaned))
                return cleaned
    except Exception as exc:
        logger.debug("LLM OCR cleanup failed: %s", exc)
    return raw_text


# ---------------------------------------------------------------------------
# Main OCR Loader class
# ---------------------------------------------------------------------------

class OCRLoader:
    """OCR text extraction with enhanced handwriting support."""

    SUPPORTED_IMAGE_EXT = {"png", "jpg", "jpeg", "tiff", "bmp", "webp"}

    # ------------------------------------------------------------------
    # Primary image OCR
    # ------------------------------------------------------------------

    def extract_from_image(self, file_path: str) -> List[Dict[str, Any]]:
        """
        Full OCR pipeline for images.

        Tries in order:
        1. PaddleOCR via Document AI (existing path)
        2. Enhanced Tesseract with preprocessing (new handwriting path)
        3. Basic Tesseract (last resort fallback)
        """
        from app.core.config import settings

        # ── Attempt 1: PaddleOCR / Document AI ──────────────────────────
        try:
            from app.document_ai.vision.image_utils import preprocess_document_image
            from app.document_ai.ocr.paddle_ocr import PaddleOCREngine
            from app.document_ai.layout.layout_parser import LayoutAnalyzer

            preprocessed_img = preprocess_document_image(file_path)
            ocr_engine = PaddleOCREngine()
            ocr_res = ocr_engine.process_image(preprocessed_img, page_num=1, source_id=file_path)
            layout_analyzer = LayoutAnalyzer()
            layout_res = layout_analyzer.analyze_page(ocr_res, img_shape=preprocessed_img.shape)

            if ocr_res.full_text:
                avg_confidence = ocr_res.average_confidence or 1.0
                is_handwritten = avg_confidence < settings.OCR_MIN_CONFIDENCE
                return [{
                    "text": ocr_res.full_text,
                    "page_number": 1,
                    "metadata": {
                        "source": file_path,
                        "ocr": True,
                        "ocr_engine": "paddle",
                        "avg_confidence": avg_confidence,
                        "handwritten": is_handwritten,
                        "layout_blocks": [b.dict() for b in layout_res.blocks],
                    }
                }]
        except Exception as exc:
            logger.debug("PaddleOCR path failed: %s — falling back to Tesseract", exc)

        # ── Attempt 2: Enhanced Tesseract + preprocessing ────────────────
        try:
            import pytesseract
            from PIL import Image
            import numpy as np
            import cv2

            img_pil = Image.open(file_path).convert("RGB")
            img_np = np.array(img_pil)

            # Preprocess for handwriting
            processed = _preprocess_for_ocr(img_np)
            processed_pil = _pillow_from_numpy(processed)

            # PSM 6: assume uniform block of text; OEM 3: LSTM only
            custom_config = r"--oem 3 --psm 6"
            raw_text = pytesseract.image_to_string(processed_pil, config=custom_config).strip()

            # Get confidence data
            tsv_data = pytesseract.image_to_data(processed_pil, config=custom_config)
            avg_confidence = _parse_tesseract_confidence(tsv_data)
            is_handwritten = avg_confidence < (settings.OCR_MIN_CONFIDENCE * 100)

            if not raw_text:
                # Also try on the original image in case preprocessing hurt
                raw_text = pytesseract.image_to_string(img_pil, config=custom_config).strip()

            if not raw_text:
                return []

            # Optional LLM cleanup for handwritten / low-confidence text
            final_text = raw_text
            if is_handwritten and settings.HANDWRITING_OCR_CLEANUP_ENABLED:
                logger.info(
                    "Low OCR confidence (%.1f%%) on %s — running LLM cleanup",
                    avg_confidence, Path(file_path).name,
                )
                final_text = _llm_ocr_cleanup(raw_text)

            return [{
                "text": final_text,
                "page_number": 1,
                "metadata": {
                    "source": file_path,
                    "ocr": True,
                    "ocr_engine": "tesseract_enhanced",
                    "avg_confidence": round(avg_confidence / 100.0, 3),
                    "handwritten": is_handwritten,
                    "llm_cleanup_applied": is_handwritten and settings.HANDWRITING_OCR_CLEANUP_ENABLED,
                }
            }]

        except Exception as exc:
            logger.warning("Enhanced Tesseract OCR failed: %s", exc)

        # ── Attempt 3: Basic Tesseract fallback ──────────────────────────
        try:
            import pytesseract
            from PIL import Image
            img = Image.open(file_path)
            text = pytesseract.image_to_string(img).strip()
            if not text:
                return []
            return [{
                "text": text,
                "page_number": 1,
                "metadata": {
                    "source": file_path,
                    "ocr": True,
                    "ocr_engine": "tesseract_basic",
                    "handwritten": False,
                }
            }]
        except Exception as fallback_exc:
            logger.error("All OCR strategies failed for %s: %s", file_path, fallback_exc)
            return []

    # ------------------------------------------------------------------
    # Scanned PDF OCR
    # ------------------------------------------------------------------

    def extract_from_scanned_pdf(self, file_path: str) -> List[Dict[str, Any]]:
        """Render PDF pages to images and OCR each page."""
        pages: List[Dict[str, Any]] = []
        try:
            import fitz
            import pytesseract
            from PIL import Image
            import io

            doc = fitz.open(file_path)
            for i, page in enumerate(doc):
                text = page.get_text("text").strip()
                if len(text) > 50:
                    pages.append({
                        "text": text,
                        "page_number": i + 1,
                        "metadata": {"source": file_path, "ocr": False},
                    })
                    continue

                # Render at higher DPI for handwriting
                pix = page.get_pixmap(dpi=300)
                img_pil = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")

                # Try enhanced OCR first
                try:
                    import numpy as np
                    img_np = _preprocess_for_ocr(img_pil if not hasattr(img_pil, 'shape') else img_pil)
                    if hasattr(img_pil, 'shape'):
                        img_np = _preprocess_for_ocr(img_pil)
                    else:
                        import numpy as np
                        img_np = _preprocess_for_ocr(np.array(img_pil))
                    processed_pil = _pillow_from_numpy(img_np)
                    ocr_text = pytesseract.image_to_string(
                        processed_pil, config="--oem 3 --psm 6"
                    ).strip()
                except Exception:
                    ocr_text = pytesseract.image_to_string(img_pil).strip()

                if ocr_text:
                    pages.append({
                        "text": ocr_text,
                        "page_number": i + 1,
                        "metadata": {"source": file_path, "ocr": True},
                    })
            doc.close()
            return pages
        except ImportError:
            logger.warning("OCR dependencies not installed")
            return []
        except Exception as exc:
            logger.error("OCR PDF extraction failed: %s", exc)
            return []

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def needs_ocr(self, file_path: str, file_type: str) -> bool:
        ext = file_type.lower().lstrip(".")
        if ext in self.SUPPORTED_IMAGE_EXT:
            return True
        if ext == "pdf":
            try:
                import fitz
                doc = fitz.open(file_path)
                total_text = sum(len(doc[i].get_text("text").strip()) for i in range(min(3, len(doc))))
                doc.close()
                return total_text < 100
            except Exception:
                return False
        return False

    def load(self, file_path: str, file_type: str) -> List[Dict[str, Any]]:
        ext = file_type.lower().lstrip(".")
        if ext in self.SUPPORTED_IMAGE_EXT:
            return self.extract_from_image(file_path)
        if ext == "pdf":
            return self.extract_from_scanned_pdf(file_path)
        return []
