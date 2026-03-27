#!/bin/bash
# Auto-sync: runs sync-up and sync-down every 30 minutes
# Start with: nohup bash /data/.openclaw/workspace/venky-dashboard/auto-sync.sh &

cd /data/.openclaw/workspace/venky-dashboard

while true; do
    echo "[$(date)] Running sync-up..."
    node sync-to-convex-live.js >> /tmp/sync-up.log 2>&1
    
    echo "[$(date)] Running sync-down..."
    node sync-down.js >> /tmp/sync-down.log 2>&1
    
    echo "[$(date)] Sync complete. Sleeping 30 minutes..."
    sleep 1800
done
