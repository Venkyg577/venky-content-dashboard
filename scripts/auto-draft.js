#!/usr/bin/env node
/**
 * Auto-Draft: Checks Convex for approved topics that don't have drafts yet.
 * Writes a brief file for each, which Wolf/Bee can pick up.
 * Run after each approval sync or on a schedule.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONVEX_URL = 'https://tidy-crocodile-856.eu-west-1.convex.cloud';
const DRAFTS_DIR = '/data/.openclaw/workspace/content-pipeline/drafts/';
const QUEUE_FILE = '/data/.openclaw/workspace/content-pipeline/draft-queue.md';

function req(apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new (require('url').URL)(apiPath, CONVEX_URL);
    const r = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
    r.on('error', reject); r.write(data); r.end();
  });
}

async function run() {
  const resp = await req('/api/query', { path: 'queries:getDashboardData', args: {} });
  const topics = resp.value.topics.filter(t => t.status === 'approved');
  const drafts = resp.value.drafts;

  // Find approved topics that don't have a matching draft
  const draftTopicIds = new Set();
  const draftTitles = new Set();
  for (const d of drafts) {
    if (d.parent_topic_id) draftTopicIds.add(d.parent_topic_id);
    // Also match by title similarity
    const titleKey = (d.topic || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 5).join(' ');
    if (titleKey.length > 10) draftTitles.add(titleKey);
  }

  // Also check existing draft files on disk
  const existingFiles = fs.readdirSync(DRAFTS_DIR).map(f => f.toLowerCase());

  const needsDraft = topics.filter(t => {
    // Skip if already has a linked draft
    if (draftTopicIds.has(t.id)) return false;
    // Skip if title matches an existing draft
    const titleKey = (t.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 5).join(' ');
    if (draftTitles.has(titleKey)) return false;
    // Skip if a draft file exists with similar name
    const slug = (t.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40);
    if (existingFiles.some(f => f.includes(slug.substring(0, 20)))) return false;
    return true;
  });

  if (needsDraft.length === 0) {
    console.log('No approved topics need drafting. All caught up.');
    return;
  }

  console.log(`Found ${needsDraft.length} approved topics needing drafts.`);

  // Write queue file for Bee to pick up
  let queue = `# Draft Queue — Auto-generated ${new Date().toISOString()}\n\n`;
  queue += `${needsDraft.length} approved topics need drafts.\n\n`;

  for (const t of needsDraft.slice(0, 10)) { // Max 10 at a time
    const connection = t.connection || 'PASSIVE';
    const category = t.category || '';
    queue += `---\n\n`;
    queue += `## ${t.title}\n`;
    queue += `- **ID:** ${t.id}\n`;
    queue += `- **Connection:** ${connection}\n`;
    queue += `- **Category:** ${category}\n`;
    queue += `- **Fit:** ${t.fit_score || ''}\n`;
    queue += `- **Source:** ${t.source || ''}\n`;
    queue += `- **URL:** ${t.url || ''}\n`;
    queue += `- **Summary:** ${t.summary || ''}\n`;
    queue += `- **Angle:** ${t.angle || t.fit_score || ''}\n\n`;
  }

  fs.writeFileSync(QUEUE_FILE, queue);
  console.log(`Queue written to ${QUEUE_FILE} with ${Math.min(needsDraft.length, 10)} topics.`);
  
  // Output for cron/agent consumption
  console.log('\n=== TOPICS NEEDING DRAFTS ===');
  for (const t of needsDraft.slice(0, 10)) {
    console.log(`  📝 ${t.title.substring(0, 60)} [${t.connection || '?'}]`);
  }
  console.log('=============================');
}

run().catch(e => { console.error('Auto-draft error:', e.message); process.exit(1); });
