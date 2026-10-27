# AeroTrack: Aircraft Inspection & Defect Management System

A DBMS course project. PostgreSQL does the real work (3NF schema, triggers, stored procedures,
views, audit log, roles); a FastAPI service exposes it; a React app is the interface.

```
database/   schema.sql, seed.sql, queries.sql, demo_triggers.sql     <- the DBMS part
backend/    FastAPI API (JWT login, role checks), init_db.py, pytest tests   -> deploys to Render
frontend/   React + Vite app                                                  -> deploys to Vercel
render.yaml Render blueprint for the API        .vscode/  tasks and debug config
```

All business rules live in the database, not in Python or React:

| Rule | Where |
|---|---|
| A CRITICAL defect grounds the aircraft | trigger `trg_defect_ground` |
| Aircraft returns to service when its last critical defect is repaired | `trg_repair_sync` + `fn_try_release_aircraft` |
| Defect status follows its repair (in repair / resolved / open again) | `trg_repair_sync` |
| A defect's component must belong to the inspected aircraft | `trg_defect_validate` |
| Every change to aircraft, inspections, defects, repairs is recorded (old and new row, plus the app user) | `fn_audit` on four tables |
| Start / close an inspection, finish a repair | procedures `sp_start_inspection`, `sp_close_inspection`, `sp_complete_repair` |
| Scheduling an inspection saves it and its technicians in one transaction | `POST /api/inspections` |
| Passwords are bcrypt hashes checked inside PostgreSQL | `fn_login` (pgcrypto) |
| Roles admin / inspector / viewer | `app_user.role` (API checks) and `role_*` database roles (optional `ENFORCE_DB_ROLES=1`) |

---

## 1. Run it locally in VS Code

You need Node 18+, Python 3.10+ and PostgreSQL 13+ (or a free hosted database, see section 4).

```bash
# open the folder in VS Code:  code aerotrack

# --- database
createdb aerotrack                       # or create an empty database in pgAdmin / DBeaver

# --- backend  (terminal 1)
cd backend
python -m venv .venv
source .venv/bin/activate                # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
cp .env.example .env                     # then edit DATABASE_URL (user, password, port)
python init_db.py                        # creates tables, triggers, views and sample data
python -m uvicorn app.main:app --reload  # API on http://localhost:8000  (docs at /docs)

# --- frontend  (terminal 2)
cd frontend
npm install
npm run dev                              # app on http://localhost:5173
```

Open http://localhost:5173 and use the demo buttons on the login page
(`admin / admin123`, `inspector / inspect123`, `viewer / viewer123`).

VS Code shortcuts (Terminal > Run Task): **Dev: API + Web** starts both servers, **Reset database**
reloads the sample data, **Backend tests** runs pytest. Select the `backend/.venv` interpreter
(Ctrl+Shift+P > Python: Select Interpreter) so tasks and debugging use it. The "Debug API" launch
configuration lets you set breakpoints in the API.

In development the Vite server forwards `/api` to port 8000, so no CORS setup is needed.

### Tests

```bash
createdb aerotrack_test                    # a scratch database: it is wiped before every test
cd backend
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aerotrack_test python -m pytest -q
# also run the whole suite with PostgreSQL enforcing the roles:
ENFORCE_DB_ROLES=1 TEST_DATABASE_URL=... python -m pytest -q
```

Windows PowerShell: `$env:TEST_DATABASE_URL="postgresql://..."; python -m pytest -q`.

### Demo script for the viva

1. **Dashboard**: VT-BBB is grounded; its maintenance tag says why.
2. **Log defect** (inspector): pick an inspection of VT-DDD, severity *Critical*, save. A second tag appears.
3. **Repairs**: start a repair on it (defect becomes "in repair"), then finish it. VT-DDD is released automatically.
4. **Inspections**: schedule one with two technicians, start it, close it. Its components leave the **Overdue** list.
5. **Audit log** (admin): the rows the triggers wrote, with old and new values and the user.
6. **SQL console** (admin): run `EXPLAIN ANALYZE` and show the partial index; try a `DELETE` and watch it refused.
7. Or run `psql -d aerotrack -f database/demo_triggers.sql` to show the same rules in pure SQL (rolls back at the end).

---

## 2. Push to GitHub

Create an empty repository on github.com (no README, no .gitignore), then from the project folder:

```bash
git init
git add .
git status                 # check that .env and node_modules are NOT listed
git commit -m "AeroTrack: DBMS project"
git branch -M main
git remote add origin https://github.com/<your-username>/aerotrack.git
git push -u origin main
```

`.gitignore` already excludes `.env`, `node_modules`, `dist` and virtual environments.
Never commit a real `DATABASE_URL` or `JWT_SECRET`.

---

## 3. Deploy: database (Neon) -> API (Render) -> frontend (Vercel)

Order matters because each step needs a URL from the previous one.

**Why not Render's own database?** Render's free Postgres expires 30 days after creation, and free web
services sleep after 15 minutes without traffic (the first request afterwards takes about a minute).
See [Render's free tier docs](https://render.com/docs/free). A free Neon (or Supabase) database does not
expire, so the blueprint uses Render only for the API.

### Step 1: database
Create a free Postgres project on [Neon](https://neon.tech), create or keep a database (for example `aerotrack`),
and copy its connection string. It looks like
`postgresql://USER:PASSWORD@HOST/aerotrack?sslmode=require`.
You do not need to load any SQL by hand: the API creates the tables and sample data on its first start.
(To do it yourself instead: put the string in `backend/.env` and run `python init_db.py`.)

### Step 2: API on Render
1. Render dashboard > New > **Blueprint**, pick your GitHub repo. Render reads `render.yaml`.
2. When asked for the values marked "sync: false":
   - `DATABASE_URL`: the Neon connection string from step 1
   - `CORS_ORIGINS`: leave a placeholder for now (e.g. `https://example.com`); you set it in step 4
3. Deploy. When it is live, open `https://<your-service>.onrender.com/api/health`. You should see `{"status":"ok"}`.
   Note the service URL.

(Without the blueprint: New > Web Service, root directory `backend`, build `pip install -r requirements.txt`,
start `python init_db.py --if-empty && uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check path
`/api/health`, and the same environment variables.)

### Step 3: frontend on Vercel
1. Vercel > Add New > Project, import the same repo.
2. Set **Root Directory** to `frontend`. Vercel detects Vite; build command `npm run build`, output `dist`.
3. Add environment variables:
   - `VITE_API_URL` = your Render URL, no trailing slash (e.g. `https://aerotrack-api.onrender.com`)
   - `VITE_DEMO_LOGINS` = `false` once you stop demoing (hides the one-click demo accounts)
4. Deploy and note the URL, e.g. `https://aerotrack.vercel.app`. `frontend/vercel.json` already makes
   page refreshes and deep links work.

### Step 4: connect them
In Render, set `CORS_ORIGINS` to your exact Vercel URL (no trailing slash) and let it redeploy.
To also allow Vercel preview deployments add `CORS_ORIGIN_REGEX` = `https://aerotrack-.*\.vercel\.app`.

If login says "Cannot reach the server", it is almost always `VITE_API_URL` (Vercel needs a redeploy after
changing it) or `CORS_ORIGINS` (must match the browser address exactly, including `https://`).

### Before you share the link
The sample data ships three accounts with simple passwords. Sign in as admin, open **Fleet and users**, and add
your own admin, or change the seed passwords in `database/seed.sql` before the first deploy. Anyone who can see the
login page can see the demo buttons unless `VITE_DEMO_LOGINS=false`.

---

## 4. Configuration reference

| Variable | Where | Meaning |
|---|---|---|
| `DATABASE_URL` | backend | PostgreSQL connection string |
| `JWT_SECRET` | backend | long random string that signs login tokens (Render generates one) |
| `CORS_ORIGINS` | backend | comma-separated exact origins allowed to call the API |
| `CORS_ORIGIN_REGEX` | backend | optional regex for extra origins (Vercel previews) |
| `TOKEN_HOURS` | backend | login lifetime, default 12 |
| `ENFORCE_DB_ROLES` | backend | `1` = each request also runs as `role_<user role>` inside PostgreSQL |
| `VITE_API_URL` | frontend | API base URL; empty in development |
| `VITE_DEMO_LOGINS` | frontend | `false` hides the demo account buttons |

`ENFORCE_DB_ROLES=1` needs the database user to be allowed to `SET ROLE` to the three roles:
`GRANT role_admin, role_inspector, role_viewer TO <your_db_user>;` On hosts that do not let the app user create
roles, `schema.sql` skips the role section with a notice and everything else works.

## 5. API at a glance

Interactive docs are at `/docs` on the running API. Every endpoint except `/api/auth/login` and `/api/health`
needs `Authorization: Bearer <token>`.

| Area | Endpoints | Roles |
|---|---|---|
| Auth | `POST /api/auth/login`, `GET /api/auth/me` | all |
| Read-only | `GET /api/dashboard`, `/api/overdue`, `/api/reports`, `/api/reports/{key}`, `/api/lookups` | admin, inspector, viewer |
| Inspections | `GET/POST /api/inspections`, `POST /api/inspections/{id}/start`, `/close`, `/cancel` | admin, inspector |
| Defects | `GET/POST /api/defects`, `GET /api/aircraft/{id}/components` | admin, inspector |
| Repairs | `GET/POST /api/repairs`, `POST /api/repairs/{id}/finish` | admin, inspector |
| Admin | `/api/admin/fleet`, `models`, `aircraft`, `component-types`, `components`, `technicians`, `users`, `audit`, `query` | admin |

Database errors, including the messages raised by the triggers ("Component 6 does not belong to the aircraft
inspected..."), come back as readable JSON `detail` text and are shown in the app as notifications.

## 6. Design notes for the report

* **3NF**: aircraft model, component type and inspection type are lookup tables; the many-to-many link between
  technicians and inspections is the bridge table `inspection_technician`; a defect references its component and
  inspection, and the aircraft is derived through the component rather than duplicated.
* `sp_close_inspection` assumes an inspection covers every component on the aircraft, and is `SECURITY DEFINER`
  so an inspector can close one without direct UPDATE rights on `component`.
* The SQL console runs inside a `READ ONLY` transaction with a 5 second timeout, so even
  `SELECT 1; DROP TABLE repair` is refused by PostgreSQL itself.
* Login attempts are throttled in memory per client and username (8 failures per minute).

## Troubleshooting

* `extension "pgcrypto" is not available`: install PostgreSQL's contrib package (included in the Windows and macOS installers).
* `password authentication failed`: fix the user and password in `DATABASE_URL`.
* Render service is slow on the first request: it was asleep; the login page tells the user while it wakes.
* `npm run dev` shows API errors: the backend is not running on port 8000.
