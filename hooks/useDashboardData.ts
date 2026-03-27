'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, Topic, Draft, Feedback, Run } from '@/lib/supabase';

const SLACK_BOT_TOKEN = process.env.NEXT_PUBLIC_SLACK_BOT_TOKEN || '';
const SLACK_CHANNEL_AIMY = process.env.NEXT_PUBLIC_SLACK_CHANNEL_AIMY || '';
const SLACK_CHANNEL_BLOG = process.env.NEXT_PUBLIC_SLACK_CHANNEL_BLOG || '';

export function useDashboardData() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    const [t, d, f, r] = await Promise.all([
      supabase.from('topics').select('*').order('discovered_at', { ascending: false }),
      supabase.from('drafts').select('*').order('created_at', { ascending: false }),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }),
      supabase.from('runs').select('*').order('started_at', { ascending: false }).limit(50),
    ]);
    if (t.data) setTopics(t.data);
    if (d.data) setDrafts(d.data);
    if (f.data) setFeedback(f.data);
    if (r.data) setRuns(r.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  const requireAuth = (fn: () => void) => {
    if (authed) return fn();
    const pw = prompt('Password:');
    if (pw === (process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD || '')) { setAuthed(true); fn(); }
    else showToast('Wrong password');
  };

  const notifySlack = async (channel: string, msg: string) => {
    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` },
        body: JSON.stringify({ channel, text: msg })
      });
    } catch (_) {}
  };

  const spawnAgent = async (agentId: string, taskPrompt: string, model?: string) => {
    try {
      const webhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_URL || 'http://localhost:3001/webhook/spawn-agent';
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, task: taskPrompt, model })
      });
      if (!response.ok) console.error('Webhook not responding.');
    } catch (e: any) {
      console.error(`Webhook unreachable (${e?.message || e}).`);
    }
  };

  // === MUTATIONS ===
  const approveTopic = async (id: string) => {
    const t = topics.find(x => x.id === id);
    if (!t) return;

    const isLinkedIn = t.channel === 'linkedin' || t.channel === 'both';
    const isBlog = t.channel === 'blog' || t.channel === 'both';

    if (isLinkedIn && !isBlog) {
      if (t.stage === 'scouted') {
        await supabase.from('topics').update({ status: 'pending', stage: 'researched' }).eq('id', id);
        notifySlack(SLACK_CHANNEL_AIMY, `Topic sent to research: ${t.title}`);
        spawnAgent('owl', `Research this LinkedIn topic: "${t.title}". Set status=pending, then after research set status=approved with summary in Supabase.`, 'anthropic/claude-opus-4-6');
        showToast('Sent to research'); load(); return;
      }
      if (t.stage === 'researched') {
        const { data: existing } = await supabase.from('drafts').select('id').eq('topic', t.title).eq('channel', 'linkedin').neq('status', 'rejected').limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from('drafts').insert({ topic: t.title, channel: 'linkedin', draft_type: 'commentary', stage: 'drafted', status: 'pending', content: '', word_count: 0, created_at: Date.now() });
        }
        await supabase.from('topics').update({ status: 'archived' }).eq('id', id);
        notifySlack(SLACK_CHANNEL_AIMY, `Research approved: ${t.title}`);
        const brief = topics.find(x => x.id === id)?.summary || '';
        spawnAgent('bee', `Write a 200-300 word LinkedIn post for: "${t.title}". Research brief: ${brief}.`, 'anthropic/claude-opus-4-6');
        showToast('Draft created'); load(); return;
      }
    }

    if (isBlog) {
      await supabase.from('topics').update({ status: 'approved', stage: 'approved' }).eq('id', id);
      const { data: existing } = await supabase.from('drafts').select('id, status').eq('topic', t.title).eq('channel', 'blog').neq('status', 'rejected').limit(1);
      if (!existing || existing.length === 0) {
        const { error: draftErr } = await supabase.from('drafts').insert({ topic: t.title, channel: 'blog', draft_type: 'blog', stage: 'drafted', status: 'pending', content: '', word_count: 0, created_at: Date.now() });
        if (draftErr) { showToast('Draft creation failed'); return; }
      }
      notifySlack(SLACK_CHANNEL_AIMY, `Blog approved: ${t.title}`);
      spawnAgent('crane', `Write a 1500-3000 word blog post for: "${t.title}".`, 'anthropic/claude-opus-4-6');
      showToast('Approved'); load(); return;
    }

    // Fallback
    const channel = t.channel || 'linkedin';
    const draftType = channel === 'blog' ? 'blog' : 'commentary';
    const { data: existing } = await supabase.from('drafts').select('id, status').eq('topic', t.title).eq('channel', channel).neq('status', 'rejected').limit(1);
    if (!existing || existing.length === 0) {
      const { data: draft, error: draftErr } = await supabase.from('drafts').insert({ topic: t.title, channel, draft_type: draftType, stage: 'drafted', status: 'pending', content: '', word_count: 0, target_publish_date: new Date().toISOString().split('T')[0], created_at: Date.now() }).select('id');
      if (draftErr) { showToast('Draft creation failed'); return; }
      await supabase.from('feedback').insert({ item_id: id, item_type: 'topic', action: 'approved', comment: `Draft ${draft?.[0]?.id} created for ${channel} channel` });
    }
    notifySlack(SLACK_CHANNEL_AIMY, `Topic approved: ${t.title}`);
    showToast('Approved & queued');
    await new Promise(r => setTimeout(r, 500));
    load();
  };

  const archiveTopic = async (id: string) => {
    await supabase.from('topics').update({ status: 'archived' }).eq('id', id);
    showToast('Archived'); load();
  };

  const rejectTopic = async (id: string) => {
    await supabase.from('topics').update({ status: 'rejected' }).eq('id', id);
    showToast('Rejected'); load();
  };

  const approveDraft = async (id: string) => {
    await supabase.from('drafts').update({ status: 'approved', stage: 'ready_to_post' }).eq('id', id);
    const d = drafts.find(x => x.id === id);
    if (d?.channel === 'blog') {
      notifySlack(SLACK_CHANNEL_BLOG, `Blog approved for publishing: ${d?.topic}`);
    }
    showToast('Approved'); load();
  };

  const publishDraft = async (id: string) => {
    await supabase.from('drafts').update({ status: 'published', stage: 'published' }).eq('id', id);
    showToast('Marked published'); load();
  };

  const rejectDraft = async (id: string) => {
    await supabase.from('drafts').update({ status: 'rejected' }).eq('id', id);
    showToast('Rejected'); load();
  };

  const archiveDraft = async (id: string) => {
    await supabase.from('drafts').update({ status: 'archived' }).eq('id', id);
    showToast('Archived'); load();
  };

  const reviseDraft = async (id: string, fb: string) => {
    if (!fb.trim()) return;
    await supabase.from('drafts').update({ status: 'revision' }).eq('id', id);
    await supabase.from('feedback').insert({ item_id: id, item_type: 'draft', action: 'revise', comment: fb });
    notifySlack(SLACK_CHANNEL_AIMY, `Revision requested on draft: ${fb}`);
    showToast('Revision sent'); load();
  };

  const rejectItem = async (type: 'topic' | 'draft', item: any, feedbackText: string) => {
    if (!feedbackText.trim()) return;
    if (type === 'topic') {
      await supabase.from('topics').update({ status: 'archived' }).eq('id', item.id);
    } else {
      await supabase.from('drafts').update({ status: 'rejected', stage: 'archived' }).eq('id', item.id);
    }
    await supabase.from('feedback').insert({ item_id: item.id, item_type: type, action: 'rejected', comment: feedbackText });
    showToast('Rejected'); load();
  };

  const reviseItem = async (type: 'topic' | 'draft', item: any, feedbackText: string) => {
    if (!feedbackText.trim()) return;
    if (type === 'topic') {
      await supabase.from('topics').update({ status: 'revision' }).eq('id', item.id);
    } else {
      await supabase.from('drafts').update({ status: 'revision' }).eq('id', item.id);
    }
    await supabase.from('feedback').insert({ item_id: item.id, item_type: type, action: 'revision', comment: feedbackText });
    notifySlack(SLACK_CHANNEL_AIMY, `Revision requested: ${item.topic || item.title}\nFeedback: ${feedbackText}`);
    showToast('Sent for revision'); load();
  };

  // Filtered data
  const linkedinTopics = topics.filter(t => (t.channel || 'linkedin') === 'linkedin');
  const linkedinDrafts = drafts.filter(d => (d.channel || 'linkedin') === 'linkedin' && d.draft_type !== 'carousel');
  const carouselDrafts = drafts.filter(d => d.draft_type === 'carousel');
  const blogDrafts = drafts.filter(d => d.channel === 'blog');
  const blogTopics = topics.filter(t => t.channel === 'blog' || t.channel === 'both');

  const pendingLinkedin = linkedinTopics.filter(t => t.status === 'pending' && t.stage === 'scouted').length + linkedinDrafts.filter(d => d.stage === 'drafted' && d.status !== 'rejected').length;
  const pendingCarousels = carouselDrafts.filter(d => d.stage === 'drafted' && d.status !== 'rejected').length;
  const pendingBlogs = blogDrafts.filter(d => d.stage === 'drafted' && d.status !== 'rejected').length + blogTopics.filter(t => t.status === 'pending').length;

  return {
    topics, drafts, feedback, runs, loading, authed, toast,
    linkedinTopics, linkedinDrafts, carouselDrafts, blogDrafts, blogTopics,
    pendingLinkedin, pendingCarousels, pendingBlogs,
    requireAuth, showToast, load,
    approveTopic, archiveTopic, rejectTopic,
    approveDraft, publishDraft, rejectDraft, archiveDraft, reviseDraft,
    rejectItem, reviseItem,
  };
}
