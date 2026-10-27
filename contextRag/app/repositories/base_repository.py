"""
Generic base repository with common CRUD operations
"""
from __future__ import annotations

from typing import Generic, List, Optional, Type, TypeVar

from sqlalchemy.orm import Session

from app.db.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    def __init__(self, model: Type[ModelT], db: Session) -> None:
        self.model = model
        self.db = db

    def get(self, id: int) -> Optional[ModelT]:
        return self.db.query(self.model).filter(self.model.id == id).first()

    def get_all(self, skip: int = 0, limit: int = 100) -> List[ModelT]:
        return self.db.query(self.model).offset(skip).limit(limit).all()

    def count(self) -> int:
        return self.db.query(self.model).count()

    def create(self, obj: ModelT) -> ModelT:
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return obj

    def update(self, obj: ModelT) -> ModelT:
        self.db.commit()
        self.db.refresh(obj)
        return obj

    def delete(self, obj: ModelT) -> bool:
        self.db.delete(obj)
        self.db.commit()
        return True

    def bulk_create(self, objs: List[ModelT]) -> List[ModelT]:
        self.db.add_all(objs)
        self.db.commit()
        return objs
