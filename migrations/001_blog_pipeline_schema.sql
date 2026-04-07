-- Migration: Blog Pipeline Schema (v1)
-- Purpose: Add fields and constraints required by PRD
-- Run in: Supabase SQL Editor
-- Date: 2026-04-07

-- ============================================
-- 1. UPDATE topics TABLE
-- ============================================

-- 1.1: Ensure summary is TEXT type (not VARCHAR)
ALTER TABLE topics
  ALTER COLUMN summary SET DATA TYPE TEXT;

-- 1.2: Add revision tracking columns
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS revision_count INT DEFAULT 0;

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS revised_at TIMESTAMP WITH TIME ZONE;

-- 1.3: Update stage enum to include all valid values
-- First, update any invalid stage values
UPDATE topics SET stage = 'scouted'
  WHERE stage NOT IN ('scouted', 'researching', 'researched', 'revise_needed', 'drafting', 'drafted', 'ready_to_post', 'published', 'archived');

-- Create new enum type with all stages
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'topic_stage_new') THEN
    -- Drop if exists
    DROP TYPE IF EXISTS topic_stage_new CASCADE;
  END IF;

  CREATE TYPE topic_stage_new AS ENUM (
    'scouted',
    'researching',
    'researched',
    'revise_needed',
    'drafting',
    'drafted',
    'ready_to_post',
    'published',
    'archived'
  );
END $$;

-- Migrate to new enum
ALTER TABLE topics
  ALTER COLUMN stage TYPE topic_stage_new USING stage::text::topic_stage_new;

-- Drop old enum if it exists
DO $$
BEGIN
  DROP TYPE IF EXISTS topic_stage CASCADE;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Rename new enum to old name
ALTER TYPE topic_stage_new RENAME TO topic_stage;

-- 1.4: Update status enum to include revision states
UPDATE topics SET status = 'pending'
  WHERE status NOT IN ('scouted', 'pending', 'researched', 'rejected', 'archived', 'revise_needed', 'revising');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'topic_status_new') THEN
    DROP TYPE IF EXISTS topic_status_new CASCADE;
  END IF;

  CREATE TYPE topic_status_new AS ENUM (
    'scouted',
    'pending',
    'researched',
    'rejected',
    'archived',
    'revise_needed',
    'revising'
  );
END $$;

ALTER TABLE topics
  ALTER COLUMN status TYPE topic_status_new USING status::text::topic_status_new;

DO $$
BEGIN
  DROP TYPE IF EXISTS topic_status CASCADE;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TYPE topic_status_new RENAME TO topic_status;

-- ============================================
-- 2. UPDATE drafts TABLE
-- ============================================

-- 2.1: Add word count caching
ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS word_count INT;

-- 2.2: Add version tracking for revisions
ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;

-- 2.3: Calculate word count for existing drafts
UPDATE drafts
  SET word_count = array_length(string_to_array(content, ' '), 1)
  WHERE content IS NOT NULL AND word_count IS NULL;

-- 2.4: Update draft stage enum
UPDATE drafts SET stage = 'drafted'
  WHERE stage NOT IN ('researched', 'drafted', 'revise_needed', 'ready_to_post', 'published', 'archived');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'draft_stage_new') THEN
    DROP TYPE IF EXISTS draft_stage_new CASCADE;
  END IF;

  CREATE TYPE draft_stage_new AS ENUM (
    'researched',
    'drafted',
    'revise_needed',
    'ready_to_post',
    'published',
    'archived'
  );
END $$;

ALTER TABLE drafts
  ALTER COLUMN stage TYPE draft_stage_new USING stage::text::draft_stage_new;

DO $$
BEGIN
  DROP TYPE IF EXISTS draft_stage CASCADE;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TYPE draft_stage_new RENAME TO draft_stage;

-- 2.5: Update draft status enum
UPDATE drafts SET status = 'pending'
  WHERE status NOT IN ('pending', 'approved', 'rejected', 'archived', 'revise_needed', 'revising');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'draft_status_new') THEN
    DROP TYPE IF EXISTS draft_status_new CASCADE;
  END IF;

  CREATE TYPE draft_status_new AS ENUM (
    'pending',
    'approved',
    'rejected',
    'archived',
    'revise_needed',
    'revising'
  );
END $$;

ALTER TABLE drafts
  ALTER COLUMN status TYPE draft_status_new USING status::text::draft_status_new;

DO $$
BEGIN
  DROP TYPE IF EXISTS draft_status CASCADE;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TYPE draft_status_new RENAME TO draft_status;

-- ============================================
-- 3. VERIFY CONSTRAINTS
-- ============================================

-- Ensure canonical_id exists and is indexed for dedup
CREATE INDEX IF NOT EXISTS idx_topics_canonical_id ON topics(canonical_id);
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_topics_stage ON topics(stage);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_stage ON drafts(stage);
CREATE INDEX IF NOT EXISTS idx_drafts_topic ON drafts(topic);

-- ============================================
-- 4. MIGRATION COMPLETE
-- ============================================

-- Verify no truncated research briefs
SELECT
  COUNT(*) as topics_with_short_brief,
  MIN(LENGTH(summary)) as shortest_brief
FROM topics
WHERE summary IS NOT NULL
  AND LENGTH(summary) < 5000
  AND status NOT IN ('rejected', 'archived');

-- Show sample of topics by stage/status
SELECT stage, status, COUNT(*) as count
FROM topics
GROUP BY stage, status
ORDER BY stage, status;
