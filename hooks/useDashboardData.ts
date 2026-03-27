'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, Topic, Draft, Feedback, Run } from '@/lib/supabase';

// Wrapper to handle Supabase PromiseLike (no .catch)
function fire(query: PromiseLike<any>) {
  Promise.resolve(query).catch(console.error);
}

export function useDashboardData() {
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const load = useCallback(async () => {
    try {
      const [topicsRes, draftsRes, feedbackRes, runsRes] = await Promise.all([
        supabase.from('topics').select('*'),
        supabase.from('drafts').select('*'),
        supabase.from('feedback').select('*'),
        supabase.from('runs').select('*').order('started_at', { ascending: false }).limit(50),
      ]);
      setTopics(topicsRes.data || []);
      setDrafts(draftsRes.data || []);
      setFeedback(feedbackRes.data || []);
      setRuns(runsRes.data || []);
      setLoading(false);
    } catch (e) {
      console.error('Load failed:', e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const requireAuth = (fn: () => void) => {
    try {
      fn();
      showToast('✅ Done', 'ok');
      setTimeout(load, 500);
    } catch (e: any) {
      showToast(`❌ ${e?.message || 'Error'}`, 'err');
    }
  };

  // === TOPIC ACTIONS ===
  const approveTopic = (id: string) => {
    const topic = topics.find(t => t.id === id);
    if (!topic) return;

    if (topic.stage === 'scouted') {
      fire(supabase.from('topics').update({ stage: 'researched', status: 'pending' }).eq('id', id));
    } else if (topic.stage === 'researched') {
      const draftExists = drafts.some(d => d.topic === topic.title && d.channel === topic.channel);
      if (!draftExists) {
        fire(supabase.from('drafts').insert({
          topic: topic.title,
          channel: topic.channel,
          draft_type: topic.channel === 'blog' ? 'blog' : 'commentary',
          stage: 'drafted',
          status: 'pending',
          content: '',
          word_count: 0,
          created_at: Date.now(),
        }));
      }
      fire(supabase.from('topics').update({ stage: 'drafted', status: 'archived' }).eq('id', id));
    }
  };

  const rejectTopic = (id: string, reason?: string) => {
    fire(supabase.from('topics').update({ status: 'rejected' }).eq('id', id));
    if (reason) {
      fire(supabase.from('feedback').insert({
        item_id: id, item_type: 'topic', action: 'reject', comment: reason,
      }));
    }
  };

  const archiveTopic = (id: string) => {
    fire(supabase.from('topics').update({ status: 'archived' }).eq('id', id));
  };

  // === DRAFT ACTIONS ===
  const approveDraft = (id: string) => {
    fire(supabase.from('drafts').update({ stage: 'ready_to_post', status: 'approved' }).eq('id', id));
  };

  const rejectDraft = (id: string, reason?: string) => {
    fire(supabase.from('drafts').update({ status: 'rejected' }).eq('id', id));
    if (reason) {
      fire(supabase.from('feedback').insert({
        item_id: id, item_type: 'draft', action: 'reject', comment: reason,
      }));
    }
  };

  const archiveDraft = (id: string) => {
    fire(supabase.from('drafts').update({ status: 'archived' }).eq('id', id));
  };

  const reviseDraft = (id: string, newContent: string) => {
    fire(supabase.from('drafts').update({ content: newContent, status: 'approved' }).eq('id', id));
  };

  const publishDraft = (id: string) => {
    fire(supabase.from('drafts').update({ stage: 'published', status: 'approved' }).eq('id', id));
  };

  // Metrics
  const pendingLinkedin = topics.filter(t => t.channel === 'linkedin' && t.status === 'approved').length;
  const pendingCarousels = drafts.filter(d => d.channel === 'carousel' && d.status === 'approved').length;
  const pendingBlogs = drafts.filter(d => d.channel === 'blog' && d.status === 'approved').length;

  return {
    loading,
    topics,
    drafts,
    feedback,
    runs,
    toast,
    showToast,
    requireAuth,
    approveTopic,
    rejectTopic,
    archiveTopic,
    approveDraft,
    rejectDraft,
    archiveDraft,
    reviseDraft,
    publishDraft,
    pendingLinkedin,
    pendingCarousels,
    pendingBlogs,
    authed: true,
  };
}
