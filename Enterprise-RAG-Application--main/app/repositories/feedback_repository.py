from __future__ import annotations

from typing import List, Optional
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.models.feedback import ResponseFeedback


class FeedbackRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, feedback: ResponseFeedback) -> ResponseFeedback:
        self.db.add(feedback)
        self.db.commit()
        self.db.refresh(feedback)
        return feedback

    def get_by_feedback_id(self, feedback_id: str) -> Optional[ResponseFeedback]:
        return (
            self.db.query(ResponseFeedback)
            .filter(ResponseFeedback.feedback_id == feedback_id).first()
        )

    def update_feedback(
        self, feedback_id: str, rating: int, comment: Optional[str], is_helpful: Optional[int]
    ) -> Optional[ResponseFeedback]:
        fb = self.get_by_feedback_id(feedback_id)
        if fb:
            fb.rating = rating
            fb.comment = comment
            fb.is_helpful = is_helpful
            self.db.commit()
            self.db.refresh(fb)
        return fb

    def list_feedback(
        self, skip: int = 0, limit: int = 50, user_id: Optional[int] = None
    ) -> List[ResponseFeedback]:
        q = self.db.query(ResponseFeedback)
        if user_id:
            q = q.filter(ResponseFeedback.user_id == user_id)
        return q.order_by(desc(ResponseFeedback.created_at)).offset(skip).limit(limit).all()

    def get_stats(self) -> dict:
        total = self.db.query(ResponseFeedback).count()
        submitted = self.db.query(ResponseFeedback).filter(
            ResponseFeedback.rating.isnot(None)
        ).count()
        avg_rating = self.db.query(func.avg(ResponseFeedback.rating)).scalar() or 0.0
        return {"total": total, "submitted": submitted, "avg_rating": round(float(avg_rating), 2)}
