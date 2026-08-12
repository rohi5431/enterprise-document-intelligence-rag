"""
OCR Loader — extracts text from scanned PDFs and images via Tesseract.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class OCRLoader:
    """OCR text extraction using Tesseract (pytesseract + Pillow)."""

    SUPPORTED_IMAGE_EXT = {"png", "jpg", "jpeg", "tiff", "bmp", "webp"}

    def extract_from_image(self, file_path: str) -> List[Dict[str, Any]]:
        try:
            from app.document_ai.vision.image_utils import preprocess_document_image
            from app.document_ai.ocr.paddle_ocr import PaddleOCREngine
            from app.document_ai.layout.layout_parser import LayoutAnalyzer

            # Step 1: Preprocess image using OpenCV
            preprocessed_img = preprocess_document_image(file_path)

            # Step 2: OCR with PaddleOCR
            ocr_engine = PaddleOCREngine()
            ocr_res = ocr_engine.process_image(preprocessed_img, page_num=1, source_id=file_path)

            # Step 3: Layout analysis
            layout_analyzer = LayoutAnalyzer()
            layout_res = layout_analyzer.analyze_page(ocr_res, img_shape=preprocessed_img.shape)

            if not ocr_res.full_text:
                return []

            return [{
                "text": ocr_res.full_text,
                "page_number": 1,
                "metadata": {
                    "source": file_path,
                    "ocr": True,
                    "avg_confidence": ocr_res.average_confidence,
                    "layout_blocks": [b.dict() for b in layout_res.blocks]
                }
            }]
        except Exception as exc:
            logger.error("Multimodal Document AI image extraction failed: %s", exc)
            # Fallback to standard Tesseract
            try:
                import pytesseract
                from PIL import Image
                img = Image.open(file_path)
                text = pytesseract.image_to_string(img).strip()
                if not text:
                    return []
                return [{"text": text, "page_number": 1, "metadata": {"source": file_path, "ocr": True}}]
            except Exception as fallback_exc:
                logger.error("Standard OCR fallback failed: %s", fallback_exc)
                return []

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

                pix = page.get_pixmap(dpi=200)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                ocr_text = pytesseract.image_to_string(img).strip()
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
