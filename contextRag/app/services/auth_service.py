"""
Authentication Service
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from jose import JWTError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, UnauthorizedException
from app.core.logger import get_logger
from app.core.security import (
    create_access_token, create_refresh_token, decode_token,
    hash_password, verify_password,
)
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.auth import RegisterRequest, TokenResponse
from app.core.config import settings

logger = get_logger(__name__)


class AuthService:
    def __init__(self, db: Session) -> None:
        self.repo = UserRepository(db)

    def register(self, req: RegisterRequest) -> User:
        if self.repo.get_by_email(req.email):
            raise ConflictException(f"Email {req.email!r} already registered")
        user = User(
            email=req.email,
            hashed_password=hash_password(req.password),
            full_name=req.full_name,
            role=UserRole.USER,
        )
        user = self.repo.create(user)
        logger.info("user_registered", user_id=user.id, email=user.email)
        return user

    def login(self, email: str, password: str) -> TokenResponse:
        user = self.repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise UnauthorizedException("Invalid credentials")
        if not user.is_active:
            raise UnauthorizedException("Account is disabled")
        self.repo.update_last_login(user.id)
        access = create_access_token(
            subject=user.id,
            extra={"email": user.email, "role": user.role.value}
        )
        refresh = create_refresh_token(subject=user.id)
        logger.info("user_login", user_id=user.id)
        return TokenResponse(
            access_token=access,
            refresh_token=refresh,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    def refresh(self, refresh_token: str) -> TokenResponse:
        try:
            payload = decode_token(refresh_token)
            if payload.get("type") != "refresh":
                raise UnauthorizedException("Invalid token type")
            user_id = int(payload["sub"])
        except (JWTError, ValueError, KeyError):
            raise UnauthorizedException("Invalid or expired refresh token")

        user = self.repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise UnauthorizedException("User not found or inactive")

        access = create_access_token(
            subject=user.id,
            extra={"email": user.email, "role": user.role.value}
        )
        new_refresh = create_refresh_token(subject=user.id)
        return TokenResponse(
            access_token=access,
            refresh_token=new_refresh,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    def get_current_user(self, user_id: int) -> User:
        user = self.repo.get_by_id(user_id)
        if not user:
            raise UnauthorizedException("User not found")
        return user
