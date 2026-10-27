"""
Conversation Memory Service
Handles multi-turn context, rolling summaries, and context window management.
"""
from __future__ import annotations

import uuid
from typing import List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ForbiddenException, NotFoundException
from app.core.logger import get_logger
from app.models.chat import ChatSession, ChatMessage, MessageRole
from app.repositories.conversation_repository import ConversationRepository

logger = get_logger(__name__)


class ConversationService:
    def __init__(self, db: Session) -> None:
        self.repo = ConversationRepository(db)

    def get_or_create_session(
        self, user_id: int, session_id: Optional[int] = None, title: Optional[str] = None
    ) -> ChatSession:
        if session_id:
            session = self.repo.get_session(session_id)
            if not session:
                raise NotFoundException("ChatSession", session_id)
            if session.user_id != user_id:
                raise ForbiddenException("Session does not belong to user")
            return session
        return self.repo.create_session(user_id=user_id, title=title)

    def build_context_prompt(self, session: ChatSession, query: str) -> str:
        """
        Build a conversation context prefix:
        [Summary if exists] + [Last N messages] + [Current query]
        """
        parts: List[str] = []

        # 1. Rolling summary
        if session.summary:
            parts.append(f"[Conversation Summary]\n{session.summary}\n")

        # 2. Recent messages
        messages = self.repo.get_recent_messages(
            session.id, limit=settings.MAX_CONVERSATION_MESSAGES
        )
        if messages:
            history_lines = []
            for msg in messages:
                role_label = "User" if msg.role == MessageRole.USER else "Assistant"
                history_lines.append(f"{role_label}: {msg.content}")
            parts.append("[Recent Conversation]\n" + "\n".join(history_lines))

        return "\n\n".join(parts) if parts else ""

    def save_turn(
        self,
        session: ChatSession,
        query: str,
        answer: str,
        sources: list,
        feedback_id: str,
        retrieval_ms: int,
        llm_ms: int,
        confidence: int,
    ) -> ChatMessage:
        # Save user message
        self.repo.add_message(
            session_id=session.id,
            role=MessageRole.USER,
            content=query,
        )
        # Save assistant message
        assistant_msg = self.repo.add_message(
            session_id=session.id,
            role=MessageRole.ASSISTANT,
            content=answer,
            sources=sources,
            feedback_id=feedback_id,
            retrieval_latency_ms=retrieval_ms,
            llm_latency_ms=llm_ms,
            confidence_score=confidence,
        )
        # Auto-summarize if threshold reached
        if session.message_count >= settings.SUMMARY_TRIGGER_COUNT:
            self._maybe_summarize(session)
        return assistant_msg

    def _maybe_summarize(self, session: ChatSession) -> None:
        """Generate a rolling summary using Ollama if message count hits threshold."""
        try:
            from rag.llm.ollama_client import OllamaClient
            from app.core.config import settings as cfg
            messages = self.repo.get_all_messages(session.id)
            if not messages:
                return
            history = "\n".join(
                f"{m.role.value.upper()}: {m.content[:300]}" for m in messages[-20:]
            )
            prompt = (
                f"Summarize the following conversation concisely (max 200 words):\n\n{history}"
            )
            client = OllamaClient(base_url=cfg.OLLAMA_BASE_URL, model=cfg.OLLAMA_MODEL)
            summary = client.generate(prompt, max_tokens=300)
            self.repo.update_session_summary(session.id, summary)
            logger.info("session_summarized", session_id=session.id)
        except Exception as exc:
            logger.warning("summarization_failed", error=str(exc))

    def get_user_sessions(self, user_id: int, skip: int = 0, limit: int = 20):
        return self.repo.get_user_sessions(user_id, skip, limit)

    def get_session_messages(self, session_id: int, user_id: int):
        session = self.repo.get_session(session_id)
        if not session:
            raise NotFoundException("ChatSession", session_id)
        if session.user_id != user_id:
            raise ForbiddenException()
        return self.repo.get_all_messages(session_id)
