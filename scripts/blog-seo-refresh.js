#!/usr/bin/env node
/**
 * blog-seo-refresh.js — Finds old blog posts needing SEO refresh.
 *
 * Runs weekly (Sunday). Queries Supabase for published posts older than 90 days,
 * creates refresh tasks in agent_tasks for Stork (re-research) and Crane (rewrite).
 *
 * Also generates sitemap.txt for search engine discovery.
 *
 * Usage: node blog-seo-refresh.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env
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
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const REFRESH_AGE_DAYS = 90;
const MAX_REFRESH_PER_RUN = 3;

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}] ${msg}`);
}

async function findStaleBlogs() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REFRESH_AGE_DAYS);

  const { data, error } = await sb
    .from('drafts')
    .select('id, topic, blog_url, blog_slug, blog_keywords, blog_cluster, created_at, revised_at')
    .eq('status', 'published')
    .eq('stage', 'published')
    .not('blog_url', 'is', null)
    .order('revised_at', { ascending: true, nullsFirst: true })
    .limit(MAX_REFRESH_PER_RUN);

  if (error) throw error;

  // Filter for posts older than cutoff (not recently revised)
  return (data || []).filter(d => {
    const lastTouch = d.revised_at || d.created_at;
    return new Date(lastTouch) < cutoff;
  });
}

async function createRefreshTasks(stalePosts) {
  const tasks = [];

  for (const post of stalePosts) {
    // Create a research refresh task for Stork
    const researchTask = {
      id: `refresh-research-${post.id}-${Date.now()}`,
      task_type: 'blog_research',
      agent: 'stork',
      ref_id: post.id,
      ref_title: `[REFRESH] ${post.topic}`,
      payload: {
        refresh: true,
        original_url: post.blog_url,
        original_keywords: post.blog_keywords,
        original_cluster: post.blog_cluster,
      },
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    tasks.push(researchTask);

    // Mark the draft as needing refresh
    await sb.from('drafts').update({
      revised: true,
      stage: 'scouted', // reset to beginning of pipeline
      status: 'pending',
    }).eq('id', post.id);
  }

  if (tasks.length > 0) {
    const { error } = await sb.from('agent_tasks').insert(tasks);
    if (error) throw error;
  }

  return tasks.length;
}

async function generateSitemap() {
  const { data, error } = await sb
    .from('drafts')
    .select('blog_url')
    .eq('status', 'published')
    .not('blog_url', 'is', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const urls = (data || []).map(d => d.blog_url).filter(Boolean);

  // Generate sitemap.txt (one URL per line)
  const sitemapPath = '/data/.openclaw/workspace/sitemap.txt';
  const sitemapContent = urls.join('\n') + '\n';
  fs.writeFileSync(sitemapPath, sitemapContent);
  log(`sitemap.txt: ${urls.length} URLs written to ${sitemapPath}`);

  // Generate robots.txt
  const robotsPath = '/data/.openclaw/workspace/robots.txt';
  const robotsContent = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: https://appletpod.com/sitemap.txt`,
    '',
  ].join('\n');
  fs.writeFileSync(robotsPath, robotsContent);
  log(`robots.txt written to ${robotsPath}`);

  return urls.length;
}

async function main() {
  log('Blog SEO Refresh — starting');

  // 1. Find stale posts
  const stalePosts = await findStaleBlogs();
  log(`Found ${stalePosts.length} posts older than ${REFRESH_AGE_DAYS} days`);

  if (stalePosts.length > 0) {
    for (const p of stalePosts) {
      log(`  - "${p.topic}" (${p.blog_url})`);
    }

    // 2. Create refresh tasks
    const taskCount = await createRefreshTasks(stalePosts);
    log(`Created ${taskCount} refresh tasks in agent_tasks`);
  } else {
    log('No posts need refreshing');
  }

  // 3. Generate sitemap + robots
  const urlCount = await generateSitemap();
  log(`Sitemap updated: ${urlCount} total published URLs`);

  log('Done');
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
