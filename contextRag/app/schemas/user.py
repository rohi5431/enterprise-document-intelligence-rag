from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    role: UserRole = UserRole.USER


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None
    role: UserRole | None = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int
    page: int
    page_size: int
