"""Admin only: fleet data entry, users, audit log, read-only SQL console."""
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import db, fetch
from ..security import require

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin = require("admin")


@router.get("/fleet")
def fleet(user=Depends(admin)):
    return {
        "aircraft": fetch(user, """
            SELECT a.aircraft_id, a.registration_no, m.manufacturer || ' ' || m.model_name AS model,
                   a.manufacture_year, a.status,
                   (SELECT COUNT(*) FROM component c WHERE c.aircraft_id = a.aircraft_id) AS components
            FROM aircraft a JOIN aircraft_model m ON m.model_id = a.model_id ORDER BY a.registration_no"""),
        "components": fetch(user, """
            SELECT c.component_id, a.registration_no, ct.type_name AS component, c.serial_no, c.installed_date,
                   c.last_inspected_date, ct.inspection_interval_days
            FROM component c
            JOIN aircraft a        ON a.aircraft_id = c.aircraft_id
            JOIN component_type ct ON ct.type_id    = c.type_id
            ORDER BY a.registration_no, ct.type_name, c.serial_no"""),
        "technicians": fetch(user, """SELECT tech_id, name, certification_level, email, is_active
                                      FROM technician ORDER BY name"""),
        "users": fetch(user, "SELECT user_id, username, role, is_active FROM app_user ORDER BY user_id"),
    }


# ---------------------------------------------------------------- data entry
def insert(user, query, params):
    with db(user) as cur:
        cur.execute(query, params)
    return {"ok": True}


class ModelIn(BaseModel):
    manufacturer: str = Field(min_length=1, max_length=60)
    model_name: str = Field(min_length=1, max_length=60)
    seat_capacity: int = Field(gt=0, le=1000)


@router.post("/models", status_code=201)
def add_model(b: ModelIn, user=Depends(admin)):
    return insert(user, "INSERT INTO aircraft_model (manufacturer, model_name, seat_capacity) VALUES (%s, %s, %s)",
                  (b.manufacturer.strip(), b.model_name.strip(), b.seat_capacity))


class AircraftIn(BaseModel):
    registration_no: str = Field(min_length=2, max_length=12)
    model_id: int
    manufacture_year: int = Field(ge=1950, le=2100)


@router.post("/aircraft", status_code=201)
def add_aircraft(b: AircraftIn, user=Depends(admin)):
    return insert(user, "INSERT INTO aircraft (registration_no, model_id, manufacture_year) VALUES (%s, %s, %s)",
                  (b.registration_no.strip().upper(), b.model_id, b.manufacture_year))


class ComponentTypeIn(BaseModel):
    type_name: str = Field(min_length=1, max_length=60)
    inspection_interval_days: int = Field(gt=0, le=3650)


@router.post("/component-types", status_code=201)
def add_component_type(b: ComponentTypeIn, user=Depends(admin)):
    return insert(user, "INSERT INTO component_type (type_name, inspection_interval_days) VALUES (%s, %s)",
                  (b.type_name.strip(), b.inspection_interval_days))


class ComponentIn(BaseModel):
    aircraft_id: int
    type_id: int
    serial_no: str = Field(min_length=1, max_length=30)
    installed_date: date = Field(default_factory=date.today)


@router.post("/components", status_code=201)
def add_component(b: ComponentIn, user=Depends(admin)):
    return insert(user, """INSERT INTO component (aircraft_id, type_id, serial_no, installed_date)
                           VALUES (%s, %s, %s, %s)""",
                  (b.aircraft_id, b.type_id, b.serial_no.strip().upper(), b.installed_date))


class TechnicianIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    certification_level: Literal["B1", "B2", "C", "NDT Level 2", "NDT Level 3"]
    email: Optional[str] = Field(None, max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.post("/technicians", status_code=201)
def add_technician(b: TechnicianIn, user=Depends(admin)):
    return insert(user, "INSERT INTO technician (name, certification_level, email) VALUES (%s, %s, %s)",
                  (b.name.strip(), b.certification_level, b.email))


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=6, max_length=200)
    role: Literal["admin", "inspector", "viewer"]


@router.post("/users", status_code=201)
def add_user(b: UserIn, user=Depends(admin)):
    return insert(user, "INSERT INTO app_user (username, password_hash, role) VALUES (%s, crypt(%s, gen_salt('bf')), %s)",
                  (b.username.strip(), b.password, b.role))


# ---------------------------------------------------------------- audit log
@router.get("/audit")
def audit(table: Literal["all", "aircraft", "inspection", "defect", "repair"] = "all",
          limit: int = Query(100, ge=1, le=500), user=Depends(admin)):
    return fetch(user, """
        SELECT log_id, changed_at, table_name, record_id, action, changed_by,
               CASE WHEN action = 'UPDATE'
                    THEN (SELECT jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value))
                            FROM jsonb_each(new_data) n JOIN jsonb_each(old_data) o USING (key)
                           WHERE o.value IS DISTINCT FROM n.value)
                    ELSE COALESCE(new_data, old_data)
               END AS details
        FROM audit_log
        WHERE (%s = 'all' OR table_name = %s)
        ORDER BY log_id DESC LIMIT %s""", (table, table, limit))


# ---------------------------------------------------------------- read-only SQL console
class QueryIn(BaseModel):
    sql: str = Field(min_length=1, max_length=5000)


READ_ONLY_STARTS = ("select", "with", "explain", "show", "table", "values")
ROW_LIMIT = 500


@router.post("/query")
def run_query(body: QueryIn, user=Depends(admin)):
    words = body.sql.strip().lstrip("(").split(None, 1)
    if not words or words[0].lower() not in READ_ONLY_STARTS:
        raise HTTPException(400, "Only read-only statements (SELECT, WITH, EXPLAIN) can be run here.")
    # READ ONLY transaction + 5 s timeout: even a smuggled "; DROP TABLE ..." is refused by PostgreSQL.
    with db(user, readonly=True, plain=True) as cur:
        cur.execute(body.sql)
        if cur.description is None:
            return {"columns": [], "rows": [], "truncated": False}
        columns = [c.name for c in cur.description]
        rows = cur.fetchmany(ROW_LIMIT + 1)
    return {"columns": columns, "rows": [list(r) for r in rows[:ROW_LIMIT]], "truncated": len(rows) > ROW_LIMIT}
