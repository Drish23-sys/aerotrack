-- =====================================================================
--  AeroTrack analytical queries (run after schema.sql + seed.sql)
--  Covers: joins, aggregates, HAVING, subqueries, CTEs, window functions,
--  views, date logic, JSONB, EXPLAIN.
-- =====================================================================

-- Q1. Fleet status summary  (GROUP BY)
SELECT status, COUNT(*) AS aircraft_count
FROM aircraft
GROUP BY status
ORDER BY aircraft_count DESC;

-- Q2. Unresolved defects per aircraft and severity  (JOIN + conditional aggregation)
SELECT a.registration_no,
       COUNT(*) FILTER (WHERE d.severity = 'CRITICAL') AS critical,
       COUNT(*) FILTER (WHERE d.severity = 'HIGH')     AS high,
       COUNT(*) FILTER (WHERE d.severity = 'MEDIUM')   AS medium,
       COUNT(*) FILTER (WHERE d.severity = 'LOW')      AS low
FROM aircraft a
JOIN component c ON c.aircraft_id  = a.aircraft_id
JOIN defect    d ON d.component_id = c.component_id AND d.status <> 'resolved'
GROUP BY a.registration_no
ORDER BY critical DESC, high DESC;

-- Q3. Components overdue for inspection  (uses view v_overdue_components)
SELECT registration_no, component, serial_no, due_date, days_overdue
FROM v_overdue_components;

-- Q4. Total repair cost per aircraft  (4-table JOIN + SUM)
SELECT a.registration_no,
       COUNT(r.repair_id)            AS repairs,
       COALESCE(SUM(r.cost), 0)      AS total_cost
FROM aircraft a
LEFT JOIN component c ON c.aircraft_id  = a.aircraft_id
LEFT JOIN defect    d ON d.component_id = c.component_id
LEFT JOIN repair    r ON r.defect_id    = d.defect_id
GROUP BY a.registration_no
ORDER BY total_cost DESC;

-- Q5. Average days to complete a repair, by defect severity
SELECT d.severity,
       COUNT(*)                                       AS completed_repairs,
       ROUND(AVG(r.end_date - r.start_date), 1)       AS avg_days_to_repair
FROM repair r
JOIN defect d ON d.defect_id = r.defect_id
WHERE r.status = 'completed'
GROUP BY d.severity
ORDER BY avg_days_to_repair DESC;

-- Q6. Defect rate per component type  (defects per installed component)
SELECT ct.type_name,
       COUNT(DISTINCT c.component_id)                                   AS installed,
       COUNT(d.defect_id)                                               AS defects,
       ROUND(COUNT(d.defect_id)::numeric / COUNT(DISTINCT c.component_id), 2) AS defects_per_component
FROM component_type ct
JOIN component c ON c.type_id = ct.type_id
LEFT JOIN defect d ON d.component_id = c.component_id
GROUP BY ct.type_name
ORDER BY defects_per_component DESC;

-- Q7. Technician workload ranking  (CTE + window function RANK)
WITH workload AS (
    SELECT t.tech_id, t.name, t.certification_level,
           (SELECT COUNT(*) FROM inspection_technician it WHERE it.tech_id = t.tech_id) AS inspections,
           (SELECT COUNT(*) FROM repair r WHERE r.tech_id = t.tech_id)                  AS repairs
    FROM technician t
    WHERE t.is_active
)
SELECT name, certification_level, inspections, repairs,
       inspections + repairs                                  AS total_jobs,
       RANK() OVER (ORDER BY inspections + repairs DESC)      AS workload_rank
FROM workload
ORDER BY workload_rank, name;

-- Q8. Aircraft that have never had a defect  (NOT EXISTS subquery)
SELECT a.registration_no
FROM aircraft a
WHERE NOT EXISTS (
    SELECT 1
    FROM component c JOIN defect d ON d.component_id = c.component_id
    WHERE c.aircraft_id = a.aircraft_id
);

-- Q9. Components with repeat defects  (HAVING)
SELECT c.serial_no, ct.type_name, COUNT(*) AS defect_count
FROM defect d
JOIN component c       ON c.component_id = d.component_id
JOIN component_type ct ON ct.type_id     = c.type_id
GROUP BY c.serial_no, ct.type_name
HAVING COUNT(*) > 1;

-- Q10. Monthly defect trend  (date_trunc)
SELECT date_trunc('month', reported_at)::date AS month,
       COUNT(*)                               AS defects_reported
FROM defect
GROUP BY 1
ORDER BY 1;

-- Q11. Inspections due in the next 30 days, with assigned technicians
SELECT i.inspection_date, a.registration_no, it.type_name,
       COALESCE(string_agg(t.name, ', ' ORDER BY t.name), 'UNASSIGNED') AS technicians
FROM inspection i
JOIN aircraft        a  ON a.aircraft_id = i.aircraft_id
JOIN inspection_type it ON it.type_id    = i.type_id
LEFT JOIN inspection_technician x ON x.inspection_id = i.inspection_id
LEFT JOIN technician t            ON t.tech_id       = x.tech_id
WHERE i.status = 'scheduled'
  AND i.inspection_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
GROUP BY i.inspection_id, i.inspection_date, a.registration_no, it.type_name
ORDER BY i.inspection_date;

-- Q12. Running repair cost over time  (window SUM)
SELECT r.end_date,
       a.registration_no,
       r.cost,
       SUM(r.cost) OVER (ORDER BY r.end_date, r.repair_id) AS cumulative_cost
FROM repair r
JOIN defect    d ON d.defect_id    = r.defect_id
JOIN component c ON c.component_id = d.component_id
JOIN aircraft  a ON a.aircraft_id  = c.aircraft_id
WHERE r.status = 'completed'
ORDER BY r.end_date, r.repair_id;

-- Q13. Full traceability for one defect: who inspected, what was found, how it was fixed
SELECT d.defect_id, a.registration_no, ct.type_name AS component, d.severity, d.description,
       it.type_name AS found_during, i.inspection_date,
       (SELECT string_agg(t.name, ', ') FROM inspection_technician x
          JOIN technician t ON t.tech_id = x.tech_id
         WHERE x.inspection_id = i.inspection_id)  AS inspected_by,
       r.action_taken, t2.name AS repaired_by, r.status AS repair_status
FROM defect d
JOIN component c        ON c.component_id = d.component_id
JOIN component_type ct  ON ct.type_id     = c.type_id
JOIN aircraft a         ON a.aircraft_id  = c.aircraft_id
JOIN inspection i       ON i.inspection_id = d.inspection_id
JOIN inspection_type it ON it.type_id     = i.type_id
LEFT JOIN repair r      ON r.defect_id    = d.defect_id
LEFT JOIN technician t2 ON t2.tech_id     = r.tech_id
WHERE d.defect_id = 1
ORDER BY r.start_date;

-- Q14. Audit trail of one defect  (JSONB; shows what changed on each UPDATE)
SELECT changed_at, action, changed_by,
       CASE WHEN action = 'UPDATE'
            THEN (SELECT jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value))
                    FROM jsonb_each(new_data) n
                    JOIN jsonb_each(old_data) o USING (key)
                   WHERE o.value IS DISTINCT FROM n.value)
            ELSE COALESCE(new_data, old_data)
       END AS details
FROM audit_log
WHERE table_name = 'defect' AND record_id = '4'
ORDER BY log_id;

-- Q15. Index demonstration: the partial index serves the "unresolved" lookups
EXPLAIN ANALYZE
SELECT * FROM defect WHERE status <> 'resolved' AND severity = 'CRITICAL';
