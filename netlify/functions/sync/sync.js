const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Paths to OpenClaw workspaces
const TOPICS_FILE = '/data/.openclaw/workspace-wolf/memory/scouted-topics.md';
const DRAFTS_DIR = '/data/.openclaw/workspace-wolf/content-bank/drafts/';
const RESEARCH_DIR = '/data/.openclaw/workspace-wolf/content-bank/drafts/';
const CRON_JOBS_FILE = '/data/.openclaw/cron/jobs.json';

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function parseTopicsMarkdown(markdown) {
  const topics = [];
  const sections = markdown.split('---');

  sections.forEach((section) => {
    const match = section.match(/Topic \d+: "(.+?)"/);
    if (match) {
      topics.push({
        title: match[1],
        raw: section,
      });
    }
  });

  return topics;
}

function parseDraftFile(filename) {
  const match = filename.match(/draft-(.+)-(\d{4}-\d{2}-\d{2})-(\w+)\.md/);
  if (match) {
    return {
      id: generateId(),
      topic: match[1].replace(/-/g, ' '),
      target_publish_date: match[2],
      draft_type: match[3],
      file_path: path.join(DRAFTS_DIR, filename),
    };
  }
  return null;
}

async function syncTopics() {
  console.log('Syncing topics...');

  if (!fs.existsSync(TOPICS_FILE)) {
    console.log('Topics file not found, skipping');
    return;
  }

  const markdown = fs.readFileSync(TOPICS_FILE, 'utf-8');
  const parsed = parseTopicsMarkdown(markdown);

  for (const topic of parsed) {
    const { data, error } = await supabase
      .from('topics')
      .upsert(
        {
          id: generateId(),
          title: topic.title,
          summary: topic.raw.substring(0, 500),
          discovered_at: new Date().toISOString(),
          status: 'pending',
        },
        { onConflict: 'title' }
      );

    if (error) {
      console.error('Error syncing topic:', error);
    }
  }

  console.log(`Synced ${parsed.length} topics`);
}

async function syncDrafts() {
  console.log('Syncing drafts...');

  if (!fs.existsSync(DRAFTS_DIR)) {
    console.log('Drafts directory not found, skipping');
    return;
  }

  const files = fs.readdirSync(DRAFTS_DIR).filter((f) => f.startsWith('draft-'));
  let synced = 0;

  for (const file of files) {
    const parsed = parseDraftFile(file);
    if (parsed) {
      const filePath = path.join(DRAFTS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const wordCount = content.split(/\s+/).length;

      const { error } = await supabase
        .from('drafts')
        .upsert({
          id: parsed.id,
          topic: parsed.topic,
          draft_type: parsed.draft_type,
          target_publish_date: parsed.target_publish_date,
          file_path: parsed.file_path,
          word_count: wordCount,
          content: content.substring(0, 1000), // Store preview
          status: 'pending',
        });

      if (error) {
        console.error('Error syncing draft:', error);
      } else {
        synced++;
      }
    }
  }

  console.log(`Synced ${synced} drafts`);
}

async function syncCronRuns() {
  console.log('Syncing cron runs...');

  if (!fs.existsSync(CRON_JOBS_FILE)) {
    console.log('Cron jobs file not found, skipping');
    return;
  }

  const data = JSON.parse(fs.readFileSync(CRON_JOBS_FILE, 'utf-8'));
  let synced = 0;

  if (data.jobs) {
    for (const job of data.jobs) {
      const { state, agentId, name, id: jobId } = job;

      if (state.lastRunAtMs) {
        const run = {
          id: generateId(),
          agent_id: agentId,
          job_id: jobId,
          job_name: name,
          status: state.lastStatus === 'ok' ? 'completed' : state.lastStatus,
          started_at: new Date(state.lastRunAtMs).toISOString(),
          completed_at: state.lastRunAtMs ? new Date(state.lastRunAtMs + (state.durationMs || 0)).toISOString() : null,
          duration_ms: state.durationMs || null,
          last_delivery_status: state.lastDeliveryStatus || null,
          consecutive_errors: state.consecutiveErrors || 0,
          error: state.lastError || null,
        };

        const { error } = await supabase
          .from('runs')
          .upsert(run, {
            onConflict: 'job_id',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error('Error syncing run:', error);
        } else {
          synced++;
        }
      }
    }
  }

  console.log(`Synced ${synced} cron runs`);
}

exports.handler = async (event) => {
  console.log('Starting sync...');

  try {
    await Promise.all([
      syncTopics(),
      syncDrafts(),
      syncCronRuns(),
    ]);

    console.log('Sync complete');

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Sync complete' }),
    };
  } catch (error) {
    console.error('Sync failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};