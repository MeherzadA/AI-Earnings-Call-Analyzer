"""Database connection and request-scoped sessions."""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.engine import make_url
from fastapi import HTTPException
import certifi

from dotenv import load_dotenv
import os
from pathlib import Path

load_dotenv(Path(__file__).with_name(".env"))

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"connect_timeout": 10} if DATABASE_URL and DATABASE_URL.startswith("postgresql") else {}
if connect_args:
    query = make_url(DATABASE_URL).query
    if query.get("sslmode") == "verify-full" and not query.get("sslrootcert"):
        certificate = os.getenv("DATABASE_SSL_ROOT_CERT")
        connect_args["sslrootcert"] = str(Path(__file__).resolve().parent / certificate) if certificate else certifi.where()
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(autocommit = False, autoflush = False, bind = engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Saved reports are temporarily unavailable. Please try again shortly.",
        ) from exc
    finally:
        db.close()

