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

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tptbfxjprpzxwsrerwjm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwdGJmeGpwcnB6eHdzcmVyd2ptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDUyNDI3MiwiZXhwIjoyMDkwMTAwMjcyfQ.1d4k8TZvKks9unEECbLFxTYssGhpfLuuNJjBSmyK5dg';
const POLL_INTERVAL = 15000;
const SIMULATE = process.argv.includes('--simulate');
const DOCKER_PREFIX = process.env.DOCKER_PREFIX || 'docker exec openclaw-ji9i-openclaw-1';
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
  switch (task.task_type) {
    case 'research':
      return [
        `Research this LinkedIn topic. Follow your AGENTS.md research process fully.`,
        ``,
        `Topic: "${task.ref_title}"`,
        task.payload.topic_url ? `Source URL: ${task.payload.topic_url}` : '',
        task.payload.topic_source ? `Found via: ${task.payload.topic_source}` : '',
        ``,
        `Topic ID in Supabase: ${task.ref_id}`,
        ``,
        `After researching, update the topic in Supabase:`,
        `- Set summary = your full research brief`,
        `- Set status = 'approved'`,
        ``,
        `Use the Supabase credentials from your workspace tools.`,
      ].filter(Boolean).join('\n');

    case 'draft':
      return [
        `Write a LinkedIn post for this topic. Follow your AGENTS.md, VOICE.md, and TEMPLATES.md fully.`,
        ``,
        `Topic: "${task.ref_title}"`,
        task.payload.topic_summary ? `Research brief:\n${task.payload.topic_summary}` : 'No research brief available — check content-bank for briefs on this topic.',
        ``,
        `Draft ID in Supabase: ${task.ref_id}`,
        ``,
        `After writing, update the draft in Supabase:`,
        `- Set content = your post text`,
        `- Set word_count = actual word count`,
        `- Set status = 'approved'`,
        ``,
        `ONE draft only. 250 words max. Follow your pre-flight checklist.`,
      ].filter(Boolean).join('\n');

    case 'revise':
      return [
        `Revise this LinkedIn draft based on Venky's feedback. Follow your VOICE.md rules.`,
        ``,
        `Topic: "${task.ref_title}"`,
        ``,
        `Current draft:`,
        `---`,
        task.payload.current_content || '(no content)',
        `---`,
        ``,
        `Venky's feedback: "${task.payload.feedback}"`,
        ``,
        `Draft ID in Supabase: ${task.ref_id}`,
        ``,
        `After revising, update the draft in Supabase:`,
        `- Set content = revised post text`,
        `- Set word_count = actual word count`,
        `- Set status = 'approved'`,
        ``,
        `Address the feedback specifically. Keep Venky's voice per VOICE.md.`,
      ].filter(Boolean).join('\n');

    // === BLOG AGENTS (Stork research, Crane draft/revise) ===

    case 'blog_research':
      return [
        `Research this blog topic. Follow your AGENTS.md research process fully.`,
        ``,
        `Topic: "${task.ref_title}"`,
        task.payload.topic_url ? `Source URL: ${task.payload.topic_url}` : '',
        task.payload.topic_source ? `Found via: ${task.payload.topic_source}` : '',
        ``,
        `Topic ID in Supabase: ${task.ref_id}`,
        ``,
        `After researching, update the topic in Supabase:`,
        `- Set summary = your full research brief`,
        `- Set status = 'approved'`,
        ``,
        `Save the brief to your workspace as per AGENTS.md.`,
        `Use the Supabase credentials from your workspace tools.`,
      ].filter(Boolean).join('\n');

    case 'blog_draft':
      return [
        `Write a blog post for appletpod.com. Follow your AGENTS.md fully.`,
        ``,
        `Topic: "${task.ref_title}"`,
        task.payload.topic_summary ? `Research brief:\n${task.payload.topic_summary}` : 'No research brief — check content-bank for briefs on this topic.',
        ``,
        `Draft ID in Supabase: ${task.ref_id}`,
        ``,
        `After writing, update the draft in Supabase:`,
        `- Set content = full MDX blog post`,
        `- Set word_count = actual word count`,
        `- Set status = 'approved'`,
        ``,
        `1500-3000 words. MDX format. Follow your writing procedure.`,
      ].filter(Boolean).join('\n');

    case 'blog_revise':
      return [
        `Revise this blog post based on Venky's feedback. Follow your AGENTS.md.`,
        ``,
        `Topic: "${task.ref_title}"`,
        ``,
        `Current draft:`,
        `---`,
        task.payload.current_content?.substring(0, 5000) || '(no content)',
        `---`,
        ``,
        `Venky's feedback: "${task.payload.feedback}"`,
        ``,
        `Draft ID in Supabase: ${task.ref_id}`,
        ``,
        `After revising, update the draft in Supabase:`,
        `- Set content = revised MDX blog post`,
        `- Set word_count = actual word count`,
        `- Set status = 'approved'`,
        ``,
        `Address the feedback specifically. Maintain blog quality standards.`,
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
  const copyCmd = `docker cp ${tmpFile} openclaw-ji9i-openclaw-1:/tmp/agent-prompt.txt`;
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

    // The agent should update Supabase directly (it has the credentials in its workspace).
    // But as a fallback, we also update from here if the agent's output contains the content.
    // Check if the agent already updated the record:
    if (task.task_type === 'research' || task.task_type === 'blog_research') {
      const { data: topic } = await sb.from('topics').select('summary, status').eq('id', task.ref_id).single();
      if (!topic?.summary || topic.status !== 'approved') {
        // Agent didn't update Supabase directly — use the output as the summary
        log(`   Agent didn't update Supabase directly, writing result as summary`);
        await sb.from('topics').update({
          summary: result,
          status: 'approved',
        }).eq('id', task.ref_id);
      } else {
        log(`   Agent updated Supabase directly ✓`);
      }
    } else if (task.task_type === 'draft' || task.task_type === 'revise' || task.task_type === 'blog_draft' || task.task_type === 'blog_revise') {
      const { data: draft } = await sb.from('drafts').select('content, status').eq('id', task.ref_id).single();
      if (!draft?.content || draft.content === '' || draft.status !== 'approved') {
        log(`   Agent didn't update Supabase directly, writing result as content`);
        const wordCount = result.split(/\s+/).length;
        await sb.from('drafts').update({
          content: result,
          word_count: wordCount,
          status: 'approved',
        }).eq('id', task.ref_id);
      } else {
        log(`   Agent updated Supabase directly ✓`);
      }
    }

    // Mark task completed
    await sb.from('agent_tasks').update({
      status: 'completed',
      result: { output_length: result.length, word_count: result.split(/\s+/).length },
      completed_at: new Date().toISOString(),
    }).eq('id', task.id);

    // Update run
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
