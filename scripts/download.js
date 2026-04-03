#!/usr/bin/env node
/**
 * download.js — Agents read their assigned task from Supabase.
 *
 * Usage:
 *   node download.js <task-id>              # Download specific task
 *   node download.js --agent <agent-name>   # Get next pending task for agent
 *
 * Outputs task JSON to stdout (agent reads it) and saves to /tmp/task-<id>.json
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

async function main() {
  const args = process.argv.slice(2);
  let task;

  if (args[0] === '--agent' && args[1]) {
    // Get next pending task for this agent
    const agentName = args[1];
    const { data, error } = await sb
      .from('agent_tasks')
      .select('*')
      .eq('agent', agentName)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) {
      console.log(JSON.stringify({ status: 'no_tasks', agent: agentName }));
      process.exit(0);
    }
    task = data;

  } else if (args[0]) {
    // Get specific task by ID
    const taskId = args[0];
    const { data, error } = await sb
      .from('agent_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error || !data) {
      console.error(`ERROR: Task not found: ${taskId}`);
      process.exit(1);
    }
    task = data;

  } else {
    console.error('Usage: node download.js <task-id> | --agent <agent-name>');
    process.exit(1);
  }

  // Enrich with source data if available
  if (task.ref_id) {
    if (['research', 'blog_research'].includes(task.task_type)) {
      const { data: topic } = await sb.from('topics').select('*').eq('id', task.ref_id).single();
      if (topic) task._source = topic;
    } else if (['draft', 'revise', 'blog_draft', 'blog_revise', 'carousel_draft', 'carousel_revise'].includes(task.task_type)) {
      const { data: draft } = await sb.from('drafts').select('*').eq('id', task.ref_id).single();
      if (draft) task._source = draft;
    }
  }

  // Save to file
  const outPath = `/tmp/task-${task.id}.json`;
  fs.writeFileSync(outPath, JSON.stringify(task, null, 2));

  // Output to stdout for agent to read
  console.log(JSON.stringify(task, null, 2));
}

main().catch(err => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
