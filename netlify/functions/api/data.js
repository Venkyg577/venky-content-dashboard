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

      topics.push({
        id: `topic-${index}`,
        title: titleMatch[1],
        source: sourceMatch ? sourceMatch[1] : '',
        url: urlMatch ? urlMatch[1] : '',
        date: dateMatch ? dateMatch[1] : '',
        signal: signalMatch ? signalMatch[1] : '',
        fit: fitMatch ? fitMatch[1] : '',
        summary: summaryMatch ? summaryMatch[1] : section.substring(0, 200),
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

      return {
        id: `draft-${filename}`,
        topic: title,
        draft_type: draftType,
        target_publish_date: match[2],
        word_count: wordCount,
        file_path: filePath,
        pick_recommended: isPick,
        status: 'pending',
      };
    }
  }
  return null;
}

function getWeeklyMetrics(topics, drafts, runs) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentTopics = topics.filter(t => {
    if (t.date) {
      const topicDate = new Date(t.date);
      return topicDate >= weekAgo;
    }
    return false;
  });

  const recentDrafts = drafts.filter(d => {
    const draftDate = new Date(d.target_publish_date);
    return draftDate >= weekAgo && draftDate <= now;
  });

  const completedRuns = runs.filter(r => {
    if (r.startedAt) {
      const runDate = new Date(r.startedAt);
      return runDate >= weekAgo && r.state.lastStatus === 'ok';
    }
    return false;
  });

  return {
    topics_found: recentTopics.length,
    briefs_created: recentDrafts.filter(d => d.draft_type === 'brief').length,
    drafts_generated: recentDrafts.length,
    runs_completed: completedRuns.length,
    drafts_pending: recentDrafts.filter(d => d.status === 'pending').length,
  };
}

// Handler for /api/data endpoint
exports.handler = async (event) => {
  try {
    // Read cron jobs
    let runs = [];
    if (fs.existsSync(CRON_JOBS_FILE)) {
      const jobsData = JSON.parse(fs.readFileSync(CRON_JOBS_FILE, 'utf-8'));
      if (jobsData.jobs) {
        runs = jobsData.jobs.map(job => ({
          id: job.id,
          agentId: job.agentId,
          name: job.name,
          schedule: job.schedule,
          state: job.state,
          lastRun: job.state.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : null,
          lastStatus: job.state.lastStatus,
          lastDeliveryStatus: job.state.lastDeliveryStatus,
          durationMs: job.state.durationMs,
        }));
      }
    }

    // Read topics
    let topics = [];
    if (fs.existsSync(TOPICS_FILE)) {
      const topicsMarkdown = fs.readFileSync(TOPICS_FILE, 'utf-8');
      topics = parseTopicsMarkdown(topicsMarkdown);
    }

    // Read drafts
    let drafts = [];
    if (fs.existsSync(DRAFTS_DIR)) {
      const files = fs.readdirSync(DRAFTS_DIR).filter(f => f.startsWith('draft-'));
      for (const file of files) {
        const parsed = parseDraftFile(file);
        if (parsed) {
          drafts.push(parsed);
        }
      }
    }

    // Get metrics
    const metrics = getWeeklyMetrics(topics, drafts, runs);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        agents: [
          { id: 'wolf', name: 'Wolf', emoji: '🐺', color: '#2563EB', role: 'Coordinator' },
          { id: 'eagle', name: 'Eagle', emoji: '🦅', color: '#10B981', role: 'Scout' },
          { id: 'owl', name: 'Owl', emoji: '🦉', color: '#7C3AED', role: 'Researcher' },
          { id: 'bee', name: 'Bee', emoji: '🐝', color: '#F59E0B', role: 'Drafter' },
        ],
        runs,
        topics,
        drafts,
        metrics,
        lastUpdated: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
