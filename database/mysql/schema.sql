CREATE DATABASE IF NOT EXISTS kroma_ai_gateway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kroma_ai_gateway;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  status VARCHAR(50) DEFAULT 'active',
  user_key TEXT,
  user_key_hash VARCHAR(255),
  quota_limit INT DEFAULT 0,
  usage_count INT DEFAULT 0,
  balance INT DEFAULT 0,
  token_version INT DEFAULT 0,
  last_login_at DATETIME NULL,
  email_verified_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY users_email_unique (email),
  KEY users_user_key_hash_idx (user_key_hash)
);

CREATE TABLE IF NOT EXISTS apis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  description TEXT,
  endpoint TEXT NOT NULL,
  model_slug VARCHAR(255),
  features JSON,
  versions JSON,
  price_per_token DECIMAL(18,6) DEFAULT 0,
  price_input DECIMAL(18,6) DEFAULT 0,
  price_output DECIMAL(18,6) DEFAULT 0,
  target_url TEXT,
  target_auth TEXT,
  active BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT TRUE,
  max_tokens INT DEFAULT 1024,
  default_temperature DECIMAL(8,4) DEFAULT 0.7,
  default_top_p DECIMAL(8,4),
  default_top_k INT,
  is_streaming BOOLEAN DEFAULT FALSE,
  timeout_ms INT,
  max_input_chars INT,
  speed_mode VARCHAR(100),
  provider VARCHAR(100),
  provider_model VARCHAR(255),
  rate_limit_per_minute INT,
  priority INT DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY apis_model_slug_idx (model_slug),
  KEY apis_active_idx (active)
);

CREATE TABLE IF NOT EXISTS plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(18,2) DEFAULT 0,
  currency VARCHAR(20) DEFAULT 'IDR',
  credits INT DEFAULT 0,
  bonus_credits INT DEFAULT 0,
  processing_fee INT DEFAULT 0,
  features JSON,
  popular BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  billing_cycle VARCHAR(50) DEFAULT 'one-time',
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY plans_active_idx (active)
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id VARCHAR(64) PRIMARY KEY,
  name TEXT NOT NULL,
  type VARCHAR(100) DEFAULT 'transfer',
  icon TEXT,
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  qr_url TEXT,
  min_amount INT DEFAULT 0,
  currency VARCHAR(20) DEFAULT 'IDR',
  active BOOLEAN DEFAULT TRUE,
  provider VARCHAR(100),
  sort_order INT DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY payment_methods_active_idx (active)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  plan_id_int INT,
  payment_method_id VARCHAR(64),
  user_key TEXT,
  user_email TEXT,
  user_name TEXT,
  plan_id TEXT,
  plan_name TEXT,
  credits INT DEFAULT 0,
  bonus_credits INT DEFAULT 0,
  price INT DEFAULT 0,
  currency VARCHAR(20) DEFAULT 'IDR',
  payment_method TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  metadata JSON,
  external_payment_id TEXT,
  payment_gateway TEXT,
  invoice_id TEXT,
  checkout_url TEXT,
  idempotency_key VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  expired_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  failed_at DATETIME NULL,
  refunded_at DATETIME NULL,
  KEY transactions_user_id_idx (user_id),
  KEY transactions_status_idx (status),
  KEY transactions_created_at_idx (created_at)
);

CREATE TABLE IF NOT EXISTS docs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title TEXT NOT NULL,
  slug VARCHAR(255),
  content TEXT,
  category VARCHAR(100) DEFAULT 'general',
  api_id INT,
  published BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY docs_category_idx (category),
  KEY docs_published_idx (published)
);

CREATE TABLE IF NOT EXISTS async_jobs (
  id VARCHAR(128) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'queued',
  endpoint TEXT NOT NULL,
  user_id INT,
  api_id INT,
  model_slug VARCHAR(255),
  request_payload JSON,
  result JSON,
  error JSON,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 0,
  priority INT DEFAULT 100,
  queue_name VARCHAR(100) DEFAULT 'default',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  failed_at DATETIME NULL,
  expires_at DATETIME NULL,
  KEY async_jobs_status_idx (status),
  KEY async_jobs_user_id_idx (user_id),
  KEY async_jobs_created_at_idx (created_at)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(128) PRIMARY KEY,
  user_id INT NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(100) NOT NULL,
  name TEXT,
  scopes JSON,
  last_used_at DATETIME NULL,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY api_keys_user_id_idx (user_id),
  KEY api_keys_key_hash_idx (key_hash)
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  api_id INT,
  api_key_id VARCHAR(128),
  request_id TEXT,
  endpoint TEXT,
  model_slug VARCHAR(255),
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  cost DECIMAL(18,6) DEFAULT 0,
  latency_ms INT,
  status_code INT,
  error_code TEXT,
  error_message TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY usage_logs_user_id_idx (user_id),
  KEY usage_logs_api_id_idx (api_id),
  KEY usage_logs_created_at_idx (created_at)
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  transaction_id INT,
  usage_log_id INT,
  type TEXT NOT NULL,
  amount INT NOT NULL,
  balance_after INT,
  reason TEXT,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY credit_ledger_user_id_idx (user_id),
  KEY credit_ledger_transaction_id_idx (transaction_id)
);

CREATE TABLE IF NOT EXISTS payment_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  transaction_id INT,
  event_type TEXT,
  payload JSON,
  status VARCHAR(50) DEFAULT 'pending',
  processed_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY payment_events_event_id_idx (event_id)
);

CREATE TABLE IF NOT EXISTS feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  conversation_id VARCHAR(255) NOT NULL,
  message_index INT NOT NULL,
  rating VARCHAR(10) NOT NULL,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY feedback_user_id_idx (user_id),
  KEY feedback_conversation_id_idx (conversation_id)
);

INSERT IGNORE INTO plans (id, name, price, currency, credits, bonus_credits, processing_fee, features, popular, active, billing_cycle)
VALUES (1, 'Starter', 50000, 'IDR', 5000, 2000, 2000, JSON_ARRAY('Cheap', 'Fast', 'Easy'), false, true, 'one-time');

INSERT IGNORE INTO payment_methods (id, name, type, icon, bank_name, account_number, account_name, min_amount, currency, active, sort_order)
VALUES ('bca', 'BCA', 'transfer', 'bank', 'Bank Central Asia', '008991222163', 'Amelia Waruwu', 15000, 'IDR', true, 100);

INSERT IGNORE INTO docs (id, title, slug, content, category, published, sort_order)
VALUES (1, 'Getting Started', 'getting-started', 'Welcome to Kroma AI Gateway.', 'general', true, 100);

INSERT IGNORE INTO apis (id, name, type, description, endpoint, model_slug, features, versions, price_per_token, price_input, price_output, target_url, target_auth, active, is_public, max_tokens, default_temperature, is_streaming, timeout_ms, max_input_chars, provider, provider_model)
VALUES (1, 'Qwen Chat', 'text-to-text', 'Chat completion model', '/ai/chat', 'qwen3:8b', JSON_ARRAY('chat', 'streaming'), JSON_ARRAY('v1'), 10, 10, 10, 'http://localhost:11434/api/chat', '', true, true, 2048, 0.7, true, 60000, 20000, 'ollama', 'qwen3:8b');
