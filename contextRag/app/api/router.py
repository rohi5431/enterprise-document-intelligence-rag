from fastapi import APIRouter
from app.api.v1 import auth, chat, documents, feedback, admin, users, search, settings, evaluation

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(chat.router)
api_router.include_router(documents.router)
api_router.include_router(feedback.router)
api_router.include_router(admin.router)
api_router.include_router(users.router)
api_router.include_router(search.router)
api_router.include_router(settings.router)
api_router.include_router(evaluation.router)
