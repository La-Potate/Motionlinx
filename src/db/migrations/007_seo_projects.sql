-- 007_seo_projects.sql
--
-- AI Assistant feature: GSC-backed SEO projects, analysis runs, findings,
-- and the cache tables that keep DataForSEO / GSC quotas under control.
--
-- New tables only. Touches no existing schema. The existing generic
-- `projects` table (task-board) is unrelated and unchanged.

CREATE TABLE IF NOT EXISTS seo_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  primary_domain TEXT,
  notes TEXT DEFAULT '',
  last_run_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (user_id, name)
);

-- Cached per-user property list from sites.list. site_url is the GSC
-- property identifier exactly as returned (sc-domain:example.com or
-- https://www.example.com/).
CREATE TABLE IF NOT EXISTS gsc_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  site_url TEXT NOT NULL,
  permission_level TEXT,
  verified INTEGER DEFAULT 1,
  last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (user_id, site_url)
);

CREATE TABLE IF NOT EXISTS seo_project_properties (
  project_id INTEGER NOT NULL,
  site_url TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, site_url),
  FOREIGN KEY (project_id) REFERENCES seo_projects (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  job_id TEXT,
  prev_run_id INTEGER,
  scores_json TEXT,
  summary_json TEXT,
  url_count INTEGER DEFAULT 0,
  error TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES seo_projects (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analysis_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  impact INTEGER DEFAULT 50,
  title TEXT NOT NULL,
  description TEXT,
  affected_urls_json TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  dedupe_key TEXT NOT NULL,
  first_seen_run_id INTEGER,
  resolved_run_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES analysis_runs (id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES seo_projects (id) ON DELETE CASCADE
);

-- GSC performance rows pulled via searchAnalytics.query, paginated to bypass
-- the 50,000-row cap. One row per dimension combination per date range.
CREATE TABLE IF NOT EXISTS gsc_performance_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  site_url TEXT NOT NULL,
  query TEXT,
  page TEXT,
  country TEXT,
  device TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  position REAL DEFAULT 0,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES seo_projects (id) ON DELETE CASCADE
);

-- URL Inspection cache (one row per URL per project). The URL Inspection API
-- is per-URL only, so this caches expensive lookups across runs.
CREATE TABLE IF NOT EXISTS url_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  site_url TEXT NOT NULL,
  url TEXT NOT NULL,
  result_json TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES seo_projects (id) ON DELETE CASCADE,
  UNIQUE (project_id, url)
);

CREATE TABLE IF NOT EXISTS lighthouse_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'mobile',
  scores_json TEXT,
  audits_json TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES seo_projects (id) ON DELETE CASCADE,
  UNIQUE (project_id, url, strategy)
);

-- On-page crawl result, one row per URL. Stores the shape we actually use,
-- not the raw DataForSEO payload (we keep the raw payload in result_json).
CREATE TABLE IF NOT EXISTS onpage_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER,
  title TEXT,
  meta_description TEXT,
  h1 TEXT,
  word_count INTEGER,
  issues_json TEXT,
  result_json TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES seo_projects (id) ON DELETE CASCADE,
  UNIQUE (project_id, url)
);

CREATE TABLE IF NOT EXISTS internal_link_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  from_url TEXT NOT NULL,
  to_url TEXT NOT NULL,
  anchor_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES seo_projects (id) ON DELETE CASCADE
);

-- Keyed by project + source + query_hash so repeat lookups dedupe inside a
-- TTL window. source: 'labs_ideas' | 'labs_ranked' | 'labs_gap' | 'labs_competitors' | 'ai_keyword'.
CREATE TABLE IF NOT EXISTS keyword_research_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  result_json TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES seo_projects (id) ON DELETE CASCADE,
  UNIQUE (project_id, source, query_hash)
);

CREATE TABLE IF NOT EXISTS gsc_sitemaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  site_url TEXT NOT NULL,
  sitemap_url TEXT NOT NULL,
  last_submitted DATETIME,
  last_downloaded DATETIME,
  warnings INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  contents_count INTEGER DEFAULT 0,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES seo_projects (id) ON DELETE CASCADE,
  UNIQUE (project_id, sitemap_url)
);

CREATE INDEX IF NOT EXISTS idx_seo_projects_user ON seo_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_gsc_properties_user ON gsc_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_project_created ON analysis_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_run ON analysis_findings(run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_project_status ON analysis_findings(project_id, status);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_dedupe ON analysis_findings(project_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_gsc_perf_project_dates ON gsc_performance_cache(project_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_url_inspections_project ON url_inspections(project_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_lighthouse_project ON lighthouse_results(project_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_onpage_project ON onpage_pages(project_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_internal_links_project ON internal_link_edges(project_id);
CREATE INDEX IF NOT EXISTS idx_keyword_cache_project ON keyword_research_cache(project_id, source, fetched_at);
CREATE INDEX IF NOT EXISTS idx_gsc_sitemaps_project ON gsc_sitemaps(project_id);
