from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.chat import ChatMessage, ChatSession, MessageRole
from app.repositories.base_repository import BaseRepository


class ConversationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Sessions ──────────────────────────────────────────────────────────────

    def create_session(self, user_id: int, title: Optional[str] = None) -> ChatSession:
        session = ChatSession(user_id=user_id, title=title)
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def get_session(self, session_id: int) -> Optional[ChatSession]:
        return self.db.query(ChatSession).filter(ChatSession.id == session_id).first()

    def get_user_sessions(
        self, user_id: int, skip: int = 0, limit: int = 20
    ) -> List[ChatSession]:
        return (
            self.db.query(ChatSession)
            .filter(ChatSession.user_id == user_id, ChatSession.is_active == True)
            .order_by(desc(ChatSession.updated_at))
            .offset(skip).limit(limit).all()
        )

    def update_session_summary(self, session_id: int, summary: str) -> None:
        self.db.query(ChatSession).filter(ChatSession.id == session_id).update(
            {"summary": summary, "updated_at": datetime.utcnow()}
        )
        self.db.commit()

    def update_session_title(self, session_id: int, title: str) -> None:
        self.db.query(ChatSession).filter(ChatSession.id == session_id).update(
            {"title": title}
        )
        self.db.commit()

    def increment_message_count(self, session_id: int) -> None:
        session = self.get_session(session_id)
        if session:
            session.message_count += 1
            session.last_message_at = datetime.utcnow()
            session.updated_at = datetime.utcnow()
            self.db.commit()

    def deactivate_session(self, session_id: int) -> None:
        self.db.query(ChatSession).filter(ChatSession.id == session_id).update(
            {"is_active": False}
        )
        self.db.commit()

    # ── Messages ──────────────────────────────────────────────────────────────

    def add_message(
        self,
        session_id: int,
        role: MessageRole,
        content: str,
        sources: Optional[list] = None,
        feedback_id: Optional[str] = None,
        retrieval_latency_ms: Optional[int] = None,
        llm_latency_ms: Optional[int] = None,
        confidence_score: Optional[int] = None,
        token_count: int = 0,
    ) -> ChatMessage:
        msg = ChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            sources=sources or [],
            feedback_id=feedback_id,
            retrieval_latency_ms=retrieval_latency_ms,
            llm_latency_ms=llm_latency_ms,
            confidence_score=confidence_score,
            token_count=token_count,
        )
        self.db.add(msg)
        self.db.commit()
        self.db.refresh(msg)
        self.increment_message_count(session_id)
        return msg

    def get_recent_messages(
        self, session_id: int, limit: int = 10
    ) -> List[ChatMessage]:
        return (
            self.db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(desc(ChatMessage.created_at))
            .limit(limit).all()[::-1]  # reverse to chronological
        )

    def get_all_messages(self, session_id: int) -> List[ChatMessage]:
        return (
            self.db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at).all()
        )

    def get_message_by_feedback_id(self, feedback_id: str) -> Optional[ChatMessage]:
        return (
            self.db.query(ChatMessage)
            .filter(ChatMessage.feedback_id == feedback_id).first()
        )
