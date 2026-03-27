#!/usr/bin/env node
// sync-down.js — Pull unsynced feedback from Convex, write revision files, mark synced
const fs = require('fs');
const path = require('path');

const CONVEX_URL = 'https://tidy-crocodile-856.eu-west-1.convex.cloud';
const REVISION_DIR = '/data/.openclaw/workspace/content-pipeline/revisions/';
const PATTERNS_DIR = '/data/.openclaw/workspace-bee/memory/';

async function query(fn, args = {}) {
  const r = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: `queries:${fn}`, args })
  });
  const j = await r.json();
  if (j.status !== 'success') throw new Error(j.errorMessage || 'Query failed');
  return j.value;
}

async function mutate(fn, args = {}) {
  const r = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: `mutations:${fn}`, args })
  });
  const j = await r.json();
  if (j.status !== 'success') throw new Error(j.errorMessage || 'Mutation failed');
  return j.value;
}

async function main() {
  console.log('=== Sync Down: Feedback → VPS ===\n');

  // Get all data
  const data = await query('getDashboardData');
  const feedback = data.feedback || [];
  const unsynced = feedback.filter(f => !f.synced_to_vps);

  if (unsynced.length === 0) {
    console.log('No unsynced feedback. Nothing to do.');
    return { revisions: [], rejections: [], archives: [] };
  }

  console.log(`Found ${unsynced.length} unsynced feedback items\n`);

  // Ensure directories exist
  fs.mkdirSync(REVISION_DIR, { recursive: true });
  fs.mkdirSync(PATTERNS_DIR, { recursive: true });

  const revisions = [];
  const rejections = [];
  const archives = [];

  for (const fb of unsynced) {
    const item = fb.item_type === 'draft'
      ? data.drafts.find(d => d.id === fb.item_id)
      : data.topics.find(t => t.id === fb.item_id);

    const itemTitle = item ? (item.topic || item.title || fb.item_id) : fb.item_id;

    if (fb.action === 'revision') {
      // Write revision file for Bee
      const revFile = path.join(REVISION_DIR, `REV-${fb.item_id}.md`);
      const content = `# Revision Request

**Item:** ${itemTitle}
**Type:** ${fb.item_type}
**ID:** ${fb.item_id}
**Category:** ${fb.category || 'general'}
**Requested:** ${new Date(fb.created_at).toISOString()}

## Feedback
${fb.comment}

## Original Content
${item ? (item.content || item.summary || '(not available)') : '(not found)'}

## Instructions
Rewrite this ${fb.item_type} addressing the feedback above. Keep Venky's voice. Save the revised version to:
\`/data/.openclaw/workspace/content-pipeline/drafts/\`
`;
      fs.writeFileSync(revFile, content);
      revisions.push({ id: fb.item_id, title: itemTitle, comment: fb.comment, category: fb.category });
      console.log(`  📝 Revision: ${itemTitle}`);
      console.log(`     Feedback: ${fb.comment}`);

    } else if (fb.action === 'rejected') {
      // Append to rejected-patterns.md for agent learning
      const patternFile = path.join(PATTERNS_DIR, 'rejected-patterns.md');
      const entry = `\n---\n**Rejected:** ${itemTitle}\n**Category:** ${fb.category || 'general'}\n**Reason:** ${fb.comment}\n**Date:** ${new Date(fb.created_at).toLocaleDateString()}\n`;
      fs.appendFileSync(patternFile, entry);
      rejections.push({ id: fb.item_id, title: itemTitle, comment: fb.comment });
      console.log(`  ❌ Rejected: ${itemTitle} — ${fb.comment}`);

    } else if (fb.action === 'archived') {
      archives.push({ id: fb.item_id, title: itemTitle, comment: fb.comment || '' });
      console.log(`  📁 Archived: ${itemTitle}`);
    }
  }

  // Mark all as synced
  const idsToMark = unsynced.filter(f => f._id).map(f => f._id);
  if (idsToMark.length > 0) {
    await mutate('markFeedbackSynced', { ids: idsToMark });
    console.log(`\n  ✓ Marked ${idsToMark.length} feedback items as synced`);
  }

  console.log(`\n=== Sync Down Complete ===`);
  console.log(`Revisions: ${revisions.length}`);
  console.log(`Rejections: ${rejections.length}`);
  console.log(`Archives: ${archives.length}`);
  console.log(`==========================\n`);

  return { revisions, rejections, archives };
}

main().catch(e => { console.error('Sync-down failed:', e); process.exit(1); });
