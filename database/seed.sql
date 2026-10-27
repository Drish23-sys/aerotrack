-- =====================================================================
--  AeroTrack sample data.  Run after schema.sql.
--  Dates are relative to today, so "overdue" always has something to show.
--  The triggers run during this load: the critical defects below ground
--  VT-BBB and VT-CCC, and the completed repair releases VT-CCC again.
-- =====================================================================

SELECT set_config('app.current_user', 'seed', false);

INSERT INTO aircraft_model (model_id, manufacturer, model_name, seat_capacity) VALUES
    (1, 'Airbus', 'A320neo',  186),
    (2, 'ATR',    '72-600',    78),
    (3, 'Boeing', '737-800',  189);

INSERT INTO aircraft (aircraft_id, registration_no, model_id, manufacture_year, status) VALUES
    (1, 'VT-AAA', 1, 2019, 'active'),
    (2, 'VT-BBB', 2, 2017, 'active'),
    (3, 'VT-CCC', 3, 2015, 'active'),
    (4, 'VT-DDD', 1, 2021, 'active');

INSERT INTO component_type (type_id, type_name, inspection_interval_days) VALUES
    (1, 'Wing Spar',              365),
    (2, 'Landing Gear Assembly',  180),
    (3, 'Hydraulic Actuator',      90),
    (4, 'Fuselage Skin Panel',    180),
    (5, 'Turbine Blade Set',      120),
    (6, 'Fuel Pump',              150);

INSERT INTO component (component_id, aircraft_id, type_id, serial_no, installed_date, last_inspected_date) VALUES
    ( 1, 1, 1, 'WS-1001', CURRENT_DATE - 1500, CURRENT_DATE - 200),
    ( 2, 1, 2, 'LG-2001', CURRENT_DATE - 1500, CURRENT_DATE - 100),
    ( 3, 1, 3, 'HA-5000', CURRENT_DATE - 1200, CURRENT_DATE -  60),
    ( 4, 1, 5, 'TB-4001', CURRENT_DATE - 1200, CURRENT_DATE - 150),   -- overdue
    ( 5, 2, 1, 'WS-1002', CURRENT_DATE - 2000, CURRENT_DATE - 300),
    ( 6, 2, 3, 'HA-5001', CURRENT_DATE - 1000, CURRENT_DATE - 120),   -- overdue
    ( 7, 2, 4, 'FS-3001', CURRENT_DATE - 2000, CURRENT_DATE - 150),
    ( 8, 2, 6, 'FP-6001', CURRENT_DATE - 1000, CURRENT_DATE -  90),
    ( 9, 3, 3, 'HA-5002', CURRENT_DATE - 1800, CURRENT_DATE -  40),
    (10, 3, 2, 'LG-2002', CURRENT_DATE - 2500, CURRENT_DATE - 260),   -- overdue
    (11, 3, 1, 'WS-1003', CURRENT_DATE - 2500, CURRENT_DATE - 100),
    (12, 3, 6, 'FP-6002', CURRENT_DATE -  200, NULL),                 -- never inspected, overdue
    (13, 4, 1, 'WS-1004', CURRENT_DATE -  400, CURRENT_DATE -  30),
    (14, 4, 3, 'HA-5003', CURRENT_DATE -  400, CURRENT_DATE -  30),
    (15, 4, 5, 'TB-4002', CURRENT_DATE -  400, CURRENT_DATE -  20),
    (16, 4, 4, 'FS-3002', CURRENT_DATE -  400, CURRENT_DATE -  50);

INSERT INTO inspection_type (type_id, type_name, description) VALUES
    (1, 'A-Check', 'Routine light maintenance check, every few hundred flight hours'),
    (2, 'C-Check', 'Heavy maintenance check with extensive structural inspection'),
    (3, 'NDT',     'Non-destructive testing (ultrasonic, eddy current, dye penetrant)'),
    (4, 'Visual',  'General visual walk-around and zonal inspection');

INSERT INTO technician (tech_id, name, certification_level, email) VALUES
    (1, 'Arjun Mehta',    'B1',          'arjun.mehta@aerotrack.example'),
    (2, 'Priya Nair',     'B2',          'priya.nair@aerotrack.example'),
    (3, 'Rahul Verma',    'C',           'rahul.verma@aerotrack.example'),
    (4, 'Sneha Iyer',     'NDT Level 2', 'sneha.iyer@aerotrack.example'),
    (5, 'Karthik Raman',  'NDT Level 3', 'karthik.raman@aerotrack.example'),
    (6, 'Divya Menon',    'B1',          'divya.menon@aerotrack.example');

INSERT INTO inspection (inspection_id, aircraft_id, type_id, inspection_date, status, remarks) VALUES
    (1, 1, 1, CURRENT_DATE -  60, 'completed',   'Routine A-Check, no major findings'),
    (2, 2, 3, CURRENT_DATE -   2, 'in_progress', 'NDT of hydraulic and structural components'),
    (3, 3, 4, CURRENT_DATE -  45, 'completed',   'Visual inspection before long-haul rotation'),
    (4, 4, 1, CURRENT_DATE -  30, 'completed',   'Routine A-Check'),
    (5, 1, 3, CURRENT_DATE -  10, 'completed',   'NDT follow-up on wing structure'),
    (6, 3, 2, CURRENT_DATE +   7, 'scheduled',   'Planned C-Check'),
    (7, 4, 4, CURRENT_DATE +  14, 'scheduled',   NULL),
    (8, 2, 1, CURRENT_DATE -  90, 'completed',   'Routine A-Check');

INSERT INTO inspection_technician (inspection_id, tech_id, role) VALUES
    (1, 1, 'Lead'), (1, 2, 'Inspector'),
    (2, 4, 'Lead'), (2, 5, 'Inspector'),
    (3, 2, 'Lead'),
    (4, 3, 'Lead'), (4, 6, 'Inspector'),
    (5, 5, 'Lead'), (5, 4, 'Inspector'),
    (6, 3, 'Lead'), (6, 1, 'Inspector'),
    (7, 6, 'Lead'),
    (8, 1, 'Lead');

-- Defects: triggers ground VT-CCC (defect 6) and VT-BBB (defect 4)
INSERT INTO defect (defect_id, inspection_id, component_id, severity, defect_class, description, reported_at) VALUES
    (1, 8,  7, 'MEDIUM',   'corrosion', 'Surface corrosion on aft fuselage skin panel',     now() - interval '88 days'),
    (7, 1,  3, 'LOW',      'wear',      'Minor seal wear on hydraulic actuator',            now() - interval '58 days'),
    (6, 3, 10, 'CRITICAL', 'crack',     'Crack found on landing gear strut retaining lug',  now() - interval '44 days'),
    (2, 5,  1, 'HIGH',     'crack',     'Hairline crack near wing spar root',               now() - interval '9 days'),
    (3, 3,  9, 'LOW',      'wear',      'Minor seepage at actuator rod seal',               now() - interval '44 days'),
    (4, 2,  6, 'CRITICAL', 'leak',      'Hydraulic leak at seal',                           now() - interval '1 day'),
    (5, 2,  7, 'LOW',      'dent',      'Minor dent on fuselage skin panel',                now() - interval '1 day');

-- Repairs: the trigger moves each defect to in_repair / resolved / open
INSERT INTO repair (repair_id, defect_id, tech_id, action_taken, cost, start_date, end_date, status) VALUES
    (1, 1, 1, 'Treated and repainted panel; corrosion returned',   12000.00, CURRENT_DATE - 85, CURRENT_DATE - 83, 'failed'),
    (2, 1, 3, 'Replaced corroded skin panel section',              38500.00, CURRENT_DATE - 80, CURRENT_DATE - 74, 'completed'),
    (5, 7, 6, 'Replaced actuator seal kit',                         3200.00, CURRENT_DATE - 55, CURRENT_DATE - 54, 'completed'),
    (3, 6, 3, 'Replaced retaining lug bolts and re-tested (NDT)',  92000.00, CURRENT_DATE - 38, CURRENT_DATE - 33, 'completed'),
    (4, 4, 2, 'Replacing hydraulic seal kit',                      15000.00, CURRENT_DATE -  1, NULL,              'in_progress');

-- Make resolution timestamps match the repair end dates
UPDATE defect d
   SET resolved_at = (SELECT max(r.end_date) FROM repair r
                       WHERE r.defect_id = d.defect_id AND r.status = 'completed')::timestamptz
 WHERE d.status = 'resolved';

-- Demo logins (change these before any real use)
INSERT INTO app_user (username, password_hash, role, tech_id) VALUES
    ('admin',     crypt('admin123',   gen_salt('bf')), 'admin',     NULL),
    ('inspector', crypt('inspect123', gen_salt('bf')), 'inspector', 1),
    ('viewer',    crypt('viewer123',  gen_salt('bf')), 'viewer',    NULL);

-- Bring identity sequences past the explicit ids used above
SELECT setval(pg_get_serial_sequence('aircraft_model',  'model_id'),      (SELECT max(model_id)      FROM aircraft_model));
SELECT setval(pg_get_serial_sequence('aircraft',        'aircraft_id'),   (SELECT max(aircraft_id)   FROM aircraft));
SELECT setval(pg_get_serial_sequence('component_type',  'type_id'),       (SELECT max(type_id)       FROM component_type));
SELECT setval(pg_get_serial_sequence('component',       'component_id'),  (SELECT max(component_id)  FROM component));
SELECT setval(pg_get_serial_sequence('inspection_type', 'type_id'),       (SELECT max(type_id)       FROM inspection_type));
SELECT setval(pg_get_serial_sequence('technician',      'tech_id'),       (SELECT max(tech_id)       FROM technician));
SELECT setval(pg_get_serial_sequence('inspection',      'inspection_id'), (SELECT max(inspection_id) FROM inspection));
SELECT setval(pg_get_serial_sequence('defect',          'defect_id'),     (SELECT max(defect_id)     FROM defect));
SELECT setval(pg_get_serial_sequence('repair',          'repair_id'),     (SELECT max(repair_id)     FROM repair));
