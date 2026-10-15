"""
migrate.py — minimal SQL migration runner.

Tracks applied migrations in a `schema_migrations` table so each file
is executed exactly once, in filename order.

Usage:
    python migrate.py
"""

from glob import glob
from os import getenv
from os.path import (
    basename,
    dirname,
    join,
)

from dotenv import load_dotenv
from psycopg import connect

load_dotenv(join(dirname(__file__), "..", "backend", ".env"))

DATABASE_URL = getenv("DATABASE_URL") or getenv("APP_DATABASE_URL")
MIGRATIONS_DIR = join(dirname(__file__), "migrations")


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError(
            "Set DATABASE_URL or APP_DATABASE_URL before running migrations."
        )
    return connect(DATABASE_URL)


def ensure_migrations_table(conn):
    """Create the schema_migrations tracking table if it doesn't exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version     VARCHAR(255) PRIMARY KEY,
                applied_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
            );
        """)
    conn.commit()


def applied_versions(conn) -> set:
    """Return the set of already-applied migration versions."""
    with conn.cursor() as cur:
        cur.execute("SELECT version FROM schema_migrations;")
        return {row[0] for row in cur.fetchall()}


def run_migrations():
    conn = get_connection()
    try:
        ensure_migrations_table(conn)
        done = applied_versions(conn)

        # collect and sort SQL files by filename
        pattern = join(MIGRATIONS_DIR, "*.sql")
        files = sorted(glob(pattern))

        if not files:
            print("No migration files found in", MIGRATIONS_DIR)  # noqa: T201
            return

        pending = [f for f in files if basename(f) not in done]

        if not pending:
            print("All migrations already applied.")  # noqa: T201
            return

        for filepath in pending:
            version = basename(filepath)
            print(f"Applying {version} ...", end=" ")  # noqa: T201

            with open(filepath) as fh:
                sql = fh.read()

            with conn.cursor() as cur:
                cur.execute(sql)
                cur.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s);", (version,)
                )
            conn.commit()
            print("done.")  # noqa: T201

        print(f"\n{len(pending)} migration(s) applied successfully.")  # noqa: T201
    except Exception as exc:
        conn.rollback()
        print(f"\nMigration failed: {exc}")  # noqa: T201
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migrations()
