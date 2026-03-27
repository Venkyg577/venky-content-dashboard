# DM Team Dashboard v2 — PRD

## What to Build

A single-page Kanban dashboard that shows the live status of Venky's LinkedIn content pipeline. Built as a static HTML file that reads from Convex database. Reference visual: Launch Control dashboard by thelaunch.space.

---

## Layout

### Header Bar
- Left: Title "DM Team" + subtitle "by thelaunch.space"
- Center: 4 stat pills — **Done this week** | **In Progress** | **To Do** | **Blocked** (counts from data)
- Right: Current date (IST) + "Venky" profile avatar

### Tabs (below header)
- **Kanban** (default view)
- **Pipeline Log** (chronological list of all runs)

---

## Kanban Columns (left to right)

| Column | What it shows | Card source |
|---|---|---|
| **Scouted** | Topics Eagle found, not yet researched | `topics[]` where `status = "pending"` |
| **To Research** | Topics approved by Venky for Owl | `topics[]` where `status = "approved"` |
| **In Progress** | Active Owl research or Bee drafting | `topics[]` where `status = "in_progress"` |
| **Draft Ready** | Bee produced drafts, awaiting Venky review | `drafts[]` where `status = "pending"` |
| **Approved** | Venky approved, ready to publish | `drafts[]` where `status = "approved"` |
| **Published** | Live on LinkedIn | `drafts[]` where `status = "published"` |

Each column header shows column name + item count.

---

## Card Design

Each card contains:
- Label tag (colored pill)
- Title (2 lines max, truncate)
- Source/sub-reference (smaller text, muted)
- Agent avatars (emoji)
- Action button (context-aware)
- Time ago
- Progress bar (colored, thin)

### Label Tags (colored pills)
- `Scout Report` — blue
- `Research Brief` — purple
- `Draft` — amber
- `Approved` — green
- `Published` — gray

### Agent Avatars (emoji + name)
- Wolf 🐺 — coordinator
- Eagle 🦅 — scout
- Owl 🦉 — researcher
- Bee 🐝 — drafter

### Action Buttons (context-aware)
- Scouted card → **Approve** (green) / **Skip** (gray)
- Draft Ready card → **Approve** / **Reject**
- Approved card → **Mark Published**
- Others → **Change status...** dropdown

### Progress Bar
Thin colored line at card bottom indicating pipeline stage:
- Scouted = 20% yellow
- In Progress = 50% blue
- Draft Ready = 75% amber
- Approved = 90% green
- Published = 100% gray

---

## Data Source

Read from Convex database via `/api/query`.

Expected shape:
```json
{
  "lastUpdated": "ISO timestamp",
  "agents": [{ "id", "name", "emoji", "role" }],
  "topics": [{ "id", "title", "source", "signal_type", "status", "discovered_at" }],
  "drafts": [{ "id", "topic", "draft_type", "target_publish_date", "status", "pick_recommended", "content" }],
  "runs": [{ "job_name", "status", "started_at", "duration_ms" }]
}
```

Dashboard auto-refreshes every 60 seconds.

---

## Pipeline Log Tab

Chronological list of all cron runs from `runs[]`:
- Timestamp | Agent | Job Name | Status (ok/error) | Duration
- Color-coded rows: green = ok, red = error
- Show last 50 entries

---

## Approve/Reject Functionality

- Clicking Approve/Reject calls Convex mutation
- Mutation updates draft/topic status
- sync-down.js pulls status changes to VPS
- Wolf checks status changes on next run and triggers next pipeline step

---

## Out of Scope

- No LinkedIn API integration
- No auto-posting
- No user authentication
- No mobile optimization (desktop only for now)

---

## Implementation Plan

### Phase 1: Kanban UI (this build)
- Build full Kanban board with 6 columns
- Card design with labels, agents, progress bars
- Header with stat pills
- Pipeline Log tab
- Read from Convex

### Phase 2: Interactivity
- Approve/Reject buttons write to Convex
- sync-down.js pulls feedback to VPS
- Agent learning loop

### Sync Architecture
- Agent post-hook: sync-up.js runs after each agent completes (zero tokens)
- OS cron every 30 min: backup sync with change detection (zero tokens)
- sync-down.js: pulls feedback from Convex to VPS memory files (zero tokens)
