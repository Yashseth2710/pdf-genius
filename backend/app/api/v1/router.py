"""Collects every v1 route behind a single router mounted at /api/v1."""

from fastapi import APIRouter

from app.api.v1 import health

api_router = APIRouter()
api_router.include_router(health.router)

# Routers added in later phases:
#   auth, users, files, pdf, ai, history
