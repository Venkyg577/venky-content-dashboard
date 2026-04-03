/**
 * Helper functions for topic/draft actions
 * Shows task status when agent is working, actions when ready for human review
 */

import { AgentTask } from './supabase';

export const TopicActionStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REVISION: 'revision',
  REJECTED: 'rejected',
  ARCHIVED: 'archived',
} as const;

export const DraftActionStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REVISION: 'revision',
  REJECTED: 'rejected',
  ARCHIVED: 'archived',
} as const;

// Agent task status display
export type TaskStatus = {
  hasActiveTask: boolean;
  taskState: 'pending' | 'claimed' | 'running' | 'completed' | 'failed' | 'retrying' | null;
  agent: string | null;
  statusLabel: string;
  statusColor: string;
  retryInfo: string | null;
};

/**
 * Find the active agent task for a given item (topic or draft)
 */
export function getTaskStatus(refId: string, agentTasks: AgentTask[]): TaskStatus {
  // Find the most recent task for this item
  const task = agentTasks
    .filter(t => t.ref_id === refId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  if (!task) return { hasActiveTask: false, taskState: null, agent: null, statusLabel: '', statusColor: '', retryInfo: null };

  const agentEmoji: Record<string, string> = {
    eagle: '🦅 Eagle', owl: '🦉 Owl', bee: '🐝 Bee',
    crane: '🏗️ Crane', stork: '🪽 Stork', pelican: '🐦 Pelican', wolf: '🐺 Wolf',
  };
  const agentName = agentEmoji[task.agent] || task.agent;

  // Check for retry backoff
  const retryCount = (task.payload as any)?.retry_count || 0;
  const retryAfter = (task.payload as any)?.retry_after;
  const isRetrying = task.status === 'pending' && retryCount > 0;

  let retryInfo: string | null = null;
  if (isRetrying && retryAfter) {
    const minsLeft = Math.max(0, Math.round((new Date(retryAfter).getTime() - Date.now()) / 60000));
    retryInfo = minsLeft > 0 ? `Retry in ${minsLeft}m (attempt ${retryCount}/5)` : `Retrying now (attempt ${retryCount}/5)`;
  }

  switch (task.status) {
    case 'pending':
      if (isRetrying) {
        return { hasActiveTask: true, taskState: 'retrying', agent: task.agent, statusLabel: `⏳ ${agentName} — rate limited`, statusColor: 'var(--gold)', retryInfo };
      }
      return { hasActiveTask: true, taskState: 'pending', agent: task.agent, statusLabel: `⏳ Queued for ${agentName}`, statusColor: 'var(--text-secondary)', retryInfo: null };

    case 'claimed':
      return { hasActiveTask: true, taskState: 'claimed', agent: task.agent, statusLabel: `🔄 ${agentName} starting...`, statusColor: 'var(--blue)', retryInfo: null };

    case 'running':
      return { hasActiveTask: true, taskState: 'running', agent: task.agent, statusLabel: `🤖 ${agentName} working...`, statusColor: 'var(--blue)', retryInfo: null };

    case 'failed':
      const isRateLimit = task.error?.includes('rate_limit') || task.error?.includes('429');
      return {
        hasActiveTask: true, taskState: 'failed', agent: task.agent,
        statusLabel: isRateLimit ? `⚠️ Rate limited — will retry` : `❌ ${agentName} failed`,
        statusColor: isRateLimit ? 'var(--gold)' : 'var(--red)',
        retryInfo: task.error?.substring(0, 80) || null,
      };

    case 'completed':
      return { hasActiveTask: false, taskState: 'completed', agent: task.agent, statusLabel: '', statusColor: '', retryInfo: null };

    default:
      return { hasActiveTask: false, taskState: null, agent: null, statusLabel: '', statusColor: '', retryInfo: null };
  }
}

/**
 * Topic action visibility — respects agent task state
 */
export const getTopicActions = (stage: string, status: string, taskStatus?: TaskStatus) => {
  // If agent is actively working, hide action buttons
  if (taskStatus?.hasActiveTask) {
    return {
      showApprove: false, showReject: false, showRevise: false, showArchive: false,
      statusLabel: taskStatus.statusLabel,
      isActionable: false,
      taskStatus,
    };
  }

  const isScouted = stage === 'scouted';
  const isResearched = stage === 'researched';
  const isRevising = status === TopicActionStatus.REVISION;

  const isReady = (isScouted && status === TopicActionStatus.PENDING)
    || (isResearched && status === TopicActionStatus.APPROVED)
    || (isResearched && status === TopicActionStatus.PENDING);

  return {
    showApprove: isReady,
    showReject: isReady,
    showRevise: false,
    showArchive: status !== 'archived',
    statusLabel: isRevising ? '📝 Revising' : isReady ? '✅ Ready to Review' : '',
    isActionable: isReady,
    taskStatus: taskStatus || null,
  };
};

/**
 * Draft action visibility — respects agent task state
 */
export const getDraftActions = (stage: string, status: string, taskStatus?: TaskStatus) => {
  // If agent is actively working, hide action buttons
  if (taskStatus?.hasActiveTask) {
    return {
      showApprove: false, showReject: false, showRevise: false, showArchive: false,
      statusLabel: taskStatus.statusLabel,
      isActionable: false,
      taskStatus,
    };
  }

  const isReady = status === DraftActionStatus.APPROVED || status === DraftActionStatus.PENDING;
  const isRevising = status === DraftActionStatus.REVISION;

  return {
    showApprove: isReady,
    showReject: isReady,
    showRevise: isReady && (stage === 'drafted' || stage === 'ready_to_post'),
    showArchive: status !== 'archived',
    statusLabel: isRevising ? '📝 Revising' : status === DraftActionStatus.APPROVED ? '✅ Ready to Review' : '',
    isActionable: isReady,
    taskStatus: taskStatus || null,
  };
};
