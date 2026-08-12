from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field


class FeedbackSubmit(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)
    is_helpful: int | None = Field(default=None, ge=0, le=1)


class FeedbackResponse(BaseModel):
    id: int
    feedback_id: str
    user_id: int | None
    session_id: int | None
    rating: int | None
    comment: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
