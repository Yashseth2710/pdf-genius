"""Collects every v1 route behind a single router mounted at /api/v1."""

from fastapi import APIRouter

from app.api.v1 import auth, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)

# Routers added in later phases:
#   users, files, pdf, ai, history
