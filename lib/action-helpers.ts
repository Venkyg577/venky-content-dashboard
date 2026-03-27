/**
 * Helper functions for topic/draft actions
 * Defines which buttons show based on status
 */

export const TopicActionStatus = {
  PENDING: 'pending',      // ⏳ In progress (no buttons)
  APPROVED: 'approved',    // ✅ Ready for review (Approve, Reject, Archive)
  REVISION: 'revision',    // 📝 Feedback given, re-doing (no buttons)
  REJECTED: 'rejected',    // ✗ Discarded
  ARCHIVED: 'archived',    // 🗂 Hidden but kept
} as const;

export const DraftActionStatus = {
  PENDING: 'pending',      // ⏳ Writing in progress
  APPROVED: 'approved',    // ✅ Ready (Approve, Revise, Reject, Archive)
  REVISION: 'revision',    // 📝 Feedback given, re-writing
  REJECTED: 'rejected',    // ✗ Discarded
  ARCHIVED: 'archived',    // 🗂 Hidden
} as const;

/**
 * Topic action visibility
 */
export const getTopicActions = (stage: string, status: string) => {
  // Scouted topics with pending status = ready for user approval (show buttons)
  // Researched topics with pending status = Owl is analyzing (no buttons)
  // Researched topics with approved status = ready for user approval (show buttons)
  
  const isScouted = stage === 'scouted';
  const isResearched = stage === 'researched';
  
  const isInProgress = status === TopicActionStatus.PENDING && isResearched; // Only "in progress" if researched+pending
  const isReady = (isScouted && status === TopicActionStatus.PENDING) || (isResearched && status === TopicActionStatus.APPROVED);
  const isRevising = status === TopicActionStatus.REVISION;

  return {
    showApprove: isReady,
    showReject: isReady,
    showRevise: false,
    showArchive: !isInProgress && status !== 'archived',
    statusLabel: isInProgress ? '⏳ In Progress' : isRevising ? '📝 Revising' : isReady ? '✅ Ready to Review' : '',
    isActionable: isReady,
  };
};

/**
 * Draft action visibility
 */
export const getDraftActions = (stage: string, status: string) => {
  const isInProgress = status === DraftActionStatus.PENDING;
  const isReady = status === DraftActionStatus.APPROVED;
  const isRevising = status === DraftActionStatus.REVISION;

  return {
    showApprove: isReady,
    showReject: isReady,
    showRevise: isReady && (stage === 'drafted' || stage === 'ready_to_post'),
    showArchive: status !== 'archived', // Always show Archive (can reject in-progress too)
    statusLabel: isInProgress ? '⏳ Writing' : isRevising ? '📝 Revising' : isReady ? '✅ Ready to Review' : '',
    isActionable: isReady,
  };
};

/**
 * Get agent name from stage/context
 */
export const getAgentInProgress = (stage: string, status: string): string => {
  if (status !== TopicActionStatus.PENDING) return '';
  
  switch (stage) {
    case 'researched':
      return 'Owl 🔬';
    case 'drafted':
      return 'Bee 🐝';
    default:
      return 'Agent';
  }
};

/**
 * Get agent name from draft stage
 */
export const getDraftAgentInProgress = (stage: string, status: string): string => {
  if (status !== DraftActionStatus.PENDING) return '';
  
  switch (stage) {
    case 'drafted':
      return 'Bee 🐝';
    default:
      return 'Crane 🏗️';
  }
};
