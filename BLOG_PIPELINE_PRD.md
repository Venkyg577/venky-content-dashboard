# Blog Pipeline PRD
**Version**: 1.0  
**Last Updated**: April 7, 2026  
**Owner**: Venky  

---

## 1. Overview

The blog pipeline is a **content production workflow** that discovers EdTech topics, researches them deeply, creates blog drafts, and publishes to the content dashboard. It's powered by AI agents working in sequence, with human review gates at critical points.

**Goal**: Produce 2-4 high-quality blog posts/week with complete, verified research and well-written content.

---

## 2. Core Agents & Roles

### 2.1 Eagle (Scout)
**Role**: Topic discovery and validation  
**Input**: EdTech news sources, trend feeds, user queries  
**Output**: `topics` table entries with initial metadata  
**Workflow**:
- Scan sources for EdTech topics
- Check for duplicates (canonical_id dedup)
- Extract: title, source, initial angle
- Assign: channel (blog), stage (scouted)
- Set: status = `scouted`, created_at

**Quality Gate**:
- Title must be unique (canonical_id check)
- Source must be valid URL
- Angle must be 1-2 sentences max
- Topic not already in researched/drafted/published state

**Output Format** (topics table):
```json
{
  "id": "uuid",
  "title": "Are Your Training Results Actually Improving Production?",
  "source": "eLearning Industry (April 2, 2026)",
  "summary": null,
  "stage": "scouted",
  "status": "scouted",
  "channel": "blog",
  "canonical_id": "sha256(title + source)",
  "discovered_at": "2026-04-02T10:00:00Z"
}
```

---

### 2.2 Stork (Researcher)
**Role**: Deep research and verdict on publishability  
**Trigger**: Topics in `researched` stage with `status = pending`  
**Input**: Topic title + source  
**Output**: `topics.summary` field with research brief + verdict  
**Workflow**:
1. Fetch full article/source material
2. Extract key insights, audience, themes, business value
3. Write research brief: 5000-8000 characters (full, untruncated)
4. Add verdict section:
   - **ACCEPT**: Ready to draft immediately
   - **CONDITIONAL ACCEPT**: Ready if reframed (specify how)
   - **REJECT**: Explain why (not EdTech, wrong angle, etc.)
5. Update topic.summary with full brief
6. Update topic.status:
   - ACCEPT → `researched`
   - CONDITIONAL ACCEPT → `researched` (with note in summary)
   - REJECT → `rejected`

**Quality Gate - MANDATORY**:
- Research brief must be 5000+ characters (NO truncation)
- Summary field must be TEXT type (handles 50KB+ without loss)
- If brief > 5000 chars, verify it's stored completely
- Verdict must be clear and specific

**What Stork Researches**:
- Who is the actual audience (builders, decision-makers, educators)?
- Business value: ROI, problem solved, market impact
- Competitive/technical landscape
- Actionable insights for builders
- Any controversial or missing context

**Research Brief Template**:
```
[Source & Context]
— eLearning Industry, April 2, 2026
— K-12 EdTech focus

[Key Findings]
1. [Finding]
2. [Finding]

[Audience for Blog Post]
Target: [Primary audience]
Why: [Why they care]

[Suggested Angle]
"[Reframed title]"
Why: [Why this angle works]

[Business Value]
ROI: [For builders/companies]
Scale: [Market size/impact]

[Verdict]
## ACCEPT / CONDITIONAL ACCEPT / REJECT
[Detailed reasoning]

---OR---

## CONDITIONAL ACCEPT (requires reframing)
Current angle: [What's wrong]
Suggested reframe: "[New angle]"
Why: [Why reframing helps]

---OR---

## REJECT
Reason: [Specific reason]
Not suitable because: [Details]
```

**Output Format** (updates topics table):
```json
{
  "summary": "[Full research brief as above - 5000+ chars, NO TRUNCATION]",
  "stage": "researched",
  "status": "researched"
}
```

---

### 2.3 Crane (Drafter)
**Role**: Write complete blog post draft  
**Trigger**: Topics in `drafted` stage with `status = pending`  
**Input**: Topic + full research brief from Stork  
**Output**: `drafts` table entry with complete blog post content  
**Workflow**:
1. Read FULL research brief from `topics.summary`
2. Extract: target audience, business value, suggested angle, key findings
3. Write blog post (1500+ words minimum for blog):
   - Introduction: Hook + what reader will learn
   - Section 1-3: Deep dive on topic with examples
   - Implications: What builders should do
   - Conclusion: Recap + call-to-action
4. Format: GitHub-flavored Markdown
5. Save to `drafts` table with content
6. Mark draft status = `drafted`

**Quality Gate - MANDATORY**:
- Minimum 1500 words (validate via word count)
- Must have all sections (intro, body, conclusion)
- Must not be stub/placeholder content
- Content must be original (not copy-paste from source)
- If research brief was CONDITIONAL ACCEPT, **follow the reframing** exactly

**If Reframing Required**:
- Stork's brief says: "Suggested reframe: 'Building EdTech Products That Survive the Consolidation Wave...'"
- Crane MUST write the blog with that angle, not the original title
- If reframing recommendation is incomplete, Crane should return with "incomplete_research" and mark draft as failed

**Output Format** (drafts table):
```json
{
  "id": "uuid",
  "topic": "Are Your Training Results Actually Improving Production?",
  "channel": "blog",
  "stage": "drafted",
  "status": "drafted",
  "content": "[Full blog post markdown - 1500+ words]",
  "word_count": 1850,
  "created_at": "2026-04-06T14:30:00Z"
}
```

---

### 2.4 Pelican (Publisher)
**Role**: Final review and publication  
**Trigger**: Drafts in `ready_to_post` stage  
**Input**: Complete blog draft  
**Output**: Published post on dashboard  
**Workflow**:
1. Receive draft marked ready_to_post
2. Final visual/editorial review
3. Publish to dashboard
4. Archive intermediate drafts
5. Mark topic as `published`

---

## 3. Data Model

### 3.1 Topics Table

**Purpose**: Central registry of potential blog topics  
**Key Fields**:
```sql
id: UUID PRIMARY KEY
title: VARCHAR(255) UNIQUE  
source: VARCHAR(500) — URL or publication name
summary: TEXT — Research brief (5000-50000 chars, NO VARCHAR limit)
stage: ENUM (scouted | researching | researched | revise_needed | drafting | drafted | revise_needed | ready_to_post | published | archived)
status: ENUM (scouted | pending | researched | rejected | archived | revise_needed | revising)
channel: ENUM (blog | linkedin | carousel)
canonical_id: VARCHAR(64) — SHA256(title + source), used for dedup
discovered_at: TIMESTAMP
researched_at: TIMESTAMP (when Stork completes)
revision_count: INT DEFAULT 0 — Track how many revisions requested
revised_at: TIMESTAMP — Last time human requested revision
```

**Invariants**:
- A topic can only be in ONE stage at a time
- canonical_id must be unique (dedup protection)
- summary field is TEXT (not VARCHAR) to support 5000-8000 char briefs without truncation
- If status = `revise_needed`, stage should stay in current stage (researched/drafted) but show "awaiting revision" in UI

### 3.2 Drafts Table

**Purpose**: Working copies of blog posts  
**Key Fields**:
```sql
id: UUID PRIMARY KEY
topic: VARCHAR(255) — Foreign key to topics.title
channel: ENUM (blog | linkedin | carousel)
stage: ENUM (researched | drafted | revise_needed | ready_to_post | published | archived)
status: ENUM (pending | approved | rejected | archived | revise_needed | revising)
content: TEXT — Full blog post markdown
word_count: INT — Cached word count for validation
version: INT DEFAULT 1 — Track revisions (v1, v2, v3)
created_at: TIMESTAMP
revised_at: TIMESTAMP
```

**Invariants**:
- Minimum 1500 words for blog posts (enforced in API)
- Cannot approve if content is stub/incomplete
- If topic has REJECT verdict, cannot create draft

### 3.3 Feedback Table

**Purpose**: Track human feedback and revisions  
**Key Fields**:
```sql
id: UUID PRIMARY KEY
item_id: UUID — Topic or Draft ID
item_type: ENUM (topic | draft)
action: ENUM (revision | approve | reject | archive)
comment: TEXT — User feedback
created_at: TIMESTAMP
```

### 3.4 Agent Tasks Table

**Purpose**: Track background agent work  
**Key Fields**:
```sql
id: UUID PRIMARY KEY
ref_id: UUID — Topic or Draft ID
agent: VARCHAR(50) — "eagle", "stork", "crane", "pelican"
status: ENUM (pending | running | claimed | completed | failed)
created_at: TIMESTAMP
completed_at: TIMESTAMP
error_message: TEXT (if failed)
```

---

## 4. Pipeline State Machine

### 4.1 Happy Path (Topic → Published)

```
[1. EAGLE - SCOUT]
Input: News sources, feeds, user suggestions
Output: Topics with canonical_id
Stage: scouted → researching

[2. STORK - RESEARCH]
Input: Topic + source
Process: Deep research, verdict
Output: topics.summary (5000+ chars, full text)
Verdicts:
  - ACCEPT → stage: researched, status: researched
  - CONDITIONAL ACCEPT → stage: researched, status: researched (with reframe note)
  - REJECT → status: rejected (stop here)

[3. HUMAN REVIEW - RESEARCH]
Decision point:
  - ✅ Approve → stage: drafting, status: pending (Crane can start)
  - 🔄 Revise → status: revise_needed (Stork re-researches)
  - ❌ Reject → status: rejected

[4. CRANE - DRAFT]
Input: topics.summary (FULL, not truncated)
Process: Write 1500+ word blog post
Output: drafts with content
Stage: drafted, status: drafted

[5. HUMAN REVIEW - DRAFT]
Decision point:
  - ✅ Approve → stage: ready_to_post, status: pending (ready for Pelican)
  - 🔄 Revise → status: revise_needed (Crane rewrites)
  - ❌ Reject → status: rejected

[6. PELICAN - PUBLISH]
Input: Draft marked ready_to_post
Output: Published on dashboard
Final: stage: published, status: published
```

### 4.2 Revision Loop

When human clicks "Revise" on a topic or draft:
1. Move status to `revise_needed` (stage stays the same)
2. Create feedback record with action = "revision"
3. Clear agent task so agents know to skip it
4. Notify relevant agent (Stork or Crane) to re-work
5. When re-work completes, move back to previous status

---

## 5. Quality Gates & Validation

### 5.1 At Research (Stork → Review)

**MUST PASS**:
- [ ] Summary field is TEXT type (not VARCHAR)
- [ ] Summary length ≥ 5000 characters (full brief, no truncation)
- [ ] Verdict is clear: ACCEPT or CONDITIONAL ACCEPT or REJECT
- [ ] If CONDITIONAL ACCEPT, reframe suggestion is complete and actionable
- [ ] Research addresses: audience, business value, angle, key insights

**Validation Code**:
```javascript
if (summary.length < 5000) {
  return { error: "Research brief incomplete, must be 5000+ chars" };
}
if (!summary.includes("##") || !summary.match(/ACCEPT|REJECT/i)) {
  return { error: "Missing verdict section" };
}
if (summary.includes("CONDITIONAL ACCEPT") && !summary.includes("Suggested reframe")) {
  return { error: "CONDITIONAL ACCEPT missing reframe suggestion" };
}
```

### 5.2 At Draft (Crane → Review)

**MUST PASS**:
- [ ] Content length ≥ 1500 words (blog minimum)
- [ ] Content is not stub/placeholder
- [ ] Has: introduction, body sections, conclusion
- [ ] If research was CONDITIONAL ACCEPT, blog follows suggested reframe
- [ ] Markdown is valid and renders correctly

**Validation Code**:
```javascript
const wordCount = content.trim().split(/\s+/).length;
if (wordCount < 1500) {
  return { error: `Blog too short: ${wordCount} words (need 1500+)` };
}
if (content.length < 200) {
  return { error: "Content appears to be stub/placeholder" };
}
```

### 5.3 Deduplication (Canonical ID)

**When**: At scout stage (Eagle creates topic)  
**Check**: Is canonical_id already in DB?
- If YES and previous topic is `scouted/researched/drafted` → reject as duplicate
- If YES and previous topic is `published` → ok, it's a new angle on old topic
- If YES and previous topic is `archived/rejected` → ok, can try again

**Canonical ID Generation**:
```javascript
const crypto = require('crypto');
function generateCanonicalId(title, source) {
  const combined = `${title.toLowerCase().trim()}|${source.toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}
```

---

## 6. Agent Configuration Files (AGENTS.md)

Each agent has an AGENTS.md that describes:
- Task: What it does
- Input: What data it receives
- Output: What it produces
- Rules: Quality gates and constraints
- Prompts: System prompts for execution

### 6.1 Eagle AGENTS.md
```
# Eagle (Scout)

## Task
Discover EdTech topics from news sources and feeds.
Focus: Trends relevant to product builders, not educators.

## Input
- EdTech news feeds (RSS, APIs)
- User suggestions
- Trend analysis

## Output
Topics table with:
- title: 10-15 words, specific and actionable
- source: Full URL or publication name
- stage: "scouted"
- status: "scouted"
- canonical_id: sha256(title + source)

## Quality Gates
- Must not duplicate (check canonical_id)
- Must be about EdTech (not general tech, education policy)
- Source must be credible (no spam blogs)
- Title must suggest specific insight (not generic)

## Prompts
Focus on topics that answer: "How can builders/founders improve their EdTech product?"
Skip: generic "what is X", legislative/policy debates, historical retrospectives
```

### 6.2 Stork AGENTS.md
```
# Stork (Researcher)

## Task
Deep research on topics. Produce 5000-8000 character research brief with verdict.

## Input
Topic title + source URL

## Output
topics.summary: Research brief with verdict
- ACCEPT: Topic is ready to draft
- CONDITIONAL ACCEPT: Topic needs angle reframe before drafting
- REJECT: Not suitable for blog (specify why)

## Quality Gates - CRITICAL
- Summary MUST be stored as TEXT field (handles 50KB+)
- Summary MUST be 5000-8000 characters (NO TRUNCATION)
- Verify stored length matches written length
- If brief > 5000 chars, double-check database didn't truncate

## Verdict Rules
- CONDITIONAL ACCEPT must include "Suggested reframe: [exact title and why]"
- REJECT must explain why (wrong audience, no builders interest, etc.)
- Research must address: audience, business value, key insights, buildable angle

## Prompts
Research as if writing for EdTech product builders.
Find: ROI angle, competitive landscape, actionable insights.
Avoid: General education commentary, policy debate, historical surveys.

## If Brief Gets Truncated
- This is a critical bug
- Check topics.summary field is TEXT type
- If VARCHAR, migrate to TEXT
- Re-run Stork to write brief again
```

### 6.3 Crane AGENTS.md
```
# Crane (Drafter)

## Task
Write 1500+ word blog post from research brief.

## Input
- Topic title
- topics.summary (FULL research brief)
- Target audience from research
- Suggested angle/reframe (if CONDITIONAL ACCEPT)

## Output
drafts table entry:
- content: Full blog post (1500+ words, markdown)
- word_count: Calculated word count
- stage: "drafted"
- status: "drafted"

## Quality Gates - CRITICAL
- Minimum 1500 words (validate before saving)
- Must have sections: intro, body (2-3), conclusion
- If research says CONDITIONAL ACCEPT with reframe, MUST use that angle
- If reframe suggestion is incomplete, FAIL and mark draft as incomplete

## Reframing Rules
If Stork's brief says:
  "Suggested reframe: 'Building EdTech Products That Survive the Consolidation Wave...'"
Then Crane MUST write blog with that EXACT angle, not the original title.

## Incomplete Research
If you receive a CONDITIONAL ACCEPT where the reframe suggestion is cut off:
- Set draft status = "failed"
- Log error: "Research brief incomplete - cannot reframe"
- Mark for Stork to re-research

## Prompts
Write for product builders (founders, CTOs, product managers).
Start with problem/opportunity.
Provide actionable insights and examples.
Make business case clear (why should they care?).
```

### 6.4 Pelican AGENTS.md
```
# Pelican (Publisher)

## Task
Review and publish final drafts.

## Input
Drafts in "ready_to_post" stage

## Output
Published blog post on dashboard

## Quality Check (Final Review)
- Does content match original research intent?
- Are there any formatting issues?
- Is markdown rendering correctly?
- Is headline compelling?

## No Rewrites at This Stage
If content needs rewriting, REJECT and send back to Crane.
Pelican is for publishing, not editing.
```

---

## 7. API Endpoints

### Research Approval
```
POST /approve-topic
Input: { topicId, feedback? }
- Check: Is topic.summary 5000+ chars?
- Check: Does it have a clear verdict?
- Move: stage → "drafting", status → "pending"
- OR if CONDITIONAL ACCEPT: Add note, still → "drafting"
```

### Draft Approval
```
POST /approve-draft
Input: { draftId }
- Check: word_count >= 1500
- Check: content not stub/placeholder
- Check: If topic was CONDITIONAL ACCEPT, does draft follow reframe?
- Move: stage → "ready_to_post", status → "pending"
```

### Revision Request
```
POST /revise-{topic|draft}
Input: { itemId, feedback }
- Set: status → "revise_needed"
- Create: feedback record
- Clear: associated agent tasks
- Notify: Slack #aimy channel
```

### Rejection
```
POST /reject-{topic|draft}
Input: { itemId, reason }
- Set: status → "rejected"
- Create: feedback record
- Clear: associated agent tasks
```

---

## 8. Data Integrity Rules

### No Topic in Multiple Stages
**Invariant**: A topic can only be in ONE stage at a time.
**Enforcement**: 
- On approve: archive other draft versions of same topic
- On reject: set status to rejected, but keep in original stage
- Dedup cleanup script: runs hourly, consolidates duplicates

### No Truncated Research Briefs
**Invariant**: topics.summary must be stored in full (5000-8000 chars)
**Enforcement**:
- API validates: len(summary) >= 5000 before saving
- Database: summary field MUST be TEXT type (tested on save)
- Cleanup script: checks for truncated briefs (length < 4500)

### Research Completeness
**Invariant**: If topic.stage = "drafting", its research brief must be complete
**Enforcement**:
- Crane validates: summary length >= 5000 before reading
- If incomplete, Crane fails with error: "Research brief incomplete"
- Dashboard shows: [refresh icon] "Research needs completion"

---

## 9. Workflow Rules

### When Topic is Marked for Revision
1. Status changes to `revise_needed`
2. Stage stays current (researched or drafted)
3. UI shows "Awaiting Revision" badge
4. Remove "Approve" button, show only status
5. Clear associated agent tasks
6. Notify Slack: "🔄 Revision needed: [Topic] — [Feedback]"

### When Topic is Ready for Next Agent
1. Status = "pending"
2. Stage = target stage for next agent
3. Unlock agent tasks
4. Agent picks up automatically
5. Dashboard card moves to next column
6. Show agent name with status badge

### When Topic is Rejected
1. Status = "rejected"
2. Stage stays current (scouted/researched/drafted)
3. UI shows red "Rejected" badge
4. Card moves to Archived column
5. No further agent work
6. Searchable via "Rejected" filter

---

## 10. Success Metrics

- **Topic → Published**: < 5 days average
- **Research Quality**: 100% of briefs 5000+ chars (no truncation)
- **Draft Quality**: 100% of drafts 1500+ words
- **Approval Rate**: 70%+ (after revisions)
- **Revision Loop**: Max 2 revisions per topic before rejection
- **Publication Rate**: 2-4 posts/week

---

## 11. Open Questions / Future

1. Should there be a "schedule" workflow (publish on specific date)?
2. Should LinkedIn/Carousel use same pipeline or separate?
3. What happens to topics older than 30 days with no progress?
4. Should Stork track sentiment/controversy and flag sensitive topics?

