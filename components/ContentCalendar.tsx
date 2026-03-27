'use client';

import { useMemo } from 'react';

type Draft = {
  id: string;
  topic: string;
  draft_type: 'deep-dive' | 'commentary' | 'quick-tip' | 'hot-take' | 'poll' | 'rewrite';
  target_publish_date: string;
  word_count: number | null;
  pick_recommended: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'published' | 'revision';
};

type Props = {
  drafts: Draft[];
};

const STATUS_STYLES = {
  pending: 'bg-yellow-100 border-yellow-300 text-yellow-800',
  approved: 'bg-green-100 border-green-300 text-green-800',
  published: 'bg-blue-100 border-blue-300 text-blue-800',
  rejected: 'bg-red-100 border-red-300 text-red-800 line-through',
  revision: 'bg-orange-100 border-orange-300 text-orange-800',
};

const TYPE_TAGS = {
  'deep-dive': 'bg-purple-500 text-white',
  'commentary': 'bg-blue-500 text-white',
  'quick-tip': 'bg-green-500 text-white',
  'hot-take': 'bg-red-500 text-white',
  'poll': 'bg-orange-500 text-white',
  'rewrite': 'bg-gray-500 text-white',
};

const TYPE_LABELS = {
  'deep-dive': 'Deep Dive',
  'commentary': 'Commentary',
  'quick-tip': 'Quick Tip',
  'hot-take': 'Hot Take',
  'poll': 'Poll',
  'rewrite': 'Rewrite',
};

export function ContentCalendar({ drafts }: Props) {
  const { weeks, thisWeekStats, nextWeekStats, monthTypeDist } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Generate 3 weeks starting from Monday of current week
    const startOfWeek = new Date(today);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday
    startOfWeek.setDate(startOfWeek.getDate() + diff);

    const weeks = [];
    for (let weekIdx = 0; weekIdx < 3; weekIdx++) {
      const days = [];
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + weekIdx * 7 + dayIdx);
        days.push(date);
      }
      weeks.push(days);
    }

    // This Week stats
    const thisWeekEnd = new Date(startOfWeek);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);
    const thisWeekDrafts = drafts.filter((d) => {
      const dDate = new Date(d.target_publish_date);
      return dDate >= startOfWeek && dDate <= thisWeekEnd;
    });

    // Next Week stats
    const nextWeekStart = new Date(startOfWeek);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
    const nextWeekDrafts = drafts.filter((d) => {
      const dDate = new Date(d.target_publish_date);
      return dDate >= nextWeekStart && dDate <= nextWeekEnd;
    });

    // Count gaps (all 7 days are posting days)
    const countGaps = (weekDrafts: Draft[], weekStart: Date) => {
      let gaps = 0;
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const checkDate = new Date(weekStart);
        checkDate.setDate(checkDate.getDate() + dayOffset);
        const dateKey = formatDate(checkDate);
        const hasDrafts = weekDrafts.some((d) => d.target_publish_date === dateKey);
        if (!hasDrafts) gaps++;
      }
      return gaps;
    };

    const thisWeekStats = {
      scheduled: thisWeekDrafts.length,
      total: 7,
      approved: thisWeekDrafts.filter((d) => d.status === 'approved').length,
      gaps: countGaps(thisWeekDrafts, startOfWeek),
    };

    const nextWeekStats = {
      scheduled: nextWeekDrafts.length,
      total: 7,
      approved: nextWeekDrafts.filter((d) => d.status === 'approved').length,
      gaps: countGaps(nextWeekDrafts, nextWeekStart),
    };

    // Month type distribution
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const monthDrafts = drafts.filter((d) => {
      const dDate = new Date(d.target_publish_date);
      return dDate >= monthStart && dDate <= monthEnd;
    });

    const typeCounts: Record<string, number> = {};
    monthDrafts.forEach((d) => {
      typeCounts[d.draft_type] = (typeCounts[d.draft_type] || 0) + 1;
    });

    const monthTypeDist = Object.entries(typeCounts).map(([type, count]) => ({
      type: type as Draft['draft_type'],
      count,
    }));

    return { weeks, thisWeekStats, nextWeekStats, monthTypeDist };
  }, [drafts]);

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDayName = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const getDraftsForDate = (date: Date) => {
    const dateKey = formatDate(date);
    return drafts.filter((d) => d.target_publish_date === dateKey);
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-lg mb-3">📊 This Week</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Posts scheduled:</span>
              <span className="font-semibold">{thisWeekStats.scheduled}/{thisWeekStats.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Posts approved:</span>
              <span className="font-semibold text-green-600">{thisWeekStats.approved}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Gaps:</span>
              <span className={`font-semibold ${thisWeekStats.gaps > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {thisWeekStats.gaps}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-lg mb-3">📅 Next Week</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Posts scheduled:</span>
              <span className="font-semibold">{nextWeekStats.scheduled}/{nextWeekStats.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Posts approved:</span>
              <span className="font-semibold text-green-600">{nextWeekStats.approved}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Gaps:</span>
              <span className={`font-semibold ${nextWeekStats.gaps > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {nextWeekStats.gaps}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content Mix This Month */}
      {monthTypeDist.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-lg mb-3">🎨 Content Mix This Month</h3>
          <div className="flex flex-wrap gap-3">
            {monthTypeDist.map(({ type, count }) => (
              <div key={type} className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${TYPE_TAGS[type]}`}>
                  {TYPE_LABELS[type]}
                </span>
                <span className="text-sm font-semibold text-gray-700">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3-Week Calendar */}
      <div className="space-y-8">
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="bg-white rounded-lg shadow p-4">
            <h3 className="font-bold text-lg mb-4">
              Week {weekIdx + 1}: {formatDate(week[0])} - {formatDate(week[6])}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
              {week.map((date, dayIdx) => {
                const dayName = getDayName(date);
                const dateKey = formatDate(date);
                const dayDrafts = getDraftsForDate(date);
                const hasGap = dayDrafts.length === 0;

                return (
                  <div
                    key={dayIdx}
                    className="border rounded p-2 min-h-[120px] bg-gray-50 border-gray-200"
                  >
                    <div className="font-semibold text-xs mb-1 flex justify-between items-start">
                      <span className="text-gray-700">
                        {dayName.slice(0, 3)}
                      </span>
                      {hasGap && <span className="text-red-600 text-lg" title="Missing daily post">⚠️</span>}
                    </div>
                    <div className="text-xs text-gray-500 mb-2">{date.getDate()}</div>

                    <div className="space-y-1">
                      {dayDrafts.map((draft) => (
                        <div
                          key={draft.id}
                          className={`border rounded p-1.5 text-xs ${STATUS_STYLES[draft.status]}`}
                        >
                          <div className={`font-medium mb-1 ${draft.status === 'rejected' ? 'line-through' : ''}`}>
                            {draft.topic.length > 40 ? draft.topic.slice(0, 40) + '...' : draft.topic}
                          </div>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_TAGS[draft.draft_type]}`}>
                            {TYPE_LABELS[draft.draft_type]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-sm mb-3">Legend</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-semibold mb-2">Post Types:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <span key={key} className={`px-2 py-1 rounded ${TYPE_TAGS[key as Draft['draft_type']]}`}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold mb-2">Status:</p>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-1 rounded border ${STATUS_STYLES.pending}`}>Pending</span>
              <span className={`px-2 py-1 rounded border ${STATUS_STYLES.approved}`}>Approved</span>
              <span className={`px-2 py-1 rounded border ${STATUS_STYLES.published}`}>Published</span>
              <span className={`px-2 py-1 rounded border ${STATUS_STYLES.rejected}`}>Rejected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
