-- Venky's DM Team Dashboard - Supabase Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- AGENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  role TEXT NOT NULL,
  slack_channel_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default agents
INSERT INTO agents (id, name, emoji, color, role, slack_channel_id) VALUES
  ('wolf', 'Wolf', '🐺', '#2563EB', 'Coordinator', 'C0AFANUGH8T'),
  ('eagle', 'Eagle', '🦅', '#10B981', 'Scout', 'C0AFLP04KNG'),
  ('owl', 'Owl', '🦉', '#7C3AED', 'Researcher', 'C0AFTVBLCEM'),
  ('bee', 'Bee', '🐝', '#F59E0B', 'Drafter', 'C0AFF3MG8MU')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- RUNS TABLE (Cron Job Executions)
-- ============================================
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  job_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  last_delivery_status TEXT,
  consecutive_errors INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_runs_agent_id ON runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);

-- ============================================
-- TOPICS TABLE (Scouted by Eagle)
-- ============================================
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  scout_run_id TEXT,
  title TEXT NOT NULL,
  source TEXT,
  url TEXT,
  platform TEXT,
  published_date TEXT,
  signal_type TEXT CHECK (signal_type IN ('A', 'B', 'C', 'D', 'E')),
  engagement TEXT,
  fit_score TEXT CHECK (fit_score IN ('Very Strong', 'Strong', 'Moderate', 'Weak')),
  summary TEXT,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'researched'))
);

CREATE INDEX IF NOT EXISTS idx_topics_discovered_at ON topics(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);

-- ============================================
-- RESEARCH_BRIEFS TABLE (Created by Owl)
-- ============================================
CREATE TABLE IF NOT EXISTS research_briefs (
  id TEXT PRIMARY KEY,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source_research TEXT,
  insights JSONB,
  venky_angle TEXT,
  brief_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_research_briefs_topic_id ON research_briefs(topic_id);
CREATE INDEX IF NOT EXISTS idx_research_briefs_status ON research_briefs(status);

-- ============================================
-- DRAFTS TABLE (Created by Bee)
-- ============================================
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  research_id TEXT REFERENCES research_briefs(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  draft_type TEXT NOT NULL CHECK (draft_type IN ('deep-dive', 'commentary', 'quick-tip')),
  word_count INTEGER,
  content TEXT,
  file_path TEXT,
  target_publish_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'published')),
  pick_recommended BOOLEAN DEFAULT FALSE,
  published_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_drafts_target_publish_date ON drafts(target_publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_draft_type ON drafts(draft_type);

-- ============================================
-- CALENDAR TABLE (Content Calendar)
-- ============================================
CREATE TABLE IF NOT EXISTS calendar (
  id TEXT PRIMARY KEY,
  draft_id TEXT REFERENCES drafts(id) ON DELETE SET NULL,
  publish_date DATE NOT NULL,
  post_type TEXT NOT NULL CHECK (post_type IN ('deep-dive', 'commentary', 'quick-tip')),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'published', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_publish_date ON calendar(publish_date DESC);

-- ============================================
-- VIEWS FOR DASHBOARD
-- ============================================

-- Pipeline status view
CREATE OR REPLACE VIEW pipeline_status AS
SELECT
  c.id,
  c.publish_date,
  c.post_type,
  c.status as calendar_status,
  d.topic,
  d.id as draft_id,
  d.status as draft_status,
  d.pick_recommended,
  d.word_count
FROM calendar c
LEFT JOIN drafts d ON c.draft_id = d.id
ORDER BY c.publish_date;

-- Weekly metrics view
CREATE OR REPLACE VIEW weekly_metrics AS
SELECT
  COUNT(DISTINCT t.id) as topics_found,
  COUNT(DISTINCT rb.id) as briefs_created,
  COUNT(DISTINCT d.id) as drafts_generated,
  SUM(CASE WHEN d.status = 'approved' THEN 1 ELSE 0 END) as drafts_approved,
  SUM(CASE WHEN d.status = 'published' THEN 1 ELSE 0 END) as drafts_published,
  COUNT(DISTINCT r.id) as total_runs,
  SUM(r.duration_ms) / 1000 as total_duration_seconds
FROM runs r
LEFT JOIN topics t ON r.job_id LIKE '%scout%'
LEFT JOIN research_briefs rb ON r.job_id LIKE '%research%'
LEFT JOIN drafts d ON r.job_id LIKE '%draft%'
WHERE r.started_at >= NOW() - INTERVAL '7 days';

-- ============================================
-- ROW LEVEL SECURITY (Optional - for multi-tenant)
-- ============================================
-- Enable RLS if needed later
-- ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE research_briefs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE calendar ENABLE ROW LEVEL SECURITY;

-- ============================================
-- REALTIME (Required for live dashboard updates)
-- ============================================
-- Enable Supabase Realtime on key tables:
ALTER PUBLICATION supabase_realtime ADD TABLE topics;
ALTER PUBLICATION supabase_realtime ADD TABLE drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE runs;