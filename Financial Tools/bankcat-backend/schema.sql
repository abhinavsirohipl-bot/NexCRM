CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS bank_company_categories (
  id BIGSERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  category TEXT NOT NULL,
  company_name_norm TEXT NOT NULL,
  bank_name_norm TEXT NOT NULL,
  category_norm TEXT NOT NULL,
  search_text TEXT NOT NULL,
  search_text_norm TEXT NOT NULL,
  source_file TEXT,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcc_company_name_norm_trgm
  ON bank_company_categories USING GIN (company_name_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_bcc_bank_name_norm_trgm
  ON bank_company_categories USING GIN (bank_name_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_bcc_category_norm_trgm
  ON bank_company_categories USING GIN (category_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_bcc_search_text_norm_trgm
  ON bank_company_categories USING GIN (search_text_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_bcc_search_tsv
  ON bank_company_categories USING GIN (to_tsvector('simple', search_text));

CREATE INDEX IF NOT EXISTS idx_bcc_company_name_lower
  ON bank_company_categories (lower(company_name));

CREATE INDEX IF NOT EXISTS idx_bcc_bank_name_lower
  ON bank_company_categories (lower(bank_name));

CREATE INDEX IF NOT EXISTS idx_bcc_company_name_norm_prefix
  ON bank_company_categories (company_name_norm text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_bcc_bank_name_norm_prefix
  ON bank_company_categories (bank_name_norm text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_bcc_category_norm_prefix
  ON bank_company_categories (category_norm text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_bcc_loaded_at
  ON bank_company_categories (loaded_at DESC);
