# Bank Category PostgreSQL Search Backend

This backend is designed for fast search on very large Bank/Company category datasets.

## 1) PostgreSQL Setup

Create database (example):

```sql
CREATE DATABASE bankcat;
```

## 2) Install Python Dependencies

```powershell
cd "C:\Users\idris\Downloads\Bank Documents\CSV\CRM Agent\bankcat-backend"
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## 3) Configure Environment

Copy `.env.example` to `.env` and update:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bankcat
PG_POOL_MIN=5
PG_POOL_MAX=30
BANK_SEARCH_CANDIDATE_LIMIT=12000
```

PowerShell export for current terminal:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bankcat"
$env:PG_POOL_MIN="5"
$env:PG_POOL_MAX="30"
$env:BANK_SEARCH_CANDIDATE_LIMIT="12000"
```

## 4) Bulk Load 2 JSON Files

Default JSON directory expected:

`C:\Users\idris\Downloads\Bank Documents\CSV\CRM Agent\Bank Company Check Tool's`

Run loader:

```powershell
python .\load_bank_json_to_postgres.py --db-url $env:DATABASE_URL --fast
```

Useful options:

- `--batch-size 10000`
- `--pattern "Main-data*.json"`
- `--no-truncate` (append mode)

## 5) Start API (port 8100)

```powershell
uvicorn api:app --host 127.0.0.1 --port 8100
```

## 6) Endpoints

Health:

```http
GET /health
```

Stats:

```http
GET /api/stats
```

Search:

```http
GET /api/search?q=bajaj%20housing&limit=500
```

## Performance Notes

- Uses PostgreSQL `pg_trgm` + GIN trigram indexes.
- Uses full-text `to_tsvector` GIN index.
- Uses pooled async DB connections via `asyncpg`.
- Loader streams JSON with `ijson` and bulk loads with `COPY`.
