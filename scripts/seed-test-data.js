#!/usr/bin/env node
/**
 * Seed test data for LinkedIn flow testing.
 * Usage: node scripts/seed-test-data.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tptbfxjprpzxwsrerwjm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwdGJmeGpwcnB6eHdzcmVyd2ptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDUyNDI3MiwiZXhwIjoyMDkwMTAwMjcyfQ.1d4k8TZvKks9unEECbLFxTYssGhpfLuuNJjBSmyK5dg';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const testTopics = [
  {
    title: 'Why Most Corporate Training Fails (And What AI Can Fix)',
    source: 'r/instructionaldesign · LinkedIn trending',
    url: 'https://www.reddit.com/r/instructionaldesign/comments/example1/',
    stage: 'scouted',
    status: 'pending',
    channel: 'linkedin',
    connection: 'DIRECT',
    fit_score: 'Very Strong',
    discovered_at: Date.now() - 3600000,
    created_at: Date.now() - 3600000,
    revised: false,
  },
  {
    title: 'The ROI of Interactive Content vs Static PDFs in Employee Onboarding',
    source: 'eLearning Industry · Research paper',
    url: null,
    stage: 'scouted',
    status: 'pending',
    channel: 'linkedin',
    connection: 'DIRECT',
    fit_score: 'Strong',
    discovered_at: Date.now() - 7200000,
    created_at: Date.now() - 7200000,
    revised: false,
  },
  {
    title: 'AI Agents Are Replacing Content Teams — Here\'s Why That\'s Wrong',
    source: 'HackerNews · Twitter/X discussion',
    url: 'https://news.ycombinator.com/item?id=example',
    stage: 'scouted',
    status: 'pending',
    channel: 'linkedin',
    connection: 'INDIRECT',
    fit_score: 'Strong — High relevance',
    discovered_at: Date.now() - 1800000,
    created_at: Date.now() - 1800000,
    revised: false,
  },
  {
    title: 'Gamification in 2026: Beyond Points and Badges',
    source: 'r/edtech · Industry report',
    url: null,
    stage: 'scouted',
    status: 'pending',
    channel: 'linkedin',
    connection: 'DIRECT',
    fit_score: 'Strong',
    discovered_at: Date.now() - 900000,
    created_at: Date.now() - 900000,
    revised: false,
  },
];

async function seed() {
  console.log('🧹 Cleaning existing data...');

  // Delete in order (feedback references topics/drafts)
  const { error: e1 } = await sb.from('feedback').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: e2 } = await sb.from('agent_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: e3 } = await sb.from('drafts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: e4 } = await sb.from('topics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: e5 } = await sb.from('runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  if (e1 || e2 || e3 || e4 || e5) {
    console.error('Clean errors:', { e1, e2, e3, e4, e5 });
  } else {
    console.log('✅ All tables cleaned');
  }

  console.log('🌱 Seeding test topics...');
  const { data, error } = await sb.from('topics').insert(testTopics).select('id, title');
  if (error) {
    console.error('❌ Seed failed:', error.message);
    return;
  }

  console.log(`✅ Inserted ${data.length} topics:`);
  data.forEach(t => console.log(`   • ${t.title}`));

  // Add a sample run
  await sb.from('runs').insert([
    { job_name: 'morning-scout', agent_id: 'eagle', status: 'completed', started_at: Date.now() - 3600000, completed_at: Date.now() - 3480000, duration_ms: 120000 },
    { job_name: 'topic-scan', agent_id: 'wolf', status: 'completed', started_at: Date.now() - 7200000, completed_at: Date.now() - 7140000, duration_ms: 60000 },
  ]);
  console.log('✅ Inserted 2 sample runs');

  console.log('\n🎯 Ready! Open the dashboard and you should see 4 topics in the Scouted column.');
}

seed().catch(console.error);
