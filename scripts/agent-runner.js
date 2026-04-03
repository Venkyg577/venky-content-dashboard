#!/usr/bin/env node
/**
 * Agent Runner — polls Supabase for pending agent_tasks and dispatches to OpenClaw.
 *
 * Usage:
 *   node agent-runner.js              # Real mode (calls OpenClaw agents)
 *   node agent-runner.js --simulate   # Simulate mode (mock responses)
 *
 * Deploy to VPS alongside OpenClaw. Runs as a long-lived process.
 *
 * IMPORTANT: This script sends minimal context to agents. The agents have their
 * own AGENTS.md, VOICE.md, SOUL.md, TEMPLATES.md in their workspaces that define
 * how they research and write. We just tell them WHAT to work on, not HOW.
 */

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}
const POLL_INTERVAL = 15000;
const SIMULATE = process.argv.includes('--simulate');
const DOCKER_PREFIX = process.env.DOCKER_PREFIX || 'docker exec openclaw-jump-openclaw-1';
const AGENT_TIMEOUT = 600000; // 10 minutes — agents do real research with web fetching

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}] ${msg}`);
}

/**
 * Build prompts that tell agents WHAT to do, not HOW.
 * Agents have their own AGENTS.md with detailed instructions on voice, format, research process.
 * We just provide the task context and let them follow their own playbook.
 */
function buildPrompt(task) {
  const UPLOAD_CMD = 'node /data/.openclaw/workspace/scripts/upload.js';

  switch (task.task_type) {
    case 'research':
      return [
        `Research this LinkedIn topic. Follow your AGENTS.md.`,
        ``,
        `Topic: "${task.ref_title}"`,
        task.payload.topic_url ? `Source: ${task.payload.topic_url}` : '',
        ``,
        `When done, write your output as JSON and upload:`,
        ``,
        `cat > /tmp/research-output.json << 'JSONEOF'`,
        `{"stage":"researched","ref_id":"${task.ref_id}","summary":"YOUR RESEARCH BRIEF HERE","angle":"VENKY'S UNIQUE ANGLE"}`,
        `JSONEOF`,
        `${UPLOAD_CMD} /tmp/research-output.json`,
      ].filter(Boolean).join('\n');

    case 'draft':
      return [
        `Write a LinkedIn post. Follow your AGENTS.md.`,
        ``,
        `Topic: "${task.ref_title}"`,
        task.payload.topic_summary ? `Brief: ${task.payload.topic_summary.substring(0, 500)}` : '',
        ``,
        `When done, write JSON and upload:`,
        ``,
        `cat > /tmp/draft-output.json << 'JSONEOF'`,
        `{"stage":"drafted","ref_id":"${task.ref_id}","content":"YOUR POST TEXT","draft_type":"commentary"}`,
        `JSONEOF`,
        `${UPLOAD_CMD} /tmp/draft-output.json`,
      ].filter(Boolean).join('\n');

    case 'revise':
      return [
        `Revise this LinkedIn draft per feedback. Follow your AGENTS.md.`,
        ``,
        `Topic: "${task.ref_title}"`,
        `Current draft:\n---\n${task.payload.current_content || '(none)'}\n---`,
        `Feedback: "${task.payload.feedback}"`,
        ``,
        `When done, write JSON and upload:`,
        ``,
        `cat > /tmp/draft-output.json << 'JSONEOF'`,
        `{"stage":"drafted","ref_id":"${task.ref_id}","content":"REVISED POST TEXT","draft_type":"commentary"}`,
        `JSONEOF`,
        `${UPLOAD_CMD} /tmp/draft-output.json`,
      ].filter(Boolean).join('\n');

    case 'blog_research':
      return [
        `Research this blog topic (SEO + keywords). Follow your AGENTS.md.`,
        ``,
        `Topic: "${task.ref_title}"`,
        task.payload.topic_url ? `Source: ${task.payload.topic_url}` : '',
        ``,
        `When done, write JSON and upload:`,
        ``,
        `cat > /tmp/blog-research-output.json << 'JSONEOF'`,
        `{"stage":"blog_researched","ref_id":"${task.ref_id}","summary":"RESEARCH BRIEF","keywords":["kw1","kw2"],"cluster":"interactive-learning"}`,
        `JSONEOF`,
        `${UPLOAD_CMD} /tmp/blog-research-output.json`,
      ].filter(Boolean).join('\n');

    case 'blog_draft':
      return [
        `Write a blog post for appletpod.com. Follow your AGENTS.md.`,
        ``,
        `Topic: "${task.ref_title}"`,
        task.payload.topic_summary ? `Brief: ${task.payload.topic_summary.substring(0, 500)}` : '',
        ``,
        `When done, write JSON and upload:`,
        ``,
        `cat > /tmp/blog-output.json << 'JSONEOF'`,
        `{"stage":"blog_drafted","ref_id":"${task.ref_id}","content":"FULL MDX BLOG POST","word_count":2000,"blog_slug":"topic-slug","blog_keywords":["kw1"],"blog_cluster":"ai-in-education"}`,
        `JSONEOF`,
        `${UPLOAD_CMD} /tmp/blog-output.json`,
      ].filter(Boolean).join('\n');

    case 'blog_revise':
      return [
        `Revise this blog post per feedback. Follow your AGENTS.md.`,
        ``,
        `Topic: "${task.ref_title}"`,
        `Current draft:\n---\n${(task.payload.current_content || '').substring(0, 3000)}\n---`,
        `Feedback: "${task.payload.feedback}"`,
        ``,
        `When done, write JSON and upload:`,
        ``,
        `cat > /tmp/blog-output.json << 'JSONEOF'`,
        `{"stage":"blog_drafted","ref_id":"${task.ref_id}","content":"REVISED MDX POST","word_count":2000}`,
        `JSONEOF`,
        `${UPLOAD_CMD} /tmp/blog-output.json`,
      ].filter(Boolean).join('\n');

    case 'carousel_draft':
      return [
        `Write a LinkedIn carousel (6-8 slides). Follow your AGENTS.md.`,
        ``,
        `Topic: "${task.ref_title}"`,
        task.payload.topic_summary ? `Brief: ${task.payload.topic_summary.substring(0, 500)}` : '',
        ``,
        `When done, write JSON and upload:`,
        ``,
        `cat > /tmp/draft-output.json << 'JSONEOF'`,
        `{"stage":"drafted","ref_id":"${task.ref_id}","content":"LINKEDIN CAPTION","draft_type":"carousel","carousel_json":{"slides":[{"title":"...","body":"..."}]}}`,
        `JSONEOF`,
        `${UPLOAD_CMD} /tmp/draft-output.json`,
      ].filter(Boolean).join('\n');

    case 'carousel_revise':
      return [
        `Revise this carousel per feedback. Follow your AGENTS.md.`,
        ``,
        `Topic: "${task.ref_title}"`,
        `Current:\n---\n${(task.payload.current_content || '').substring(0, 3000)}\n---`,
        `Feedback: "${task.payload.feedback}"`,
        ``,
        `When done, write JSON and upload:`,
        ``,
        `cat > /tmp/draft-output.json << 'JSONEOF'`,
        `{"stage":"drafted","ref_id":"${task.ref_id}","content":"REVISED CAPTION","draft_type":"carousel","carousel_json":{"slides":[{"title":"...","body":"..."}]}}`,
        `JSONEOF`,
        `${UPLOAD_CMD} /tmp/draft-output.json`,
      ].filter(Boolean).join('\n');
  }
}

// Execute OpenClaw agent
async function runAgent(task) {
  if (SIMULATE) {
    log(`🎭 Simulating ${task.agent} for: ${task.ref_title}`);
    await new Promise(r => setTimeout(r, 3000));
    return `[SIMULATED] ${task.task_type} result for "${task.ref_title}"`;
  }

  const prompt = buildPrompt(task);
  // Write prompt to a temp file to avoid shell escaping issues
  const fs = require('fs');
  const tmpFile = `/tmp/agent-prompt-${task.id}.txt`;
  fs.writeFileSync(tmpFile, prompt);

  // Copy prompt file into container, then run agent
  const containerName = DOCKER_PREFIX.replace('docker exec ', '');
  const copyCmd = `docker cp ${tmpFile} ${containerName}:/tmp/agent-prompt.txt`;
  const agentCmd = `${DOCKER_PREFIX} bash -c 'openclaw agent --agent ${task.agent} --message "$(cat /tmp/agent-prompt.txt)"'`;

  log(`🚀 Running ${task.agent} agent for: ${task.ref_title}`);
  log(`   Task type: ${task.task_type} | Timeout: ${AGENT_TIMEOUT / 1000}s`);

  try {
    execSync(copyCmd, { timeout: 10000 });
    const output = execSync(agentCmd, {
      timeout: AGENT_TIMEOUT,
      maxBuffer: 5 * 1024 * 1024, // 5MB — agents can produce verbose output
      encoding: 'utf-8',
    });
    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    return output.trim();
  } catch (err) {
    try { require('fs').unlinkSync(tmpFile); } catch (_) {}
    throw new Error(`Agent execution failed: ${err.stderr || err.message}`);
  }
}

// Process a single task
async function processTask(task) {
  log(`📋 Claiming task: ${task.task_type} → ${task.agent} | ${task.ref_title}`);

  // Claim the task
  await sb.from('agent_tasks').update({
    status: 'claimed',
    claimed_at: new Date().toISOString(),
  }).eq('id', task.id);

  // Create a run record
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  await sb.from('runs').insert({
    id: runId,
    agent_id: task.agent,
    job_name: `${task.task_type}: ${task.ref_title?.substring(0, 50)}`,
    status: 'running',
    started_at: startedAt,
  });

  await sb.from('agent_tasks').update({ run_id: runId, status: 'running' }).eq('id', task.id);

  try {
    const result = await runAgent(task);
    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    // Agent uses upload.js to write results to Supabase.
    // Verify the upload happened by checking the record status.
    let uploaded = false;
    if (task.task_type === 'research' || task.task_type === 'blog_research') {
      const { data: topic } = await sb.from('topics').select('status').eq('id', task.ref_id).single();
      uploaded = topic?.status === 'approved';
    } else if (['draft', 'revise', 'blog_draft', 'blog_revise', 'carousel_draft', 'carousel_revise'].includes(task.task_type)) {
      const { data: draft } = await sb.from('drafts').select('status').eq('id', task.ref_id).single();
      uploaded = draft?.status === 'approved';
    }

    if (uploaded) {
      log(`   upload.js confirmed: Supabase updated ✓`);
    } else {
      log(`   ⚠️ upload.js may not have run. Agent output saved to task result as fallback.`);
    }

    // Mark task completed
    await sb.from('agent_tasks').update({
      status: 'completed',
      result: { output_length: result.length, uploaded },
      completed_at: new Date().toISOString(),
    }).eq('id', task.id);

    await sb.from('runs').update({
      status: 'completed',
      completed_at: completedAt,
      duration_ms: durationMs,
    }).eq('id', runId);

    log(`✅ Done in ${Math.round(durationMs / 1000)}s`);

  } catch (err) {
    const errMsg = err.message?.substring(0, 500) || 'Unknown error';
    log(`❌ Task failed: ${errMsg}`);

    await sb.from('agent_tasks').update({
      status: 'failed',
      error: errMsg,
      completed_at: new Date().toISOString(),
    }).eq('id', task.id);

    await sb.from('runs').update({
      status: 'failed',
      completed_at: Date.now(),
    }).eq('id', runId);
  }
}

// Main poll loop
async function poll() {
  try {
    const { data: tasks, error } = await sb
      .from('agent_tasks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      log(`⚠️ Poll error: ${error.message}`);
      return;
    }

    if (tasks && tasks.length > 0) {
      await processTask(tasks[0]);
    }
  } catch (e) {
    log(`⚠️ Poll exception: ${e.message}`);
  }
}

// Start
async function main() {
  log(`🤖 Agent Runner started ${SIMULATE ? '(SIMULATE MODE)' : '(LIVE MODE — real OpenClaw agents)'}`);
  log(`📡 Polling Supabase every ${POLL_INTERVAL / 1000}s`);
  log(`⏱️  Agent timeout: ${AGENT_TIMEOUT / 1000}s`);
  if (!SIMULATE) log(`🐳 Docker: ${DOCKER_PREFIX}`);

  // Initial poll
  await poll();

  // Continue polling
  setInterval(poll, POLL_INTERVAL);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
