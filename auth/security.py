"""
auth/security.py — JWT creation/verification and password checking.
Auth is only active when Config.WEB_PASSWORD is set in .env.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from config import Config

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"


def auth_enabled() -> bool:
    """Return True when WEB_PASSWORD is configured."""
    return bool(Config.WEB_PASSWORD)


def verify_password(plain: str) -> bool:
    """Compare plain-text password against the stored bcrypt hash."""
    if not Config.WEB_PASSWORD_HASH:
        return False
    return bcrypt.checkpw(plain.encode(), Config.WEB_PASSWORD_HASH)


def create_access_token() -> str:
    """Create a signed JWT with 30-day expiry."""
    exp = datetime.now(timezone.utc) + timedelta(days=30)
    return jwt.encode({"exp": exp}, Config.JWT_SECRET, algorithm=ALGORITHM)


def verify_token(token: str | None) -> bool:
    """Verify a JWT. Returns False on any error (expired, tampered, wrong secret)."""
    if not token:
        return False
    try:
        jwt.decode(token, Config.JWT_SECRET, algorithms=[ALGORITHM])
        return True
    except JWTError:
        return False
