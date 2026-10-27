from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..db import db
from ..security import check_throttle, create_token, current_user, record_failure

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=200)


@router.post("/login")
def login(body: LoginIn, request: Request):
    username = body.username.strip()
    check_throttle(request, username)
    # The password is checked inside PostgreSQL (bcrypt via pgcrypto), see fn_login().
    with db() as cur:
        cur.execute("SELECT user_id, username, role FROM fn_login(%s, %s)", (username, body.password))
        user = cur.fetchone()
    if not user:
        record_failure(request, username)
        raise HTTPException(401, "Wrong username or password.")
    return {"token": create_token(user), "user": dict(user)}


@router.get("/me")
def me(user=Depends(current_user)):
    return user
