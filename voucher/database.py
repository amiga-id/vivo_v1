import importlib.util
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

Base = declarative_base()


def get_database_url() -> str:
    """Return a PostgreSQL URL from DATABASE_URL, using the installed driver."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required to connect to PostgreSQL")

    url = make_url(database_url)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql")
    elif not url.drivername.startswith("postgresql+"):
        raise RuntimeError("DATABASE_URL must use PostgreSQL")

    if url.drivername == "postgresql":
        if importlib.util.find_spec("psycopg") is not None:
            url = url.set(drivername="postgresql+psycopg")
        elif importlib.util.find_spec("psycopg2") is not None:
            url = url.set(drivername="postgresql+psycopg2")
        else:
            raise RuntimeError(
                "PostgreSQL driver missing; install psycopg2-binary or psycopg"
            )

    return url.render_as_string(hide_password=False)


DATABASE_URL = get_database_url()
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=2,
    pool_recycle=300,
    connect_args={"connect_timeout": 10},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


# def init_db() -> None:
#     """Create tables for all registered ORM models in PostgreSQL."""
#     if __package__:
#         from .models import invoice, user  # noqa: F401
#     else:
#         from models import invoice, user  # noqa: F401
#
#     Base.metadata.create_all(bind=engine)
