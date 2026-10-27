"""Day-to-day work: inspections, defects, repairs. Inspector and admin only (lookups: everyone)."""
from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import db, fetch
from ..security import current_user, require

router = APIRouter(prefix="/api", tags=["operations"])
inspector = require("admin", "inspector")


# ---------------------------------------------------------------- lookups
@router.get("/lookups")
def lookups(user=Depends(current_user)):
    return {
        "aircraft": fetch(user, "SELECT aircraft_id, registration_no, status FROM aircraft ORDER BY registration_no"),
        "inspection_types": fetch(user, "SELECT type_id, type_name FROM inspection_type ORDER BY type_id"),
        "technicians": fetch(user, """SELECT tech_id, name, certification_level FROM technician
                                      WHERE is_active ORDER BY name"""),
        "component_types": fetch(user, "SELECT type_id, type_name FROM component_type ORDER BY type_name"),
        "models": fetch(user, "SELECT model_id, manufacturer, model_name FROM aircraft_model ORDER BY 2, 3"),
    }


@router.get("/aircraft/{aircraft_id}/components")
def aircraft_components(aircraft_id: int, user=Depends(inspector)):
    return fetch(user, """
        SELECT c.component_id, ct.type_name, c.serial_no
        FROM component c JOIN component_type ct ON ct.type_id = c.type_id
        WHERE c.aircraft_id = %s ORDER BY ct.type_name, c.serial_no""", (aircraft_id,))


# ---------------------------------------------------------------- inspections
INSPECTION_STATUSES = {"scheduled", "in_progress", "completed", "cancelled"}


@router.get("/inspections")
def list_inspections(status: Optional[str] = Query(None, description="comma separated"), user=Depends(inspector)):
    wanted = [s for s in (status or "").split(",") if s]
    if any(s not in INSPECTION_STATUSES for s in wanted):
        raise HTTPException(400, "Unknown inspection status.")
    return fetch(user, """
        SELECT i.inspection_id, i.aircraft_id, a.registration_no, it.type_name, i.inspection_date, i.status,
               COALESCE(string_agg(t.name || CASE WHEN x.role = 'Lead' THEN ' (lead)' ELSE '' END, ', '
                                   ORDER BY (x.role = 'Lead') DESC, t.name), '') AS technicians,
               COALESCE(i.remarks, '') AS remarks
        FROM inspection i
        JOIN aircraft a         ON a.aircraft_id = i.aircraft_id
        JOIN inspection_type it ON it.type_id    = i.type_id
        LEFT JOIN inspection_technician x ON x.inspection_id = i.inspection_id
        LEFT JOIN technician t            ON t.tech_id       = x.tech_id
        WHERE (cardinality(%s::text[]) = 0 OR i.status = ANY(%s::text[]))
        GROUP BY i.inspection_id, a.registration_no, it.type_name
        ORDER BY i.inspection_date DESC, i.inspection_id DESC""", (wanted, wanted))


class InspectionIn(BaseModel):
    aircraft_id: int
    type_id: int
    inspection_date: date
    technician_ids: list[int] = Field(min_length=1)
    remarks: Optional[str] = Field(None, max_length=500)


@router.post("/inspections", status_code=201)
def schedule_inspection(body: InspectionIn, user=Depends(inspector)):
    techs = list(dict.fromkeys(body.technician_ids))          # drop duplicates, keep order (first = lead)
    with db(user) as cur:                                      # one transaction: inspection + technicians
        cur.execute("""INSERT INTO inspection (aircraft_id, type_id, inspection_date, remarks)
                       VALUES (%s, %s, %s, %s) RETURNING inspection_id""",
                    (body.aircraft_id, body.type_id, body.inspection_date, (body.remarks or "").strip() or None))
        new_id = cur.fetchone()["inspection_id"]
        for n, tech_id in enumerate(techs):
            cur.execute("""INSERT INTO inspection_technician (inspection_id, tech_id, role)
                           VALUES (%s, %s, %s)""", (new_id, tech_id, "Lead" if n == 0 else "Inspector"))
    return {"inspection_id": new_id}


@router.post("/inspections/{inspection_id}/start")
def start_inspection(inspection_id: int, user=Depends(inspector)):
    with db(user) as cur:
        cur.execute("CALL sp_start_inspection(%s)", (inspection_id,))
    return {"inspection_id": inspection_id, "status": "in_progress"}


class CloseIn(BaseModel):
    remarks: Optional[str] = Field(None, max_length=500)


@router.post("/inspections/{inspection_id}/close")
def close_inspection(inspection_id: int, body: CloseIn, user=Depends(inspector)):
    with db(user) as cur:
        cur.execute("CALL sp_close_inspection(%s, %s)", (inspection_id, (body.remarks or "").strip() or None))
    return {"inspection_id": inspection_id, "status": "completed"}


@router.post("/inspections/{inspection_id}/cancel")
def cancel_inspection(inspection_id: int, user=Depends(inspector)):
    with db(user) as cur:
        cur.execute("""UPDATE inspection SET status = 'cancelled'
                       WHERE inspection_id = %s AND status = 'scheduled'""", (inspection_id,))
        if cur.rowcount == 0:
            raise HTTPException(409, "Only a scheduled inspection can be cancelled.")
    return {"inspection_id": inspection_id, "status": "cancelled"}


# ---------------------------------------------------------------- defects
@router.get("/defects")
def list_defects(scope: Literal["awaiting_repair", "unresolved", "recent"] = "recent",
                 user=Depends(inspector)):
    if scope == "awaiting_repair":
        return fetch(user, """SELECT defect_id, registration_no, component, serial_no, severity, defect_class
                              FROM v_open_defects WHERE status = 'open'""")
    if scope == "unresolved":
        return fetch(user, """SELECT defect_id, registration_no, component, serial_no, severity, defect_class, status
                              FROM v_open_defects""")
    return fetch(user, """
        SELECT d.defect_id, a.registration_no, ct.type_name AS component, c.serial_no, d.severity,
               d.defect_class, d.description, d.status, d.reported_at
        FROM defect d
        JOIN component c       ON c.component_id = d.component_id
        JOIN component_type ct ON ct.type_id     = c.type_id
        JOIN aircraft a        ON a.aircraft_id  = c.aircraft_id
        ORDER BY d.defect_id DESC LIMIT 15""")


class DefectIn(BaseModel):
    inspection_id: int
    component_id: int
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    defect_class: str = Field(min_length=1, max_length=40)
    description: str = Field(min_length=1, max_length=1000)


@router.post("/defects", status_code=201)
def log_defect(body: DefectIn, user=Depends(inspector)):
    with db(user) as cur:
        cur.execute("""INSERT INTO defect (inspection_id, component_id, severity, defect_class, description)
                       VALUES (%s, %s, %s, %s, %s) RETURNING defect_id""",
                    (body.inspection_id, body.component_id, body.severity,
                     body.defect_class.strip(), body.description.strip()))
        defect_id = cur.fetchone()["defect_id"]
        cur.execute("""SELECT a.registration_no, a.status FROM aircraft a
                       JOIN component c ON c.aircraft_id = a.aircraft_id WHERE c.component_id = %s""",
                    (body.component_id,))
        ac = cur.fetchone()
    return {"defect_id": defect_id, "registration_no": ac["registration_no"],
            "grounded": body.severity == "CRITICAL" and ac["status"] == "grounded"}


# ---------------------------------------------------------------- repairs
@router.get("/repairs")
def list_repairs(status: Literal["in_progress", "all"] = "all", user=Depends(inspector)):
    return fetch(user, """
        SELECT r.repair_id, a.registration_no, ct.type_name AS component, d.severity, t.name AS technician,
               r.action_taken, r.cost::float AS cost, r.start_date, r.end_date, r.status
        FROM repair r
        JOIN defect d          ON d.defect_id    = r.defect_id
        JOIN component c       ON c.component_id = d.component_id
        JOIN component_type ct ON ct.type_id     = c.type_id
        JOIN aircraft a        ON a.aircraft_id  = c.aircraft_id
        JOIN technician t      ON t.tech_id      = r.tech_id
        WHERE (%s = 'all' OR r.status = 'in_progress')
        ORDER BY (r.status = 'in_progress') DESC, r.repair_id DESC LIMIT 100""", (status,))


class RepairIn(BaseModel):
    defect_id: int
    tech_id: int
    action_taken: str = Field(min_length=1, max_length=500)
    cost: Decimal = Field(ge=0, max_digits=12, decimal_places=2, default=Decimal("0"))
    start_date: date = Field(default_factory=date.today)


@router.post("/repairs", status_code=201)
def start_repair(body: RepairIn, user=Depends(inspector)):
    with db(user) as cur:
        cur.execute("""INSERT INTO repair (defect_id, tech_id, action_taken, cost, start_date)
                       VALUES (%s, %s, %s, %s, %s) RETURNING repair_id""",
                    (body.defect_id, body.tech_id, body.action_taken.strip(), body.cost, body.start_date))
        return {"repair_id": cur.fetchone()["repair_id"]}


class FinishIn(BaseModel):
    outcome: Literal["completed", "failed"]
    end_date: date = Field(default_factory=date.today)
    cost: Optional[Decimal] = Field(None, ge=0, max_digits=12, decimal_places=2)


@router.post("/repairs/{repair_id}/finish")
def finish_repair(repair_id: int, body: FinishIn, user=Depends(inspector)):
    with db(user) as cur:
        cur.execute("""SELECT a.aircraft_id, a.registration_no, a.status
                       FROM repair r JOIN defect d ON d.defect_id = r.defect_id
                       JOIN component c ON c.component_id = d.component_id
                       JOIN aircraft a  ON a.aircraft_id  = c.aircraft_id
                       WHERE r.repair_id = %s""", (repair_id,))
        before = cur.fetchone()
        if not before:
            raise HTTPException(404, "Repair not found.")
        cur.execute("CALL sp_complete_repair(%s, %s, %s, %s)", (repair_id, body.outcome, body.end_date, body.cost))
        cur.execute("SELECT status FROM aircraft WHERE aircraft_id = %s", (before["aircraft_id"],))
        after = cur.fetchone()["status"]
    return {"repair_id": repair_id, "outcome": body.outcome, "registration_no": before["registration_no"],
            "released": before["status"] == "grounded" and after == "active"}
