const fs = require('fs');
const path = require('path');

// Paths to OpenClaw workspaces
const TOPICS_FILE = '/data/.openclaw/workspace-wolf/memory/scouted-topics.md';
const DRAFTS_DIR = '/data/.openclaw/workspace-wolf/content-bank/drafts/';
const CRON_JOBS_FILE = '/data/.openclaw/cron/jobs.json';

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
        id: `topic-${index}-${Date.now()}`,
        title: titleMatch[1],
        source: sourceMatch ? sourceMatch[1] : '',
        url: urlMatch ? urlMatch[1] : '',
        platform: urlMatch ? (urlMatch[1].includes('linkedin') ? 'LinkedIn' : 'Web') : '',
        published_date: topicDate,
        signal_type: signalMatch ? signalMatch[1] : 'C',
        fit_score: fitMatch ? fitMatch[1] : 'Moderate',
        summary: summaryMatch ? summaryMatch[1] : section.substring(0, 200),
        discovered_at: Date.now(),
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
        word_count: content.split(/\s+/).length,
        file_path: filePath,
        file_name: filename,
        content: content, // Include full content
        pick_recommended: isPick,
        status: isPublished ? 'published' : 'pending',
        created_at: Date.now()
      };
    }
  }
  return null;
}

async function syncToConvex() {
  console.log('Starting sync with content...');
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    // Read topics
    let topics = [];
    if (fs.existsSync(TOPICS_FILE)) {
      const markdown = fs.readFileSync(TOPICS_FILE, 'utf-8');
      topics = parseTopicsMarkdown(markdown);
      console.log(`Found ${topics.length} topics`);
    }

    // Read drafts
    let drafts = [];
    if (fs.existsSync(DRAFTS_DIR)) {
      const files = fs.readdirSync(DRAFTS_DIR).filter(f => f.startsWith('draft-'));
      for (const file of files) {
        const parsed = parseDraftFile(file);
        if (parsed) drafts.push(parsed);
      }
      console.log(`Found ${drafts.length} drafts`);
    }

    // Read cron runs
    let runs = [];
    if (fs.existsSync(CRON_JOBS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CRON_JOBS_FILE, 'utf-8'));
      if (data.jobs) {
        for (const job of data.jobs) {
          if (job.state && job.state.lastRunAtMs) {
            runs.push({
              id: `run-${job.id}-${job.state.lastRunAtMs}`,
              agent_id: job.agentId || 'unknown',
              job_id: job.id,
              job_name: job.name,
              status: job.state.lastStatus === 'ok' ? 'completed' : job.state.lastStatus === 'error' ? 'failed' : 'pending',
              started_at: job.state.lastRunAtMs,
              completed_at: job.state.lastRunAtMs + (job.state.durationMs || 0),
              duration_ms: job.state.durationMs || 0,
              last_delivery_status: job.state.lastDeliveryStatus || null,
              consecutive_errors: job.state.consecutiveErrors || 0,
              error: job.state.lastError || null,
              created_at: job.state.lastRunAtMs || Date.now()
            });
          }
        }
      }
      console.log(`Found ${runs.length} runs`);
    }

    // Define agents (static data)
    const agents = [
      { id: 'wolf', name: 'Wolf', emoji: '🐺', color: '#2563EB', role: 'Coordinator', slack_channel_id: 'C0AFANUGH8T', created_at: Date.now() },
      { id: 'eagle', name: 'Eagle', emoji: '🦅', color: '#10B981', role: 'Scout', slack_channel_id: 'C0AFLP04KNG', created_at: Date.now() },
      { id: 'owl', name: 'Owl', emoji: '🦉', color: '#7C3AED', role: 'Researcher', slack_channel_id: 'C0AFTVBLCEM', created_at: Date.now() },
      { id: 'bee', name: 'Bee', emoji: '🐝', color: '#F59E0B', role: 'Drafter', slack_channel_id: 'C0AFF3MG8MU', created_at: Date.now() }
    ];

    // Push data to Convex
    console.log('\nPreparing data...');
    
    const data = {
      lastUpdated: new Date().toISOString(),
      agents,
      topics,
      drafts,
      runs
    };

    // Save to file for dashboard
    const outputFile = '/data/.openclaw/workspace/venky-dashboard/dashboard-data.json';
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log(`\n✅ Data saved to ${outputFile}`);

    console.log('\n=== Sync Summary ===');
    console.log(`Agents: ${agents.length}`);
    console.log(`Topics: ${topics.length}`);
    console.log(`Drafts: ${drafts.length}`);
    console.log(`Runs: ${runs.length}`);
    console.log('===================\n');
    
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  syncToConvex();
}
