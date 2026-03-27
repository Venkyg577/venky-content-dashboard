const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Paths to OpenClaw workspaces
const TOPICS_FILE = '/data/.openclaw/workspace-wolf/memory/scouted-topics.md';
const DRAFTS_DIR = '/data/.openclaw/workspace-wolf/content-bank/drafts/';
const RESEARCH_DIR = '/data/.openclaw/workspace-wolf/content-bank/drafts/';
const CRON_JOBS_FILE = '/data/.openclaw/cron/jobs.json';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function parseTopicsMarkdown(markdown) {
  const topics = [];
  const sections = markdown.split('---');

  sections.forEach((section, index) => {
    const titleMatch = section.match(/### Topic \d+: "(.+?)"/);
    if (titleMatch) {
      const sourceMatch = section.match(/Source: (.+)/);
      const urlMatch = section.match(/URL: (.+)/);
      const dateMatch = section.match(/Date: (.+)/);
      const signalMatch = section.match(/Signal: (.+)/);
      const fitMatch = section.match(/Fit: (.+)/);
      const summaryMatch = section.match(/Summary: (.+)/);

      const topicDate = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

      topics.push({
        id: `topic-${index}`,
        title: titleMatch[1],
        source: sourceMatch ? sourceMatch[1] : '',
        url: urlMatch ? urlMatch[1] : '',
        platform: urlMatch ? (urlMatch[1].includes('linkedin') ? 'LinkedIn' : 'Web') : '',
        published_date: topicDate,
        signal_type: signalMatch ? signalMatch[1] : 'C',
        fit_score: fitMatch ? fitMatch[1] : 'Moderate',
        summary: summaryMatch ? summaryMatch[1] : section.substring(0, 200),
        discovered_at: new Date().toISOString(),
        status: 'pending'
      });
    }
  });

  return topics;
}

function parseDraftFile(filename) {
  const match = filename.match(/draft-(.+)-(\d{4}-\d{2}-\d{2})-(\w+)\.md/);
  if (match) {
    const filePath = path.join(DRAFTS_DIR, filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const wordCount = content.split(/\s+/).length;

      // Extract title from content
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : match[1].replace(/-/g, ' ');

      // Extract type
      const typeMatch = content.match(/\*\*Type:\*\*\s+(.+)/i);
      const draftType = typeMatch ? typeMatch[1] : match[3];

      // Check for PICK recommendation
      const isPick = content.includes('PICK Recommendation') || content.includes('PICK');

      // Check published status
      const isPublished = content.includes('**PUBLISHED**') || content.includes('**Status:** Published');

      return {
        id: `draft-${filename.replace(/\./g, '-')}`,
        topic: title,
        draft_type: draftType.toLowerCase(),
        target_publish_date: match[2],
        word_count: wordCount,
        file_path: filePath,
        pick_recommended: isPick,
        status: isPublished ? 'published' : 'pending',
        created_at: new Date().toISOString()
      };
    }
  }
  return null;
}

function parseResearchBrief(filename) {
  const match = filename.match(/RESEARCH-(\d{4}-\d{2}-\d{2})-(\d+)\.md/);
  if (match) {
    const filePath = path.join(RESEARCH_DIR, filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Extract title
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : 'Research Brief';

      // Extract source research
      const sourceMatch = content.match(/\*\*Source research:\*\*\s+(.+)/i);
      const source = sourceMatch ? sourceMatch[1] : '';

      // Extract Venky's angle
      const angleMatch = content.match(/\*\*Venky's Angle:\*\*\s+(.+)/i);
      const angle = angleMatch ? angleMatch[1] : '';

      return {
        id: `research-${match[2]}-${match[3]}`,
        title: title,
        source_research: source,
        venky_angle: angle,
        brief_path: filePath,
        created_at: match[1] ? `${match[1]}T00:00:00Z` : new Date().toISOString(),
        status: 'pending'
      };
    }
  }
  return null;
}

function parseCronJobs(data) {
  const runs = [];
  
  if (data.jobs) {
    for (const job of data.jobs) {
      if (job.state && job.state.lastRunAtMs) {
        const run = {
          id: generateId(),
          agent_id: job.agentId,
          job_id: job.id,
          job_name: job.name,
          status: job.state.lastStatus === 'ok' ? 'completed' : job.state.lastStatus,
          started_at: new Date(job.state.lastRunAtMs).toISOString(),
          completed_at: job.state.lastRunAtMs ? new Date(job.state.lastRunAtMs + (job.state.durationMs || 0)).toISOString() : null,
          duration_ms: job.state.durationMs || null,
          last_delivery_status: job.state.lastDeliveryStatus || null,
          consecutive_errors: job.state.consecutiveErrors || 0,
          error: job.state.lastError || null
        };
        runs.push(run);
      }
    }
  }
  
  return runs;
}

async function syncTopics() {
  console.log('Syncing topics...');

  if (!fs.existsSync(TOPICS_FILE)) {
    console.log('Topics file not found, skipping');
    return 0;
  }

  const markdown = fs.readFileSync(TOPICS_FILE, 'utf-8');
  const topics = parseTopicsMarkdown(markdown);
  let synced = 0;

  for (const topic of topics) {
    const { data, error } = await supabase
      .from('topics')
      .upsert(topic, { onConflict: 'id' });

    if (error) {
      console.error('Error syncing topic:', error);
    } else {
      synced++;
    }
  }

  console.log(`Synced ${synced} topics`);
  return synced;
}

async function syncDrafts() {
  console.log('Syncing drafts...');

  if (!fs.existsSync(DRAFTS_DIR)) {
    console.log('Drafts directory not found, skipping');
    return 0;
  }

  const files = fs.readdirSync(DRAFTS_DIR).filter(f => f.startsWith('draft-'));
  let synced = 0;

  for (const file of files) {
    const parsed = parseDraftFile(file);
    if (parsed) {
      const { error } = await supabase
        .from('drafts')
        .upsert(parsed, { onConflict: 'id' });

      if (error) {
        console.error('Error syncing draft:', error);
      } else {
        synced++;
      }
    }
  }

  console.log(`Synced ${synced} drafts`);
  return synced;
}

async function syncResearchBriefs() {
  console.log('Syncing research briefs...');

  if (!fs.existsSync(RESEARCH_DIR)) {
    console.log('Research directory not found, skipping');
    return 0;
  }

  const files = fs.readdirSync(RESEARCH_DIR).filter(f => f.startsWith('RESEARCH-'));
  let synced = 0;

  for (const file of files) {
    const parsed = parseResearchBrief(file);
    if (parsed) {
      const { error } = await supabase
        .from('research_briefs')
        .upsert(parsed, { onConflict: 'id' });

      if (error) {
        console.error('Error syncing research:', error);
      } else {
        synced++;
      }
    }
  }

  console.log(`Synced ${synced} research briefs`);
  return synced;
}

async function syncCronRuns() {
  console.log('Syncing cron runs...');

  if (!fs.existsSync(CRON_JOBS_FILE)) {
    console.log('Cron jobs file not found, skipping');
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(CRON_JOBS_FILE, 'utf-8'));
  let synced = 0;

  if (data.jobs) {
    for (const job of data.jobs) {
      const run = {
        id: generateId(),
        agent_id: job.agentId,
        job_id: job.id,
        job_name: job.name,
        status: job.state.lastStatus === 'ok' ? 'completed' : job.state.lastStatus,
        started_at: job.state.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : null,
        completed_at: job.state.lastRunAtMs ? new Date(job.state.lastRunAtMs + (job.state.durationMs || 0)).toISOString() : null,
        duration_ms: job.state.durationMs || null,
        last_delivery_status: job.state.lastDeliveryStatus || null,
        consecutive_errors: job.state.consecutiveErrors || 0,
        error: job.state.lastError || null,
        created_at: job.state.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : new Date().toISOString()
      };

      const { error } = await supabase
        .from('runs')
        .upsert(run, { onConflict: 'job_id' });

      if (error) {
        console.error('Error syncing run:', error);
      } else {
        synced++;
      }
    }
  }

  console.log(`Synced ${synced} runs`);
  return synced;
}

async function main() {
  console.log('Starting sync to Supabase...');
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    const results = await Promise.all([
      syncTopics(),
      syncDrafts(),
      syncResearchBriefs(),
      syncCronRuns()
    ]);

    const [topicsCount, draftsCount, researchCount, runsCount] = results;

    console.log('\n=== Sync Summary ===');
    console.log(`Topics: ${topicsCount}`);
    console.log(`Drafts: ${draftsCount}`);
    console.log(`Research Briefs: ${researchCount}`);
    console.log(`Runs: ${runsCount}`);
    console.log(`Total: ${topicsCount + draftsCount + researchCount + runsCount}`);
    console.log('======================\n');
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

main();