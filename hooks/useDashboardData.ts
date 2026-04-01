'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Topic, Draft, Feedback, Run, AgentTask } from '@/lib/supabase';

const API_BASE = '/.netlify/functions/api';

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
    try {
      const [topicsRes, draftsRes, feedbackRes, runsRes, tasksRes] = await Promise.all([
        fetch(`${API_BASE}/topics`),
        fetch(`${API_BASE}/drafts`),
        fetch(`${API_BASE}/feedback`),
        fetch(`${API_BASE}/runs`),
        fetch(`${API_BASE}/agent-tasks`),
      ]);

      const [t, d, f, r, at] = await Promise.all([
        topicsRes.json(),
        draftsRes.json(),
        feedbackRes.json(),
        runsRes.json(),
        tasksRes.json(),
      ]);

      setTopics(t || []);
      setDrafts(d || []);
      setFeedback(f || []);
      setRuns(r || []);
      setAgentTasks(at || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoading(false);
    }
  }, []);

  // Debounced load
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { load(); }, 400);
  }, [load]);

  // Initial load + polling fallback
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

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

  // === MUTATIONS ===
  const approveTopic = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/approve-topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: id }),
      });
      const result = await response.json();
      if (result.message) showToast(result.message);
      load();
    } catch (error) {
      showToast('Failed to approve topic');
      console.error(error);
    }
  };

  const archiveTopic = async (id: string) => {
    try {
      await fetch(`${API_BASE}/archive-topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: id }),
      });
      showToast('Archived');
      load();
    } catch (error) {
      showToast('Failed to archive');
    }
  };

  const restoreTopic = async (id: string) => {
    try {
      await fetch(`${API_BASE}/restore-topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: id }),
      });
      showToast('Restored');
      load();
    } catch (error) {
      showToast('Failed to restore');
    }
  };

  const rejectTopic = async (id: string, reason?: string) => {
    try {
      await fetch(`${API_BASE}/reject-topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: id, reason }),
      });
      showToast('Rejected');
      load();
    } catch (error) {
      showToast('Failed to reject');
    }
  };

  const approveDraft = async (id: string) => {
    try {
      await fetch(`${API_BASE}/approve-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: id }),
      });
      showToast('Approved');
      load();
    } catch (error) {
      showToast('Failed to approve');
    }
  };

  const archiveDraft = async (id: string) => {
    try {
      await fetch(`${API_BASE}/archive-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: id }),
      });
      showToast('Archived');
      load();
    } catch (error) {
      showToast('Failed to archive');
    }
  };

  const restoreDraft = async (id: string) => {
    try {
      await fetch(`${API_BASE}/restore-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: id }),
      });
      showToast('Restored');
      load();
    } catch (error) {
      showToast('Failed to restore');
    }
  };

  const rejectDraft = async (id: string, reason?: string) => {
    try {
      await fetch(`${API_BASE}/reject-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: id, reason }),
      });
      showToast('Rejected');
      load();
    } catch (error) {
      showToast('Failed to reject');
    }
  };

  const reviseDraft = async (id: string, feedback: string) => {
    try {
      await fetch(`${API_BASE}/revise-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: id, feedback }),
      });
      showToast('Revision requested');
      load();
    } catch (error) {
      showToast('Failed to request revision');
    }
  };

  const publishDraft = async (id: string) => {
    try {
      await fetch(`${API_BASE}/publish-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: id }),
      });
      showToast('Marked as published');
      load();
    } catch (error) {
      showToast('Failed to publish');
    }
  };

  // Helper functions
  const rejectItem = async (type: 'topic' | 'draft', item: any, reason: string) => {
    if (type === 'topic') await rejectTopic(item.id, reason);
    else await rejectDraft(item.id, reason);
  };

  const reviseItem = async (type: 'topic' | 'draft', item: any, feedbackText: string) => {
    if (type === 'draft') await reviseDraft(item.id, feedbackText);
  };

  // Computed properties for metrics
  const pendingLinkedin = topics.filter(t => 
    (t.channel === 'linkedin' || t.channel === 'both') && 
    t.status === 'pending'
  ).length + drafts.filter(d => 
    d.channel === 'linkedin' && 
    d.status === 'pending'
  ).length;

  const pendingCarousels = topics.filter(t => 
    t.channel === 'carousel' && 
    t.status === 'pending'
  ).length + drafts.filter(d => 
    d.draft_type === 'carousel' && 
    d.status === 'pending'
  ).length;

  const pendingBlogs = topics.filter(t => 
    (t.channel === 'blog' || t.channel === 'both') && 
    t.status === 'pending'
  ).length + drafts.filter(d => 
    d.channel === 'blog' && 
    d.status === 'pending'
  ).length;

  return {
    topics,
    drafts,
    feedback,
    runs,
    agentTasks,
    loading,
    toast,
    showToast,
    authed,
    requireAuth,
    logout,
    approveTopic,
    archiveTopic,
    restoreTopic,
    rejectTopic,
    approveDraft,
    archiveDraft,
    restoreDraft,
    rejectDraft,
    reviseDraft,
    publishDraft,
    pendingLinkedin,
    pendingCarousels,
    pendingBlogs,
  };
}
