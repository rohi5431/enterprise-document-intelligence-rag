from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.preferences_service import PreferencesService

router = APIRouter(prefix="/settings", tags=["Settings"])


class PreferencesResponse(BaseModel):
    llm_provider: str
    llm_model: str | None
    query_expansion_enabled: bool
    show_retrieval_diagnostics: bool
    available_providers: list[str]
    available_models: dict[str, list[str]]

    model_config = {"from_attributes": True}


class PreferencesUpdate(BaseModel):
    llm_provider: str | None = None
    llm_model: str | None = None
    query_expansion_enabled: bool | None = None
    show_retrieval_diagnostics: bool | None = None


AVAILABLE_MODELS = {
    "ollama": ["llama3", "mistral", "gemma2", "phi3"],
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    "gemini": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
}


@router.get("/preferences", response_model=PreferencesResponse)
def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = PreferencesService(db).get_or_create(current_user.id)
    return PreferencesResponse(
        llm_provider=prefs.llm_provider,
        llm_model=prefs.llm_model or _default_model(prefs.llm_provider),
        query_expansion_enabled=prefs.query_expansion_enabled,
        show_retrieval_diagnostics=prefs.show_retrieval_diagnostics,
        available_providers=["ollama", "openai", "gemini"],
        available_models=AVAILABLE_MODELS,
    )


@router.put("/preferences", response_model=PreferencesResponse)
def update_preferences(
    req: PreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = PreferencesService(db).update(
        current_user.id,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        query_expansion_enabled=req.query_expansion_enabled,
        show_retrieval_diagnostics=req.show_retrieval_diagnostics,
    )
    return PreferencesResponse(
        llm_provider=prefs.llm_provider,
        llm_model=prefs.llm_model or _default_model(prefs.llm_provider),
        query_expansion_enabled=prefs.query_expansion_enabled,
        show_retrieval_diagnostics=prefs.show_retrieval_diagnostics,
        available_providers=["ollama", "openai", "gemini"],
        available_models=AVAILABLE_MODELS,
    )


def _default_model(provider: str) -> str:
    defaults = {
        "ollama": settings.OLLAMA_MODEL,
        "openai": settings.OPENAI_MODEL,
        "gemini": settings.GEMINI_MODEL,
    }
    return defaults.get(provider, settings.OLLAMA_MODEL)
