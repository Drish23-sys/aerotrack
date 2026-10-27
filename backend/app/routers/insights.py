"""Read-only screens: dashboard, overdue components, reports. Open to every signed-in role."""
from fastapi import APIRouter, Depends, HTTPException

from ..db import fetch
from ..security import current_user

router = APIRouter(prefix="/api", tags=["insights"])

SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


@router.get("/dashboard")
def dashboard(user=Depends(current_user)):
    kpi = fetch(user, """
        SELECT (SELECT COUNT(*) FROM aircraft WHERE status = 'grounded')  AS grounded,
               (SELECT COUNT(*) FROM aircraft WHERE status = 'active')    AS active,
               (SELECT COUNT(*) FROM aircraft)                            AS fleet,
               (SELECT COUNT(*) FROM v_open_defects)                      AS open_defects,
               (SELECT COUNT(*) FROM v_overdue_components)                AS overdue""")[0]

    # Why is each grounded aircraft grounded? -> its unresolved critical defects
    rows = fetch(user, """
        SELECT a.aircraft_id, a.registration_no, m.manufacturer || ' ' || m.model_name AS model,
               d.defect_id, ct.type_name AS component, d.defect_class, d.status AS defect_status, d.reported_at
        FROM aircraft a
        JOIN aircraft_model m            ON m.model_id = a.model_id
        LEFT JOIN component c            ON c.aircraft_id = a.aircraft_id
        LEFT JOIN defect d               ON d.component_id = c.component_id
                                        AND d.severity = 'CRITICAL' AND d.status <> 'resolved'
        LEFT JOIN component_type ct      ON ct.type_id = c.type_id
        WHERE a.status = 'grounded'
        ORDER BY a.registration_no, d.reported_at""")
    grounded: dict[int, dict] = {}
    for r in rows:
        g = grounded.setdefault(r["aircraft_id"], {
            "aircraft_id": r["aircraft_id"], "registration_no": r["registration_no"],
            "model": r["model"], "defects": []})
        if r["defect_id"] is not None:
            g["defects"].append({k: r[k] for k in
                                 ("defect_id", "component", "defect_class", "defect_status", "reported_at")})

    open_defects = fetch(user, """
        SELECT defect_id, registration_no, component, serial_no, severity, defect_class, status, reported_at
        FROM v_open_defects""")
    counts = {s: 0 for s in SEVERITIES}
    for d in open_defects:
        counts[d["severity"]] += 1

    return {
        "kpi": kpi,
        "grounded": list(grounded.values()),
        "open_defects": open_defects,
        "severity_counts": [{"severity": s, "count": counts[s]} for s in SEVERITIES],
    }


@router.get("/overdue")
def overdue(user=Depends(current_user)):
    return fetch(user, """
        SELECT component_id, registration_no, component, serial_no, last_inspected_date, due_date, days_overdue
        FROM v_overdue_components""")


REPORTS = {
    "repair-cost": {
        "title": "Repair cost per aircraft",
        "chart": {"type": "bar", "x": "aircraft", "y": "total_cost", "y_label": "Total cost"},
        "sql": """
            SELECT a.registration_no AS aircraft, COUNT(r.repair_id) AS repairs,
                   COALESCE(SUM(r.cost), 0)::float AS total_cost
            FROM aircraft a
            LEFT JOIN component c ON c.aircraft_id  = a.aircraft_id
            LEFT JOIN defect    d ON d.component_id = c.component_id
            LEFT JOIN repair    r ON r.defect_id    = d.defect_id
            GROUP BY a.registration_no ORDER BY 3 DESC, 1""",
    },
    "defect-rate": {
        "title": "Defect rate by component type",
        "chart": {"type": "bar", "x": "component_type", "y": "defects_per_component", "y_label": "Defects per component"},
        "sql": """
            SELECT ct.type_name AS component_type, COUNT(DISTINCT c.component_id) AS installed,
                   COUNT(d.defect_id) AS defects,
                   ROUND(COUNT(d.defect_id)::numeric / COUNT(DISTINCT c.component_id), 2)::float AS defects_per_component
            FROM component_type ct
            JOIN component c ON c.type_id = ct.type_id
            LEFT JOIN defect d ON d.component_id = c.component_id
            GROUP BY ct.type_name ORDER BY 4 DESC, 1""",
    },
    "technician-workload": {
        "title": "Technician workload",
        "chart": {"type": "bar", "x": "technician", "y": "total_jobs", "y_label": "Inspections + repairs"},
        "sql": """
            WITH workload AS (
                SELECT t.name, t.certification_level,
                       (SELECT COUNT(*) FROM inspection_technician it WHERE it.tech_id = t.tech_id) AS inspections,
                       (SELECT COUNT(*) FROM repair r WHERE r.tech_id = t.tech_id)                  AS repairs
                FROM technician t WHERE t.is_active)
            SELECT name AS technician, certification_level AS certification,
                   inspections, repairs, inspections + repairs AS total_jobs,
                   RANK() OVER (ORDER BY inspections + repairs DESC) AS rank
            FROM workload ORDER BY rank, name""",
    },
    "repair-time": {
        "title": "Average days to repair, by severity",
        "chart": {"type": "bar", "x": "severity", "y": "avg_days", "y_label": "Average days"},
        "sql": """
            SELECT initcap(d.severity) AS severity, COUNT(*) AS completed_repairs,
                   ROUND(AVG(r.end_date - r.start_date), 1)::float AS avg_days
            FROM repair r JOIN defect d ON d.defect_id = r.defect_id
            WHERE r.status = 'completed'
            GROUP BY d.severity ORDER BY 3 DESC""",
    },
    "defects-per-month": {
        "title": "Defects reported per month",
        "chart": {"type": "line", "x": "month", "y": "defects", "y_label": "Defects"},
        "sql": """
            SELECT to_char(date_trunc('month', reported_at), 'YYYY-MM') AS month, COUNT(*) AS defects
            FROM defect GROUP BY 1 ORDER BY 1""",
    },
}


@router.get("/reports")
def list_reports(user=Depends(current_user)):
    return [{"key": k, "title": v["title"]} for k, v in REPORTS.items()]


@router.get("/reports/{key}")
def run_report(key: str, user=Depends(current_user)):
    spec = REPORTS.get(key)
    if not spec:
        raise HTTPException(404, "Unknown report.")
    return {"key": key, "title": spec["title"], "chart": spec["chart"], "rows": fetch(user, spec["sql"])}
