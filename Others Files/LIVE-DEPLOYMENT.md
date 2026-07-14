# CRM Agent - Live Deployment Guide

## 1) Push frontend to GitHub

Run in PowerShell from this folder:

```powershell
git init
git branch -M main
git add .
git commit -m "CRM Agent live-ready setup"
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 2) Enable GitHub Pages

1. Open your repo on GitHub.
2. Go to `Settings -> Pages`.
3. Source: `Deploy from a branch`.
4. Branch: `main` and folder `/ (root)`.
5. Save.

Your frontend URL becomes:

```text
https://<your-username>.github.io/<your-repo>/
```

## 3) Deploy 3 backend APIs (Render/Railway/Fly)

You need 3 backend services:

- `mca-backend`
- `bankcat-backend`
- `pincode-backend`

Use start command for each service:

```bash
uvicorn api:app --host 0.0.0.0 --port $PORT
```

Set environment variable on each service:

```text
DATABASE_URL=postgresql://<user>:<pass>@<host>:<port>/<db_name>
```

Optional tuning env vars:

```text
PG_POOL_MIN=5
PG_POOL_MAX=30
PINCODE_SEARCH_CANDIDATE_LIMIT=10000
PINCODE_MAX_LIMIT=150
```

## 4) Load data into cloud PostgreSQL (one-time)

From local terminal (with Python env), run loaders pointing to your cloud DB URL:

```powershell
# MCA
python .\mca-backend\load_mca_json_to_postgres.py --db-url "<MCA_DATABASE_URL>" --fast

# Bank Category
python .\bankcat-backend\load_bank_json_to_postgres.py --db-url "<BANK_DATABASE_URL>" --fast

# Pincode
python .\pincode-backend\load_pincode_json_to_postgres.py --db-url "<PINCODE_DATABASE_URL>" --fast
```

## 5) Configure live API URLs in frontend

Open this page after deployment:

```text
https://<your-username>.github.io/<your-repo>/live-api-config.html
```

Set:

- MCA API Base: `https://<mca-service-domain>`
- Bank API Base: `https://<bank-service-domain>`
- Pincode API Base: `https://<pincode-service-domain>`

Click `Save API URLs`.

## 6) Verify

Open each API in browser:

- `https://<mca-service-domain>/health`
- `https://<bank-service-domain>/health`
- `https://<pincode-service-domain>/health`

Each should return `{"ok":true,...}`.

Then test tools from Launch page.

## 7) Notes

- GitHub Pages is static hosting only. APIs must run on external backend.
- Free backend plans may cold-start after inactivity.
- If API URL changes, update it from `live-api-config.html`.
