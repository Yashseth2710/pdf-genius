"""Collects every v1 route behind a single router mounted at /api/v1."""

from fastapi import APIRouter

from app.api.v1 import auth, documents, health, jobs, tools

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(documents.router)
api_router.include_router(tools.router)
api_router.include_router(jobs.router)

# Routers added in later phases:
#   ai
