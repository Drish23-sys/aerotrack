import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import JWT_SECRET, TOKEN_HOURS

_bearer = HTTPBearer(auto_error=False)


def create_token(user):
    payload = {
        "sub": user["username"],
        "uid": user["user_id"],
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    if creds is None:
        raise HTTPException(401, "Sign in to continue.")
    try:
        p = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    return {"user_id": p["uid"], "username": p["sub"], "role": p["role"]}


def require(*roles):
    """Dependency factory: only the listed roles may call the endpoint."""
    def dep(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Your role is not allowed to do this.")
        return user
    return dep


# --- tiny login throttle (per client + username, in memory) -------------------------
_failures: dict[str, list[float]] = {}
WINDOW_SECONDS, MAX_FAILURES = 60, 8


def _key(request: Request, username: str):
    host = request.client.host if request.client else "?"
    return f"{host}|{username.lower()}"


def check_throttle(request: Request, username: str):
    k, now = _key(request, username), time.monotonic()
    recent = [t for t in _failures.get(k, []) if now - t < WINDOW_SECONDS]
    _failures[k] = recent
    if len(recent) >= MAX_FAILURES:
        raise HTTPException(429, "Too many failed attempts. Wait a minute and try again.")


def record_failure(request: Request, username: str):
    _failures.setdefault(_key(request, username), []).append(time.monotonic())
