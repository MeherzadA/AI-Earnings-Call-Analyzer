# file to represent database tables and itneract w/ DB via python objects and not SQL 

# literally just map each DB table to a Pythonic class


# relationship(): Python connection between tables; Ex: user.saved_tickers automatically getss all tickers belonging to the specific user
# back_populates: makes the relationship work both ways, so you can go from a user to their tickers, or from a ticker back to its user

from sqlalchemy import Column, Integer, String, Text, ForeignKey, TIMESTAMP, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP, server_default = func.now())

    saved_tickers = relationship("SavedTicker", back_populates="user")
    analyses = relationship("Analysis", back_populates="user")

class SavedTicker(Base):
    __tablename__ = "saved_tickers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ticker = Column(String(10), nullable=False)
    company_name = Column(String(255))
    created_at = Column(TIMESTAMP, server_default=func.now())

    user = relationship("User", back_populates="saved_tickers")


class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String(10), nullable=False)
    quarter = Column(String(10), nullable=False)
    year = Column(Integer, nullable=False)
    raw_text = Column(Text, nullable=False)
    fetched_at = Column(TIMESTAMP, server_default=func.now())

    analyses = relationship("Analysis", back_populates="transcript")


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, index=True)
    transcript_id = Column(Integer, ForeignKey("transcripts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    sentiment = Column(String(50))
    key_claims = Column(Text)
    red_flags = Column(Text)
    summary = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

    sentiment_score = Column(Float)
    opportunities = Column(Text)
    
    return_1day = Column(Float, nullable=True)
    return_5day = Column(Float, nullable=True)
    daily_prices = Column(Text, nullable=True)
    research_json = Column(Text, nullable=True)

    transcript = relationship("Transcript", back_populates="analyses")
    user = relationship("User", back_populates="analyses")
