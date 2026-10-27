"""
Unit Tests — validates auth_service user register, login, and JWT logic
"""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, UnauthorizedException
from app.schemas.auth import RegisterRequest
from app.services.auth_service import AuthService


def test_register_user(db: Session):
    service = AuthService(db)
    req = RegisterRequest(
        email="testuser@rag.com",
        password="testpassword123",
        full_name="Test User",
    )
    user = service.register(req)
    assert user.id is not None
    assert user.email == "testuser@rag.com"


def test_register_duplicate_email(db: Session):
    service = AuthService(db)
    req = RegisterRequest(
        email="duplicate@rag.com",
        password="testpassword123",
        full_name="Duplicate User",
    )
    service.register(req)
    
    with pytest.raises(ConflictException):
        service.register(req)


def test_login_success(db: Session):
    service = AuthService(db)
    req = RegisterRequest(
        email="login@rag.com",
        password="secretpassword",
        full_name="Login User",
    )
    service.register(req)
    
    tokens = service.login("login@rag.com", "secretpassword")
    assert tokens.access_token is not None
    assert tokens.refresh_token is not None


def test_login_invalid_credentials(db: Session):
    service = AuthService(db)
    req = RegisterRequest(
        email="loginfail@rag.com",
        password="secretpassword",
        full_name="Login Fail User",
    )
    service.register(req)
    
    with pytest.raises(UnauthorizedException):
        service.login("loginfail@rag.com", "wrongpassword")
        
    with pytest.raises(UnauthorizedException):
        service.login("notexists@rag.com", "secretpassword")
