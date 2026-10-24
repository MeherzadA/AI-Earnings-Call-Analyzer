# Earnings Call Analyzer

Earnings calls are long, and the useful parts can be easy to miss. This app pulls together the main results, concerns, and management's outlook, with links back to the transcript so you can check the details yourself.

Choose a company, fiscal year, and quarter, or open a report someone has already run.

**[Try the live app](https://earnings-analyzer-vercel2.vercel.app)**

## Walkthrough

A 38-second tour of a saved NVIDIA report: findings, transcript sources, concerns, forecasts and share prices.

https://github.com/user-attachments/assets/36597fbc-c64c-4a07-9f75-02b8a52c7d3d

## What it does

- Uses Gemini to pull out key findings and financial highlights, with supporting transcript excerpts.
- Shows stock price changes over the next trading day, five trading days, or a month.
- Compares earlier revenue guidance with reported results when the periods and figures match, and shows related news links.
- Lets you read the full transcript or listen with browser read-aloud. Original recordings are available for some calls.
- Saves reports in a shared library with links you can reopen without running the AI again.

## Built with

React, Vite, and Recharts on the frontend. Python, FastAPI, SQLAlchemy, and PostgreSQL on the backend. Gemini handles the analysis, DuckDB reads transcripts from defeatbeta's public dataset, and yfinance supplies historical prices.

The live app runs on Vercel, with saved reports in Neon PostgreSQL.

## Limits

AI can misread a transcript even when the quotes and numbers match. Reports haven't had independent human review, and stock movements don't prove what caused them. Transcript, price, and news coverage can be incomplete.

## Inside the project

[Architecture and source checks](docs/architecture.md)
