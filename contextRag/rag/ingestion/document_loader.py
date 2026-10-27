"""
Document Loader — parses PDF, DOCX, TXT, MD, and image files into page dicts.
"""
from __future__ import annotations

import logging
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Dict, Any

from app.core.config import settings

logger = logging.getLogger(__name__)


class DocumentLoader:
    """Load documents of various formats into page dicts."""

    IMAGE_EXT = {"png", "jpg", "jpeg", "tiff", "bmp", "webp"}

    def load(self, file_path: str, file_type: str) -> List[Dict[str, Any]]:
        ext = file_type.lower().lstrip(".")
        dispatch = {
            "pdf": self._load_pdf,
            "docx": self._load_docx,
            "txt": self._load_txt,
            "md": self._load_md,
        }
        if ext in self.IMAGE_EXT:
            return self._load_image(file_path)
        loader_fn = dispatch.get(ext)
        if not loader_fn:
            raise ValueError(f"Unsupported file type: {ext}")

        pages = loader_fn(file_path)

        if settings.OCR_ENABLED and ext == "pdf" and self._needs_ocr(pages):
            from rag.ingestion.ocr_loader import OCRLoader
            ocr_pages = OCRLoader().extract_from_scanned_pdf(file_path)
            if ocr_pages:
                pages = ocr_pages

        logger.info("document_loaded file=%s pages=%d type=%s", file_path, len(pages), ext)
        return pages

    def _needs_ocr(self, pages: List[Dict[str, Any]]) -> bool:
        if not pages:
            return True
        total_text = sum(len(p.get("text", "")) for p in pages)
        return total_text < 100

    def _load_image(self, file_path: str) -> List[Dict[str, Any]]:
        from rag.ingestion.ocr_loader import OCRLoader
        return OCRLoader().extract_from_image(file_path)

    def _load_pdf(self, file_path: str) -> List[Dict[str, Any]]:
        pages = []
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(file_path)
            for i, page in enumerate(doc):
                text = page.get_text("text").strip()
                if text:
                    pages.append({
                        "text": text,
                        "page_number": i + 1,
                        "metadata": {"source": file_path}
                    })
            doc.close()
            return pages
        except Exception as exc:
            logger.warning("PyMuPDF failed to load PDF, trying PyPDF2: %s", exc)
            
        try:
            import PyPDF2
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for i, page in enumerate(reader.pages):
                    text = (page.extract_text() or "").strip()
                    if text:
                        pages.append({
                            "text": text,
                            "page_number": i + 1,
                            "metadata": {"source": file_path}
                        })
            return pages
        except Exception as exc:
            logger.error("PyPDF2 also failed to load PDF: %s", exc)
            raise ValueError(f"Failed to parse PDF file: {exc}")

    def _load_docx(self, file_path: str) -> List[Dict[str, Any]]:
        """Dependency-free DOCX text extractor by reading xml directly."""
        try:
            paragraphs = []
            with zipfile.ZipFile(file_path) as docx:
                xml_content = docx.read('word/document.xml')
                root = ET.fromstring(xml_content)
                
                # DOCX namespaces
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                
                # Extract text from paragraphs
                for paragraph in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                    texts = [node.text for node in paragraph.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if node.text]
                    if texts:
                        paragraphs.append("".join(texts))
            
            full_text = "\n\n".join(paragraphs).strip()
            if not full_text:
                return []
            
            # Since DOCX doesn't have native physical pages in XML without layout rendering,
            # we treat it as a single page or split it into page-like chunks if very large.
            return [{
                "text": full_text,
                "page_number": 1,
                "metadata": {"source": file_path}
            }]
        except Exception as exc:
            logger.error("Failed to parse DOCX file: %s", exc)
            raise ValueError(f"Failed to parse DOCX file: {exc}")

    def _load_txt(self, file_path: str) -> List[Dict[str, Any]]:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read().strip()
            if not text:
                return []
            return [{
                "text": text,
                "page_number": 1,
                "metadata": {"source": file_path}
            }]
        except Exception as exc:
            logger.error("Failed to parse TXT file: %s", exc)
            raise ValueError(f"Failed to parse TXT file: {exc}")

    def _load_md(self, file_path: str) -> List[Dict[str, Any]]:
        # Markdown can be loaded exactly like plain text
        return self._load_txt(file_path)
