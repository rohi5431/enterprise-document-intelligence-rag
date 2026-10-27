"""
User preferences — LLM provider, query expansion, debug panel toggles.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db.base import Base


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    llm_provider = Column(String(20), default="ollama")  # ollama | openai | gemini
    llm_model = Column(String(100), nullable=True)
    query_expansion_enabled = Column(Boolean, default=True)
    show_retrieval_diagnostics = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="preferences")
