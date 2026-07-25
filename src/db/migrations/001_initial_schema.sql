-- 001_initial_schema.sql
--
-- Squash of every CREATE TABLE that previously lived in src/db/schema.js's
-- initSchema(). Idempotent — uses IF NOT EXISTS — so existing databases that
-- were initialized by the legacy serial code are safe to re-apply.
--
-- The legacy `ensureTableColumns(...)` calls have been inlined as part of each
-- CREATE so the table shape matches what the application code expects.
-- Future schema changes go in 002_*.sql, 003_*.sql, etc.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'personal',
  is_active BOOLEAN DEFAULT 1,
  auth_provider TEXT DEFAULT 'local',
  google_id TEXT,
  email_verified BOOLEAN DEFAULT 0,
  avatar_url TEXT,
  failed_logins INTEGER DEFAULT 0,
  locked_until DATETIME,
  last_login DATETIME,
  credits INTEGER DEFAULT 0,
  credits_refreshed_at DATETIME,
  seat_count INTEGER DEFAULT 1,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'inactive',
  subscription_current_period_end DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  admin_level INTEGER DEFAULT 1,
  permissions TEXT DEFAULT 'read,write',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS banned_ips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT UNIQUE NOT NULL,
  reason TEXT NOT NULL,
  banned_by INTEGER NOT NULL,
  banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (banned_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS user_bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  banned_by INTEGER NOT NULL,
  banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (banned_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS whiteboard_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#238636',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  assignee TEXT DEFAULT 'Unassigned',
  status TEXT DEFAULT 'Not started',
  date TEXT DEFAULT 'Today',
  comments INTEGER DEFAULT 0,
  attachments INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'Low',
  labels TEXT DEFAULT '',
  completed INTEGER DEFAULT 0,
  time_spent INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS heatmap_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  place_id TEXT NOT NULL,
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  keyword TEXT NOT NULL,
  grid_size INTEGER DEFAULT 7,
  step_meters INTEGER DEFAULT 500,
  radius_meters INTEGER DEFAULT 3000,
  shape TEXT DEFAULT 'square',
  use_radius INTEGER DEFAULT 1,
  use_meters INTEGER DEFAULT 1,
  snapshots INTEGER DEFAULT 0,
  latest_html_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_run_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  website TEXT,
  category TEXT,
  place_id TEXT UNIQUE,
  rating REAL,
  reviews INTEGER,
  photos INTEGER,
  coordinates TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  search_volume INTEGER,
  difficulty TEXT,
  target_url TEXT,
  country TEXT,
  language TEXT,
  device TEXT DEFAULT 'desktop',
  last_position INTEGER,
  best_position INTEGER,
  worst_position INTEGER,
  last_checked_at DATETIME,
  status TEXT DEFAULT 'idle',
  notes TEXT,
  last_snapshot TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ranking_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  search_engine TEXT DEFAULT 'google',
  location TEXT,
  device TEXT DEFAULT 'desktop',
  date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (keyword_id) REFERENCES keywords (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  distance TEXT,
  rating REAL,
  reviews INTEGER,
  position INTEGER,
  backlinks INTEGER,
  website TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS backlinks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  anchor_text TEXT,
  type TEXT,
  domain_authority INTEGER,
  spam_score INTEGER,
  date_found DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS traffic_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  monthly_visits INTEGER,
  growth_rate REAL,
  organic_percentage INTEGER,
  direct_percentage INTEGER,
  social_percentage INTEGER,
  referral_percentage INTEGER,
  top_keywords TEXT,
  date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (user_id, setting_key)
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS api_quota (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  service TEXT NOT NULL,
  limit_per_period INTEGER NOT NULL,
  period_hours INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, service)
);

CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  service TEXT NOT NULL,
  period_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, service, period_start)
);

CREATE TABLE IF NOT EXISTS api_request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  service TEXT NOT NULL,
  credits INTEGER DEFAULT 1,
  meta TEXT,
  success INTEGER DEFAULT 1,
  status_code INTEGER,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  change INTEGER NOT NULL,
  reason TEXT,
  balance_after INTEGER,
  meta TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  entity_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zipcode TEXT,
  country TEXT DEFAULT 'US',
  email TEXT,
  website TEXT,
  description TEXT,
  year_established INTEGER,
  categories TEXT,
  services TEXT,
  keywords TEXT,
  working_hours TEXT,
  social_profiles TEXT,
  logo_url TEXT,
  logo_description TEXT,
  photos TEXT,
  featured_message TEXT,
  status TEXT DEFAULT 'COMPLETE',
  provider TEXT DEFAULT 'INTERNAL',
  business_id_slug TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  listings_created_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  publisher_id TEXT NOT NULL,
  listing_url TEXT,
  status TEXT DEFAULT 'LIVE',
  status_details TEXT,
  last_checked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES business_entities (entity_id) ON DELETE CASCADE,
  UNIQUE (entity_id, publisher_id)
);

CREATE TABLE IF NOT EXISTS publisher_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  publisher_id TEXT NOT NULL,
  account_id TEXT,
  status TEXT DEFAULT 'WAITING_ON_CUSTOMER',
  alternate_brands TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES business_entities (entity_id) ON DELETE CASCADE,
  UNIQUE (entity_id, publisher_id)
);

CREATE TABLE IF NOT EXISTS press_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  website TEXT NOT NULL,
  author TEXT NOT NULL,
  service TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'ready',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  website TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  topic TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'ready',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS citation_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  business_name TEXT NOT NULL,
  business_website TEXT,
  business_address TEXT,
  business_phone TEXT,
  business_city TEXT,
  business_state TEXT,
  business_zipcode TEXT,
  country TEXT DEFAULT 'US',
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  total_citations INTEGER DEFAULT 0,
  found_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  not_found_count INTEGER DEFAULT 0,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS citation_audit_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT,
  status TEXT DEFAULT 'pending',
  found_url TEXT,
  found_name TEXT,
  found_address TEXT,
  found_phone TEXT,
  found_website TEXT,
  name_match INTEGER DEFAULT 0,
  address_match INTEGER DEFAULT 0,
  phone_match INTEGER DEFAULT 0,
  website_match INTEGER DEFAULT 0,
  checked_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (audit_id) REFERENCES citation_audits (id) ON DELETE CASCADE
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_name ON projects(user_id, name);
CREATE INDEX IF NOT EXISTS idx_citation_audits_user ON citation_audits(user_id);
CREATE INDEX IF NOT EXISTS idx_citation_audit_results_audit ON citation_audit_results(audit_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keywords_business ON keywords(business_id);
-- Indexes that reference late-added columns (users.stripe_customer_id,
-- users.stripe_subscription_id, users.google_id, business_entities.business_id_slug)
-- live in migration 002, after the column reconciliation step has guaranteed
-- those columns exist on legacy databases.
