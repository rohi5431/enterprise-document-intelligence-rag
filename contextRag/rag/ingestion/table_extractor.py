"""
Table Extractor — extracts tables from PDFs using pdfplumber (primary) and camelot (fallback).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


class TableExtractor:
    """Extract tabular data from PDF documents."""

    def extract(self, file_path: str) -> List[Dict[str, Any]]:
        tables = self._extract_pdfplumber(file_path)
        if not tables:
            tables = self._extract_camelot(file_path)
        return tables

    def _extract_pdfplumber(self, file_path: str) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        try:
            import pdfplumber

            with pdfplumber.open(file_path) as pdf:
                for page_idx, page in enumerate(pdf.pages):
                    for table_idx, table in enumerate(page.extract_tables() or []):
                        if not table or len(table) < 2:
                            continue
                        cleaned = [[str(cell or "").strip() for cell in row] for row in table]
                        text = self._table_to_text(cleaned)
                        results.append({
                            "page_number": page_idx + 1,
                            "table_index": table_idx,
                            "table_data": cleaned,
                            "table_text": text,
                            "extraction_method": "pdfplumber",
                        })
            logger.info("pdfplumber extracted %d tables from %s", len(results), file_path)
            return results
        except ImportError:
            logger.debug("pdfplumber not installed")
            return []
        except Exception as exc:
            logger.warning("pdfplumber extraction failed: %s", exc)
            return []

    def _extract_camelot(self, file_path: str) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        try:
            import camelot

            tables = camelot.read_pdf(file_path, pages="all", flavor="lattice")
            for idx, table in enumerate(tables):
                df = table.df
                rows = df.values.tolist()
                cleaned = [[str(cell).strip() for cell in row] for row in rows]
                text = self._table_to_text(cleaned)
                results.append({
                    "page_number": table.page,
                    "table_index": idx,
                    "table_data": cleaned,
                    "table_text": text,
                    "extraction_method": "camelot",
                })
            logger.info("camelot extracted %d tables from %s", len(results), file_path)
            return results
        except ImportError:
            logger.debug("camelot not installed")
            return []
        except Exception as exc:
            logger.warning("camelot extraction failed: %s", exc)
            return []

    @staticmethod
    def _table_to_text(rows: List[List[str]]) -> str:
        lines = [" | ".join(row) for row in rows if any(row)]
        return "\n".join(lines)
