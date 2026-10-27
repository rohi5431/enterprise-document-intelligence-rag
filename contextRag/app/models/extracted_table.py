"""
Extracted table storage — tables parsed from PDF documents.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, JSON

from app.db.base import Base


class ExtractedTable(Base):
    __tablename__ = "extracted_tables"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    page_number = Column(Integer, nullable=True)
    table_index = Column(Integer, default=0)
    table_data = Column(JSON, nullable=False)  # rows as list of lists
    table_text = Column(Text, nullable=True)   # flattened text for search
    extraction_method = Column(String(50), default="pdfplumber")

    created_at = Column(DateTime, default=datetime.utcnow)
