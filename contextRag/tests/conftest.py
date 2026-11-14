"""
pytest Configuration - setups fixtures for unit and integration testing
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid

_context_rag_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _context_rag_dir not in sys.path:
    sys.path.insert(0, _context_rag_dir)

_TEST_DATABASE_PATH = os.path.join(
    tempfile.gettempdir(),
    f"contextrag-phase2-{uuid.uuid4().hex}.db",
)
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "phase2-test-only-secret-not-for-deployments"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DATABASE_PATH.replace(os.sep, '/')}"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["CORS_ORIGINS"] = '["http://localhost:3000"]'

from app.core.config import settings, get_settings
get_settings.cache_clear()
settings.RATE_LIMIT_ENABLED = False
settings.ENVIRONMENT = "test"
settings.DATABASE_URL = os.environ["DATABASE_URL"]

import pytest
from typing import Generator
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

import app.db.session as session_mod
session_mod.engine = create_engine(
    os.environ["DATABASE_URL"],
    connect_args={"check_same_thread": False},
)
session_mod.SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=session_mod.engine,
    class_=Session,
)

from app.db.base import Base
from app.db.session import get_db
from app.main import app


@pytest.fixture(name="db_engine")
def fixture_db_engine():
    """Create a temporary SQLite engine in memory for unit testing."""
    engine = session_mod.engine
    Base.metadata.create_all(bind=engine)
    yield engine


@pytest.fixture(name="db")
def fixture_db(db_engine) -> Generator[Session, None, None]:
    """Provide a database session fixture."""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(name="client")
def fixture_client(db) -> Generator[TestClient, None, None]:
    """Provide a FastAPI test client with mocked database session dependency."""
    def override_get_db():
        try:
            yield db
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def pytest_sessionfinish(session, exitstatus):
    session_mod.engine.dispose()
    try:
        os.remove(_TEST_DATABASE_PATH)
    except FileNotFoundError:
        pass
