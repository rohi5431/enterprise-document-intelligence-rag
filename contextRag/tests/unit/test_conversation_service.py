"""
Unit Tests — validates ConversationService session creation, message management, and contexts
"""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException
from app.models.chat import MessageRole
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.services.conversation_service import ConversationService


@pytest.fixture(name="user")
def fixture_user(db: Session) -> User:
    user = User(
        email="sessionuser@rag.com",
        hashed_password="hashedpassword",
        role=UserRole.USER,
        is_active=True,
    )
    return UserRepository(db).create(user)


def test_create_session(db: Session, user: User):
    service = ConversationService(db)
    session = service.get_or_create_session(user_id=user.id, title="New Session")
    assert session.id is not None
    assert session.user_id == user.id
    assert session.title == "New Session"


def test_get_nonexistent_session(db: Session, user: User):
    service = ConversationService(db)
    with pytest.raises(NotFoundException):
        service.get_or_create_session(user_id=user.id, session_id=9999)


def test_add_and_retrieve_messages(db: Session, user: User):
    service = ConversationService(db)
    session = service.get_or_create_session(user_id=user.id)
    
    # Add messages
    service.repo.add_message(session.id, MessageRole.USER, "Hello assistant")
    service.repo.add_message(session.id, MessageRole.ASSISTANT, "Hello user")
    
    # Build prompt context
    context = service.build_context_prompt(session, "Next query")
    assert "User: Hello assistant" in context
    assert "Assistant: Hello user" in context
