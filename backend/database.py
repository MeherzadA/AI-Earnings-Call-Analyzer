# sqlalchemy lets us interact with Postgres DB using python code instead of just raw SQL everyhwehre


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

# read .env file
load_dotenv(Path(__file__).with_name(".env"))

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# create the actual connection to Postgres using DB URL
connect_args = {"connect_timeout": 10} if DATABASE_URL and DATABASE_URL.startswith("postgresql") else {}
if connect_args:
    query = make_url(DATABASE_URL).query
    if query.get("sslmode") == "verify-full" and not query.get("sslrootcert"):
        connect_args["sslrootcert"] = certifi.where()
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args=connect_args,
)

# session is just talking to your DB: open session, do stuff, then close session
SessionLocal = sessionmaker(autocommit = False, autoflush = False, bind = engine)

# base class that all DB models will inherit from
Base = declarative_base()


# function to open DB session, hand it to whoever needs it, and then close it when they are done
def get_db():
    db = SessionLocal()
    try:
        # yield creates geenerator functions (AKA produce sequence of values one at a time) 
        # (so yield pauses function exectuion and saves its state to be resumed from where it left off whenever the next time a value is requested)
        yield db
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Saved reports are temporarily unavailable. Please try again shortly.",
        ) from exc
    finally:
        db.close()

