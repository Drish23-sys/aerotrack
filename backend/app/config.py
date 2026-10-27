import logging
import os
import secrets

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

log = logging.getLogger("aerotrack")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/aerotrack")

JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    # Fine for local development; on a server set JWT_SECRET, otherwise every
    # restart signs everybody out.
    JWT_SECRET = secrets.token_urlsafe(32)
    log.warning("JWT_SECRET is not set; using a random secret for this process only.")
if len(JWT_SECRET) < 32:
    log.warning("JWT_SECRET is shorter than 32 characters; use a long random value in production.")
TOKEN_HOURS = int(os.getenv("TOKEN_HOURS", "12"))

# Comma-separated list of exact origins allowed to call the API (your Vercel URL).
CORS_ORIGINS = [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
# Optional regex, e.g. https://aerotrack-.*\.vercel\.app  to also allow Vercel preview deployments.
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX") or None

# 1 = run every request as role_admin / role_inspector / role_viewer inside PostgreSQL.
# Needs the roles from schema.sql and: GRANT role_admin, role_inspector, role_viewer TO <db user>;
ENFORCE_DB_ROLES = os.getenv("ENFORCE_DB_ROLES", "0") == "1"
