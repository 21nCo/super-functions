"""Minimal shared auth primitives for Python superfunctions packages."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class AuthSubject(BaseModel):
    kind: str = "user"
    user_id: Optional[str] = Field(None, alias="userId")

    class Config:
        populate_by_name = True
