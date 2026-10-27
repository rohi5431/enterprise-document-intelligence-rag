import logging
from typing import List, Optional
import numpy as np
from app.document_ai.ocr.ocr_schema import PageOCRResult, OCRItem
from app.document_ai.layout.layout_schema import LayoutBlock, PageLayoutResult

logger = logging.getLogger(__name__)

class LayoutAnalyzer:
    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name
        self._lp_model = None
        self._init_model()

    def _init_model(self):
        if self.model_name:
            try:
                import layoutparser as lp
                self._lp_model = lp.AutoLayoutModel(self.model_name)
                logger.info(f"LayoutParser model {self.model_name} initialized.")
            except Exception as e:
                logger.warning(f"Failed to load LayoutParser model ({e}). Using geometric heuristic layout parser.")
                self._lp_model = None

    def analyze_page(self, page_ocr: PageOCRResult, img_shape: Optional[tuple] = None) -> PageLayoutResult:
        """Associates OCR text items with document layout blocks (Title, Header, Paragraph, Table)."""
        blocks: List[LayoutBlock] = []
        page_num = page_ocr.page

        if not page_ocr.items:
            return PageLayoutResult(page=page_num, blocks=[])

        # If image shape provided, sort items by vertical baseline
        sorted_items = sorted(page_ocr.items, key=lambda item: (item.bbox[0], item.bbox[1]))

        # Group OCR items into layout blocks based on vertical spatial proximity
        current_block_items: List[OCRItem] = []
        current_type = "paragraph"

        for idx, item in enumerate(sorted_items):
            if not current_block_items:
                current_block_items.append(item)
                continue

            last_item = current_block_items[-1]
            vertical_gap = item.bbox[0] - last_item.bbox[2]

            # Heuristic logic for block boundaries:
            # Large vertical gap or font/text characteristics trigger block split
            if vertical_gap > 35 or (len(item.text) < 40 and item.text.isupper()):
                # Finalize previous block
                block_text = " ".join([it.text for it in current_block_items])
                min_ymin = min([it.bbox[0] for it in current_block_items])
                min_xmin = min([it.bbox[1] for it in current_block_items])
                max_ymax = max([it.bbox[2] for it in current_block_items])
                max_xmax = max([it.bbox[3] for it in current_block_items])

                # Determine block type
                if min_ymin < 100 and len(block_text) < 80:
                    b_type = "header"
                elif len(block_text) < 60 and (block_text.istitle() or block_text.isupper()):
                    b_type = "title"
                elif "table" in block_text.lower() or "|" in block_text or "\t" in block_text:
                    b_type = "table"
                else:
                    b_type = "paragraph"

                blocks.append(LayoutBlock(
                    block_id=f"p{page_num}_b{len(blocks)+1}",
                    page=page_num,
                    block_type=b_type,
                    bbox=[min_ymin, min_xmin, max_ymax, max_xmax],
                    text=block_text,
                    confidence=round(sum([it.confidence for it in current_block_items]) / len(current_block_items), 3),
                    section=block_text[:30] if b_type in ["title", "header"] else None
                ))

                current_block_items = [item]
            else:
                current_block_items.append(item)

        # Final block flush
        if current_block_items:
            block_text = " ".join([it.text for it in current_block_items])
            min_ymin = min([it.bbox[0] for it in current_block_items])
            min_xmin = min([it.bbox[1] for it in current_block_items])
            max_ymax = max([it.bbox[2] for it in current_block_items])
            max_xmax = max([it.bbox[3] for it in current_block_items])

            blocks.append(LayoutBlock(
                block_id=f"p{page_num}_b{len(blocks)+1}",
                page=page_num,
                block_type="paragraph" if len(block_text) > 60 else "title",
                bbox=[min_ymin, min_xmin, max_ymax, max_xmax],
                text=block_text,
                confidence=round(sum([it.confidence for it in current_block_items]) / len(current_block_items), 3)
            ))

        return PageLayoutResult(page=page_num, blocks=blocks)
