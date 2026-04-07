#!/usr/bin/env node
/**
 * cleanup-rejected-topics.js — Archive topics with REJECT verdicts still in pipeline
 *
 * Finds topics/drafts that have explicit REJECT in their research brief
 * but are still in active stages (researched, drafted, ready_to_post)
 * and archives them.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function log(msg) {
  console.log(`[cleanup-rejected ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}] ${msg}`);
}

async function main() {
  log('Scanning for topics with REJECT verdicts (for manual review)...\n');

  let flagged = 0;

  // 1. Find topics with REJECT verdict in summary but status is not 'rejected'
  const { data: allTopics } = await sb.from('topics')
    .select('id, title, status, stage, summary')
    .not('status', 'eq', 'archived');

  if (!allTopics) {
    log('No topics found');
    return;
  }

  const rejectPatterns = [
    /##\s*REJECT:/i,
    /Proceed with writing:\s*No/i,
    /CRITICAL LIMITATIONS/i,
  ];

  for (const topic of allTopics) {
    const summary = topic.summary || '';
    const hasRejectVerdict = rejectPatterns.some(pattern => pattern.test(summary));

    if (hasRejectVerdict && topic.status !== 'rejected') {
      log(`⚠️  "${topic.title}"`);
      log(`   Status: ${topic.status} | Stage: ${topic.stage}`);
      log(`   Research has REJECT verdict → requires manual review`);
      flagged++;
      log('');
    }
  }

  // 2. Find drafts with REJECT verdict in summary
  const { data: allDrafts } = await sb.from('drafts')
    .select('id, topic, status, content')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected');

  if (allDrafts) {
    for (const draft of allDrafts) {
      const content = draft.content || '';
      const hasRejectVerdict = rejectPatterns.some(pattern => pattern.test(content));

      if (hasRejectVerdict && draft.status !== 'rejected') {
        log(`⚠️  Draft: "${draft.topic}"`);
        log(`   Status: ${draft.status}`);
        log(`   Content has REJECT verdict → requires manual review`);
        flagged++;
        log('');
      }
    }
  }

  if (flagged === 0) {
    log('✅ No items with REJECT verdict found');
  } else {
    log(`\n=== REVIEW SUMMARY ===`);
    log(`Items flagged for manual review: ${flagged}`);
    log(`Please decide whether to reject via dashboard`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
