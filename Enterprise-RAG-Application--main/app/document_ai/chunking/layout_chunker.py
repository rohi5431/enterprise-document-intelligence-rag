from typing import List, Dict, Any
import uuid
from app.document_ai.layout.layout_schema import PageLayoutResult, LayoutBlock

class LayoutAwareChunker:
    def __init__(self, max_chunk_size: int = 500, overlap: int = 50):
        self.max_chunk_size = max_chunk_size
        self.overlap = overlap

    def chunk_layout_results(
        self,
        layout_results: List[PageLayoutResult],
        doc_id: str,
        source_name: str,
        ocr_used: bool = True
    ) -> List[Dict[str, Any]]:
        """Converts layout blocks into metadata-rich chunks for Qdrant payload insertion."""
        chunks: List[Dict[str, Any]] = []

        current_section = "General"

        for page_res in layout_results:
            page_num = page_res.page

            for block in page_res.blocks:
                if block.block_type in ["title", "header"] and block.text.strip():
                    current_section = block.text.strip()

                text = block.text.strip()
                if not text:
                    continue

                # If text exceeds max_chunk_size, split by sentences or sliding window
                if len(text) > self.max_chunk_size:
                    words = text.split()
                    sub_texts = []
                    current_words = []
                    current_len = 0

                    for w in words:
                        current_words.append(w)
                        current_len += len(w) + 1
                        if current_len >= self.max_chunk_size:
                            sub_texts.append(" ".join(current_words))
                            current_words = current_words[-10:] if len(current_words) > 10 else []
                            current_len = sum([len(x) + 1 for x in current_words])

                    if current_words:
                        sub_texts.append(" ".join(current_words))

                    for idx, sub_txt in enumerate(sub_texts):
                        chunks.append({
                            "id": str(uuid.uuid4()),
                            "document_id": doc_id,
                            "text": sub_txt,
                            "page_number": page_num,
                            "block_type": block.block_type,
                            "bbox": block.bbox,
                            "source": source_name,
                            "ocr_used": ocr_used,
                            "ocr_confidence": block.confidence,
                            "section": current_section,
                            "chunk_index": len(chunks)
                        })
                else:
                    chunks.append({
                        "id": str(uuid.uuid4()),
                        "document_id": doc_id,
                        "text": text,
                        "page_number": page_num,
                        "block_type": block.block_type,
                        "bbox": block.bbox,
                        "source": source_name,
                        "ocr_used": ocr_used,
                        "ocr_confidence": block.confidence,
                        "section": current_section,
                        "chunk_index": len(chunks)
                    })

        return chunks
