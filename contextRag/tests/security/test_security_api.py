from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy.orm import Session

from app.core.config import Settings, settings
from app.core.security import create_access_token, hash_password, verify_password
from app.api.v1.chat import _filter_authorized_sources
from app.models.chat import ChatMessage, ChatSession, MessageRole
from app.models.document import Document
from app.models.feedback import ResponseFeedback
from app.models.user import User, UserRole
from app.services.document_service import DocumentService


def create_user(db: Session, email: str, role: UserRole = UserRole.USER) -> User:
    user = User(
        email=email,
        full_name=email.split("@")[0],
        hashed_password=hash_password("safe-test-password"),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(user.id, extra={"role": "admin"})
    return {"Authorization": f"Bearer {token}"}


def test_login_rejects_bad_password_and_accepts_good_password(
    client: TestClient, db: Session
):
    user = create_user(db, "login@example.com")
    assert user.hashed_password != "safe-test-password"
    assert verify_password("safe-test-password", user.hashed_password)

    failed = client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "wrong-password"},
    )
    valid = client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "safe-test-password"},
    )

    assert failed.status_code == 401
    assert valid.status_code == 200
    assert valid.json()["access_token"]


def test_authentication_rejects_missing_invalid_and_expired_tokens(
    client: TestClient, db: Session
):
    user = create_user(db, "token@example.com")
    missing = client.get("/api/v1/auth/me")
    invalid = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-token"},
    )
    now = datetime.now(timezone.utc)
    expired_token = jwt.encode(
        {
            "sub": str(user.id),
            "iat": now - timedelta(minutes=10),
            "exp": now - timedelta(minutes=1),
            "type": "access",
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    expired = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )

    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert expired.status_code == 401


def test_registration_cannot_create_an_admin_or_overwrite_an_account(
    client: TestClient, db: Session
):
    admin = create_user(db, "existing-admin@example.com", UserRole.ADMIN)
    duplicate = client.post(
        "/api/v1/auth/register",
        json={
            "email": admin.email,
            "password": "new-password",
            "full_name": "Attacker",
            "role": "admin",
        },
    )
    registration = client.post(
        "/api/v1/auth/register",
        json={
            "email": "new-user@example.com",
            "password": "new-password",
            "full_name": "New User",
            "role": "admin",
        },
    )

    assert duplicate.status_code == 409
    assert registration.status_code == 201
    assert registration.json()["role"] == "user"


def test_production_settings_reject_missing_or_placeholder_secrets(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValueError, match="explicit SECRET_KEY"):
        Settings(
            _env_file=None,
            ENVIRONMENT="production",
            DATABASE_URL="postgresql://localhost/rag_db",
            CORS_ORIGINS=["https://app.example.com"],
        )

    with pytest.raises(ValueError, match="explicit SECRET_KEY"):
        Settings(
            _env_file=None,
            ENVIRONMENT="production",
            SECRET_KEY="replace_with_a_unique_random_secret_of_at_least_32_characters",
            DATABASE_URL="postgresql://localhost/rag_db",
            CORS_ORIGINS=["https://app.example.com"],
        )


def test_user_cannot_access_another_users_resources_or_admin_api(
    client: TestClient, db: Session
):
    user_a = create_user(db, "user-a@example.com")
    user_b = create_user(db, "user-b@example.com")
    document = Document(
        title="Private document",
        filename="private.txt",
        owner_id=user_b.id,
        is_public=False,
        celery_task_id="user-b-task",
    )
    session = ChatSession(user_id=user_b.id, title="Private session")
    db.add_all([document, session])
    db.commit()
    db.refresh(document)
    db.refresh(session)
    db.add(
        ChatMessage(
            session_id=session.id,
            role=MessageRole.USER,
            content="private message",
        )
    )
    feedback = ResponseFeedback(
        feedback_id="user-b-feedback",
        user_id=user_b.id,
        session_id=session.id,
        query_text="private query",
        answer_text="private answer",
    )
    db.add(feedback)
    db.commit()

    headers = auth_header(user_a)
    assert _filter_authorized_sources(
        [{"doc_id": document.id, "text_snippet": "private text"}],
        db,
        user_a.id,
        False,
    ) == []
    responses = [
        client.get(f"/api/v1/documents/{document.id}", headers=headers),
        client.get(f"/api/v1/documents/{document.id}/download", headers=headers),
        client.get(f"/api/v1/documents/{document.id}/preview", headers=headers),
        client.get(f"/api/v1/documents/{document.id}/versions", headers=headers),
        client.get(
            f"/api/v1/documents/{document.id}/chunks/1",
            headers=headers,
        ),
        client.delete(f"/api/v1/documents/{document.id}", headers=headers),
        client.get(
            f"/api/v1/chat/sessions/{session.id}/messages",
            headers=headers,
        ),
        client.get(
            f"/api/v1/feedback/{feedback.feedback_id}",
            headers=headers,
        ),
        client.post(
            f"/api/v1/feedback/{feedback.feedback_id}",
            headers=headers,
            json={"rating": 1, "comment": "unauthorized"},
        ),
        client.get(
            "/api/v1/documents/job/user-b-task",
            headers=headers,
        ),
        client.get("/api/v1/admin/stats", headers=headers),
    ]

    assert [response.status_code for response in responses] == [
        403,
        403,
        403,
        403,
        403,
        403,
        403,
        404,
        404,
        404,
        403,
    ]
    assert all("private answer" not in response.text for response in responses)

    owner_feedback = client.get(
        f"/api/v1/feedback/{feedback.feedback_id}",
        headers=auth_header(user_b),
    )
    assert owner_feedback.status_code == 200
    assert owner_feedback.json()["feedback_id"] == feedback.feedback_id


def test_upload_uses_unique_server_paths_and_assigns_owner(
    client: TestClient,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    admin = create_user(db, "uploader@example.com", UserRole.ADMIN)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    monkeypatch.setattr(
        "app.api.v1.documents.get_cache_service",
        lambda: SimpleNamespace(invalidate_user=lambda user_id: 0),
    )

    class FakeIngestionTask:
        counter = 0

        def delay(self, doc_id: int, file_path: str, file_type: str):
            self.counter += 1
            return SimpleNamespace(id=f"test-task-{self.counter}")

    monkeypatch.setitem(
        sys.modules,
        "app.tasks.ingestion_tasks",
        SimpleNamespace(ingest_document_task=FakeIngestionTask()),
    )

    headers = auth_header(admin)
    first = client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("same.txt", b"first valid document", "text/plain")},
    )
    second = client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("same.txt", b"second valid document", "text/plain")},
    )

    assert first.status_code == 201
    assert second.status_code == 201
    first_path = db.get(Document, first.json()["id"]).file_path
    second_path = db.get(Document, second.json()["id"]).file_path
    assert first_path != second_path
    assert first_path != str(tmp_path / "same.txt")
    assert db.get(Document, first.json()["id"]).owner_id == admin.id
    assert db.get(Document, second.json()["id"]).owner_id == admin.id


def test_upload_rejects_path_traversal_corrupt_and_oversized_files(
    client: TestClient,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    admin = create_user(db, "upload-check@example.com", UserRole.ADMIN)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "MAX_FILE_SIZE_MB", 1)
    headers = auth_header(admin)

    traversal = client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("../escape.txt", b"content", "text/plain")},
    )
    corrupt = client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("corrupt.pdf", b"not a PDF", "application/pdf")},
    )
    oversized = client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={
            "file": (
                "oversized.txt",
                b"x" * (1024 * 1024 + 1),
                "text/plain",
            )
        },
    )

    assert traversal.status_code == 422
    assert corrupt.status_code == 422
    assert oversized.status_code == 413
    assert list(tmp_path.iterdir()) == []


def test_upload_processing_failure_returns_safe_error_and_cleans_file(
    client: TestClient,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    admin = create_user(db, "upload-failure@example.com", UserRole.ADMIN)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))

    def fail_create_document(*args, **kwargs):
        raise RuntimeError("sensitive internal path")

    monkeypatch.setattr(DocumentService, "create_document", fail_create_document)
    response = client.post(
        "/api/v1/documents/upload",
        headers=auth_header(admin),
        files={"file": ("valid.txt", b"valid test content", "text/plain")},
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "sensitive internal path" not in response.text
    assert list(tmp_path.iterdir()) == []
