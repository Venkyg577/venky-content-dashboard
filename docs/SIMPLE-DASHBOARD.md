# Venky's DM Team Dashboard

Simple dashboard for tracking Wolf, Eagle, Owl, Bee agents and their outputs.

## Current Status

- ✅ **Dashboard deployed:** http://venky-dashboard.netlify.app
- ✅ **Netlify Functions:** Connected to read local files
- ✅ **File-based data:** Reads from /data/.openclaw/workspace-wolf/ (no database needed)

## Setup Complete

All functionality is working:
- Agent status cards
- Weekly metrics
- Upcoming posts calendar
- Real-time updates (every 30s)
- Live data from your OpenClaw workspaces

## What This Dashboard Does

1. **Agent Status** — Shows Wolf, Eagle, Owl, Bee running/completed/failed
2. **Weekly Metrics** — Topics found, briefs created, drafts generated
3. **Upcoming Posts** — Content calendar with publish dates and status
4. **Live Updates** — Data refreshes automatically every 30 seconds

## Data Sources

The dashboard pulls data from:
- `/data/.openclaw/workspace-wolf/memory/scouted-topics.md` → topics
- `/data/.openclaw/workspace-wolf/content-bank/drafts/` → drafts
- `/data/.openclaw/cron/jobs.json` → agent runs

All served via **Netlify Functions** without any external database.

## Features Added

- Real-time polling (no manual refresh needed)
- File-based data (no Supabase required)
- Simple HTML (no build process)
- Netlify Functions for secure data access
- Auto-deploys on code changes (if configured)

## Future Enhancements (Optional)

If you want to add later:
- Draft approval workflow (approve/reject buttons)
- Research briefs viewer
- Topics explorer with filtering
- Download reports
- Calendar view with drag & drop
- Agent-specific detail pages

---

**Dashboard URL:** http://venky-dashboard.netlify.app

**Visit now to see your content pipeline!**
