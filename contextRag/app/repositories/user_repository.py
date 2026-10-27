from __future__ import annotations

from typing import List, Optional
from datetime import datetime

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, db: Session) -> None:
        super().__init__(User, db)

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def get_by_id(self, user_id: int) -> Optional[User]:
        return self.get(user_id)

    def get_active_users(self, skip: int = 0, limit: int = 100) -> List[User]:
        return (
            self.db.query(User)
            .filter(User.is_active == True)
            .order_by(desc(User.created_at))
            .offset(skip).limit(limit).all()
        )

    def get_users_with_activity(self, skip: int = 0, limit: int = 100) -> List[dict]:
        from app.models.query_log import QueryLog
        from app.models.chat import ChatSession
        results = (
            self.db.query(
                User.id, User.email, User.full_name, User.role,
                User.is_active, User.created_at, User.last_login_at,
                func.count(QueryLog.id).label("total_queries"),
                func.count(ChatSession.id).label("total_sessions"),
            )
            .outerjoin(QueryLog, QueryLog.user_id == User.id)
            .outerjoin(ChatSession, ChatSession.user_id == User.id)
            .group_by(User.id)
            .order_by(desc(User.created_at))
            .offset(skip).limit(limit).all()
        )
        return [r._asdict() for r in results]

    def update_last_login(self, user_id: int) -> None:
        self.db.query(User).filter(User.id == user_id).update(
            {"last_login_at": datetime.utcnow()}
        )
        self.db.commit()

    def count_by_role(self, role: UserRole) -> int:
        return self.db.query(User).filter(User.role == role).count()

    def total_count(self) -> int:
        return self.db.query(User).count()
