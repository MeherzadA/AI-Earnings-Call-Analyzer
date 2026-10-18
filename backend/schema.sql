-- SERIAL: automatically increments (1,2,3 ... )
-- PRIMARY KEY: main row identifier 
-- VARCHAR(N): text up to N characters
-- UNIQUE: every entry min this column for the table must be unique
-- NOT NULL: must exist and cant be null no way
-- TIMESTAMP: date + time
-- DEFAULT CURRENT_TIMESTAMP: automatically set when the user is created (Ex: 2026-03-12 14:22:01)
-- TEXT: very long text


-- USERS own saved tickers and analyses. 
-- analyses belong to transcripts


-- column names
-- user table
-- storges registered users

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash varchar(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Example:
-- | id | user_id | ticker | company_name |
-- | -- | ------- | ------ | ------------ |
-- | 1  | 5       | AAPL   | Apple        |
-- | 2  | 5       | NVDA   | Nvidia       |

-- stock market ticker table
-- which companies each user is tracking
CREATE TABLE saved_tickers (
    id SERIAL PRIMARY KEY,

    -- FOREIGN KEY: AKA, this value must match an id from the users table
    -- ON DELETE CASCADE: AKA if a user is deleted (so their id is deleted), it automatically deletes all their saved tickers 
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,


    ticker VARCHAR(10) NOT NULL,
    company_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- transcripts table for each earnings call
-- raw earnings call text fetched from the API that we will then store
CREATE TABLE transcripts (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    quarter VARCHAR(10) NOT NULL,
    year INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- analaysis table
-- AI output for each transcript, linked to both the transcript and the user that requested for it
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

