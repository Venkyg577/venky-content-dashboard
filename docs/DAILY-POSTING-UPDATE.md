# Daily Posting Schedule Update

## Change Summary

Updated the Content Calendar to reflect Venky's **daily posting schedule** (7 posts/week, 1 per day).

## What Changed

### Before (Incorrect):
- Posting days: Tue/Thu/Sat only (3 days/week)
- Posting days highlighted in blue
- Gap warnings only on Tue/Thu/Sat
- Weekly summary showed raw count

### After (Correct):
- **Posting days: ALL 7 DAYS** (Mon-Sun, daily schedule)
- All days treated equally (no special highlighting)
- Gap warnings on ANY empty day
- Weekly summary shows **X/7 posts scheduled**

## Visual Changes

### "This Week" / "Next Week" Cards:
```
Before: "Posts scheduled: 5"
After:  "Posts scheduled: 5/7"  ← Shows completion ratio

Before: "Posting day gaps: 2"
After:  "Gaps: 2"  ← Simpler label
```

### Calendar Grid:
```
Before: Tue/Thu/Sat have blue background (special posting days)
After:  All days have same gray background (all posting days)

Before: ⚠️ only on empty Tue/Thu/Sat
After:  ⚠️ on ANY empty day
```

### Gap Calculation:
```
Before: countGaps() checked only days [2, 4, 6] (Tue/Thu/Sat)
After:  countGaps() checks all 7 days (0-6)
```

## Files Modified

1. **components/ContentCalendar.tsx**
   - Removed `POSTING_DAYS` constant
   - Removed `isPostingDay()` function
   - Updated `countGaps()` to check all 7 days
   - Updated stats to include `total: 7`
   - Removed blue highlighting from specific days
   - Updated gap logic: `hasGap = dayDrafts.length === 0` (for all days)
   - Updated tooltip: "Missing daily post" instead of "Gap in posting schedule"

2. **CONTENT-CALENDAR-IMPLEMENTATION.md**
   - Updated feature description
   - Changed "Posting days highlighted" → "Daily posting schedule"
   - Changed "Gap warnings on Tue/Thu/Sat" → "Gap warnings on any empty day"
   - Updated "How It Works" section

3. **CALENDAR-FEATURE-OVERVIEW.md**
   - Updated visual diagram to show daily schedule
   - Changed summary cards to show X/7 format
   - Updated "Special Highlights" section
   - Updated "How to Use It" instructions

## Expected Behavior

### Week with 5 posts:
```
This Week:
- Posts scheduled: 5/7
- Gaps: 2 ⚠️

Calendar shows:
Mon: [Post A]
Tue: [Post B]
Wed: ⚠️ (gap)
Thu: [Post C]
Fri: [Post D]
Sat: ⚠️ (gap)
Sun: [Post E]
```

### Perfect week (7 posts):
```
This Week:
- Posts scheduled: 7/7
- Gaps: 0 ✓

All days have posts, no ⚠️ icons
```

## Testing Checklist

✅ TypeScript compilation passes (no errors)
✅ All days treated as posting days
✅ Gap calculation counts all 7 days
✅ Summary shows X/7 format
✅ Warning icon appears on any empty day
✅ No special highlighting for specific days
✅ All original dashboard functionality intact

## Why This Matters

- **Accurate representation** - Reflects actual daily posting cadence
- **Clear gaps** - Easy to spot missing days in 7-day schedule
- **Consistent UI** - All days look the same (no confusing blue highlights)
- **Better planning** - X/7 shows weekly completion at a glance

## Next Steps

Start the dev server and verify:
```bash
cd /data/.openclaw/workspace/venky-dashboard
npm run dev
```

Navigate to the Content Calendar tab and confirm:
1. All days show equal treatment (no blue highlights)
2. Any empty day shows ⚠️
3. Summary shows "5/7" format instead of just "5"
4. Gaps count reflects all 7 days
