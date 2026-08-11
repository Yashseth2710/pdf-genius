"""Collects every v1 route behind a single router mounted at /api/v1."""

from fastapi import APIRouter

from app.api.v1 import auth, documents, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(documents.router)

# Routers added in later phases:
#   pdf, ai, history
