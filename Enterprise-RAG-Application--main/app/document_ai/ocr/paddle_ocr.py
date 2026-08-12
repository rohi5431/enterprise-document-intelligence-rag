import logging
from typing import List, Optional, Any
import numpy as np
from app.document_ai.ocr.ocr_schema import OCRItem, PageOCRResult

logger = logging.getLogger(__name__)

class PaddleOCREngine:
    def __init__(self, lang: str = 'en', use_angle_cls: bool = True):
        self.lang = lang
        self.use_angle_cls = use_angle_cls
        self._ocr = None
        self._init_ocr()

    def _init_ocr(self):
        try:
            from paddleocr import PaddleOCR
            self._ocr = PaddleOCR(use_angle_cls=self.use_angle_cls, lang=self.lang, show_log=False)
            logger.info("PaddleOCR engine initialized successfully.")
        except Exception as e:
            logger.warning(f"PaddleOCR not available or failed initialization: {e}. Will fallback gracefully.")
            self._ocr = None

    def process_image(self, img: np.ndarray, page_num: int = 1, source_id: str = "document") -> PageOCRResult:
        """Runs OCR on image and converts output to normalized OCRItem schema."""
        ocr_items: List[OCRItem] = []
        
        if self._ocr is not None:
            try:
                result = self._ocr.ocr(img, cls=self.use_angle_cls)
                if result and result[0]:
                    for line in result[0]:
                        box, (text, conf) = line
                        # Convert box points [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] to [ymin, xmin, ymax, xmax]
                        xs = [p[0] for p in box]
                        ys = [p[1] for p in box]
                        bbox = [int(min(ys)), int(min(xs)), int(max(ys)), int(max(xs))]
                        
                        ocr_items.append(OCRItem(
                            text=text.strip(),
                            bbox=bbox,
                            confidence=round(float(conf), 3),
                            page=page_num,
                            source=source_id
                        ))
            except Exception as e:
                logger.error(f"Error during PaddleOCR execution: {e}")

        # Fallback if PaddleOCR yielded no items or is not loaded
        if not ocr_items:
            # Fallback to pytesseract or basic fallback if available
            try:
                import pytesseract
                data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
                n_boxes = len(data['text'])
                for i in range(n_boxes):
                    text = data['text'][i].strip()
                    conf = float(data['conf'][i])
                    if text and conf > 0:
                        x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
                        ocr_items.append(OCRItem(
                            text=text,
                            bbox=[y, x, y + h, x + w],
                            confidence=round(conf / 100.0, 3),
                            page=page_num,
                            source=source_id
                        ))
            except Exception:
                pass

        full_text = " ".join([item.text for item in ocr_items])
        avg_conf = (
            sum([item.confidence for item in ocr_items]) / len(ocr_items)
            if ocr_items else 0.0
        )

        return PageOCRResult(
            page=page_num,
            items=ocr_items,
            full_text=full_text,
            average_confidence=round(avg_conf, 3)
        )
