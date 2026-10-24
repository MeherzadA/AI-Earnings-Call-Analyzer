-- PostgreSQL schema. Existing installations use backend/migrations/ for updates.
-- Account tables are retained for compatibility; public reports can be anonymous.
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash varchar(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE saved_tickers (
    id SERIAL PRIMARY KEY,

    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,


    ticker VARCHAR(10) NOT NULL,
    company_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transcripts (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    quarter VARCHAR(10) NOT NULL,
    year INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE analyses (
    id SERIAL PRIMARY KEY,
    transcript_id INTEGER REFERENCES transcripts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    sentiment VARCHAR(50),
    key_claims TEXT,
    red_flags TEXT,
    summary TEXT,
    sentiment_score FLOAT,
    opportunities TEXT,
    return_1day FLOAT,
    return_5day FLOAT,
    daily_prices TEXT,
    research_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

