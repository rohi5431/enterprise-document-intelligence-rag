"""
Integration Tests — validates Multi-turn RAG Chat API endpoints and auth flows
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.core.security import hash_password


@pytest.fixture(name="auth_headers")
def fixture_auth_headers(db: Session, client: TestClient) -> dict[str, str]:
    # Seed user in DB
    user = User(
        email="apiuser@rag.com",
        hashed_password=hash_password("testpassword123"),
        role=UserRole.USER,
        is_active=True,
    )
    db.add(user)
    db.commit()

    # Login via API
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "apiuser@rag.com", "password": "testpassword123"},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_chat_message_success(client: TestClient, auth_headers: dict[str, str]):
    # Post first query
    resp = client.post(
        "/api/v1/chat/message",
        json={"query": "What is hybrid search?", "top_k": 5, "final_top_k": 3},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "answer" in data
    assert "session_id" in data
    assert "feedback_id" in data
    assert "citations" in data
    
    session_id = data["session_id"]
    feedback_id = data["feedback_id"]

    # Post follow-up query in same session
    resp2 = client.post(
        "/api/v1/chat/message",
        json={"query": "And how is it evaluated?", "session_id": session_id},
        headers=auth_headers,
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["session_id"] == session_id
    assert data2["feedback_id"] != feedback_id
