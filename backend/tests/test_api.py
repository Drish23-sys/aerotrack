"""End-to-end API tests. Seed facts used: VT-DDD (aircraft 4) is active with components 13-16;
inspection 4 (VT-DDD, completed) and 7 (VT-DDD, scheduled); component 6 belongs to VT-BBB."""


# ------------------------------------------------------------------ auth & roles
def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_login_and_me(client, login):
    h = login("admin", "admin123")
    me = client.get("/api/auth/me", headers=h).json()
    assert me["username"] == "admin" and me["role"] == "admin"


def test_wrong_password_and_missing_token(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "nope"})
    assert r.status_code == 401
    assert client.get("/api/dashboard").status_code == 401
    assert client.get("/api/dashboard", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_login_throttle(client):
    for _ in range(8):
        assert client.post("/api/auth/login", json={"username": "nobody", "password": "x"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "nobody", "password": "x"}).status_code == 429


def test_role_boundaries(client, viewer, inspector, admin):
    assert client.get("/api/dashboard", headers=viewer).status_code == 200
    assert client.get("/api/reports/repair-cost", headers=viewer).status_code == 200
    assert client.get("/api/inspections", headers=viewer).status_code == 403
    assert client.post("/api/defects", headers=viewer, json={}).status_code == 403
    assert client.get("/api/admin/fleet", headers=inspector).status_code == 403
    assert client.get("/api/inspections", headers=inspector).status_code == 200
    assert client.get("/api/admin/fleet", headers=admin).status_code == 200


# ------------------------------------------------------------------ dashboard & reports
def test_dashboard_matches_seed_data(client, viewer):
    d = client.get("/api/dashboard", headers=viewer).json()
    k = d["kpi"]
    assert (k["grounded"], k["active"], k["open_defects"], k["overdue"]) == (1, 3, 4, 4)
    assert [g["registration_no"] for g in d["grounded"]] == ["VT-BBB"]
    assert d["grounded"][0]["defects"][0]["component"] == "Hydraulic Actuator"
    assert {c["severity"]: c["count"] for c in d["severity_counts"]} == {"LOW": 2, "MEDIUM": 0, "HIGH": 1, "CRITICAL": 1}


def test_every_report_runs(client, viewer):
    for item in client.get("/api/reports", headers=viewer).json():
        r = client.get(f"/api/reports/{item['key']}", headers=viewer)
        assert r.status_code == 200 and r.json()["rows"], item["key"]
    assert client.get("/api/reports/nope", headers=viewer).status_code == 404


# ------------------------------------------------------------------ defect -> repair workflow (the triggers)
def _aircraft_status(client, h, reg):
    return next(a["status"] for a in client.get("/api/lookups", headers=h).json()["aircraft"] if a["registration_no"] == reg)


def test_critical_defect_grounds_and_repair_releases(client, inspector):
    assert _aircraft_status(client, inspector, "VT-DDD") == "active"

    r = client.post("/api/defects", headers=inspector, json={
        "inspection_id": 4, "component_id": 14, "severity": "CRITICAL",
        "defect_class": "leak", "description": "test leak"})
    assert r.status_code == 201 and r.json()["grounded"] is True
    defect_id = r.json()["defect_id"]
    assert _aircraft_status(client, inspector, "VT-DDD") == "grounded"

    r = client.post("/api/repairs", headers=inspector, json={
        "defect_id": defect_id, "tech_id": 2, "action_taken": "replace seal", "cost": "1500.50"})
    assert r.status_code == 201
    repair_id = r.json()["repair_id"]
    in_progress = client.get("/api/repairs?status=in_progress", headers=inspector).json()
    assert any(x["repair_id"] == repair_id for x in in_progress)
    assert not any(d["defect_id"] == defect_id for d in client.get("/api/defects?scope=awaiting_repair", headers=inspector).json())

    r = client.post(f"/api/repairs/{repair_id}/finish", headers=inspector, json={"outcome": "completed"})
    assert r.status_code == 200 and r.json()["released"] is True
    assert _aircraft_status(client, inspector, "VT-DDD") == "active"


def test_failed_repair_reopens_defect_and_keeps_aircraft_grounded(client, inspector):
    r = client.post("/api/defects", headers=inspector, json={
        "inspection_id": 4, "component_id": 14, "severity": "CRITICAL", "defect_class": "crack", "description": "x"})
    defect_id = r.json()["defect_id"]
    repair_id = client.post("/api/repairs", headers=inspector, json={
        "defect_id": defect_id, "tech_id": 1, "action_taken": "patch"}).json()["repair_id"]
    r = client.post(f"/api/repairs/{repair_id}/finish", headers=inspector, json={"outcome": "failed"})
    assert r.json()["released"] is False
    assert _aircraft_status(client, inspector, "VT-DDD") == "grounded"
    assert any(d["defect_id"] == defect_id for d in client.get("/api/defects?scope=awaiting_repair", headers=inspector).json())


def test_trigger_rules_are_reported_as_readable_errors(client, inspector):
    # component 6 sits on VT-BBB, inspection 4 covers VT-DDD
    r = client.post("/api/defects", headers=inspector, json={
        "inspection_id": 4, "component_id": 6, "severity": "LOW", "defect_class": "x", "description": "x"})
    assert r.status_code == 400 and "does not belong" in r.json()["detail"]
    # inspection 7 is only scheduled
    r = client.post("/api/defects", headers=inspector, json={
        "inspection_id": 7, "component_id": 14, "severity": "LOW", "defect_class": "x", "description": "x"})
    assert r.status_code == 400 and "in-progress or completed" in r.json()["detail"]
    # repair on an already resolved defect
    r = client.post("/api/repairs", headers=inspector, json={"defect_id": 1, "tech_id": 1, "action_taken": "x"})
    assert r.status_code == 400 and "already resolved" in r.json()["detail"]


def test_input_validation(client, inspector):
    bad = {"inspection_id": 4, "component_id": 14, "severity": "SEVERE", "defect_class": "x", "description": "x"}
    assert client.post("/api/defects", headers=inspector, json=bad).status_code == 422
    r = client.post("/api/inspections", headers=inspector, json={
        "aircraft_id": 1, "type_id": 1, "inspection_date": "2026-12-01", "technician_ids": []})
    assert r.status_code == 422


# ------------------------------------------------------------------ inspections
def test_inspection_lifecycle_updates_overdue_list(client, inspector):
    assert any(o["registration_no"] == "VT-AAA" for o in client.get("/api/overdue", headers=inspector).json())

    r = client.post("/api/inspections", headers=inspector, json={
        "aircraft_id": 1, "type_id": 1, "inspection_date": "2026-10-20", "technician_ids": [1, 2, 1], "remarks": "t"})
    assert r.status_code == 201
    iid = r.json()["inspection_id"]
    row = next(i for i in client.get("/api/inspections?status=scheduled", headers=inspector).json() if i["inspection_id"] == iid)
    assert row["technicians"] == "Arjun Mehta (lead), Priya Nair"

    assert client.post(f"/api/inspections/{iid}/close", headers=inspector, json={}).status_code == 400   # not started
    assert client.post(f"/api/inspections/{iid}/start", headers=inspector).status_code == 200
    assert client.post(f"/api/inspections/{iid}/start", headers=inspector).status_code == 400            # already started
    assert client.post(f"/api/inspections/{iid}/cancel", headers=inspector).status_code == 409
    assert client.post(f"/api/inspections/{iid}/close", headers=inspector, json={"remarks": "done"}).status_code == 200

    assert not any(o["registration_no"] == "VT-AAA" for o in client.get("/api/overdue", headers=inspector).json())


def test_cancel_scheduled_inspection(client, inspector):
    assert client.post("/api/inspections/7/cancel", headers=inspector).status_code == 200
    statuses = {i["inspection_id"]: i["status"] for i in client.get("/api/inspections", headers=inspector).json()}
    assert statuses[7] == "cancelled"


# ------------------------------------------------------------------ audit trail
def test_audit_records_the_signed_in_user(client, inspector, admin):
    client.post("/api/defects", headers=inspector, json={
        "inspection_id": 4, "component_id": 14, "severity": "LOW", "defect_class": "wear", "description": "x"})
    log = client.get("/api/admin/audit?table=defect&limit=5", headers=admin).json()
    assert log[0]["action"] == "INSERT" and log[0]["changed_by"] == "inspector"
    assert client.get("/api/admin/audit", headers=inspector).status_code == 403


# ------------------------------------------------------------------ admin
def test_admin_data_entry_and_new_user_can_log_in(client, admin):
    r = client.post("/api/admin/aircraft", headers=admin, json={"registration_no": "vt-zzz", "model_id": 1, "manufacture_year": 2022})
    assert r.status_code == 201
    dup = client.post("/api/admin/aircraft", headers=admin, json={"registration_no": "VT-ZZZ", "model_id": 1, "manufacture_year": 2022})
    assert dup.status_code == 409 and "already exists" in dup.json()["detail"]
    assert client.post("/api/admin/technicians", headers=admin, json={
        "name": "T", "certification_level": "B1", "email": "not-an-email"}).status_code == 422
    assert client.post("/api/admin/users", headers=admin, json={"username": "newbie", "password": "secret1", "role": "viewer"}).status_code == 201
    r = client.post("/api/auth/login", json={"username": "newbie", "password": "secret1"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "viewer"
    fleet = client.get("/api/admin/fleet", headers=admin).json()
    assert "VT-ZZZ" in [a["registration_no"] for a in fleet["aircraft"]]
    assert all("password_hash" not in u for u in fleet["users"])


def test_sql_console_is_read_only(client, admin):
    ok = client.post("/api/admin/query", headers=admin, json={"sql": "SELECT registration_no FROM aircraft ORDER BY 1"})
    assert ok.status_code == 200 and ok.json()["columns"] == ["registration_no"] and len(ok.json()["rows"]) == 4
    assert client.post("/api/admin/query", headers=admin, json={"sql": "DELETE FROM aircraft"}).status_code == 400
    smuggled = client.post("/api/admin/query", headers=admin, json={"sql": "SELECT 1; DROP TABLE repair"})
    assert smuggled.status_code == 400 and "read-only" in smuggled.json()["detail"]
    bad = client.post("/api/admin/query", headers=admin, json={"sql": "SELECT * FROM no_such_table"})
    assert bad.status_code == 400 and "no_such_table" in bad.json()["detail"]
    assert client.post("/api/admin/query", headers=admin, json={"sql": "SELECT count(*) FROM repair"}).json()["rows"] == [[5]]
