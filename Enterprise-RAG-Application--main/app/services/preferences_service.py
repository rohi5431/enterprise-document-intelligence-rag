"""
User preferences service
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.user_preferences import UserPreferences


class PreferencesService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_or_create(self, user_id: int) -> UserPreferences:
        prefs = self.db.query(UserPreferences).filter(
            UserPreferences.user_id == user_id
        ).first()
        if not prefs:
            prefs = UserPreferences(user_id=user_id)
            self.db.add(prefs)
            self.db.commit()
            self.db.refresh(prefs)
        return prefs

    def update(self, user_id: int, **kwargs) -> UserPreferences:
        prefs = self.get_or_create(user_id)
        for key, value in kwargs.items():
            if hasattr(prefs, key) and value is not None:
                setattr(prefs, key, value)
        self.db.commit()
        self.db.refresh(prefs)
        return prefs
