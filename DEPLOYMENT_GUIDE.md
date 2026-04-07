# Blog Pipeline Rebuild — Deployment Guide

**Status**: Complete ✅  
**Date**: April 7, 2026  
**Changes**: 5 major components rebuilt per PRD

---

## What Was Built

This is a complete rebuild of the blog content pipeline foundation, based on the Blog Pipeline PRD (`BLOG_PIPELINE_PRD.md`).

### 1. Database Schema Migration ✅
**File**: `migrations/001_blog_pipeline_schema.sql`

**Changes**:
- `topics.summary` → TEXT type (unlimited size, prevents truncation)
- Added `revision_count`, `revised_at` columns to topics
- Updated stage enums: added `researching`, `revise_needed`, `drafting`
- Updated status enums: added `revise_needed`, `revising`
- Added indexes for performance (canonical_id, status, stage, topic)

**Status**: Ready to run in Supabase

---

### 2. Agent Configuration Files ✅
**Files**: 
- `openclaw-config/agents/stork/AGENTS.md` (updated)
- `openclaw-config/agents/crane/AGENTS.md` (updated)
- `openclaw-config/agents/pelican/AGENTS.md` (updated)

**Changes**:
- **Stork**: Added CRITICAL requirement for TEXT field, verdict structure (ACCEPT/CONDITIONAL ACCEPT/REJECT), complete reframe validation
- **Crane**: Added brief completeness checks, minimum 1500 word enforcement, reframe compliance validation
- **Pelican**: Added content completeness gate (minimum 1500 words)

**Status**: Live (agents should read these before working)

---

### 3. API Quality Gate Validations ✅
**File**: `netlify/functions/api.ts`

**Endpoints Updated**:
- `/approve-topic`: 
  - Gate 1: Research brief must be 5000+ characters
  - Gate 2: Brief must have clear verdict (ACCEPT/CONDITIONAL ACCEPT/REJECT)
  - Gate 3: If CONDITIONAL ACCEPT, reframe suggestion must be complete (not truncated)

- `/approve-draft`:
  - Validates draft is not stub/placeholder
  - Enforces 1500+ word minimum for blogs
  - Checks topic is not rejected

**Status**: Ready to deploy

---

### 4. Dashboard State Display ✅
**File**: `lib/action-helpers.ts`

**Changes**:
- Status `revise_needed` now maps to "⏳ Awaiting Revision" badge
- Action buttons hidden when item is awaiting revision
- Clear visual distinction from agent worker status

**Status**: Ready to deploy

---

### 5. Cleanup Script Validations ✅
**File**: `dedup-cleanup.js`

**New Validation Checks**:
- Step 7: Research brief completeness (5000+ chars, no truncation)
- Step 8: Draft word counts (1500+ for blogs, no stubs)
- Step 9: Research verdicts are clear (ACCEPT/REJECT present)
- Step 10: CONDITIONAL ACCEPT reframes are complete (not truncated)
- Step 11: Clear stale "stork working" status

**Status**: Ready to use (run hourly via cron)

---

## Deployment Steps

### Phase 1: Database Migration (Do This First)
1. Go to: https://supabase.com/dashboard/project/tptbfxjprpzxwsrerwjm/sql
2. Create new query
3. Copy entire contents of `migrations/001_blog_pipeline_schema.sql`
4. Paste into Supabase SQL editor
5. Run (Ctrl+Enter or click Run button)
6. Wait for green checkmark ✓
7. Verify success with the verification queries in migration README

**Timeline**: ~2 minutes

### Phase 2: Code Deployment (After Migration)
```bash
# Pull all changes
git pull

# Deploy to dev or main branch as usual
# Changes include:
#  - API validation logic (new quality gates)
#  - Dashboard display updates (revision status)
#  - Cleanup script enhancements (validation warnings)
```

**Timeline**: ~5 minutes (deploy + Netlify build)

### Phase 3: Agent Configuration Review
Agents (Stork, Crane, Pelican) should review their updated AGENTS.md files to understand:
- New validation requirements
- Verdict structure expectations
- Quality gates that will block approval

**Timeline**: ~10 minutes (read)

### Phase 4: Cleanup Script Activation
Ensure `dedup-cleanup.js` runs regularly (hourly via cron or manual runs) to catch data quality issues.

**Timeline**: Ongoing

---

## Verification Checklist

After deployment, verify:

- [ ] **Schema**: Summary field is TEXT type
  ```sql
  SELECT data_type FROM information_schema.columns 
  WHERE table_name='topics' AND column_name='summary';
  -- Should show: text
  ```

- [ ] **API gates**: Try approving a topic with < 5000 char brief
  - Should get error: "Research brief incomplete. Length: X chars (need 5000+)"

- [ ] **API gates**: Try approving a draft with < 1500 words
  - Should get error: "Draft is too short (X words). Blog posts need minimum 1500 words."

- [ ] **Dashboard**: Approve a topic, then click "Revise"
  - Should show "⏳ Awaiting Revision" badge
  - Approve button should disappear

- [ ] **Cleanup script**: Run manually
  ```bash
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node dedup-cleanup.js
  ```
  - Should report validation warnings (if any issues exist)
  - Should show count of items fixed

---

## Rollback Plan

If something goes wrong:

1. **Schema issues**: Supabase has automatic backups. Contact Supabase support to restore.
2. **Code issues**: Revert git commits and redeploy:
   ```bash
   git revert [commit-sha]
   git push
   ```
3. **Cleanup script**: Simply stop running it; no data is modified by validation checks alone.

---

## Next Steps

1. **Run migration** (Phase 1) — Required first
2. **Deploy code** (Phase 2) — After migration succeeds
3. **Review AGENTS.md** (Phase 3) — Agent awareness
4. **Monitor cleanup output** (Phase 4) — Ongoing quality monitoring

---

## Files Changed Summary

**New files**:
- `migrations/001_blog_pipeline_schema.sql`
- `migrations/README.md`
- `BLOG_PIPELINE_PRD.md`
- `DEPLOYMENT_GUIDE.md`

**Updated files**:
- `netlify/functions/api.ts` — Quality gate validations
- `lib/action-helpers.ts` — Revision status display
- `dedup-cleanup.js` — Validation checks
- `openclaw-config/agents/stork/AGENTS.md`
- `openclaw-config/agents/crane/AGENTS.md`
- `openclaw-config/agents/pelican/AGENTS.md`
- `cleanup-rejected-topics.js` — Changed to flag instead of auto-reject
- `lib/canonical-id.ts` — (from prior work, dedup support)

**Git commits**:
- `c4089fa` — Migration: add blog pipeline schema
- `b9e2789` — Docs: update Stork and Crane AGENTS.md
- `7a06e16` — Docs: add content completeness gate to Pelican AGENTS.md
- `9b29635` — Feat: add API quality gate validations
- `135a71a` — Feat: update dashboard status display
- `2a96ad6` — Feat: add comprehensive validation checks to cleanup script

---

## Support

Questions about the rebuild? Refer to:
- `BLOG_PIPELINE_PRD.md` — Architecture, workflows, data model
- `AGENTS.md` files — Agent-specific requirements
- `migrations/README.md` — Database migration details
- `DEPLOYMENT_GUIDE.md` — This file

