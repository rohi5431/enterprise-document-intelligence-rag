"""
Integration Tests — validates Document Ingestion and Versioning API endpoints
"""
from __future__ import annotations

import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.core.security import hash_password


@pytest.fixture(name="auth_headers")
def fixture_auth_headers(db: Session, client: TestClient) -> dict[str, str]:
    # Seed user in DB
    user = User(
        email="docuser@rag.com",
        hashed_password=hash_password("testpassword123"),
        role=UserRole.USER,
        is_active=True,
    )
    db.add(user)
    db.commit()

    # Login via API
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "docuser@rag.com", "password": "testpassword123"},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_upload_document_flow(client: TestClient, auth_headers: dict[str, str]):
    # Mock PDF upload
    file_content = b"%PDF-1.4 Mock PDF Content"
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
