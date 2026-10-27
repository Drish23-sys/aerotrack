"""AeroTrack API.  Run locally:  uvicorn app.main:app --reload"""
import logging
from contextlib import asynccontextmanager

import psycopg2
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .db import close_pool, fetch, get_pool
from .routers import admin, auth, insights, ops

log = logging.getLogger("aerotrack")


@asynccontextmanager
async def lifespan(app):
    get_pool()
    yield
    close_pool()


app = FastAPI(title="AeroTrack API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_origin_regex=config.CORS_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, insights.router, ops.router, admin.router):
    app.include_router(r)


@app.get("/api/health", tags=["system"])
def health():
    """Used by Render's health check. Also confirms the database answers."""
    fetch(None, "SELECT 1")
    return {"status": "ok"}


@app.exception_handler(psycopg2.Error)
async def database_error(request: Request, exc: psycopg2.Error):
    """Turn PostgreSQL errors (including our trigger RAISE EXCEPTION messages) into readable JSON."""
    code = getattr(exc, "pgcode", None) or ""
    diag = getattr(exc, "diag", None)
    message = (diag.message_primary if diag and diag.message_primary else str(exc)).strip()
    detail = (diag.message_detail if diag and diag.message_detail else "").strip()

    if isinstance(exc, (psycopg2.OperationalError, psycopg2.InterfaceError)) and not code:
        return JSONResponse({"detail": "The database is unavailable. Try again in a moment."}, 503)
    if code == "23505":
        return JSONResponse({"detail": f"That record already exists. {detail}".strip()}, 409)
    if code == "23503":
        return JSONResponse({"detail": "That record points to something that does not exist, "
                                       "or is still used by other records."}, 409)
    if code in ("23514", "23502", "22P02", "22007", "22003", "22001"):
        return JSONResponse({"detail": f"Value not allowed: {message}"}, 400)
    if code == "P0001":                       # RAISE EXCEPTION from our triggers / procedures
        return JSONResponse({"detail": message}, 400)
    if code == "25006":
        return JSONResponse({"detail": "This console is read-only; that statement would change data."}, 400)
    if code == "57014":
        return JSONResponse({"detail": "The query took too long and was stopped (5 second limit)."}, 400)
    if code == "42501":
        return JSONResponse({"detail": "The database role for this user is not allowed to do that."}, 403)
    if code.startswith("42"):                 # syntax error, unknown table/column ...
        return JSONResponse({"detail": message}, 400)

    log.exception("Unhandled database error on %s", request.url.path)
    return JSONResponse({"detail": "Unexpected database error."}, 500)
