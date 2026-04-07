# Database Migrations

This directory contains SQL migrations for the blog pipeline database schema.

## Running Migrations

### Method 1: Supabase Web Console (Recommended)

1. Go to: https://supabase.com/dashboard/project/tptbfxjprpzxwsrerwjm/sql
2. Click **"New Query"** button
3. Copy entire contents of `001_blog_pipeline_schema.sql`
4. Paste into the query editor
5. Click **"Run"** button (or Ctrl+Enter)
6. Wait for green checkmark ✓

### Method 2: psql CLI (if connected to Supabase)

```bash
psql -h db.tptbfxjprpzxwsrerwjm.supabase.co \
     -U postgres \
     -d postgres \
     -f migrations/001_blog_pipeline_schema.sql
```

## Migration: 001_blog_pipeline_schema.sql

**Purpose**: Update schema to support PRD requirements

**Changes**:
1. **topics.summary** → TEXT type (support 5000-50000 chars without truncation)
2. **topics** → Add `revision_count`, `revised_at` columns
3. **topics.stage** → Add enum values: `researching`, `revise_needed`, `drafting`
4. **topics.status** → Add enum values: `revise_needed`, `revising`
5. **drafts** → Add `word_count`, `version` columns
6. **drafts.stage** → Add enum value: `revise_needed`
7. **drafts.status** → Add enum value: `revise_needed`, `revising`
8. **Create indexes** for: canonical_id, status, stage, topic (performance)

**Verification**:
- Counts topics with summary < 5000 chars (for manual review)
- Shows distribution by stage/status
- Ensures no data loss during enum migrations

## Checklist

Before running migration:
- [ ] Backup database (Supabase automatically does this)
- [ ] Read migration SQL to understand changes
- [ ] Verify you're in correct Supabase project

After running migration:
- [ ] Check for green checkmark (success)
- [ ] Verify: `SELECT LENGTH(summary) FROM topics WHERE summary IS NOT NULL LIMIT 1;`
  - Should show > 5000 for full briefs, < 5000 for truncated ones (for awareness)
- [ ] Verify enums: `SELECT DISTINCT stage FROM topics;`
  - Should include: scouted, researching, researched, revise_needed, drafting, drafted, ready_to_post, published, archived
- [ ] Verify word_count: `SELECT COUNT(*) FROM drafts WHERE word_count IS NOT NULL;`
  - Should match number of drafts with content

## Rollback

If something goes wrong:

1. **Supabase has automatic backups** — Contact Supabase support to restore
2. **Manual rollback** — Drop new columns/enums and recreate old ones (not recommended, use backup instead)

## Next Steps

After schema migration runs successfully:

1. Verify no warnings/errors in output
2. Run cleanup script: `node dedup-cleanup.js` (validates data integrity)
3. Deploy API changes (validation logic)
4. Update agent AGENTS.md files
5. Test dashboard with new status options
