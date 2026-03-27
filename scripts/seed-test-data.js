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
    title: 'Why Most Corporate Training Fails — And What Interactive Content Can Fix',
    summary: 'Reddit discussion in r/instructionaldesign with 200+ upvotes. L&D professionals sharing frustration: "We spend $300K/year on training platforms and completion rates are 23%." Multiple commenters point to lack of interactivity and real practice as the core issue. One commenter links a McKinsey report showing interactive training has 3x retention vs passive video. Strong signal — Venky can speak directly from BYJU\'S experience building interactive content at scale.',
    source: 'r/instructionaldesign · 200+ upvotes · 89 comments',
    url: 'https://www.reddit.com/r/instructionaldesign/comments/1jkmn8p/why_does_corporate_training_still_suck/',
    stage: 'scouted',
    status: 'pending',
    channel: 'linkedin',
    connection: 'DIRECT',
    fit_score: 'Very Strong',
    angle: 'Share BYJU\'S experience: managed 300 people creating content, learned that volume ≠ impact. Interactive applets > more videos.',
    discovered_at: Date.now() - 3600000,
    created_at: Date.now() - 3600000,
    revised: false,
  },
  {
    title: 'The ROI of Interactive Content vs Static PDFs in Employee Onboarding',
    summary: 'eLearning Industry published a study comparing onboarding approaches across 50 companies. Key finding: companies using interactive onboarding content saw 34% faster time-to-productivity and 45% higher 90-day retention. Static PDF-based onboarding had the worst outcomes. Article is getting traction on LinkedIn — 500+ reactions on the original post. AppletPod\'s interactive applet model directly addresses this gap.',
    source: 'eLearning Industry · Published research · Trending on LinkedIn',
    url: 'https://elearningindustry.com/interactive-onboarding-roi-2026-study',
    stage: 'scouted',
    status: 'pending',
    channel: 'linkedin',
    connection: 'DIRECT',
    fit_score: 'Strong — data-backed',
    angle: 'Use the data to validate AppletPod approach. "I built 100+ interactive applets in 3 months — here\'s why the ROI data doesn\'t surprise me."',
    discovered_at: Date.now() - 7200000,
    created_at: Date.now() - 7200000,
    revised: false,
  },
  {
    title: 'AI Agents Are Replacing Content Teams — Here\'s Why That\'s Wrong',
    summary: 'HackerNews thread (400+ points) debating whether AI agents can fully replace human content creators. Top comment: "AI can generate 10x the content but 90% of it is unusable without human curation." Counter-argument: "The economics are clear — one person + AI agents > a team of 10." This is a hot-button topic in EdTech/content. Venky is living proof of the "1 person + AI" model with AppletPod but can add nuance — AI doesn\'t replace thinking, it replaces busywork.',
    source: 'HackerNews · 400+ points · Twitter/X crossover discussion',
    url: 'https://news.ycombinator.com/item?id=43482901',
    stage: 'scouted',
    status: 'pending',
    channel: 'linkedin',
    connection: 'INDIRECT',
    fit_score: 'Strong — High relevance',
    angle: 'Personal story: "I went from managing 300 people to building solo with AI. But AI didn\'t replace my team — it replaced the parts of the work that shouldn\'t have needed a team."',
    discovered_at: Date.now() - 1800000,
    created_at: Date.now() - 1800000,
    revised: false,
  },
  {
    title: 'Gamification in 2026: Beyond Points and Badges — What Actually Works',
    summary: 'Industry report from Gartner shows gamification market growing to $40B by 2027 but 80% of gamified learning experiences fail because they focus on extrinsic motivation (points, badges) rather than intrinsic engagement (challenge, mastery, autonomy). The report highlights interactive simulations and scenario-based learning as the highest-performing approaches. Several L&D leaders on LinkedIn are sharing this with commentary about "gamification fatigue." Venky\'s applet work is exactly the kind of intrinsic-engagement-first approach that works.',
    source: 'Gartner report · r/edtech · LinkedIn L&D discussion',
    url: null,
    stage: 'scouted',
    status: 'pending',
    channel: 'linkedin',
    connection: 'DIRECT',
    fit_score: 'Strong',
    angle: 'Contrast shallow gamification (points/badges) with deep interactivity (AppletPod applets). "Real engagement isn\'t about rewards — it\'s about making the learner think."',
    discovered_at: Date.now() - 900000,
    created_at: Date.now() - 900000,
    revised: false,
  },
];

async function seed() {
  console.log('🧹 Cleaning existing data...');

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

  await sb.from('runs').insert([
    { job_name: 'morning-scout', agent_id: 'eagle', status: 'completed', started_at: Date.now() - 3600000, completed_at: Date.now() - 3480000, duration_ms: 120000 },
    { job_name: 'topic-scan', agent_id: 'wolf', status: 'completed', started_at: Date.now() - 7200000, completed_at: Date.now() - 7140000, duration_ms: 60000 },
  ]);
  console.log('✅ Inserted 2 sample runs');

  console.log('\n🎯 Ready! Topics now have summaries, sources, angles, and URLs for informed decisions.');
}

seed().catch(console.error);
