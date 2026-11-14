"""
Integration Tests — validates Document Ingestion and Versioning API endpoints
"""
from __future__ import annotations

import io
import sys
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.core.security import hash_password
from app.core.config import settings
import fitz


@pytest.fixture(name="auth_headers")
def fixture_auth_headers(
    db: Session,
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> dict[str, str]:
    # Seed user in DB
    user = User(
        email="docuser@rag.com",
        hashed_password=hash_password("testpassword123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(user)
    db.commit()
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    monkeypatch.setattr(
        "app.api.v1.documents.get_cache_service",
        lambda: SimpleNamespace(invalidate_user=lambda user_id: 0),
    )

    class FakeIngestionTask:
        def delay(self, doc_id: int, file_path: str, file_type: str):
            return SimpleNamespace(id="integration-test-task")

    monkeypatch.setitem(
        sys.modules,
        "app.tasks.ingestion_tasks",
        SimpleNamespace(ingest_document_task=FakeIngestionTask()),
    )

    # Login via API
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "docuser@rag.com", "password": "testpassword123"},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_upload_document_flow(client: TestClient, auth_headers: dict[str, str]):
    # Create a valid isolated PDF upload; ingestion is mocked in the fixture.
    document = fitz.open()
    document.new_page().insert_text((72, 72), "Integration test PDF")
    file_content = document.tobytes()
    document.close()
    file = io.BytesIO(file_content)
    
    # Upload document
    resp = client.post(
        "/api/v1/documents/upload",
        files={"file": ("test_doc.pdf", file, "application/pdf")},
        data={"title": "Test PDF Doc", "tags": "test,rag"},
        headers=auth_headers,
    )
    # The endpoint might return 201 Created
    assert resp.status_code in (200, 201)
    doc_data = resp.json()
    assert doc_data["title"] == "Test PDF Doc"
    assert doc_data["filename"] == "test_doc.pdf"
    
    doc_id = doc_data["id"]

    # Get document details
    resp_get = client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers)
    assert resp_get.status_code == 200
    assert resp_get.json()["id"] == doc_id

    # List all versions
    resp_versions = client.get(f"/api/v1/documents/{doc_id}/versions", headers=auth_headers)
    assert resp_versions.status_code == 200
    versions = resp_versions.json()
    assert len(versions) == 1
    assert versions[0]["version_number"] == 1
