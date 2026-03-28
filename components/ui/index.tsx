'use client';

import React from 'react';
import { Topic, Draft } from '@/lib/supabase';
import { ago, fitColor, copyToClipboard, stripFrontmatter, parseResearchBrief, extractDraftContent, dedup } from '@/lib/format';
import { getTopicActions, getDraftActions } from '@/lib/action-helpers';

// === KANBAN COLUMN ===
export function Column({ title, count, children, accent = 'var(--royal)' }: {
  title: string; count: number; children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="flex flex-col min-w-[280px] w-[300px] md:w-auto md:flex-1 bg-white rounded-xl border border-[var(--border)] flex-shrink-0 h-full shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full ring-2 ring-offset-1" style={{ backgroundColor: accent, ['--tw-ring-color' as any]: accent + '33' }} />
          <span className="font-semibold text-sm text-[var(--text-primary)]">{title}</span>
        </div>
        <span className="text-xs font-semibold min-w-[24px] h-6 flex items-center justify-center bg-[var(--surface)] px-2 rounded-full text-[var(--text-muted)] border border-[var(--border)]">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 scrollbar-thin min-h-0">
        {children}
      </div>
    </div>
  );
}

// === TOPIC CARD ===
export function TopicCard({ t, showActions = true, onView, onApprove, onReject, onArchive, onRestore, requireAuth }: {
  t: Topic; showActions?: boolean;
  onView: (t: Topic) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore?: (id: string) => void;
  requireAuth: (fn: () => void) => void;
}) {
  const isBlogTopic = t.channel === 'blog' || t.channel === 'both';
  const isResearched = t.stage === 'researched';
  const summarySnippet = t.summary ? (() => {
    const cleaned = dedup(t.summary);
    const brief = parseResearchBrief(cleaned);
    const text = brief.sections.length > 0 ? brief.sections[0].content : cleaned;
    return text.replace(/^#[^\n]+\n*/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^[\s\-*]+/gm, '').trim().substring(0, 140);
  })() : '';
  const updatedAt = t.revised_at || t.discovered_at;

  return (
    <div className="group bg-white rounded-xl border border-[var(--border)] overflow-hidden cursor-pointer card-hover"
         onClick={() => onView(t)}>
      <div className={`h-[3px] ${t.connection === 'DIRECT' ? 'bg-[var(--sage)]' : isBlogTopic ? 'bg-[var(--accent)]' : 'bg-[var(--royal)]'}`} />
      <div className="p-3.5">
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          {isResearched && <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-[var(--royal-light)] text-[var(--royal)]">Researched</span>}
          {!isResearched && t.connection && (
            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${t.connection === 'DIRECT' ? 'bg-[var(--sage-light)] text-[var(--sage)]' : 'bg-[var(--gold-light)] text-[var(--gold)]'}`}>
              {t.connection}
            </span>
          )}
          {t.fit_score && <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-gray-100" style={{ color: fitColor(t.fit_score) }}>{(t.fit_score || '').split('—')[0].trim()}</span>}
          {t.status === 'revision' && <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-[var(--gold-light)] text-[var(--gold)] pulse-dot">Revision</span>}
        </div>
        <p className="font-semibold text-sm leading-snug mb-1.5 line-clamp-2 text-[var(--text-primary)] group-hover:text-[var(--royal)] transition-colors">{t.title}</p>
        {summarySnippet ? (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-3 mb-2.5 leading-relaxed">{summarySnippet}...</p>
        ) : t.url ? (
          <p className="text-xs text-[var(--royal)] mb-2.5 truncate">{t.url.replace('https://www.', '').replace('https://', '').split('/')[0]}</p>
        ) : (
          <p className="text-xs text-[var(--text-muted)] mb-2.5 italic">Click to see details</p>
        )}
        <div className="flex items-center justify-between text-2xs text-[var(--text-muted)]">
          <span className="truncate max-w-[60%]">{(t.source || '').split('·').map(s => s.trim()).filter(Boolean).join(' · ')}</span>
          <span>{ago(updatedAt)}</span>
        </div>
        {showActions && t.status !== 'archived' && (
          <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
            {(() => {
              const actions = getTopicActions(t.stage, t.status);
              return (
                <>
                  {actions.statusLabel && <p className="text-2xs font-medium text-[var(--text-muted)]">{actions.statusLabel}</p>}
                  <div className="flex gap-1.5">
                    {actions.showApprove && <button onClick={() => requireAuth(() => onApprove(t.id))} className="flex-1 text-xs py-2 rounded-lg bg-[var(--sage)] text-white font-semibold hover:opacity-90 active:scale-[0.97] transition-all">Approve</button>}
                    {actions.showReject && <button onClick={() => requireAuth(() => onReject(t.id))} className="flex-1 text-xs py-2 rounded-lg bg-[var(--red-light)] text-[var(--red)] font-semibold hover:bg-red-100 transition-colors">Reject</button>}
                    {actions.showArchive && <button onClick={() => requireAuth(() => onArchive(t.id))} className="text-xs px-3 py-2 rounded-lg bg-[var(--surface)] text-[var(--text-secondary)] font-semibold hover:bg-gray-200 transition-colors">Archive</button>}
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {showActions && (t.status === 'archived' || t.status === 'rejected') && onRestore && (
          <div className="flex gap-1.5 mt-3 pt-3 border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <button onClick={() => requireAuth(() => onRestore(t.id))} className="flex-1 text-xs py-2 rounded-lg bg-[var(--royal)] text-white font-semibold hover:opacity-90 active:scale-[0.97] transition-all">Restore to Scouted</button>
          </div>
        )}
      </div>
    </div>
  );
}

// === DRAFT CARD ===
export function DraftCard({ d, revisionCount = 0, showActions = true, onView, onApprove, onReject, onArchive, onRevise, onPublish, onCopy, onRestore, requireAuth }: {
  d: Draft; revisionCount?: number; showActions?: boolean;
  onView: (d: Draft) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onArchive: (id: string) => void;
  onRevise: (d: Draft) => void;
  onPublish: (id: string) => void;
  onCopy: (text: string) => void;
  onRestore?: (id: string) => void;
  requireAuth: (fn: () => void) => void;
}) {
  const stLabel = d.stage === 'published' ? 'Published' : d.stage === 'ready_to_post' ? 'Ready' : d.status === 'revision' ? 'Revision' : 'Draft';
  const barColor = d.stage === 'published' ? 'bg-[var(--royal)]' : d.stage === 'ready_to_post' ? 'bg-[var(--sage)]' : d.status === 'revision' ? 'bg-[var(--gold)]' : 'bg-gray-300';
  const stStyles: Record<string, string> = {
    'Published': 'bg-[var(--royal-light)] text-[var(--royal)]',
    'Ready': 'bg-[var(--sage-light)] text-[var(--sage)]',
    'Revision': 'bg-[var(--gold-light)] text-[var(--gold)]',
    'Draft': 'bg-gray-100 text-[var(--text-secondary)]',
  };
  const typeColors: Record<string, string> = {
    carousel: 'bg-[var(--plum-light)] text-[var(--plum)]',
    blog: 'bg-[var(--royal-light)] text-[var(--royal)]',
    commentary: 'bg-[var(--royal-light)] text-[var(--royal)]',
    'quick-tip': 'bg-[var(--sage-light)] text-[var(--sage)]',
    'hot-take': 'bg-[var(--red-light)] text-[var(--red)]',
  };
  const isBlogDraft = d.channel === 'blog' || d.draft_type === 'blog';
  const snippet = d.content ? (() => {
    const clean = extractDraftContent(d.content);
    return stripFrontmatter(clean).body.replace(/^#[^\n]+\n*/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim().substring(0, 120);
  })() : '';

  return (
    <div className="group bg-white rounded-xl border border-[var(--border)] overflow-hidden cursor-pointer card-hover"
         onClick={() => onView(d)}>
      <div className={`h-[3px] ${barColor}`} />
      <div className="p-3.5">
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${stStyles[stLabel] || 'bg-gray-100 text-[var(--text-secondary)]'}`}>{stLabel}</span>
          <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${typeColors[d.draft_type] || 'bg-gray-100 text-[var(--text-secondary)]'}`}>{d.draft_type}</span>
          {d.word_count ? <span className="text-2xs text-[var(--text-muted)]">{d.word_count}w</span> : null}
          {revisionCount > 0 && <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-[var(--gold-light)] text-[var(--gold)]">R{revisionCount}</span>}
        </div>
        <p className="font-semibold text-sm leading-snug mb-1.5 line-clamp-2 text-[var(--text-primary)] group-hover:text-[var(--royal)] transition-colors">{d.topic}</p>
        {snippet && <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-2.5 leading-relaxed">{snippet}...</p>}
        <div className="flex items-center justify-between text-2xs text-[var(--text-muted)]">
          <span>{isBlogDraft && d.blog_url ? d.blog_url.replace('https://', '') : d.target_publish_date || ''}</span>
          <span>{ago(d.revised_at || d.created_at)}</span>
        </div>

        {showActions && d.stage === 'drafted' && d.status !== 'archived' && (
          <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
            {(() => {
              const actions = getDraftActions(d.stage, d.status);
              return (
                <>
                  {actions.statusLabel && <p className="text-2xs font-medium text-[var(--text-muted)]">{actions.statusLabel}</p>}
                  <div className="flex gap-1.5">
                    {actions.showApprove && <button onClick={() => requireAuth(() => onApprove(d.id))} className="flex-1 text-xs py-2 rounded-lg bg-[var(--sage)] text-white font-semibold hover:opacity-90 active:scale-[0.97] transition-all">Approve</button>}
                    {actions.showRevise && <button onClick={() => requireAuth(() => onRevise(d))} className="flex-1 text-xs py-2 rounded-lg bg-[var(--gold-light)] text-[var(--gold)] font-semibold hover:bg-amber-100 transition-colors">Revise</button>}
                    {actions.showReject && <button onClick={() => requireAuth(() => onReject(d.id))} className="flex-1 text-xs py-2 rounded-lg bg-[var(--red-light)] text-[var(--red)] font-semibold hover:bg-red-100 transition-colors">Reject</button>}
                    {actions.showArchive && <button onClick={() => requireAuth(() => onArchive(d.id))} className="text-xs px-3 py-2 rounded-lg bg-[var(--surface)] text-[var(--text-secondary)] font-semibold hover:bg-gray-200 transition-colors">Archive</button>}
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {showActions && d.stage === 'ready_to_post' && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <button onClick={() => d.content && onCopy(extractDraftContent(d.content))} className="text-xs px-3 py-2 rounded-lg bg-[var(--royal)] text-white font-semibold hover:opacity-90 transition-colors">Copy</button>
            <button onClick={() => requireAuth(() => onPublish(d.id))} className="text-xs px-3 py-2 rounded-lg bg-[var(--surface)] text-[var(--text-secondary)] font-semibold hover:bg-gray-200 transition-colors">Mark published</button>
          </div>
        )}
        {showActions && (d.status === 'archived' || d.status === 'rejected') && onRestore && (
          <div className="flex gap-1.5 mt-3 pt-3 border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <button onClick={() => requireAuth(() => onRestore(d.id))} className="flex-1 text-xs py-2 rounded-lg bg-[var(--royal)] text-white font-semibold hover:opacity-90 active:scale-[0.97] transition-all">Restore to Drafts</button>
          </div>
        )}
      </div>
    </div>
  );
}

// === TOAST ===
export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--charcoal)] text-white px-5 py-3 rounded-xl text-sm font-medium shadow-xl z-[80] slide-up flex items-center gap-2">
      <svg className="w-4 h-4 text-[var(--sage)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      {message}
    </div>
  );
}

// === EMPTY STATE ===
export function EmptyState({ message = 'Nothing here yet' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4">
      <div className="w-12 h-12 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
      </div>
      <p className="text-sm text-[var(--text-muted)]">{message}</p>
    </div>
  );
}
