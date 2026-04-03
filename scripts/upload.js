#!/usr/bin/env node
/**
 * upload.js — Deterministic upload script for all agents.
 *
 * Agents write their output as strict JSON to a file, then run:
 *   node upload.js <output-file.json>
 *
 * This script:
 *   1. Reads the JSON file
 *   2. Validates required fields based on the "stage" field
 *   3. Uploads to the correct Supabase table
 *   4. Returns success/error so the agent can retry if needed
 *
 * No AI here — just dumb, reliable plumbing.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env from script directory if env vars not set
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const [key, ...val] = line.split('=');
    if (key && !process.env[key]) process.env[key] = val.join('=');
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Schema validation per stage ─────────────────────────────────

const SCHEMAS = {
  scouted: {
    table: 'topics',
    required: ['title', 'source', 'score', 'channel_tag'],
    optional: ['url', 'engagement', 'summary', 'signal_type', 'platform'],
    arrayField: 'items', // expects { stage, items: [...] }
  },
  researched: {
    table: 'topics',
    required: ['ref_id', 'summary', 'angle'],
    optional: ['proof_points', 'post_type', 'stats'],
    arrayField: null, // single item update
  },
  drafted: {
    table: 'drafts',
    required: ['ref_id', 'content', 'draft_type'],
    optional: ['word_count', 'caption', 'carousel_json'],
    arrayField: null,
  },
  blog_researched: {
    table: 'topics',
    required: ['ref_id', 'summary', 'keywords', 'cluster'],
    optional: ['serp_analysis', 'internal_links', 'search_volume'],
    arrayField: null,
  },
  blog_drafted: {
    table: 'drafts',
    required: ['ref_id', 'content', 'word_count'],
    optional: ['blog_slug', 'blog_keywords', 'blog_cluster'],
    arrayField: null,
  },
  published: {
    table: 'drafts',
    required: ['ref_id', 'blog_url'],
    optional: ['commit_sha'],
    arrayField: null,
  },
  task_complete: {
    table: 'agent_tasks',
    required: ['task_id', 'status'],
    optional: ['result', 'error'],
    arrayField: null,
  },
};

// ─── Validation ──────────────────────────────────────────────────

function validate(data) {
  if (!data.stage) {
    return { ok: false, error: 'Missing "stage" field' };
  }

  const schema = SCHEMAS[data.stage];
  if (!schema) {
    return { ok: false, error: `Unknown stage: "${data.stage}". Valid: ${Object.keys(SCHEMAS).join(', ')}` };
  }

  // If schema expects array items (e.g., scouted topics)
  if (schema.arrayField) {
    const items = data[schema.arrayField];
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: `"${schema.arrayField}" must be a non-empty array` };
    }
    for (let i = 0; i < items.length; i++) {
      for (const field of schema.required) {
        if (items[i][field] === undefined || items[i][field] === null || items[i][field] === '') {
          return { ok: false, error: `Item ${i}: missing required field "${field}"` };
        }
      }
    }
  } else {
    // Single item — check required fields on root
    for (const field of schema.required) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        return { ok: false, error: `Missing required field "${field}"` };
      }
    }
  }

  return { ok: true, schema };
}

// ─── Upload logic per stage ──────────────────────────────────────

async function upload(data, schema) {
  const stage = data.stage;
  let result;

  switch (stage) {
    case 'scouted': {
      const rows = data.items.map((item, i) => ({
        id: `topic-${Date.now()}-${i}`,
        title: item.title,
        source: item.source || '',
        url: item.url || '',
        signal_type: item.signal_type || 'C',
        fit_score: String(item.score),
        summary: item.summary || '',
        channel: item.channel_tag?.toLowerCase() || 'linkedin',
        category: item.engagement || '',
        discovered_at: Date.now(),
        created_at: Date.now(),
        status: 'pending',
        stage: 'scouted',
      }));
      result = await sb.from('topics').upsert(rows);
      if (result.error) throw result.error;
      return `✅ ${rows.length} topics uploaded (stage=scouted, status=pending)`;
    }

    case 'researched': {
      const updateFields = {
        summary: data.summary,
        status: 'approved',
        stage: 'researched',
      };
      if (data.angle) updateFields.angle = data.angle;
      result = await sb.from('topics').update(updateFields).eq('id', data.ref_id);
      if (result.error) throw result.error;
      return `✅ Topic ${data.ref_id} updated (stage=researched, status=approved)`;
    }

    case 'drafted': {
      const wordCount = data.word_count || data.content.split(/\s+/).length;
      const updateData = {
        content: data.content,
        word_count: wordCount,
        draft_type: data.draft_type,
        status: 'approved',
        stage: 'drafted',
      };
      if (data.carousel_json) updateData.carousel_json = data.carousel_json;
      if (data.caption) updateData.caption = data.caption;

      result = await sb.from('drafts').update(updateData).eq('id', data.ref_id);
      if (result.error) throw result.error;
      return `✅ Draft ${data.ref_id} updated (stage=drafted, ${wordCount} words)`;
    }

    case 'blog_researched': {
      result = await sb.from('topics').update({
        summary: data.summary,
        angle: data.keywords?.join(', ') || '',
        status: 'approved',
        stage: 'researched',
        channel: 'blog',
      }).eq('id', data.ref_id);
      if (result.error) throw result.error;
      return `✅ Blog topic ${data.ref_id} researched (keywords: ${data.keywords?.join(', ')})`;
    }

    case 'blog_drafted': {
      result = await sb.from('drafts').update({
        content: data.content,
        word_count: data.word_count,
        status: 'approved',
        stage: 'drafted',
        blog_slug: data.blog_slug || null,
        blog_keywords: data.blog_keywords || null,
        blog_cluster: data.blog_cluster || null,
      }).eq('id', data.ref_id);
      if (result.error) throw result.error;
      return `✅ Blog draft ${data.ref_id} updated (${data.word_count} words)`;
    }

    case 'published': {
      result = await sb.from('drafts').update({
        blog_url: data.blog_url,
        status: 'published',
        stage: 'published',
      }).eq('id', data.ref_id);
      if (result.error) throw result.error;
      return `✅ Published: ${data.blog_url}`;
    }

    case 'task_complete': {
      const updateData = {
        status: data.status, // 'completed' or 'failed'
        completed_at: new Date().toISOString(),
      };
      if (data.result) updateData.result = data.result;
      if (data.error) updateData.error = data.error;

      result = await sb.from('agent_tasks').update(updateData).eq('id', data.task_id);
      if (result.error) throw result.error;
      return `✅ Task ${data.task_id} marked ${data.status}`;
    }

    default:
      throw new Error(`No upload handler for stage: ${stage}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node upload.js <output-file.json>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`ERROR: Invalid JSON in ${filePath}: ${e.message}`);
    process.exit(1);
  }

  const validation = validate(data);
  if (!validation.ok) {
    console.error(`VALIDATION ERROR: ${validation.error}`);
    console.error(`File: ${filePath}`);
    console.error(`Stage: ${data.stage || 'missing'}`);
    process.exit(1);
  }

  try {
    const message = await upload(data, validation.schema);
    console.log(message);
  } catch (e) {
    console.error(`UPLOAD ERROR: ${e.message}`);
    process.exit(1);
  }
}

main();
