"""
Models package — import all models here so Alembic can detect them
"""
from app.models.user import User, UserRole
from app.models.document import Document
from app.models.document_version import DocumentVersion
from app.models.chunk import Chunk
from app.models.chat import ChatSession, ChatMessage, MessageRole
from app.models.feedback import ResponseFeedback
from app.models.query_log import QueryLog
from app.models.audit_log import AuditLog
from app.models.user_preferences import UserPreferences
from app.models.evaluation_log import EvaluationLog
from app.models.extracted_table import ExtractedTable

__all__ = [
    "User", "UserRole",
    "Document", "DocumentVersion", "Chunk",
    "ChatSession", "ChatMessage", "MessageRole",
    "ResponseFeedback",
    "QueryLog",
    "AuditLog",
    "UserPreferences",
    "EvaluationLog",
    "ExtractedTable",
]
