'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, Topic, Draft, Feedback, Run, AgentTask, isBlogItem, isCarouselItem } from '@/lib/supabase';

const SLACK_BOT_TOKEN = process.env.NEXT_PUBLIC_SLACK_BOT_TOKEN || '';
const SLACK_CHANNEL_AIMY = process.env.NEXT_PUBLIC_SLACK_CHANNEL_AIMY || '';
const SLACK_CHANNEL_BLOG = process.env.NEXT_PUBLIC_SLACK_CHANNEL_BLOG || '';

export function useDashboardData() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('dashboard_authed') === 'true';
  });
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    const [t, d, f, r, at] = await Promise.all([
      supabase.from('topics').select('*').order('discovered_at', { ascending: false }),
      supabase.from('drafts').select('*').order('created_at', { ascending: false }),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }),
      supabase.from('runs').select('*').order('started_at', { ascending: false }).limit(50),
      supabase.from('agent_tasks').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    if (t.data) setTopics(t.data);
    if (d.data) setDrafts(d.data);
    if (f.data) setFeedback(f.data);
    if (r.data) setRuns(r.data);
    if (at.data) setAgentTasks(at.data);
    setLoading(false);
  }, []);

  // Debounced load — collapses rapid realtime events into one reload
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { load(); }, 400);
  }, [load]);

  // Initial load + polling fallback
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  // Supabase Realtime — instant updates when agents write back to DB
  useEffect(() => {
    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drafts' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_tasks' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' }, debouncedLoad)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [debouncedLoad]);

  const setAuth = (val: boolean) => {
    setAuthed(val);
    if (typeof window !== 'undefined') {
      if (val) localStorage.setItem('dashboard_authed', 'true');
      else localStorage.removeItem('dashboard_authed');
    }
  };

  const requireAuth = (fn: () => void) => {
    if (authed) return fn();
    const dashPw = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD;
    if (!dashPw) { setAuth(true); return fn(); }
    const pw = prompt('Password:');
    if (pw === dashPw) { setAuth(true); fn(); }
    else showToast('Wrong password');
  };

  const logout = () => { setAuth(false); showToast('Logged out'); };

  const notifySlack = async (channel: string, msg: string) => {
    if (!SLACK_BOT_TOKEN) return;
    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` },
        body: JSON.stringify({ channel, text: msg })
      });
    } catch (_) {}
  };

  // === MUTATIONS ===
  const approveTopic = async (id: string) => {
    const t = topics.find(x => x.id === id);
    if (!t) return;

    const isLinkedIn = t.channel === 'linkedin' || t.channel === 'both';
    const isBlog = t.channel === 'blog' || t.channel === 'both';

    if (isLinkedIn && !isBlog) {
      // SCOUTED → RESEARCHED: trigger Owl research
      if (t.stage === 'scouted') {
        await supabase.from('topics').update({ status: 'pending', stage: 'researched' }).eq('id', id);
        await supabase.from('agent_tasks').insert({
          task_type: 'research', agent: 'owl', ref_id: id, ref_title: t.title,
          payload: { topic_title: t.title, topic_url: t.url, topic_source: t.source },
        });
        notifySlack(SLACK_CHANNEL_AIMY, `Topic sent to research: ${t.title}`);
        showToast('Sent to Owl for research'); load(); return;
      }
      // RESEARCHED → DRAFT: trigger Bee drafting
      if (t.stage === 'researched') {
        const { data: existing } = await supabase.from('drafts').select('id').eq('topic', t.title).eq('channel', 'linkedin').neq('status', 'rejected').limit(1);
        let draftId: string | null = null;
        if (!existing || existing.length === 0) {
          const { data: newDraft } = await supabase.from('drafts').insert({
            topic: t.title, channel: 'linkedin', draft_type: 'commentary',
            stage: 'drafted', status: 'pending', content: '', word_count: 0, created_at: Date.now()
          }).select('id').single();
          draftId = newDraft?.id || null;
        } else {
          draftId = existing[0].id;
        }
        await supabase.from('topics').update({ status: 'archived' }).eq('id', id);
        if (draftId) {
          await supabase.from('agent_tasks').insert({
            task_type: 'draft', agent: 'bee', ref_id: draftId, ref_title: t.title,
            payload: { topic_title: t.title, topic_summary: t.summary || '' },
          });
        }
        notifySlack(SLACK_CHANNEL_AIMY, `Research approved, drafting: ${t.title}`);
        showToast('Draft created, sent to Bee'); load(); return;
      }
    }

    const isCarousel = t.channel === 'carousel';
    if (isCarousel) {
      // CAROUSEL SCOUTED → RESEARCHED: trigger Owl research (same as LinkedIn)
      if (t.stage === 'scouted') {
        await supabase.from('topics').update({ status: 'pending', stage: 'researched' }).eq('id', id);
        await supabase.from('agent_tasks').insert({
          task_type: 'research', agent: 'owl', ref_id: id, ref_title: t.title,
          payload: { topic_title: t.title, topic_url: t.url, topic_source: t.source },
        });
        notifySlack(SLACK_CHANNEL_AIMY, `Carousel topic sent to research: ${t.title}`);
        showToast('Sent to Owl for research'); load(); return;
      }
      // CAROUSEL RESEARCHED → DRAFT: trigger Bee carousel drafting
      if (t.stage === 'researched') {
        const { data: existing } = await supabase.from('drafts').select('id').eq('topic', t.title).eq('draft_type', 'carousel').neq('status', 'rejected').limit(1);
        let draftId: string | null = null;
        if (!existing || existing.length === 0) {
          const { data: newDraft } = await supabase.from('drafts').insert({
            topic: t.title, channel: 'carousel', draft_type: 'carousel',
            stage: 'drafted', status: 'pending', content: '', word_count: 0, created_at: Date.now()
          }).select('id').single();
          draftId = newDraft?.id || null;
        } else {
          draftId = existing[0].id;
        }
        await supabase.from('topics').update({ status: 'archived' }).eq('id', id);
        if (draftId) {
          await supabase.from('agent_tasks').insert({
            task_type: 'carousel_draft', agent: 'bee', ref_id: draftId, ref_title: t.title,
            payload: { topic_title: t.title, topic_summary: t.summary || '' },
          });
        }
        notifySlack(SLACK_CHANNEL_AIMY, `Carousel research approved, sent to Bee for slides: ${t.title}`);
        showToast('Sent to Bee for carousel slides'); load(); return;
      }
    }

    if (isBlog) {
      // BLOG SCOUTED → RESEARCHED: trigger Stork research
      if (t.stage === 'scouted') {
        await supabase.from('topics').update({ status: 'pending', stage: 'researched' }).eq('id', id);
        await supabase.from('agent_tasks').insert({
          task_type: 'blog_research', agent: 'stork', ref_id: id, ref_title: t.title,
          payload: { topic_title: t.title, topic_url: t.url, topic_source: t.source },
        });
        notifySlack(SLACK_CHANNEL_BLOG, `Blog topic sent to Stork for research: ${t.title}`);
        showToast('Sent to Stork for research'); load(); return;
      }
      // BLOG RESEARCHED → DRAFT: trigger Crane drafting
      if (t.stage === 'researched') {
        const { data: existing } = await supabase.from('drafts').select('id').eq('topic', t.title).eq('channel', 'blog').neq('status', 'rejected').limit(1);
        let draftId: string | null = null;
        if (!existing || existing.length === 0) {
          const { data: newDraft, error: draftErr } = await supabase.from('drafts').insert({
            topic: t.title, channel: 'blog', draft_type: 'blog',
            stage: 'drafted', status: 'pending', content: '', word_count: 0, created_at: Date.now()
          }).select('id').single();
          if (draftErr) { showToast('Draft creation failed'); return; }
          draftId = newDraft?.id || null;
        } else {
          draftId = existing[0].id;
        }
        await supabase.from('topics').update({ status: 'archived' }).eq('id', id);
        if (draftId) {
          await supabase.from('agent_tasks').insert({
            task_type: 'blog_draft', agent: 'crane', ref_id: draftId, ref_title: t.title,
            payload: { topic_title: t.title, topic_summary: t.summary || '' },
          });
        }
        notifySlack(SLACK_CHANNEL_BLOG, `Blog research approved, sent to Crane for drafting: ${t.title}`);
        showToast('Sent to Crane for drafting'); load(); return;
      }
    }

    // Fallback
    const channel = t.channel || 'linkedin';
    const draftType = channel === 'blog' ? 'blog' : 'commentary';
    const { data: existing } = await supabase.from('drafts').select('id, status').eq('topic', t.title).eq('channel', channel).neq('status', 'rejected').limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from('drafts').insert({
        topic: t.title, channel, draft_type: draftType, stage: 'drafted', status: 'pending',
        content: '', word_count: 0, target_publish_date: new Date().toISOString().split('T')[0], created_at: Date.now()
      });
    }
    notifySlack(SLACK_CHANNEL_AIMY, `Topic approved: ${t.title}`);
    showToast('Approved & queued'); load();
  };

  const archiveTopic = async (id: string) => {
    await supabase.from('topics').update({ status: 'archived' }).eq('id', id);
    showToast('Archived'); load();
  };

  const restoreTopic = async (id: string) => {
    const t = topics.find(x => x.id === id);
    // Restore to scouted/pending so it can go through the pipeline again
    await supabase.from('topics').update({ status: 'pending', stage: 'scouted' }).eq('id', id);
    showToast(`Restored: ${t?.title?.substring(0, 30) || 'Topic'}`); load();
  };

  const rejectTopic = async (id: string) => {
    await supabase.from('topics').update({ status: 'rejected' }).eq('id', id);
    showToast('Rejected'); load();
  };

  const approveDraft = async (id: string) => {
    await supabase.from('drafts').update({ status: 'approved', stage: 'ready_to_post' }).eq('id', id);
    const d = drafts.find(x => x.id === id);
    if (d?.channel === 'blog') notifySlack(SLACK_CHANNEL_BLOG, `Blog approved: ${d?.topic}`);
    if (d?.channel === 'carousel') {
      showToast('Approved — PDF generating...'); 
    } else {
      showToast('Approved');
    }
    load();
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

  const restoreDraft = async (id: string) => {
    const d = drafts.find(x => x.id === id);
    await supabase.from('drafts').update({ status: 'pending', stage: 'drafted' }).eq('id', id);
    showToast(`Restored: ${d?.topic?.substring(0, 30) || 'Draft'}`); load();
  };

  const reviseDraft = async (id: string, fb: string) => {
    if (!fb.trim()) return;
    const draft = drafts.find(d => d.id === id);
    const isBlog = draft ? isBlogItem(draft) : false;
    const isCarousel = draft ? isCarouselItem(draft) : false;
    const agent = isBlog ? 'crane' : 'bee';
    const taskType = isBlog ? 'blog_revise' : isCarousel ? 'carousel_revise' : 'revise';
    const slackChannel = isBlog ? SLACK_CHANNEL_BLOG : SLACK_CHANNEL_AIMY;
    await supabase.from('drafts').update({ status: 'revision', revised: true, revised_at: Date.now() }).eq('id', id);
    await supabase.from('feedback').insert({ item_id: id, item_type: 'draft', action: 'revise', comment: fb });
    await supabase.from('agent_tasks').insert({
      task_type: taskType, agent, ref_id: id, ref_title: draft?.topic || '',
      payload: { feedback: fb, current_content: draft?.carousel_json || draft?.content || '' },
    });
    notifySlack(slackChannel, `Revision requested: ${fb}`);
    const agentName = isBlog ? 'Crane' : 'Bee';
    showToast(`Sent to ${agentName} for revision`); load();
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
      const isBlog = isBlogItem(item);
      const isCarousel = isCarouselItem(item);
      const agent = isBlog ? 'crane' : 'bee';
      const taskType = isBlog ? 'blog_revise' : isCarousel ? 'carousel_revise' : 'revise';
      await supabase.from('drafts').update({ status: 'revision' }).eq('id', item.id);
      await supabase.from('agent_tasks').insert({
        task_type: taskType, agent, ref_id: item.id, ref_title: item.topic || item.title || '',
        payload: { feedback: feedbackText, current_content: item.carousel_json || item.content || '' },
      });
    }
    await supabase.from('feedback').insert({ item_id: item.id, item_type: type, action: 'revision', comment: feedbackText });
    const slackChannel = (item.channel === 'blog') ? SLACK_CHANNEL_BLOG : SLACK_CHANNEL_AIMY;
    notifySlack(slackChannel, `Revision requested: ${item.topic || item.title}\nFeedback: ${feedbackText}`);
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
    topics, drafts, feedback, runs, agentTasks, loading, authed, toast,
    linkedinTopics, linkedinDrafts, carouselDrafts, blogDrafts, blogTopics,
    pendingLinkedin, pendingCarousels, pendingBlogs,
    requireAuth, logout, showToast, load,
    approveTopic, archiveTopic, rejectTopic, restoreTopic,
    approveDraft, publishDraft, rejectDraft, archiveDraft, restoreDraft, reviseDraft,
    rejectItem, reviseItem,
  };
}
