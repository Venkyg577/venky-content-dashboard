#!/usr/bin/env node
/**
 * Agent Runner — polls Supabase for pending agent_tasks and dispatches to OpenClaw.
 *
 * Usage:
 *   node agent-runner.js              # Real mode (calls OpenClaw agents)
 *   node agent-runner.js --simulate   # Simulate mode (mock responses)
 *
 * Deploy to VPS alongside OpenClaw. Runs as a long-lived process.
 */

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tptbfxjprpzxwsrerwjm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwdGJmeGpwcnB6eHdzcmVyd2ptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDUyNDI3MiwiZXhwIjoyMDkwMTAwMjcyfQ.1d4k8TZvKks9unEECbLFxTYssGhpfLuuNJjBSmyK5dg';
const POLL_INTERVAL = 15000; // 15 seconds
const SIMULATE = process.argv.includes('--simulate');
// Set to empty string if running inside the container, or 'docker exec openclaw-ji9i-openclaw-1' if outside
const DOCKER_PREFIX = process.env.DOCKER_PREFIX || 'docker exec openclaw-ji9i-openclaw-1';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}] ${msg}`);
}

// Build agent prompts
function buildPrompt(task) {
  switch (task.task_type) {
    case 'research':
      return `You are Owl, the research agent. Research this topic thoroughly for Venky's LinkedIn content.

Topic: "${task.ref_title}"
Source: ${task.payload.topic_url || 'General industry discussion'}
Context: ${task.payload.topic_source || 'EdTech / L&D industry'}

Write a research summary (300-500 words) with:
1. Key findings and data points
2. Industry context and trends
3. Venky's angle — how this connects to interactive education, AI in learning, and AppletPod
4. 2-3 potential LinkedIn post angles

Write ONLY the research summary, no meta-commentary.`;

    case 'draft':
      return `You are Bee, the LinkedIn content writer. Write a LinkedIn post for Venky (Venkatesh G).

Topic: "${task.ref_title}"
Research: ${task.payload.topic_summary || 'No research available — use your knowledge.'}

Venky's voice:
- Direct, no fluff. Educational but conversational.
- 10 years at BYJU'S (Principal Director PMO, Head of Studio, 300+ people)
- Built 100+ interactive educational applets solo using AI
- Brand: AppletPod — interactive education technology
- Entrepreneur perspective, not corporate speak

Write a 200-300 word LinkedIn post. Include:
- Strong hook (first 2 lines visible before "see more")
- Personal insight or experience
- Actionable takeaway
- No hashtags in the body, add 3-5 at the end

Write ONLY the post content, nothing else.`;

    case 'revise':
      return `You are Bee, the LinkedIn content writer. Revise this draft based on feedback.

Current draft:
---
${task.payload.current_content}
---

Feedback: "${task.payload.feedback}"

Rewrite the post addressing the feedback. Keep Venky's voice — direct, educational, entrepreneur perspective. 200-300 words.

Write ONLY the revised post, nothing else.`;
  }
}

// Simulate agent response
function simulateResponse(task) {
  switch (task.task_type) {
    case 'research':
      return `## Research Summary: ${task.ref_title}

### Key Findings
- The L&D industry is shifting from passive content delivery to interactive, measurable learning experiences
- Organizations using interactive content see 40-60% higher engagement and 25% better knowledge retention
- AI is accelerating content creation but quality and pedagogical soundness remain concerns

### Industry Context
The EdTech sector in 2026 is at an inflection point. Enterprise L&D budgets are growing but expectations around ROI and measurable outcomes are higher than ever. The gap between "content creation" and "learning design" is widening.

### Venky's Angle
This directly connects to AppletPod's core thesis: interactive education isn't just about making content "engaging" — it's about designing learning experiences that produce measurable outcomes. Venky's experience building 100+ applets proves that AI + learning design expertise can bridge this gap at scale.

### Post Angles
1. "The content creation trap" — why more content ≠ better learning
2. Personal story — from managing 300 people to building solo with AI
3. Data-driven — share specific metrics from interactive vs static content`;

    case 'draft':
      return `Stop creating more content. Start designing better learning.

I spent 10 years at BYJU'S managing 300+ people in content production. We churned out thousands of hours of material.

Here's what I learned: Volume doesn't equal impact.

The teams that moved the needle weren't the ones producing the most content. They were the ones obsessing over HOW students interacted with it.

When I left to build AppletPod, I built 100+ interactive educational applets in 3 months. Solo. Using AI.

Not because AI replaced the thinking — but because it freed me to focus on what matters: the learning design.

Three things I've seen work:
→ Interaction beats passive consumption every time
→ Feedback loops > more slides
→ One well-designed applet > ten PDFs

The future of L&D isn't "AI-generated content at scale."

It's AI-assisted learning design that actually changes behavior.

What's your experience? Are you seeing the shift from content volume to learning quality?

#EdTech #LearningDesign #AI #CorporateTraining #AppletPod`;

    case 'revise':
      return `[Revised based on feedback: "${task.payload.feedback}"]

${task.payload.current_content || 'Revised draft content here.'}

(This is a simulated revision — the real Bee agent will rewrite based on the feedback.)`;
  }
}

// Execute OpenClaw agent
async function runAgent(task) {
  if (SIMULATE) {
    log(`🎭 Simulating ${task.agent} for: ${task.ref_title}`);
    await new Promise(r => setTimeout(r, 3000)); // Simulate 3s delay
    return simulateResponse(task);
  }

  const prompt = buildPrompt(task);
  const escapedPrompt = prompt.replace(/'/g, "'\\''");
  const cmd = `${DOCKER_PREFIX} openclaw agent --agent ${task.agent} --message '${escapedPrompt}'`;

  log(`🚀 Running ${task.agent} agent for: ${task.ref_title}`);
  try {
    const output = execSync(cmd, {
      timeout: 300000, // 5 minute timeout
      maxBuffer: 1024 * 1024, // 1MB
      encoding: 'utf-8',
    });
    return output.trim();
  } catch (err) {
    throw new Error(`Agent execution failed: ${err.message}`);
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
  await sb.from('runs').insert({
    id: runId,
    agent_id: task.agent,
    job_name: `${task.task_type}: ${task.ref_title?.substring(0, 50)}`,
    status: 'running',
    started_at: Date.now(),
  });

  // Update task with run_id
  await sb.from('agent_tasks').update({ run_id: runId, status: 'running' }).eq('id', task.id);

  try {
    const result = await runAgent(task);
    const completedAt = Date.now();

    // Write result back to the source record
    if (task.task_type === 'research') {
      // Update topic with research summary
      await sb.from('topics').update({
        summary: result,
        status: 'approved', // Ready for user to approve → create draft
      }).eq('id', task.ref_id);
      log(`✅ Research complete. Topic updated with summary.`);
    } else if (task.task_type === 'draft' || task.task_type === 'revise') {
      // Update draft with content
      const wordCount = result.split(/\s+/).length;
      await sb.from('drafts').update({
        content: result,
        word_count: wordCount,
        status: 'approved', // Ready for user review
      }).eq('id', task.ref_id);
      log(`✅ ${task.task_type === 'draft' ? 'Draft' : 'Revision'} complete. ${wordCount} words.`);
    }

    // Mark task completed
    await sb.from('agent_tasks').update({
      status: 'completed',
      result: { output: result.substring(0, 500), word_count: result.split(/\s+/).length },
      completed_at: new Date().toISOString(),
    }).eq('id', task.id);

    // Update run
    await sb.from('runs').update({
      status: 'completed',
      completed_at: completedAt,
      duration_ms: completedAt - (task.claimed_at ? new Date(task.claimed_at).getTime() : Date.now()),
    }).eq('id', runId);

  } catch (err) {
    log(`❌ Task failed: ${err.message}`);

    await sb.from('agent_tasks').update({
      status: 'failed',
      error: err.message,
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
}

// Start
async function main() {
  log(`🤖 Agent Runner started ${SIMULATE ? '(SIMULATE MODE)' : '(LIVE MODE)'}`);
  log(`📡 Polling Supabase every ${POLL_INTERVAL / 1000}s`);
  if (!SIMULATE) log(`🐳 Docker: ${DOCKER_PREFIX || '(running inside container)'}`);

  // Initial poll
  await poll();

  // Continue polling
  setInterval(poll, POLL_INTERVAL);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
