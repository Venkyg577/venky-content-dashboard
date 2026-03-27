#!/bin/bash
# Draft approved topics — run by cron or triggered by approval notification
# Checks Convex for approved topics without drafts, writes queue, spawns Bee

cd /data/.openclaw/workspace/venky-dashboard

# Step 1: Generate queue
node auto-draft.js 2>&1
QUEUE="/data/.openclaw/workspace/content-pipeline/draft-queue.md"

if [ ! -f "$QUEUE" ]; then
    echo "No queue file generated. Nothing to draft."
    exit 0
fi

# Step 2: Check if queue has topics
TOPIC_COUNT=$(grep -c "^## " "$QUEUE" 2>/dev/null || echo 0)
if [ "$TOPIC_COUNT" -eq 0 ]; then
    echo "Queue empty. All caught up."
    exit 0
fi

echo "Queue has $TOPIC_COUNT topics. Ready for Bee."

# Step 3: Sync to Convex after drafting
echo "Syncing to Convex..."
node sync-to-convex-live.js 2>&1 | tail -5
