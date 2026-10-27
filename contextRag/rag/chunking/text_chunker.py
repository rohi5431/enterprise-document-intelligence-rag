"""
Text Chunker — splits documents into manageable overlapping chunks while preserving page alignment
"""
from __future__ import annotations

import logging
from typing import List, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)


class TextChunker:
    """Chunks text using RecursiveCharacterTextSplitter, mapping offsets to original pages."""

    def __init__(self, chunk_size: int = 512, overlap: int = 64) -> None:
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=overlap,
            length_function=len,
        )
        # Try importing tiktoken for token counting, otherwise fallback
        try:
            import tiktoken
            self.encoder = tiktoken.get_encoding("cl100k_base")
        except ImportError:
            self.encoder = None

    def chunk(self, full_text: str, doc_id: int, pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Split the text and assign each chunk to its corresponding page.
        To avoid page misalignment, we chunk each page individually.
        """
        chunks: List[Dict[str, Any]] = []
        sequence_number = 1

        for page in pages:
            page_text = page["text"]
            page_num = page["page_number"]
            page_meta = page.get("metadata", {})

            # Split text on this page
            split_texts = self.splitter.split_text(page_text)

            for text in split_texts:
                stripped_text = text.strip()
                if not stripped_text:
                    continue

                token_count = self._count_tokens(stripped_text)
                
                chunks.append({
                    "text": stripped_text,
                    "sequence_number": sequence_number,
                    "page_number": page_num,
                    "token_count": token_count,
                    "tags": [],
                    "metadata": {
                        **page_meta,
                        "doc_id": doc_id,
                        "page_number": page_num,
                    }
                })
                sequence_number += 1

        logger.info(
        f"chunking_complete doc_id={doc_id} total_chunks={len(chunks)}"
        )
        return chunks

    def _count_tokens(self, text: str) -> int:
        if self.encoder:
            return len(self.encoder.encode(text, disallowed_special=()))
        # Fallback: estimate 1 token ≈ 4 characters or ~0.75 words
        return len(text.split())