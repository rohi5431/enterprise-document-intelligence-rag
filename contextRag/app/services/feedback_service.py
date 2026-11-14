from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException
from app.core.logger import get_logger
from app.models.feedback import ResponseFeedback
from app.repositories.feedback_repository import FeedbackRepository
from app.schemas.feedback import FeedbackSubmit

logger = get_logger(__name__)


class FeedbackService:
    def __init__(self, db: Session) -> None:
        self.repo = FeedbackRepository(db)

    def create_slot(
        self,
        user_id: Optional[int],
        session_id: Optional[int],
        message_id: Optional[int],
        query_text: str,
        answer_text: str,
    ) -> str:
        """Pre-allocate a feedback slot and return its UUID."""
        feedback_id = str(uuid.uuid4())
        fb = ResponseFeedback(
            feedback_id=feedback_id,
            user_id=user_id,
            session_id=session_id,
            message_id=message_id,
            query_text=query_text,
            answer_text=answer_text,
        )
        self.repo.create(fb)
        return feedback_id

    def submit(
        self,
        feedback_id: str,
        req: FeedbackSubmit,
        user_id: Optional[int] = None,
        is_admin: bool = False,
    ) -> ResponseFeedback:
        fb = self.repo.update_feedback(
            feedback_id=feedback_id,
            rating=req.rating,
            comment=req.comment,
            is_helpful=req.is_helpful,
            user_id=user_id,
            is_admin=is_admin,
        )
        if not fb:
            raise NotFoundException("Feedback")
        logger.info("feedback_submitted", feedback_id=feedback_id, rating=req.rating)
        return fb

    def get(
        self,
        feedback_id: str,
        user_id: Optional[int] = None,
        is_admin: bool = False,
    ) -> ResponseFeedback:
        fb = self.repo.get_by_feedback_id(feedback_id, user_id, is_admin)
        if not fb:
            raise NotFoundException("Feedback")
        return fb

    def list_feedback(self, skip: int = 0, limit: int = 50, user_id: Optional[int] = None):
        return self.repo.list_feedback(skip, limit, user_id)

    def get_stats(self) -> dict:
        return self.repo.get_stats()
