-- =====================================================================
--  Live demo of the automation rules (for the viva / demo).
--  Everything runs inside a transaction that is ROLLED BACK at the end,
--  so your data is untouched.   Run:  psql -d aerotrack -f demo_triggers.sql
-- =====================================================================
\set ON_ERROR_STOP off
BEGIN;
SELECT set_config('app.current_user', 'demo', true);

\echo '--- 1. BEFORE: VT-DDD is active'
SELECT registration_no, status FROM aircraft WHERE registration_no = 'VT-DDD';

\echo '--- 2. Start inspection #7 (scheduled) and log a CRITICAL defect on VT-DDD'
CALL sp_start_inspection(7);
INSERT INTO defect (inspection_id, component_id, severity, defect_class, description)
VALUES (7, 14, 'CRITICAL', 'leak', 'Demo: hydraulic actuator leak')
RETURNING defect_id \gset new_

\echo '--- 3. AFTER: trigger trg_defect_ground has grounded VT-DDD automatically'
SELECT registration_no, status FROM aircraft WHERE registration_no = 'VT-DDD';

\echo '--- 4. Start a repair: defect becomes in_repair'
INSERT INTO repair (defect_id, tech_id, action_taken, cost)
VALUES (:new_defect_id, 2, 'Demo: replace actuator', 20000)
RETURNING repair_id \gset rep_
SELECT defect_id, status FROM defect WHERE defect_id = :new_defect_id;

\echo '--- 5. Complete the repair: defect resolved, VT-DDD returned to service'
CALL sp_complete_repair(:rep_repair_id, 'completed');
SELECT d.status AS defect_status, a.status AS aircraft_status
FROM defect d
JOIN component c ON c.component_id = d.component_id
JOIN aircraft  a ON a.aircraft_id  = c.aircraft_id
WHERE d.defect_id = :new_defect_id;

\echo '--- 6. Integrity rule: component HA-5001 (VT-BBB) is not on VT-DDD  -> must fail'
SAVEPOINT before_bad_insert;
INSERT INTO defect (inspection_id, component_id, severity, defect_class, description)
VALUES (7, 6, 'LOW', 'test', 'should be rejected');
ROLLBACK TO SAVEPOINT before_bad_insert;

\echo '--- 7. Closing inspection #7 stamps VT-DDD components as inspected today'
CALL sp_close_inspection(7, 'Demo close-out');
SELECT serial_no, last_inspected_date FROM component WHERE aircraft_id = 4 ORDER BY 1;

\echo '--- 8. Audit trail written by the triggers during this demo'
SELECT table_name, record_id, action, changed_by FROM audit_log WHERE changed_by = 'demo' ORDER BY log_id;
ROLLBACK;

\echo '--- Demo finished: all changes rolled back.'
