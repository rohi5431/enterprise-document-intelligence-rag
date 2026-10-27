from typing import Generator
from sqlalchemy.orm import Session
from app.db.session import get_db

# Re-export for FastAPI Depends injection
__all__ = ["get_db"]
