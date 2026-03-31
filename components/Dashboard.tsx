'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { Topic, Draft, Feedback, isBlogItem, isBlogTopic, isCarouselItem } from '@/lib/supabase';
import { useDashboardData } from '@/hooks/useDashboardData';
import { Column, TopicCard, DraftCard, Toast, EmptyState, ArchivedItemRow, ArchivedEntry } from '@/components/ui';
import { ago, fitColor, copyToClipboard, renderMd, stripFrontmatter, parseResearchBrief, hasThinkingContent, extractDraftContent, dedup } from '@/lib/format';
import { getTopicActions, getDraftActions } from '@/lib/action-helpers';

type Tab = 'overview' | 'linkedin' | 'carousels' | 'blogs' | 'calendar';

export function Dashboard() {
  const data = useDashboardData();
  const [tab, setTab] = useState<Tab>('overview');
  const [modal, setModal] = useState<{ type: 'topic' | 'draft'; item: any; mode: 'view' | 'reject' | 'revise' } | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  const handleCopy = (text: string) => copyToClipboard(text, data.showToast);

  // Count revisions per draft — must be before any early returns (hooks order)
  const revisionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.feedback.forEach(f => {
      if (f.action === 'revision' || f.action === 'revise') {
        counts[f.item_id] = (counts[f.item_id] || 0) + 1;
      }
    });
    return counts;
  }, [data.feedback]);

  // Shared helpers
  const buildArchivedList = (topics: Topic[], drafts: Draft[]): ArchivedEntry[] => [
    ...topics.map(t => ({ id: t.id, type: 'topic' as const, title: t.title, status: t.status, at: t.revised_at || t.discovered_at })),
    ...drafts.map(d => ({ id: d.id, type: 'draft' as const, title: d.topic, status: d.status, at: d.revised_at || d.created_at })),
  ].sort((a, b) => (b.at || 0) - (a.at || 0));

  const handleRestore = (type: 'topic' | 'draft', id: string) => {
    if (type === 'topic') data.restoreTopic(id);
    else data.restoreDraft(id);
  };

  const renderArchivedColumn = (archived: ArchivedEntry[]) => (
    <Column title="Archived" count={archived.length} accent="var(--text-muted)">
      {archived.map(item => (
        <ArchivedItemRow key={item.id} item={item} onRestore={handleRestore} requireAuth={data.requireAuth} />
      ))}
      {archived.length === 0 && <EmptyState message="Nothing archived" />}
    </Column>
  );

  // === SWIPE TO DISMISS (mobile) — must be before early returns for hooks order ===
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number; currentY: number; isDragging: boolean; scrollTop: number }>({ startY: 0, currentY: 0, isDragging: false, scrollTop: 0 });

  const closeModal = useCallback(() => {
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.classList.remove('sheet-dragging');
      sheet.classList.add('sheet-snapping');
      sheet.style.transform = 'translateY(100%)';
      const backdrop = sheet.parentElement;
      if (backdrop) backdrop.style.opacity = '0';
      setTimeout(() => { setModal(null); setFeedbackText(''); }, 350);
    } else {
      setModal(null); setFeedbackText('');
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const scrollBody = sheet.querySelector('.modal-scroll-body') as HTMLElement;
    const atTop = !scrollBody || scrollBody.scrollTop <= 0;
    dragState.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY, isDragging: atTop, scrollTop: scrollBody?.scrollTop || 0 };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const ds = dragState.current;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const scrollBody = sheet.querySelector('.modal-scroll-body') as HTMLElement;
    const touchY = e.touches[0].clientY;
    const deltaY = touchY - ds.startY;

    if (!ds.isDragging) {
      if (deltaY > 0 && scrollBody && scrollBody.scrollTop <= 0) {
        ds.isDragging = true;
        ds.startY = touchY;
      } else {
        return;
      }
    }

    const offset = Math.max(0, touchY - ds.startY);
    if (offset > 0) {
      try { e.preventDefault(); } catch {}
      sheet.classList.add('sheet-dragging');
      const dampened = offset < 100 ? offset : 100 + (offset - 100) * 0.3;
      sheet.style.transform = `translateY(${dampened}px)`;
      const backdrop = sheet.parentElement;
      if (backdrop) backdrop.style.opacity = `${Math.max(0.2, 1 - offset / 400)}`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const ds = dragState.current;
    const sheet = sheetRef.current;
    if (!sheet || !ds.isDragging) return;
    ds.isDragging = false;

    const match = sheet.style.transform.match(/translateY\((.+?)px\)/);
    const currentOffset = match ? parseFloat(match[1]) : 0;

    if (currentOffset > 120) {
      closeModal();
    } else {
      sheet.classList.remove('sheet-dragging');
      sheet.classList.add('sheet-snapping');
      sheet.style.transform = 'translateY(0)';
      const backdrop = sheet.parentElement;
      if (backdrop) backdrop.style.opacity = '1';
      setTimeout(() => { sheet.classList.remove('sheet-snapping'); }, 350);
    }
  }, [closeModal]);

  if (data.loading) return (
    <div className="h-screen h-[100dvh] flex items-center justify-center bg-[var(--surface)]">
      <div className="text-center">
        <div className="relative w-10 h-10 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--border)]" />
          <div className="absolute inset-0 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-[var(--text-muted)] font-medium">Loading dashboard...</p>
      </div>
    </div>
  );

  // Card action handlers
  const topicCardProps = (t: Topic, opts?: { showRestore?: boolean }) => ({
    t,
    onView: (t: Topic) => setModal({ type: 'topic' as const, item: t, mode: 'view' as const }),
    onApprove: data.approveTopic,
    onReject: data.rejectTopic,
    onArchive: data.archiveTopic,
    onRestore: opts?.showRestore ? data.restoreTopic : undefined,
    requireAuth: data.requireAuth,
  });

  const draftCardProps = (d: Draft, opts?: { showRestore?: boolean }) => ({
    d,
    revisionCount: revisionCounts[d.id] || 0,
    onView: (d: Draft) => setModal({ type: 'draft' as const, item: d, mode: 'view' as const }),
    onApprove: data.approveDraft,
    onReject: data.rejectDraft,
    onArchive: data.archiveDraft,
    onRevise: (d: Draft) => setModal({ type: 'draft' as const, item: d, mode: 'revise' as const }),
    onPublish: data.publishDraft,
    onCopy: handleCopy,
    onRestore: opts?.showRestore ? data.restoreDraft : undefined,
    requireAuth: data.requireAuth,
  });

  // Sort helpers: most recently updated first (filter() already returns new arrays)
  const sortTopics = (arr: Topic[]) => arr.sort((a, b) => (b.revised_at || b.discovered_at) - (a.revised_at || a.discovered_at));
  const sortDrafts = (arr: Draft[]) => arr.sort((a, b) => (b.revised_at || b.created_at) - (a.revised_at || a.created_at));

  // === OVERVIEW TAB ===
  const renderOverview = () => {
    const agentEmojis: Record<string, string> = { eagle: '🦅', owl: '🦉', bee: '🐝', wolf: '🐺', stork: '🦩', crane: '🏗️', pelican: '📰' };
    const metrics = [
      { label: 'Pending review', value: data.pendingLinkedin + data.pendingCarousels + data.pendingBlogs, color: 'var(--gold)', bg: 'var(--gold-light)', icon: '⏳' },
      { label: 'Ready to post', value: data.drafts.filter(d => d.stage === 'ready_to_post').length, color: 'var(--sage)', bg: 'var(--sage-light)', icon: '✅' },
      { label: 'Published', value: data.drafts.filter(d => d.stage === 'published').length, color: 'var(--royal)', bg: 'var(--royal-light)', icon: '🚀' },
      { label: 'In revision', value: data.drafts.filter(d => d.status === 'revision').length, color: 'var(--accent)', bg: 'var(--accent-light)', icon: '📝' },
      { label: 'Total topics', value: data.topics.length, color: 'var(--plum)', bg: 'var(--plum-light)', icon: '💡' },
    ];

    return (
      <div className="space-y-6 fade-in">
        {/* Metrics */}
        <div className="grid grid-cols-2 xs:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {metrics.map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-[var(--border)] p-4 md:p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl md:text-3xl">{m.icon}</span>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: m.bg }}>
                  <span className="text-lg font-bold" style={{ color: m.color }}>{m.value}</span>
                </div>
              </div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">{m.label}</p>
              <div className="h-[3px] mt-3 rounded-full opacity-40" style={{ backgroundColor: m.color }} />
            </div>
          ))}
        </div>

        {/* Agent Runs */}
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">Recent agent runs</h3>
            <span className="text-2xs text-[var(--text-muted)]">{data.runs.length} total</span>
          </div>
          <div className="max-h-[500px] overflow-y-auto scrollbar-thin">
            {/* Mobile: card layout / Desktop: table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-2xs text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]"><th className="px-5 py-3">Time</th><th className="px-5 py-3">Agent</th><th className="px-5 py-3">Job</th><th className="px-5 py-3 text-right">Status</th></tr></thead>
                <tbody>
                  {data.runs.slice(0, 20).map(r => {
                    const agentKey = (r.agent_id || r.job_name || '').toLowerCase();
                    const emoji = Object.entries(agentEmojis).find(([k]) => agentKey.includes(k))?.[1] || '🤖';
                    return (
                      <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface)] transition-colors">
                        <td className="px-5 py-3.5 text-[var(--text-muted)] text-xs">{r.started_at ? new Date(r.started_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '—'}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-[var(--text-primary)]">{emoji} {r.agent_id || '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)]">{r.job_name}</td>
                        <td className="px-5 py-3.5 text-right"><span className={`text-2xs font-semibold px-2.5 py-1 rounded-full ${r.status === 'completed' || r.status === 'ok' ? 'bg-[var(--sage-light)] text-[var(--sage)]' : r.status === 'error' || r.status === 'failed' ? 'bg-[var(--red-light)] text-[var(--red)]' : 'bg-[var(--gold-light)] text-[var(--gold)]'}`}>{r.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile card layout */}
            <div className="md:hidden divide-y divide-[var(--border)]">
              {data.runs.slice(0, 20).map(r => {
                const agentKey = (r.agent_id || r.job_name || '').toLowerCase();
                const emoji = Object.entries(agentEmojis).find(([k]) => agentKey.includes(k))?.[1] || '🤖';
                return (
                  <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-xl">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{r.agent_id || r.job_name}</p>
                      <p className="text-2xs text-[var(--text-muted)]">{r.started_at ? new Date(r.started_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '—'}</p>
                    </div>
                    <span className={`text-2xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${r.status === 'completed' || r.status === 'ok' ? 'bg-[var(--sage-light)] text-[var(--sage)]' : r.status === 'error' || r.status === 'failed' ? 'bg-[var(--red-light)] text-[var(--red)]' : 'bg-[var(--gold-light)] text-[var(--gold)]'}`}>{r.status}</span>
                  </div>
                );
              })}
            </div>
            {data.runs.length === 0 && <EmptyState message="No runs yet" />}
          </div>
        </div>
      </div>
    );
  };

  // === LINKEDIN TAB ===
  const renderLinkedIn = () => {
    const scouted = sortTopics(data.topics.filter(t => t.channel === "linkedin").filter(t => t.stage === 'scouted' && t.status !== 'archived' && t.status !== 'rejected'));
    const research = sortTopics(data.topics.filter(t => t.channel === "linkedin").filter(t => t.stage === 'researched' && t.status !== 'archived' && t.status !== 'rejected'));
    const drafted = sortDrafts(data.drafts.filter(d => d.channel === "linkedin").filter(d => d.stage === 'drafted' && d.status !== 'rejected' && d.status !== 'archived'));
    const ready = sortDrafts(data.drafts.filter(d => d.channel === "linkedin").filter(d => d.stage === 'ready_to_post'));
    const published = sortDrafts(data.drafts.filter(d => d.channel === "linkedin").filter(d => d.stage === 'published'));
    const archived = buildArchivedList(
      data.topics.filter(t => t.channel === "linkedin" && (t.status === 'archived' || t.status === 'rejected')),
      data.drafts.filter(d => d.channel === "linkedin" && (d.status === 'archived' || d.status === 'rejected')),
    );
    return (
      <div className="kanban-scroll flex gap-3 overflow-x-auto pb-4 md:snap-none fade-in h-full">
        <Column title="Scouted" count={scouted.length} accent="var(--royal)">
          {scouted.map(t => <TopicCard key={t.id} {...topicCardProps(t)} />)}
          {scouted.length === 0 && <EmptyState />}
        </Column>
        <Column title="Research" count={research.length} accent="var(--plum)">
          {research.map(t => <TopicCard key={t.id} {...topicCardProps(t)} />)}
          {research.length === 0 && <EmptyState />}
        </Column>
        <Column title="Drafted" count={drafted.length} accent="var(--gold)">
          {drafted.map(d => <DraftCard key={d.id} {...draftCardProps(d)} />)}
          {drafted.length === 0 && <EmptyState />}
        </Column>
        <Column title="Ready to post" count={ready.length} accent="var(--sage)">
          {ready.map(d => <DraftCard key={d.id} {...draftCardProps(d)} />)}
          {ready.length === 0 && <EmptyState />}
        </Column>
        <Column title="Published" count={published.length} accent="var(--plum)">
          {published.map(d => <DraftCard key={d.id} {...draftCardProps(d)} showActions={false} />)}
          {published.length === 0 && <EmptyState />}
        </Column>
        {renderArchivedColumn(archived)}
      </div>
    );
  };

  // === CAROUSELS TAB ===
  const renderCarousels = () => {
    const carouselFilter = (t: Topic) => t.channel === 'carousel';
    const carouselDraftFilter = isCarouselItem;
    const scouted = sortTopics(data.topics.filter(carouselFilter).filter(t => t.stage === 'scouted' && t.status !== 'archived' && t.status !== 'rejected'));
    const research = sortTopics(data.topics.filter(carouselFilter).filter(t => t.stage === 'researched' && t.status !== 'archived' && t.status !== 'rejected'));
    const drafted = sortDrafts(data.drafts.filter(carouselDraftFilter).filter(d => d.stage === 'drafted' && d.status !== 'rejected' && d.status !== 'archived'));
    const ready = sortDrafts(data.drafts.filter(carouselDraftFilter).filter(d => d.stage === 'ready_to_post'));
    const published = sortDrafts(data.drafts.filter(carouselDraftFilter).filter(d => d.stage === 'published'));
    const archived = buildArchivedList(
      data.topics.filter(carouselFilter).filter(t => t.status === 'archived' || t.status === 'rejected'),
      data.drafts.filter(carouselDraftFilter).filter(d => d.status === 'archived' || d.status === 'rejected'),
    );
    return (
      <div className="kanban-scroll flex gap-3 overflow-x-auto pb-4 md:snap-none fade-in h-full">
        <Column title="Scouted" count={scouted.length} accent="var(--royal)">
          {scouted.map(t => <TopicCard key={t.id} {...topicCardProps(t)} />)}
          {scouted.length === 0 && <EmptyState />}
        </Column>
        <Column title="Research" count={research.length} accent="var(--plum)">
          {research.map(t => <TopicCard key={t.id} {...topicCardProps(t)} />)}
          {research.length === 0 && <EmptyState />}
        </Column>
        <Column title="Drafted" count={drafted.length} accent="var(--gold)">
          {drafted.map(d => <DraftCard key={d.id} {...draftCardProps(d)} />)}
          {drafted.length === 0 && <EmptyState />}
        </Column>
        <Column title="Ready to post" count={ready.length} accent="var(--sage)">
          {ready.map(d => <DraftCard key={d.id} {...draftCardProps(d)} />)}
          {ready.length === 0 && <EmptyState />}
        </Column>
        <Column title="Published" count={published.length} accent="var(--plum)">
          {published.map(d => <DraftCard key={d.id} {...draftCardProps(d)} showActions={false} />)}
          {published.length === 0 && <EmptyState />}
        </Column>
        {renderArchivedColumn(archived)}
      </div>
    );
  };

  // === BLOGS TAB ===
  const renderBlogs = () => {
    const blogFilter = isBlogTopic;
    const blogDraftFilter = isBlogItem;
    const scouted = sortTopics(data.topics.filter(blogFilter).filter(t => t.stage === 'scouted' && t.status !== 'archived' && t.status !== 'rejected'));
    const research = sortTopics(data.topics.filter(blogFilter).filter(t => t.stage === 'researched' && t.status !== 'archived' && t.status !== 'rejected'));
    const drafted = sortDrafts(data.drafts.filter(blogDraftFilter).filter(d => d.stage === 'drafted' && d.status !== 'rejected' && d.status !== 'archived'));
    const ready = sortDrafts(data.drafts.filter(blogDraftFilter).filter(d => d.stage === 'ready_to_post'));
    const published = sortDrafts(data.drafts.filter(blogDraftFilter).filter(d => d.stage === 'published'));
    const archived = buildArchivedList(
      data.topics.filter(blogFilter).filter(t => t.status === 'archived' || t.status === 'rejected'),
      data.drafts.filter(blogDraftFilter).filter(d => d.status === 'archived' || d.status === 'rejected'),
    );
    return (
      <div className="kanban-scroll flex gap-3 overflow-x-auto pb-4 md:snap-none fade-in h-full">
        <Column title="Scouted" count={scouted.length} accent="var(--royal)">
          {scouted.map(t => <TopicCard key={t.id} {...topicCardProps(t)} />)}
          {scouted.length === 0 && <EmptyState />}
        </Column>
        <Column title="Research" count={research.length} accent="var(--plum)">
          {research.map(t => <TopicCard key={t.id} {...topicCardProps(t)} />)}
          {research.length === 0 && <EmptyState />}
        </Column>
        <Column title="Drafted" count={drafted.length} accent="var(--gold)">
          {drafted.map(d => <DraftCard key={d.id} {...draftCardProps(d)} />)}
          {drafted.length === 0 && <EmptyState />}
        </Column>
        <Column title="Ready to post" count={ready.length} accent="var(--sage)">
          {ready.map(d => <DraftCard key={d.id} {...draftCardProps(d)} />)}
          {ready.length === 0 && <EmptyState />}
        </Column>
        <Column title="Published" count={published.length} accent="#e87b35">
          {published.map(d => <DraftCard key={d.id} {...draftCardProps(d)} showActions={false} />)}
          {published.length === 0 && <EmptyState />}
        </Column>
        {renderArchivedColumn(archived)}
      </div>
    );
  };

  // === CALENDAR TAB ===
  const renderCalendar = () => {
    const allDrafts = [...data.drafts.filter(d => d.channel === "linkedin"), ...data.drafts.filter(d => d.channel === "carousel")].filter(d => d.target_publish_date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(today); const dow = start.getDay();
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const weeks = [];
    for (let w = 0; w < 3; w++) {
      const ws = new Date(start); ws.setDate(ws.getDate() + w * 7);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(ws); d.setDate(d.getDate() + i);
        if (d.getDay() === 0) continue;
        const dk = fmt(d);
        const dd = allDrafts.filter(x => x.target_publish_date === dk && x.status !== 'rejected');
        days.push({ date: d, dk, dd, isToday: dk === fmt(today), dayName: dayNames[i], expectedFormat: [1, 3, 5].includes(d.getDay()) ? 'CAROUSEL' : 'TEXT' });
      }
      weeks.push({ start: ws, end: we, days });
    }

    return (
      <div className="space-y-4 fade-in">
        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[var(--plum)]" />Carousel (Mon/Wed/Fri)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[var(--royal)]" />Text (Tue/Thu/Sat)</span>
        </div>

        {weeks.map((week, wi) => (
          <div key={wi} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden shadow-sm">
            <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 md:px-5 py-3 flex items-center justify-between">
              <span className="font-semibold text-sm text-[var(--text-primary)]">Week {wi + 1}</span>
              <span className="text-2xs text-[var(--text-muted)]">{fmt(week.start)} → {fmt(week.end)}</span>
            </div>
            {/* Desktop: grid / Mobile: list */}
            <div className="hidden md:grid md:grid-cols-6 divide-x divide-[var(--border)]">
              {week.days.map((day, di) => {
                const pick = day.dd[0];
                return (
                  <div key={di}
                    className={`p-3 min-h-[100px] cursor-pointer hover:bg-[var(--surface)] transition-colors ${day.isToday ? 'bg-[var(--royal-light)]' : ''}`}
                    onClick={() => pick && setModal({ type: 'draft', item: pick, mode: 'view' })}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold ${day.isToday ? 'text-[var(--royal)]' : 'text-[var(--text-secondary)]'}`}>{day.dayName} {day.date.getDate()}</span>
                      <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded ${day.expectedFormat === 'CAROUSEL' ? 'bg-[var(--plum-light)] text-[var(--plum)]' : 'bg-[var(--royal-light)] text-[var(--royal)]'}`}>{day.expectedFormat === 'CAROUSEL' ? 'C' : 'T'}</span>
                    </div>
                    {pick ? (
                      <div>
                        <p className="text-xs font-medium text-[var(--text-primary)] line-clamp-2 mb-1">{pick.topic}</p>
                        <span className={`text-2xs font-semibold ${pick.stage === 'published' ? 'text-[var(--sage)]' : pick.stage === 'ready_to_post' ? 'text-[var(--royal)]' : 'text-[var(--gold)]'}`}>
                          {pick.stage === 'published' ? 'Posted' : pick.stage === 'ready_to_post' ? 'Ready' : 'Pending'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-2">
                        <svg className="w-3.5 h-3.5 text-[var(--red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                        <span className="text-2xs text-[var(--red)]">No content</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Mobile: list */}
            <div className="md:hidden divide-y divide-[var(--border)]">
              {week.days.map((day, di) => {
                const pick = day.dd[0];
                return (
                  <div key={di}
                    className={`flex items-center px-4 py-3 ${day.isToday ? 'bg-[var(--royal-light)]' : ''}`}
                    onClick={() => pick && setModal({ type: 'draft', item: pick, mode: 'view' })}
                    style={{ cursor: pick ? 'pointer' : 'default' }}>
                    <span className={`font-semibold text-sm w-16 flex-shrink-0 ${day.isToday ? 'text-[var(--royal)]' : 'text-[var(--text-secondary)]'}`}>{day.dayName} {day.date.getDate()}</span>
                    <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full mr-3 flex-shrink-0 ${day.expectedFormat === 'CAROUSEL' ? 'bg-[var(--plum-light)] text-[var(--plum)]' : 'bg-[var(--royal-light)] text-[var(--royal)]'}`}>{day.expectedFormat}</span>
                    {pick ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm truncate flex-1 text-[var(--text-primary)]">{pick.topic}</span>
                        <span className={`text-2xs font-semibold whitespace-nowrap ${pick.stage === 'published' ? 'text-[var(--sage)]' : pick.stage === 'ready_to_post' ? 'text-[var(--royal)]' : 'text-[var(--gold)]'}`}>
                          {pick.stage === 'published' ? 'Posted' : pick.stage === 'ready_to_post' ? 'Ready' : 'Pending'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[var(--red)] text-sm flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" /></svg>
                        No content
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // === MODAL ===
  const renderModal = () => {
    if (!modal) return null;
    const { type, item, mode } = modal;
    const itemFb = data.feedback.filter(f => f.item_id === item.id);
    const rawContent = item.content || item.summary || '';
    const isDraft = type === 'draft';
    const content = isDraft && rawContent ? extractDraftContent(rawContent) : rawContent;
    const isBlog = isBlogItem(item);

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center modal-backdrop" style={{ transition: 'opacity 0.35s ease' }} onClick={closeModal}>
        {/* Mobile: bottom sheet / Desktop: centered modal */}
        <div ref={sheetRef}
             className="bg-white w-full md:rounded-2xl md:max-w-3xl md:w-full md:max-h-[85vh] max-h-[92dvh] flex flex-col shadow-2xl border-t md:border border-[var(--border)] overflow-hidden rounded-t-2xl md:rounded-2xl slide-up-sheet md:slide-up"
             onClick={e => e.stopPropagation()}
             onTouchStart={handleTouchStart}
             onTouchMove={handleTouchMove}
             onTouchEnd={handleTouchEnd}>
          {/* Drag handle on mobile — visual swipe affordance */}
          <div className="md:hidden flex justify-center pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing">
            <div className="w-9 h-[5px] rounded-full bg-[var(--border-hover)]" />
          </div>

          {/* Header */}
          <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--surface)] flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-lg text-[var(--text-primary)] leading-snug line-clamp-2">{item.topic || item.title || '—'}</h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {item.connection && <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${item.connection === 'DIRECT' ? 'bg-[var(--sage-light)] text-[var(--sage)]' : 'bg-[var(--gold-light)] text-[var(--gold)]'}`}>{item.connection}</span>}
                  {item.fit_score && <span className="text-2xs text-[var(--text-muted)]">{item.fit_score}</span>}
                  {item.word_count && <span className="text-2xs text-[var(--text-muted)]">{item.word_count} words</span>}
                  {item.draft_type && <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-[var(--text-secondary)]">{item.draft_type}</span>}
                </div>
              </div>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* Desktop only — carousel header actions */}
            {type === 'draft' && isCarouselItem(item) && (
              <div className="hidden md:flex flex-wrap gap-2 mt-3">
                {item.carousel_pdf_url && <a href={item.carousel_pdf_url} target="_blank" rel="noopener" className="text-xs px-3.5 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-90 transition-colors flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download PDF
                </a>}
                {item.caption && <button onClick={() => handleCopy(item.caption)} className="text-xs px-3.5 py-2 rounded-lg bg-[var(--plum)] text-white font-semibold hover:opacity-90 transition-colors">Copy caption</button>}
              </div>
            )}
            {type === 'draft' && !isCarouselItem(item) && content && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button onClick={() => handleCopy(content)} className="text-xs px-3.5 py-2 rounded-lg bg-[var(--royal)] text-white font-semibold hover:opacity-90 transition-colors">Copy content</button>
                {item.caption && <button onClick={() => handleCopy(item.caption)} className="text-xs px-3.5 py-2 rounded-lg bg-[var(--plum)] text-white font-semibold hover:opacity-90 transition-colors">Copy caption</button>}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin modal-scroll-body">
            {type === 'topic' && (
              <div className="mb-4 space-y-3">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener" className="flex items-center gap-2 px-4 py-3 bg-[var(--royal-light)] text-[var(--royal)] rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors border border-[var(--royal)]/10 w-full">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    <span className="truncate flex-1">{item.url.replace('https://www.', '').replace('https://', '')}</span>
                  </a>
                ) : (
                  <a href={'https://www.google.com/search?q=' + encodeURIComponent(item.title || '')} target="_blank" rel="noopener" className="flex items-center gap-2 px-4 py-3 bg-[var(--surface)] text-[var(--text-secondary)] rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors border border-[var(--border)] w-full">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <span className="truncate flex-1">Search: {item.title}</span>
                  </a>
                )}
                {item.summary && (() => {
                  const brief = parseResearchBrief(dedup(item.summary));
                  const isThinking = hasThinkingContent(item.summary);
                  return (
                    <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                      <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between">
                        <p className="text-2xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Research Brief</p>
                        {isThinking && <span className="text-2xs px-2 py-0.5 rounded-full bg-[var(--gold-light)] text-[var(--gold)] font-semibold">Contains raw agent output</span>}
                      </div>
                      <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
                        {brief.sections.length > 1 ? (
                          brief.sections.map((section, i) => {
                            const sectionColors: Record<string, string> = {
                              'Key Findings': 'var(--sage)',
                              'Sources': 'var(--royal)',
                              'Industry Context': 'var(--plum)',
                              "Venky's Angle": 'var(--accent)',
                              'Post Angles': 'var(--gold)',
                              'Evidence': 'var(--royal)',
                              'Context': 'var(--plum)',
                              'Angle': 'var(--accent)',
                            };
                            const color = Object.entries(sectionColors).find(([k]) => section.title.includes(k))?.[1] || 'var(--text-secondary)';
                            return (
                              <div key={i} className={`px-4 py-3 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                  <p className="text-xs font-semibold" style={{ color }}>{section.title}</p>
                                </div>
                                <div className="text-sm text-[var(--text-secondary)] leading-relaxed pl-4" dangerouslySetInnerHTML={{ __html: renderMd(section.content) }} />
                              </div>
                            );
                          })
                        ) : (
                          <div className="px-4 py-4 text-sm text-[var(--text-secondary)] leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMd(brief.raw || item.summary.substring(0, 1500)) }} />
                        )}
                      </div>
                    </div>
                  );
                })()}
                {!item.summary && (
                  <div className="bg-[var(--gold-light)] border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
                    <span className="text-lg">🔬</span>
                    <div>
                      <p className="font-semibold mb-0.5">No research brief yet</p>
                      <p className="text-xs leading-relaxed">Approve to trigger Owl research.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Carousel slide preview */}
            {isDraft && isCarouselItem(item) && (() => {
              // Try to parse carousel_json, falling back to content field
              let carouselData: string | null = item.carousel_json || null;
              if (!carouselData && item.content) {
                // Agent may have written JSON into content field instead of carousel_json
                try {
                  const jsonMatch = item.content.match(/\{[\s\S]*"slides"[\s\S]*\}/);
                  if (jsonMatch) carouselData = jsonMatch[0];
                } catch {}
              }
              if (!carouselData) {
                // Show content as plain text if available, otherwise show empty state
                return item.content ? (
                  <div className="space-y-3">
                    <div className="bg-[var(--gold-light)] border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
                      <span className="text-lg">⚠️</span>
                      <div>
                        <p className="font-semibold mb-0.5">Carousel JSON not found</p>
                        <p className="text-xs leading-relaxed">Agent output is shown as text below. The carousel may need to be re-generated.</p>
                      </div>
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: renderMd(extractDraftContent(item.content)) }} className="text-sm leading-relaxed text-[var(--text-secondary)]" />
                  </div>
                ) : (
                  <div className="bg-[var(--gold-light)] border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
                    <span className="text-lg">📭</span>
                    <div>
                      <p className="font-semibold mb-0.5">No carousel content yet</p>
                      <p className="text-xs leading-relaxed">The agent hasn't written back yet. Check the agent runner logs.</p>
                    </div>
                  </div>
                );
              }
              try {
                // Parse carousel JSON — handle both string and pre-parsed object from Supabase
                let carousel: any;
                if (typeof carouselData === 'object') {
                  carousel = carouselData;
                } else {
                  // Try direct parse first, then sanitize if it fails
                  try {
                    carousel = JSON.parse(carouselData);
                  } catch {
                    // Handle raw unescaped newlines in JSON strings from agent output
                    const sanitized = carouselData.replace(/[\n\r\t]/g, (c: string) => c === '\n' ? '\\n' : c === '\r' ? '\\r' : '\\t');
                    carousel = JSON.parse(sanitized);
                  }
                }
                const slides = (carousel.slides || []).map((s: any) => ({
                  ...s,
                  title: s.title || s.heading || '',
                  subtitle: s.subtitle || s.subheading || '',
                  items: s.items?.map((it: any) => typeof it === 'string' ? { text: it, icon: '→' } : it),
                }));
                return (
                  <div className="space-y-3">
                    {/* Slide counter on mobile */}
                    <div className="md:hidden flex items-center justify-center gap-1.5 py-1">
                      <span className="text-2xs text-[var(--text-muted)] font-medium">Swipe to browse</span>
                      <span className="text-2xs text-[var(--text-muted)]">&middot;</span>
                      <span className="text-2xs text-[var(--text-muted)] font-semibold">{slides.length} slides</span>
                    </div>
                    {/* Mobile: horizontal snap scroll / Desktop: vertical stack */}
                    <div className="md:space-y-3 flex md:block overflow-x-auto md:overflow-x-visible snap-x snap-mandatory scrollbar-hide gap-3 md:gap-0 -mx-5 px-5 md:mx-0 md:px-0">
                      {slides.map((slide: any, i: number) => {
                        const bgColors: Record<string, string> = {
                          hook: '#1A1A2E', dark: '#1A1A2E', charcoal: '#252545',
                          warm: '#FFF8F3', white: '#FFFFFF', coral: '#E87B35', cta: '#E87B35',
                          stats: '#1A1A2E', bullets: '#1A1A2E',
                        };
                        const bg = slide.bg || (slide.type === 'hook' || slide.type === 'stats' ? 'dark' : slide.type === 'cta' ? 'coral' : i % 2 === 0 ? 'charcoal' : 'warm');
                        const isDark = bg === 'dark' || bg === 'charcoal' || bg === 'stats';
                        const isCoral = bg === 'coral' || slide.type === 'cta';
                        const textColor = isDark || isCoral ? '#FFFFFF' : '#1A1A2E';
                        const bgColor = bgColors[bg] || bgColors[slide.type] || '#FFF8F3';
                        return (
                          <div key={i} className="rounded-xl overflow-hidden border border-[var(--border)] relative snap-center flex-shrink-0 w-[85vw] md:w-auto" style={{ backgroundColor: bgColor, color: textColor, aspectRatio: '4/5' }}>
                            {/* Top accent bar */}
                            <div className="absolute top-0 left-0 right-0 h-[3px] bg-[var(--accent)] z-10" />
                            <div className="absolute inset-0 flex flex-col justify-center p-5 md:p-8">
                              {/* Slide number badge */}
                              <div className="absolute top-3 right-3 md:top-4 md:right-4 text-2xs font-semibold uppercase tracking-wider opacity-40">{i + 1}/{slides.length}</div>
                              {slide.emoji && <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ backgroundColor: isDark ? 'rgba(232,123,53,0.15)' : 'rgba(232,123,53,0.1)' }}>{slide.emoji}</div>}
                              {slide.type === 'hook' && (
                                <>
                                  {slide.label && <p className="text-2xs font-bold tracking-[3px] uppercase mb-3" style={{ color: '#E87B35' }}>{slide.label}</p>}
                                  <h3 style={{ fontFamily: "'Outfit', sans-serif" }} className="text-xl md:text-2xl font-black leading-tight mb-2" dangerouslySetInnerHTML={{ __html: (slide.title || '').replace(/<span class='highlight'>(.*?)<\/span>/g, '<span style="color: #E87B35">$1</span>') }} />
                                  {slide.subtitle && <p className="text-sm opacity-50 leading-relaxed">{slide.subtitle}</p>}
                                </>
                              )}
                              {slide.type === 'point' && (
                                <>
                                  <span style={{ fontFamily: "'Outfit', sans-serif", color: '#E87B35' }} className="text-4xl font-black leading-none">{slide.number}</span>
                                  <h3 style={{ fontFamily: "'Outfit', sans-serif" }} className="text-lg font-bold mt-2 mb-2">{slide.title}</h3>
                                  <p className="text-sm opacity-60 leading-relaxed">{slide.body}</p>
                                  {slide.highlight && (
                                    <div className="mt-3 p-3 rounded-xl text-sm leading-relaxed" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#1A1A2E', color: isDark ? 'rgba(255,255,255,0.85)' : '#FFFFFF' }}>
                                      {slide.highlight.icon && <span className="mr-2">{slide.highlight.icon}</span>}
                                      {slide.highlight.text}
                                    </div>
                                  )}
                                </>
                              )}
                              {slide.type === 'stats' && (
                                <>
                                  <h3 style={{ fontFamily: "'Outfit', sans-serif" }} className="text-lg font-bold mb-3">{slide.title}</h3>
                                  <div className="space-y-2">
                                    {(slide.stats || []).map((s: any, j: number) => (
                                      <div key={j} className="flex items-center gap-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                                        <span style={{ fontFamily: "'Outfit', sans-serif", color: '#E87B35' }} className="text-2xl font-black min-w-[70px]">{s.number}</span>
                                        <span className="text-sm opacity-60">{s.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              {slide.type === 'bullets' && (
                                <>
                                  <h3 style={{ fontFamily: "'Outfit', sans-serif" }} className="text-lg font-bold mb-3">{slide.title}</h3>
                                  <div className="space-y-1.5">
                                    {(slide.items || []).map((b: any, j: number) => (
                                      <div key={j} className="flex items-start gap-3 text-sm p-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                                        <span className="flex-shrink-0 text-base">{b.icon}</span>
                                        <span className="opacity-75 leading-relaxed">{b.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              {slide.type === 'cta' && (
                                <div className="text-center">
                                  <h3 style={{ fontFamily: "'Outfit', sans-serif" }} className="text-xl font-bold mb-2">{slide.title}</h3>
                                  {slide.subtitle && <p className="text-sm opacity-50 mb-4 leading-relaxed">{slide.subtitle}</p>}
                                  {slide.button && <span className="inline-block px-6 py-3 rounded-xl text-sm font-bold" style={{ backgroundColor: isCoral ? '#FFFFFF' : '#E87B35', color: isCoral ? '#E87B35' : '#FFFFFF', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>{slide.button}</span>}
                                </div>
                              )}
                            </div>
                            {/* Brand bar */}
                            <div className="absolute bottom-3 right-4 flex items-center gap-1.5 z-10">
                              <span style={{ fontFamily: "'Outfit', sans-serif", color: '#E87B35' }} className="text-2xs font-bold">AppletPod</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Caption */}
                    {carousel.caption && (
                      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                        <p className="text-2xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">LinkedIn Caption</p>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{carousel.caption}</p>
                      </div>
                    )}
                  </div>
                );
              } catch {
                return (
                  <div className="space-y-3">
                    <div className="bg-[var(--gold-light)] border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
                      <span className="text-lg">⚠️</span>
                      <div>
                        <p className="font-semibold mb-0.5">Carousel JSON parse error</p>
                        <p className="text-xs leading-relaxed">The carousel data couldn't be parsed. Showing raw content below.</p>
                      </div>
                    </div>
                    {content && <div dangerouslySetInnerHTML={{ __html: renderMd(content) }} className="text-sm leading-relaxed text-[var(--text-secondary)]" />}
                  </div>
                );
              }
            })()}

            {!isBlog && !isCarouselItem(item) && content && (
              <div dangerouslySetInnerHTML={{ __html: renderMd(content) }} className="text-sm leading-relaxed text-[var(--text-secondary)]" />
            )}

            {isBlog && content && content.length >= 100 && (() => {
              const { body: blogBody, meta: blogMeta } = stripFrontmatter(content);
              const blogTitle = blogMeta.title || item.topic || item.title;
              const blogCategory = blogMeta.cluster || blogMeta.category || 'Blog';
              const wordCount = item.word_count || content.split(/\s+/).length;
              const readTime = Math.max(1, Math.round(wordCount / 250));
              return (
                <div className="rounded-xl border border-[var(--warm-dark)] overflow-hidden bg-white">
                  {/* Accent gradient line */}
                  <div className="h-[2px]" style={{ background: 'linear-gradient(to right, transparent, var(--accent), transparent)' }} />
                  {/* Blog header — appletpod style */}
                  <div className="px-5 md:px-8 pt-7 pb-5 border-b border-[var(--warm-dark)]">
                    <span className="inline-block text-sm font-medium px-3 py-1 rounded-full mb-4" style={{ color: 'rgba(232, 123, 53, 0.8)', backgroundColor: 'rgba(232, 123, 53, 0.08)' }}>{blogCategory}</span>
                    <h1 style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--charcoal)' }} className="text-2xl md:text-3xl font-bold leading-tight tracking-tight mb-3">{blogTitle}</h1>
                    {blogMeta.description && <p className="text-base leading-relaxed mb-4" style={{ color: 'rgba(26, 26, 46, 0.5)' }}>{blogMeta.description}</p>}
                    <div className="flex items-center gap-3 text-sm" style={{ color: 'rgba(26, 26, 46, 0.4)' }}>
                      <span><span className="font-medium" style={{ color: 'rgba(26, 26, 46, 0.6)' }}>Venky</span></span>
                      <span>·</span>
                      <span>{wordCount} words</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {readTime} min read
                      </span>
                    </div>
                  </div>
                  {/* Blog body — appletpod prose */}
                  <div className="px-5 md:px-8 py-6 prose-appletpod" dangerouslySetInnerHTML={{ __html: renderMd(blogBody) }} />
                  {/* Keywords */}
                  {blogMeta.keywords && (
                    <div className="px-5 md:px-8 pb-6 pt-4 border-t border-[var(--warm-dark)] flex flex-wrap gap-2">
                      {blogMeta.keywords.split(',').map((kw: string, i: number) => (
                        <span key={i} className="text-sm px-3 py-1.5 rounded-full" style={{ color: 'rgba(26, 26, 46, 0.4)', backgroundColor: 'var(--warm)' }}>{kw.trim()}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Feedback history */}
            {itemFb.length > 0 && (
              <div className="mt-6 pt-4 border-t border-[var(--border)]">
                <p className="text-2xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Feedback history</p>
                <div className="space-y-2">
                  {itemFb.map(f => (
                    <div key={f.id} className="flex items-start gap-2 text-sm p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)]">
                      <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${f.action === 'rejected' ? 'bg-[var(--red-light)] text-[var(--red)]' : 'bg-[var(--gold-light)] text-[var(--gold)]'}`}>{f.action}</span>
                      <span className="flex-1 text-[var(--text-secondary)] text-sm leading-relaxed">{f.comment}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reject/Revise form */}
            {(mode === 'reject' || mode === 'revise') && (
              <div className="mt-6 pt-4 border-t border-[var(--border)]">
                <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">{mode === 'reject' ? 'Reject with reason' : 'Request revision'}</p>
                <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder={mode === 'reject' ? 'Why reject? (required)' : 'What needs to change? (required)'} className="w-full border border-[var(--border)] rounded-xl p-4 text-sm focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none transition-all resize-none" rows={3} autoFocus />
                <div className="flex gap-2 mt-3">
                  {mode === 'reject' && <button onClick={() => data.requireAuth(() => { data.rejectItem(type, item, feedbackText); setModal(null); setFeedbackText(''); })} disabled={!feedbackText.trim()} className="px-4 py-2.5 bg-[var(--red)] text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all">Reject</button>}
                  {mode === 'revise' && <button onClick={() => data.requireAuth(() => { data.reviseItem(type, item, feedbackText); setModal(null); setFeedbackText(''); })} disabled={!feedbackText.trim()} className="px-4 py-2.5 bg-[var(--gold)] text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all">Send for revision</button>}
                  <button onClick={() => { setModal({ ...modal, mode: 'view' }); setFeedbackText(''); }} className="px-4 py-2.5 bg-gray-100 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-gray-200 transition-colors">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          {mode === 'view' && (
            <div className="flex flex-wrap gap-2 px-5 py-4 border-t border-[var(--border)] bg-[var(--surface)] rounded-b-2xl flex-shrink-0">
              {type === 'topic' && item.status !== 'archived' && (() => {
                const actions = getTopicActions(item.stage, item.status);
                return (
                  <div className="flex gap-2">
                    {actions.showApprove && <button onClick={() => data.requireAuth(() => { data.approveTopic(item.id); setModal(null); })} className="px-5 py-2.5 bg-[var(--sage)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-colors">Approve</button>}
                    {actions.showReject && <button onClick={() => setModal({ ...modal!, mode: 'reject' })} className="px-5 py-2.5 bg-[var(--red-light)] text-[var(--red)] rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors">Reject</button>}
                    {actions.showArchive && <button onClick={() => data.requireAuth(() => { data.archiveTopic(item.id); setModal(null); })} className="px-5 py-2.5 bg-gray-100 text-[var(--text-secondary)] rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors">Archive</button>}
                  </div>
                );
              })()}
              {type === 'draft' && item.stage === 'drafted' && item.status !== 'archived' && (() => {
                const actions = getDraftActions(item.stage, item.status);
                return (
                  <div className="flex gap-2">
                    {actions.showApprove && <button onClick={() => data.requireAuth(() => { data.approveDraft(item.id); setModal(null); })} className="px-5 py-2.5 bg-[var(--sage)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-colors">Approve</button>}
                    {actions.showRevise && <button onClick={() => setModal({ ...modal!, mode: 'revise' })} className="px-5 py-2.5 bg-[var(--gold-light)] text-[var(--gold)] rounded-xl text-sm font-semibold hover:bg-amber-100 transition-colors">Revise</button>}
                    {actions.showReject && <button onClick={() => setModal({ ...modal!, mode: 'reject' })} className="px-5 py-2.5 bg-[var(--red-light)] text-[var(--red)] rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors">Reject</button>}
                  </div>
                );
              })()}
              {type === 'draft' && item.stage === 'ready_to_post' && (
                <button onClick={() => data.requireAuth(() => { data.publishDraft(item.id); setModal(null); })} className="px-5 py-2.5 bg-[var(--royal)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-colors">Mark published</button>
              )}
              {/* Mobile carousel icon buttons */}
              {type === 'draft' && isCarouselItem(item) && (
                <div className="flex md:hidden gap-1.5">
                  {item.carousel_pdf_url && (
                    <a href={item.carousel_pdf_url} target="_blank" rel="noopener" className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-colors" title="Download PDF">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </a>
                  )}
                  {item.caption && (
                    <button onClick={() => handleCopy(item.caption)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--plum)] text-white hover:opacity-90 transition-colors" title="Copy caption">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                    </button>
                  )}
                </div>
              )}
              <div className="flex-1" />
            </div>
          )}
        </div>
      </div>
    );
  };

  // === TABS CONFIG ===
  const tabs: { key: Tab; label: string; badge: number; icon: string }[] = [
    { key: 'overview', label: 'Dashboard', badge: 0, icon: '📊' },
    { key: 'linkedin', label: 'LinkedIn', badge: data.pendingLinkedin, icon: '💼' },
    { key: 'carousels', label: 'Carousels', badge: data.pendingCarousels, icon: '🎠' },
    { key: 'blogs', label: 'Blogs', badge: data.pendingBlogs, icon: '📝' },
    { key: 'calendar', label: 'Calendar', badge: 0, icon: '📅' },
  ];

  return (
    <div className="flex flex-col bg-[var(--surface)]" style={{ height: 'var(--app-height, 100dvh)' }}>
      {/* Header */}
      <header className="bg-white border-b border-[var(--border)] px-4 md:px-6 flex items-center justify-between shadow-sm" style={{ height: 'calc(var(--app-height, 100dvh) * 0.1)', minHeight: '44px' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--plum)] flex items-center justify-center shadow-sm">
            <span className="text-white text-sm font-bold">V</span>
          </div>
          <div>
            <h1 className="text-sm md:text-base font-semibold text-[var(--text-primary)] tracking-tight leading-none">Content Dashboard</h1>
            <p className="text-2xs text-[var(--text-muted)] hidden xs:block mt-0.5">AI-powered content pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-xs text-[var(--text-muted)] hidden sm:block">{new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
          {data.authed
            ? <button onClick={data.logout} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-2xs font-semibold bg-[var(--sage-light)] text-[var(--sage)] border border-[var(--sage)]/20 hover:bg-green-100 transition-colors" title="Click to logout"><span className="w-1.5 h-1.5 rounded-full bg-[var(--sage)] pulse-dot" />Logged in</button>
            : <button onClick={() => data.requireAuth(() => {})} className="px-3 py-1.5 bg-[var(--surface)] rounded-full text-2xs font-semibold hover:bg-gray-200 transition-colors border border-[var(--border)]">Login</button>}
        </div>
      </header>

      {/* Desktop Tabs - pill style */}
      <nav className="hidden md:flex bg-white border-b border-[var(--border)] px-6 py-2 gap-1 flex-shrink-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${tab === t.key ? 'bg-[var(--charcoal)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]'}`}>
            <span className="text-base">{t.icon}</span>
            {t.label}
            {t.badge > 0 && <span className={`ml-0.5 px-1.5 py-0.5 text-2xs font-bold rounded-full badge-pop ${tab === t.key ? 'bg-white/20 text-white' : 'bg-[var(--accent)] text-white'}`}>{t.badge}</span>}
          </button>
        ))}
      </nav>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border)] px-2 flex justify-around z-40 safe-bottom shadow-lg items-center" style={{ height: 'calc(var(--app-height, 100dvh) * 0.1)', minHeight: '44px' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex flex-col items-center py-1.5 px-2 rounded-lg transition-all relative min-w-[56px] ${tab === t.key ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
            <span className="text-xl">{t.icon}</span>
            <span className="text-2xs font-medium mt-0.5">{t.label}</span>
            {t.badge > 0 && <span className="absolute -top-0.5 right-0 min-w-[16px] h-4 flex items-center justify-center px-1 text-2xs font-bold bg-[var(--accent)] text-white rounded-full badge-pop">{t.badge}</span>}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className={`min-h-0 flex-1 ${tab === 'overview' || tab === 'calendar' ? 'overflow-y-auto' : 'overflow-hidden'} p-2 md:p-4 pb-0 md:pb-4`}>
        <div className="h-full">
          {tab === 'overview' && renderOverview()}
          {tab === 'linkedin' && renderLinkedIn()}
          {tab === 'carousels' && renderCarousels()}
          {tab === 'blogs' && renderBlogs()}
          {tab === 'calendar' && renderCalendar()}
        </div>
      </main>

      {renderModal()}
      <Toast message={data.toast} />
    </div>
  );
}
