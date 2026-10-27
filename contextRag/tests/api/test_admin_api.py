"""
API Tests — validates Admin endpoints and Role-Based Access Control (RBAC)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.core.security import hash_password


@pytest.fixture(name="user_token")
def fixture_user_token(db: Session, client: TestClient) -> str:
    user = User(
        email="regularuser@rag.com",
        hashed_password=hash_password("testpassword123"),
        role=UserRole.USER,
        is_active=True,
    )
    db.add(user)
    db.commit()

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "regularuser@rag.com", "password": "testpassword123"},
    )
    return resp.json()["access_token"]


@pytest.fixture(name="admin_token")
def fixture_admin_token(db: Session, client: TestClient) -> str:
    admin = User(
        email="adminuser@rag.com",
        hashed_password=hash_password("testpassword123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(admin)
    db.commit()

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "adminuser@rag.com", "password": "testpassword123"},
    )
    return resp.json()["access_token"]


def test_regular_user_access_forbidden(client: TestClient, user_token: str):
    # Regular user attempting admin endpoint should receive 403 Forbidden
    resp = client.get(
        "/api/v1/admin/stats",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 403
    assert "detail" in resp.json()


def test_admin_user_access_success(client: TestClient, admin_token: str):
    # Admin user accessing admin routes successfully
    resp = client.get(
        "/api/v1/admin/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total_users" in data
    assert "total_documents" in data


def test_admin_get_users(client: TestClient, admin_token: str):
    resp = client.get(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "users" in data
    assert "total" in data


def test_admin_get_feedback(client: TestClient, admin_token: str):
    resp = client.get(
        "/api/v1/admin/feedback",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "feedback" in data
    assert "total" in data
