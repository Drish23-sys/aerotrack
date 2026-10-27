"""Create (or reset) the AeroTrack tables and load the sample data.

    python init_db.py              # drop + recreate everything, then load seed data
    python init_db.py --no-seed    # schema only, empty tables
    python init_db.py --if-empty   # only do the above when the tables do not exist yet
                                   # (used by the Render start command: safe on every deploy)

The database itself must already exist. The connection string comes from
DATABASE_URL (see .env.example).
"""
import os
import sys
from pathlib import Path

import psycopg2

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SQL_DIR = Path(__file__).resolve().parent.parent / "database"


def schema_exists(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.aircraft') IS NOT NULL")
        return cur.fetchone()[0]


def init(database_url, seed=True):
    """Run schema.sql (+ seed.sql) in a single transaction. Returns row counts."""
    conn = psycopg2.connect(database_url)
    try:
        for name in ["schema.sql"] + (["seed.sql"] if seed else []):
            with conn.cursor() as cur:
                cur.execute((SQL_DIR / name).read_text(encoding="utf-8"))
        conn.commit()
        with conn.cursor() as cur:
            cur.execute("""SELECT (SELECT COUNT(*) FROM aircraft), (SELECT COUNT(*) FROM component),
                                  (SELECT COUNT(*) FROM inspection), (SELECT COUNT(*) FROM defect),
                                  (SELECT COUNT(*) FROM repair)""")
            return dict(zip(["aircraft", "components", "inspections", "defects", "repairs"], cur.fetchone()))
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main():
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/aerotrack")
    args = set(sys.argv[1:])
    print(f"Connecting to {url.rsplit('@', 1)[-1]} ...")
    try:
        if "--if-empty" in args:
            conn = psycopg2.connect(url)
            exists = schema_exists(conn)
            conn.close()
            if exists:
                print("Schema already present, nothing to do.")
                return
        counts = init(url, seed="--no-seed" not in args)
    except psycopg2.OperationalError as e:
        sys.exit(f"Could not connect: {e}\nCreate the database first and check DATABASE_URL.")
    except psycopg2.Error as e:
        hint = ""
        if "pgcrypto" in str(e):
            hint = "\nHint: the pgcrypto extension is required (ships with PostgreSQL contrib packages)."
        sys.exit(f"Failed, nothing was changed: {e}{hint}")
    print("Done. " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    if "--no-seed" not in args:
        print("Demo logins: admin/admin123, inspector/inspect123, viewer/viewer123")


if __name__ == "__main__":
    main()
