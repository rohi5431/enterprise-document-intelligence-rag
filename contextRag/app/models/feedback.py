"""
Response Feedback model
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class ResponseFeedback(Base):
    __tablename__ = "response_feedback"

    id = Column(Integer, primary_key=True, index=True)
    feedback_id = Column(String(100), unique=True, nullable=False, index=True)  # UUID
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=True, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=True, unique=True)

    # Content reference
    query_text = Column(Text, nullable=True)
    answer_text = Column(Text, nullable=True)

    # Feedback
    rating = Column(Integer, nullable=True)  # 1-5
    comment = Column(Text, nullable=True)
    is_helpful = Column(Integer, nullable=True)  # 1=yes, 0=no

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="feedbacks")
    message = relationship("ChatMessage", back_populates="feedback")

    def __repr__(self) -> str:
        return f"<ResponseFeedback(id={self.feedback_id!r}, rating={self.rating})>"
