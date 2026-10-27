from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from app.core.exceptions import UnauthorizedException
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserResponse
from app.services.auth_service import AuthService
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user account."""
    user = AuthService(db).register(req)
    return user



@router.post("/login", response_model=TokenResponse)
def login(
    req: LoginRequest,
    db: Session = Depends(get_db),
):
    """Authenticate and receive JWT tokens."""
    return AuthService(db).login(
        req.email,
        req.password,
    )

@router.post("/token", response_model=TokenResponse)
def token_login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    return AuthService(db).login(
        form_data.username,
        form_data.password,
    )

@router.post("/refresh", response_model=TokenResponse)
def refresh(req: RefreshRequest, db: Session = Depends(get_db)):
    """Refresh access token using refresh token."""
    return AuthService(db).refresh(req.refresh_token)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """Return current authenticated user profile."""
    return current_user
