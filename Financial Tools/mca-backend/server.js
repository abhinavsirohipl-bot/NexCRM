import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 8300);
const DATA_GOV_API_KEY = process.env.DATA_GOV_API_KEY || '';
const DATA_GOV_BASE_URL = (process.env.DATA_GOV_BASE_URL || 'https://api.data.gov.in').replace(/\/$/, '');
const DATA_GOV_MCA_ENDPOINT_PATH = process.env.DATA_GOV_MCA_ENDPOINT_PATH || '/resource/registrars-companies-roc-wise-company-master-data';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 12000);
const DATA_GOV_LIMIT = Number(process.env.DATA_GOV_LIMIT || 25);
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 600);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

const cache = new Map();

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '50kb' }));

const allowedOrigins = FRONTEND_ORIGIN.split(',').map((x) => x.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again after a minute.' } }
}));

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'nexcrm-mca-proxy', configured: Boolean(DATA_GOV_API_KEY) });
});

app.get('/api/mca/company', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!DATA_GOV_API_KEY) {
    return res.status(500).json({
      success: false,
      query,
      count: 0,
      data: [],
      error: {
        code: 'MISSING_API_KEY',
        message: 'Backend DATA_GOV_API_KEY is not configured. Add it to .env on the server.'
      }
    });
  }

  if (query.length < 2) {
    return res.status(400).json({
      success: false,
      query,
      count: 0,
      data: [],
      error: { code: 'INVALID_QUERY', message: 'Enter at least 2 characters of Company Name, CIN, or LLPIN.' }
    });
  }

  const cacheKey = normalizeText(query);
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const upstreamPayload = await searchDataGov(query);
    const normalized = normalizeResponse(query, upstreamPayload);

    if (normalized.count === 0) {
      const noResult = {
        success: false,
        query,
        count: 0,
        data: [],
        error: { code: 'NO_RESULT', message: 'No company record found for this search.' }
      };
      setCache(cacheKey, noResult);
      return res.status(404).json(noResult);
    }

    setCache(cacheKey, normalized);
    return res.json(normalized);
  } catch (error) {
    return handleError(error, query, res);
  }
});

async function searchDataGov(query) {
  const endpointPath = DATA_GOV_MCA_ENDPOINT_PATH.startsWith('/')
    ? DATA_GOV_MCA_ENDPOINT_PATH
    : `/${DATA_GOV_MCA_ENDPOINT_PATH}`;
  const baseEndpoint = `${DATA_GOV_BASE_URL}${endpointPath}`;

  const candidates = buildCandidateParams(query);
  let lastPayload = null;

  for (const params of candidates) {
    const url = new URL(baseEndpoint);
    url.searchParams.set('api-key', DATA_GOV_API_KEY);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(DATA_GOV_LIMIT));
    url.searchParams.set('offset', '0');
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const payload = await fetchJsonWithTimeout(url);
    lastPayload = payload;
    const records = extractRecords(payload);
    const filtered = filterRelevant(records, query);

    if (filtered.length > 0) {
      return { ...payload, records: filtered };
    }
  }

  return { ...(lastPayload || {}), records: [] };
}

function buildCandidateParams(query) {
  const q = query.trim();
  const looksLikeCin = /^[A-Z]{1,2}\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/i.test(q);
  const looksLikeLlpin = /^[A-Z]{3}-?\d{4}$/i.test(q) || /^[A-Z]{2}\d{6}$/i.test(q);

  const generic = [{ q }];
  const nameFields = [
    'company_name',
    'name_of_company',
    'companyname',
    'company_name_'
  ].map((field) => ({ [`filters[${field}]`]: q }));

  const idFields = [
    'cin',
    'llpin',
    'corporate_identification_number',
    'corporate_identification_number_cin',
    'corporate_identity_number'
  ].map((field) => ({ [`filters[${field}]`]: q }));

  if (looksLikeCin || looksLikeLlpin) return [...idFields, ...generic, ...nameFields];
  return [...generic, ...nameFields, ...idFields];
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'NexCRM-MCA-Proxy/1.0'
      }
    });

    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      const err = new Error('data.gov.in returned a non-JSON response.');
      err.code = 'BAD_UPSTREAM_JSON';
      err.status = 502;
      throw err;
    }

    if (!response.ok || hasInvalidKeyMessage(payload)) {
      const err = new Error('data.gov.in rejected the API request.');
      err.code = response.status === 401 || response.status === 403 || hasInvalidKeyMessage(payload)
        ? 'INVALID_API_KEY'
        : 'UPSTREAM_ERROR';
      err.status = response.status || 502;
      err.upstream = safeUpstreamMessage(payload);
      throw err;
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      const err = new Error('data.gov.in request timed out.');
      err.code = 'UPSTREAM_TIMEOUT';
      err.status = 504;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeResponse(query, payload) {
  const records = extractRecords(payload);
  const data = records.map((record) => normalizeRecord(record));
  return {
    success: true,
    query,
    count: data.length,
    data
  };
}

function extractRecords(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  if (payload.result && Array.isArray(payload.result.records)) return payload.result.records;
  if (payload.response && Array.isArray(payload.response.records)) return payload.response.records;
  return [];
}

function normalizeRecord(record) {
  return {
    company_name: pick(record, ['company_name', 'company_name_', 'name_of_company', 'companyname', 'name', 'company_llp_name']),
    cin: pick(record, ['cin', 'llpin', 'corporate_identification_number', 'corporate_identification_number_cin', 'corporate_identity_number', 'company_cin', 'company_llpin']),
    company_status: pick(record, ['company_status', 'status', 'company_status_for_efiling', 'company_llp_status', 'status_of_company']),
    roc: pick(record, ['roc', 'registrar_of_companies', 'registrar_of_companies_roc', 'roc_code', 'roc_name']),
    registration_number: pick(record, ['registration_number', 'registration_no', 'reg_no', 'company_registration_number']),
    date_of_incorporation: pick(record, ['date_of_incorporation', 'date_of_registration', 'incorporation_date', 'registration_date']),
    company_class: pick(record, ['company_class', 'class_of_company', 'class']),
    company_category: pick(record, ['company_category', 'category', 'category_of_company']),
    company_sub_category: pick(record, ['company_sub_category', 'sub_category', 'subcategory', 'sub_category_of_company']),
    authorized_capital: pick(record, ['authorized_capital', 'authorised_capital', 'authorized_capital_in_inr', 'authorised_capital_in_inr', 'authorized_capital_rs']),
    paid_up_capital: pick(record, ['paid_up_capital', 'paidup_capital', 'paid_up_capital_in_inr', 'paidup_capital_in_inr', 'paid_up_capital_rs']),
    registered_state: pick(record, ['registered_state', 'state', 'state_of_registration', 'registered_office_state']),
    registered_office_address: pick(record, ['registered_office_address', 'registered_address', 'company_address', 'address', 'registered_office_full_address']),
    main_division: pick(record, ['main_division', 'principal_business_activity', 'business_activity', 'activity_description', 'main_activity', 'industrial_class']),
    last_agm_date: pick(record, ['last_agm_date', 'date_of_last_agm', 'last_annual_general_meeting_date']),
    last_balance_sheet_date: pick(record, ['last_balance_sheet_date', 'date_of_balance_sheet', 'balance_sheet_date', 'date_of_last_balance_sheet']),
    raw: record
  };
}

function pick(record, aliases) {
  if (!record || typeof record !== 'object') return '';
  const lookup = new Map();

  for (const [key, value] of Object.entries(record)) {
    const safeValue = value === null || value === undefined ? '' : String(value).trim();
    lookup.set(normalizeKey(key), safeValue);
  }

  for (const alias of aliases) {
    const value = lookup.get(normalizeKey(alias));
    if (value) return value;
  }

  return '';
}

function filterRelevant(records, query) {
  const needle = normalizeText(query);
  if (!needle) return [];

  return records.filter((record) => {
    const normalized = normalizeRecord(record);
    const haystack = normalizeText([
      normalized.company_name,
      normalized.cin,
      record?.cin,
      record?.llpin,
      record?.company_name,
      JSON.stringify(record)
    ].join(' '));
    const cinNeedle = normalizeText(normalized.cin);
    return haystack.includes(needle) || (cinNeedle && needle.includes(cinNeedle));
  });
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasInvalidKeyMessage(payload) {
  const msg = safeUpstreamMessage(payload).toLowerCase();
  return msg.includes('invalid api') || msg.includes('invalid key') || msg.includes('api key') && msg.includes('invalid') || msg.includes('unauthorized');
}

function safeUpstreamMessage(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.message || payload.error || payload.statusMsg || payload.status || '').slice(0, 300);
}

function handleError(error, query, res) {
  const code = error.code || 'SERVER_ERROR';
  const status = code === 'INVALID_API_KEY' ? 401 : error.status || 500;

  const messages = {
    INVALID_API_KEY: 'Invalid data.gov.in API key or key is not allowed for this API.',
    UPSTREAM_TIMEOUT: 'data.gov.in request timed out. Please try again.',
    BAD_UPSTREAM_JSON: 'data.gov.in returned an invalid response.',
    UPSTREAM_ERROR: 'data.gov.in returned an error while fetching MCA data.',
    SERVER_ERROR: 'Something went wrong while checking company data.'
  };

  return res.status(status).json({
    success: false,
    query,
    count: 0,
    data: [],
    error: {
      code,
      message: messages[code] || messages.SERVER_ERROR,
      upstream: error.upstream || undefined
    }
  });
}

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000
  });
}

app.listen(PORT, () => {
  console.log(`NexCRM MCA proxy running on http://localhost:${PORT}`);
  console.log(`API key configured: ${Boolean(DATA_GOV_API_KEY)}`);
});
