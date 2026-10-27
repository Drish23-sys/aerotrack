"""PostgreSQL access: a connection pool and one transaction helper."""
import threading
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool, sql
from psycopg2.extras import RealDictCursor

from .config import DATABASE_URL, ENFORCE_DB_ROLES

_pool = None
_lock = threading.Lock()


def get_pool():
    global _pool
    with _lock:
        if _pool is None or _pool.closed:
            _pool = pool.ThreadedConnectionPool(
                1, 8, DATABASE_URL,
                keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=3,
            )
        return _pool


def close_pool():
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None


def _acquire():
    """A live connection. Hosted databases drop idle connections, so ping and replace dead ones."""
    p = get_pool()
    for _ in range(3):
        conn = p.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            conn.rollback()
            return conn
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            p.putconn(conn, close=True)
    raise psycopg2.OperationalError("could not get a working database connection")


@contextmanager
def db(user=None, readonly=False, plain=False):
    """One transaction, committed on success and rolled back on any error.

    user      stamps the audit trail (app.current_user) and, with ENFORCE_DB_ROLES=1,
              selects the PostgreSQL role the statements run as.
    readonly  READ ONLY transaction with a 5 second statement timeout.
    plain     tuple rows instead of dict rows (used by the SQL console).
    """
    conn = _acquire()
    try:
        with conn.cursor(cursor_factory=None if plain else RealDictCursor) as cur:
            if readonly:
                cur.execute("SET TRANSACTION READ ONLY")
                cur.execute("SET LOCAL statement_timeout = '5000'")
            if user:
                cur.execute("SELECT set_config('app.current_user', %s, true)", (user["username"],))
                if ENFORCE_DB_ROLES:
                    cur.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier("role_" + user["role"])))
            yield cur
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        get_pool().putconn(conn)


def fetch(user, query, params=None, readonly=True):
    """Run one SELECT and return all rows as dicts."""
    with db(user, readonly=readonly) as cur:
        cur.execute(query, params)
        return cur.fetchall()
