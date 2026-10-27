"""Tests run against a real PostgreSQL database that they RESET before every test.

    createdb aerotrack_test
    TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aerotrack_test pytest

Never point TEST_DATABASE_URL at a database whose data you care about.
"""
import os
import sys
from pathlib import Path

import pytest

TEST_URL = os.getenv("TEST_DATABASE_URL")
if not TEST_URL:
    pytest.exit("Set TEST_DATABASE_URL to an empty scratch database (it is wiped for every test).", returncode=2)

os.environ["DATABASE_URL"] = TEST_URL
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 32
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import init_db  # noqa: E402
from app import security  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    init_db.init(TEST_URL, seed=True)
    security._failures.clear()


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def login(client):
    def _login(username, password):
        r = client.post("/api/auth/login", json={"username": username, "password": password})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['token']}"}
    return _login


@pytest.fixture()
def admin(login):
    return login("admin", "admin123")


@pytest.fixture()
def inspector(login):
    return login("inspector", "inspect123")


@pytest.fixture()
def viewer(login):
    return login("viewer", "viewer123")
