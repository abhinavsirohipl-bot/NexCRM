# NexCRM MCA Company Check Backend Proxy

Secure backend/proxy for `Financial Tools/MCA-Company-Check.html`.

## Why this backend is required

The data.gov.in API key must never be placed in frontend HTML, JavaScript, browser localStorage, or public GitHub files. This backend reads `DATA_GOV_API_KEY` from server environment only and exposes your safe NexCRM endpoint:

```http
GET /api/mca/company?q=<company name or CIN>
```

## Folder placement

Recommended project structure:

```txt
NexCRM/
  index.html
  admin-dashboard.html
  employee-dashboard.html
  Financial Tools/
    MCA-Company-Check.html
  mca-backend/
    server.js
    package.json
    .env
    .env.example
    README-MCA.md
```

## Local setup

```bash
cd mca-backend
npm install
copy .env.example .env
```

Edit `.env`:

```env
DATA_GOV_API_KEY=your_real_data_gov_in_key_here
PORT=8300
FRONTEND_ORIGIN=*
DATA_GOV_BASE_URL=https://api.data.gov.in
DATA_GOV_MCA_ENDPOINT_PATH=/resource/registrars-companies-roc-wise-company-master-data
```

Run:

```bash
npm start
```

Test:

```bash
curl "http://localhost:8300/health"
curl "http://localhost:8300/api/mca/company?q=ABC%20PRIVATE%20LIMITED"
```

## Frontend API base setup

If frontend and backend are on the same domain, keep this in HTML:

```js
const MCA_API_BASE_URL = '';
```

If your backend is separate while testing locally, set:

```js
const MCA_API_BASE_URL = 'http://localhost:8300';
```

For production, use your backend domain:

```js
const MCA_API_BASE_URL = 'https://api.yourdomain.com';
```

## Deployment options

### Option A: Same server/domain

1. Host static NexCRM files normally.
2. Run `mca-backend` on the same server using PM2.
3. Reverse proxy `/api/mca/company` to Node server.

Example PM2:

```bash
npm install -g pm2
cd mca-backend
pm2 start server.js --name nexcrm-mca-proxy
pm2 save
```

### Option B: Render/Railway/Node hosting

1. Deploy `mca-backend` folder as a Node service.
2. Add environment variable `DATA_GOV_API_KEY` in hosting dashboard.
3. Add `FRONTEND_ORIGIN=https://your-nexcrm-domain.com`.
4. In HTML, set `MCA_API_BASE_URL` to backend URL.

## Important notes

- Do not commit `.env`.
- Do not store data.gov.in API key in frontend/localStorage.
- If the exact data.gov.in endpoint path shown in your data.gov.in API console is different, update `DATA_GOV_MCA_ENDPOINT_PATH` in `.env`.
