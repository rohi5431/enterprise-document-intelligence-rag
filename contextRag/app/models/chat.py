"""
Chat Session and Message models for multi-turn conversations
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Enum, JSON, Boolean
from sqlalchemy.orm import relationship

from app.db.base import Base


class MessageRole(str, PyEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(500), nullable=True)
    summary = Column(Text, nullable=True)  # rolling conversation summary
    message_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    session_metadata = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_message_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="chat_sessions")
    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at"
    )

    def __repr__(self) -> str:
        return f"<ChatSession(id={self.id}, user_id={self.user_id}, msgs={self.message_count})>"


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Enum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    token_count = Column(Integer, default=0)

    # RAG metadata for assistant messages
    sources = Column(JSON, default=list)  # citations
    feedback_id = Column(String(100), nullable=True)  # for feedback linking
    retrieval_latency_ms = Column(Integer, nullable=True)
    llm_latency_ms = Column(Integer, nullable=True)
    confidence_score = Column(Integer, nullable=True)  # 0-100

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    session = relationship("ChatSession", back_populates="messages")
    feedback = relationship("ResponseFeedback", back_populates="message", uselist=False)

    def __repr__(self) -> str:
        return f"<ChatMessage(id={self.id}, session_id={self.session_id}, role={self.role})>"
