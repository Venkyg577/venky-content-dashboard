#!/usr/bin/env node
/**
 * dedup-cleanup.js — Finds and removes duplicate content cards.
 *
 * Runs periodically via OpenClaw cron. Checks:
 * 1. Drafts with same topic title — keeps newest, archives rest
 * 2. Topics with same title in same stage — keeps newest, archives rest
 * 3. Drafts showing "Ready to Review" but with no content — marks failed
 *
 * Usage: node dedup-cleanup.js
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
  console.log(`[dedup ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}] ${msg}`);
}

async function main() {
  let fixed = 0;

  // 1. Duplicate drafts — same topic, multiple non-published/non-archived entries
  const { data: drafts } = await sb.from('drafts')
    .select('id, topic, stage, status, content, created_at')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected')
    .order('created_at', { ascending: false });

  if (drafts) {
    const byTopic = {};
    for (const d of drafts) {
      const key = d.topic?.toLowerCase().trim();
      if (!key) continue;
      if (!byTopic[key]) byTopic[key] = [];
      byTopic[key].push(d);
    }

    for (const [topic, items] of Object.entries(byTopic)) {
      if (items.length <= 1) continue;

      // Keep the one with content, or the newest
      const withContent = items.filter(d => d.content && d.content.length > 10);
      const keep = withContent.length > 0 ? withContent[0] : items[0];
      const dupes = items.filter(d => d.id !== keep.id);

      for (const dupe of dupes) {
        // Only archive if it's truly a duplicate (no unique content worth keeping)
        if (dupe.content && dupe.content.length > 100 && (!keep.content || keep.content.length < 100)) {
          continue; // This dupe actually has content the keeper doesn't — skip
        }
        await sb.from('drafts').update({ status: 'archived' }).eq('id', dupe.id);
        await sb.from('agent_tasks').update({ status: 'cancelled' })
          .eq('ref_id', dupe.id).in('status', ['pending', 'running', 'claimed']);
        log(`Archived duplicate draft: "${topic.substring(0, 50)}" (${dupe.id})`);
        fixed++;
      }
    }
  }

  // 2. Duplicate topics by canonical_id (across all states)
  const { data: allTopics } = await sb.from('topics').select('id, canonical_id, title, stage, status, discovered_at');

  if (allTopics) {
    const byCanonical = {};
    for (const t of allTopics) {
      if (!t.canonical_id) continue;
      if (!byCanonical[t.canonical_id]) byCanonical[t.canonical_id] = [];
      byCanonical[t.canonical_id].push(t);
    }

    for (const [canonical, items] of Object.entries(byCanonical)) {
      if (items.length <= 1) continue;

      // Keep the one that is active and furthest in pipeline
      const stageOrder = { published: 5, ready_to_post: 4, drafted: 3, researched: 2, scouted: 1 };
      const isActive = (t: any) => !['archived', 'rejected'].includes(t.status);

      items.sort((a, b) => {
        const aActive = isActive(a);
        const bActive = isActive(b);
        if (aActive !== bActive) return bActive ? 1 : -1;
        return (stageOrder[b.stage] || 0) - (stageOrder[a.stage] || 0);
      });

      const keep = items[0];
      const dupes = items.slice(1);

      for (const dupe of dupes) {
        if (dupe.id === keep.id) continue;
        await sb.from('topics').update({ status: 'archived' }).eq('id', dupe.id);
        log(`Archived duplicate by canonical_id: "${keep.title?.substring(0, 50)}" (${dupe.id}, was ${dupe.stage}/${dupe.status})`);
        fixed++;
      }
    }
  }

  // 3. Cross-check: archive topics/drafts that already have a published or ready_to_post version
  const { data: publishedDrafts } = await sb.from('drafts')
    .select('topic')
    .in('stage', ['published', 'ready_to_post']);

  if (publishedDrafts) {
    const doneTitles = new Set(publishedDrafts.map(d => d.topic?.toLowerCase().trim()).filter(Boolean));

    // Archive active topics that are already published
    const { data: activeTopics } = await sb.from('topics')
      .select('id, title, stage, status')
      .not('status', 'eq', 'rejected')
      .not('status', 'eq', 'archived');

    for (const t of activeTopics || []) {
      const key = t.title?.toLowerCase().trim();
      if (doneTitles.has(key)) {
        await sb.from('topics').update({ status: 'archived' }).eq('id', t.id);
        log(`Archived topic (already published): "${t.title?.substring(0, 50)}" (was ${t.stage})`);
        fixed++;
      }
    }

    // Archive non-published drafts that are already published
    const { data: activeDrafts } = await sb.from('drafts')
      .select('id, topic, stage, status')
      .not('status', 'eq', 'archived')
      .not('status', 'eq', 'rejected')
      .not('stage', 'in', '("published","ready_to_post")');

    for (const d of activeDrafts || []) {
      const key = d.topic?.toLowerCase().trim();
      if (doneTitles.has(key)) {
        await sb.from('drafts').update({ status: 'archived' }).eq('id', d.id);
        log(`Archived draft (already published): "${d.topic?.substring(0, 50)}"`);
        fixed++;
      }
    }
  }

  // 4. Empty drafts stuck as "approved" with no content for >1 hour
  const oneHourAgo = Date.now() - 3600000;
  const { data: emptyDrafts } = await sb.from('drafts')
    .select('id, topic, status, content, created_at')
    .eq('status', 'approved')
    .is('content', null)
    .lt('created_at', oneHourAgo);

  if (emptyDrafts) {
    for (const d of emptyDrafts) {
      // Check if there's a running task for it
      const { data: activeTasks } = await sb.from('agent_tasks')
        .select('id').eq('ref_id', d.id).in('status', ['pending', 'running', 'claimed']);

      if (!activeTasks || activeTasks.length === 0) {
        await sb.from('drafts').update({ status: 'pending' }).eq('id', d.id);
        log(`Reset empty draft to pending: "${d.topic?.substring(0, 50)}" (${d.id})`);
        fixed++;
      }
    }
  }

  // 5. Data integrity: topic stage must match active draft stage
  // Rule: A topic should only exist in one stage at a time, matching its active draft's stage
  const { data: allTopics } = await sb.from('topics')
    .select('id, title, stage, status')
    .not('status', 'eq', 'rejected')
    .not('status', 'eq', 'archived');

  if (allTopics) {
    for (const topic of allTopics) {
      // Find all non-archived drafts for this topic
      const { data: draftsForTopic } = await sb.from('drafts')
        .select('id, stage, status')
        .eq('topic', topic.title)
        .not('status', 'eq', 'archived')
        .not('status', 'eq', 'rejected');

      if (draftsForTopic && draftsForTopic.length > 0) {
        // Get the draft that's furthest along the pipeline
        const stageOrder = { published: 5, ready_to_post: 4, drafted: 3, researched: 2, scouted: 1 };
        const sortedDrafts = draftsForTopic.sort((a, b) => (stageOrder[b.stage] || 0) - (stageOrder[a.stage] || 0));
        const activeStage = sortedDrafts[0].stage;

        // If topic is in a different stage, sync it to match the draft
        if (topic.stage !== activeStage) {
          await sb.from('topics').update({ stage: activeStage }).eq('id', topic.id);
          log(`Fixed stage mismatch: "${topic.title?.substring(0, 50)}" ${topic.stage} → ${activeStage}`);
          fixed++;
        }
      }
    }
  }

  // 6. DISABLED: Auto-reject topics with REJECT verdict
  // Rejection decisions are made manually via dashboard.
  // Cleanup script only deduplicates and syncs stages; rejections require explicit user decision.

  // 7. Clear "stork working" status from topics with no active tasks
  const { data: storkTopics } = await sb.from('topics')
    .select('id, title, status')
    .eq('status', 'stork working')
    .not('status', 'eq', 'archived')
    .not('status', 'eq', 'rejected');

  if (storkTopics) {
    for (const topic of storkTopics) {
      const { data: activeTasks } = await sb.from('agent_tasks')
        .select('id')
        .eq('ref_id', topic.id)
        .in('status', ['pending', 'running', 'claimed']);

      if (!activeTasks || activeTasks.length === 0) {
        await sb.from('topics').update({ status: 'researched' }).eq('id', topic.id);
        log(`Cleared stale "stork working" status: "${topic.title.substring(0, 50)}" (no active tasks)`);
        fixed++;
      }
    }
  }

  if (fixed === 0) {
    log('No duplicates found. All clean.');
  } else {
    log(`Fixed ${fixed} duplicate(s).`);
  }
}

main().catch(err => { console.error('Dedup error:', err.message); process.exit(1); });
