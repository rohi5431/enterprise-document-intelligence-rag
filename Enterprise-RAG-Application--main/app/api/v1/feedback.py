from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.feedback import FeedbackResponse, FeedbackSubmit
from app.services.feedback_service import FeedbackService

router = APIRouter(prefix="/feedback", tags=["Feedback"])


@router.post("/{feedback_id}", response_model=FeedbackResponse)
def submit_feedback(
    feedback_id: str,
    req: FeedbackSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit feedback for a RAG response."""
    return FeedbackService(db).submit(feedback_id, req, user_id=current_user.id)


@router.get("/{feedback_id}", response_model=FeedbackResponse)
def get_feedback(
    feedback_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get feedback by ID."""
    return FeedbackService(db).get(feedback_id)
