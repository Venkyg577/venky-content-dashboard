export const ago = (ts: number) => {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  return h < 24 ? h + 'h ago' : Math.floor(h / 24) + 'd ago';
};

export const fitColor = (fit: string) =>
  /very\s*strong|strong|high/i.test(fit) ? '#16a34a' : /medium/i.test(fit) ? '#ea580c' : '#6b7280';

export const copyToClipboard = (text: string, showToast: (msg: string) => void) => {
  const clean = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
  navigator.clipboard.writeText(clean).then(() => showToast('Copied!')).catch(() => showToast('Copy failed'));
};

export const renderMd = (text: string) => {
  if (!text) return '';
  return text
    .replace(/^### (.+)$/gm, '<h3 class="font-medium text-base mt-4 mb-1 text-[var(--charcoal)]">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-medium text-lg mt-5 mb-2 text-[var(--charcoal)]">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-medium text-xl mt-4 mb-2 text-[var(--charcoal)]">$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^>\s*(.+)$/gm, '<blockquote class="border-l-2 border-[var(--accent)]/30 pl-3 my-2 text-gray-500 italic">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-sm leading-relaxed">$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 text-sm leading-relaxed">$1</li>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" class="text-[var(--accent)] hover:opacity-80 underline transition-colors">$1</a>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/^---$/gm, '<hr class="my-3 border-gray-200"/>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
};

// ---- Research Brief Parser ----
// Strategy: WHITELIST good content sections by name, ignore everything else.
// Agent output is too unpredictable to blacklist — instead we extract only
// the named research sections we care about.

// Section names we want to keep (matched loosely)
const GOOD_SECTIONS: { pattern: RegExp; label: string }[] = [
  { pattern: /key (research )?(?:findings|highlights)/i, label: 'Key Findings' },
  { pattern: /ai content trap|problem|the .+ validated/i, label: 'Key Findings' },
  { pattern: /what ai should|should actually/i, label: 'What AI Should Do' },
  { pattern: /source|evidence/i, label: 'Sources & Evidence' },
  { pattern: /industry context|industry|context|landscape/i, label: 'Industry Context' },
  { pattern: /venky.?s (direct )?angle|angle/i, label: "Venky's Angle" },
  { pattern: /competitor/i, label: 'Competitor Landscape' },
  { pattern: /data highlight|key (data|stat)/i, label: 'Data Highlights' },
  { pattern: /post (angle|style)|recommended/i, label: 'Post Angles' },
  { pattern: /topic tier/i, label: 'Topic Tier' },
];

// Section names to REJECT (agent meta, not research)
const BAD_SECTIONS: RegExp[] = [
  /research (complete|deliverables?|status)/i,
  /supabase|update (in progress|status)/i,
  /three topics|topics researched/i,
  /full research brief saved/i,
  /completion summary/i,
];

// Is this line agent narration / junk?
const isJunkLine = (line: string): boolean => {
  const t = line.trim();
  if (!t) return false;
  // Agent thinking
  if (/^(let me |i'll |i will |now let me |now i[' ]|while waiting|i need to|i should|i'm going to)/i.test(t)) return true;
  if (/^(first,? let|next,? let|finally,? let|let's |alright|ok,? |sure,? |great,? |good!|excellent!|perfect)/i.test(t)) return true;
  if (/^(waiting for|polling|retrying|attempting|running|executing|calling|invoking)/i.test(t)) return true;
  if (/^(reddit content|let me try|let me also|let me compile|let me wait|let me check|let me search|let me fetch|let me use)/i.test(t)) return true;
  if (/^(now let me|i found|from my earlier|the (search|scrape|request|call) (didn't|failed|returned|timed out))/i.test(t)) return true;
  // File paths, IDs, status meta
  if (/^\/data\/\.openclaw\//i.test(t)) return true;
  if (/^(topic id|status|summary field|setting to|ref_id|payload|result|output)\s*:/i.test(t)) return true;
  if (/^(word count|saved to|supabase|draft written|ready for venky)/i.test(t)) return true;
  // Emoji status lines
  if (/^✅\s*(research complete|corporate training|authoring tool|ai content|topics researched)/i.test(t)) return true;
  // Numbered deliverables like "1. Full Research Brief Saved:"
  if (/^\d+\.\s*(full research brief|supabase update)/i.test(t)) return true;
  return false;
};

// Parse research brief: extract named sections, strip junk
export const parseResearchBrief = (text: string): { sections: { title: string; content: string }[]; raw: string } => {
  if (!text) return { sections: [], raw: '' };

  // Split text into header:content blocks. Headers can be:
  // "## Title", "**Title:**", "Title:" (bold or plain, at line start)
  const headerRegex = /^(?:#{1,3}\s+|\*\*)?(.+?)(?:\*\*)?:?\s*$/;
  const lines = text.split('\n');

  // Collect all sections with their content
  const rawSections: { header: string; lines: string[] }[] = [];
  let current: { header: string; lines: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers: "## Key Findings", "**Key Findings:**", "Key Findings:", "The AI Content Trap Validated:"
    const isHeader = (
      /^#{1,3}\s+/.test(trimmed) ||
      (/^\*\*[^*]+\*\*:?\s*$/.test(trimmed) && trimmed.length < 80) ||
      (/^[A-Z][^.!?]{5,60}:$/.test(trimmed))
    );

    if (isHeader) {
      const cleanHeader = trimmed.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '').replace(/:$/, '').trim();
      current = { header: cleanHeader, lines: [] };
      rawSections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
    // Lines before any header are discarded (usually narration)
  }

  // Now filter: keep only sections that match GOOD_SECTIONS, skip BAD_SECTIONS
  const sections: { title: string; content: string }[] = [];
  const seen = new Set<string>(); // deduplicate by label

  for (const sec of rawSections) {
    // Skip bad sections
    if (BAD_SECTIONS.some(p => p.test(sec.header))) continue;

    // Match to a good section
    const match = GOOD_SECTIONS.find(g => g.pattern.test(sec.header));
    const label = match?.label || null;

    // If it doesn't match any known good section, check if it has substantial content
    // (sub-sections under a good parent are ok, standalone unknown sections are skipped)
    if (!label) continue;
    if (seen.has(label)) continue; // skip duplicates (agent repeats entire output)

    // Clean the content lines: remove junk, keep substance
    const cleanLines = sec.lines.filter(l => !isJunkLine(l));
    const content = cleanLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    if (content.length > 20) {
      sections.push({ title: label, content });
      seen.add(label);
    }
  }

  // Build a clean raw version from extracted sections
  const raw = sections.map(s => `## ${s.title}\n${s.content}`).join('\n\n');

  // If nothing matched (unstructured output), do basic line-level cleanup as fallback
  if (sections.length === 0) {
    const fallback = lines.filter(l => !isJunkLine(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (fallback.length > 50) {
      sections.push({ title: 'Research Brief', content: fallback });
    }
    return { sections, raw: fallback };
  }

  return { sections, raw };
};

// Extract the actual post/draft content from agent output
export const extractDraftContent = (text: string): string => {
  if (!text) return '';

  // Strip junk lines, then find the longest contiguous content block
  const lines = text.split('\n');
  const cleaned = lines.filter(l => !isJunkLine(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Split into blocks, pick the longest one (the actual post)
  const blocks = cleaned.split(/\n{3,}/);
  let best = '';
  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.length < 50) continue;
    // Skip meta headers
    if (/^(the post|here'?s the|here is the|✅|research|topic|approach|structure)/i.test(trimmed)) continue;
    if (trimmed.length > best.length) best = trimmed;
  }

  return best || cleaned;
};

// Detect if content has agent thinking/process narration
export const hasThinkingContent = (text: string): boolean => {
  if (!text) return false;
  const lines = text.split('\n');
  const junkCount = lines.filter(l => isJunkLine(l)).length;
  return junkCount >= 3;
};

// Deduplicate text that's been repeated (agent writes same summary twice)
export const dedup = (text: string): string => {
  if (!text) return '';
  const half = Math.floor(text.length / 2);
  // Check if the second half is a near-exact repeat of the first
  const first = text.substring(0, half).trim();
  const second = text.substring(half).trim();
  // If >80% of second half appears in first half, it's a repeat
  if (first.length > 100 && second.length > 100) {
    const sample = second.substring(0, Math.min(200, second.length));
    if (first.includes(sample)) return first;
  }
  return text;
};

export const stripFrontmatter = (text: string): { body: string; meta: Record<string, string> } => {
  const meta: Record<string, string> = {};
  let body = text;
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (fmMatch) {
    fmMatch[1].split('\n').forEach(line => {
      const [k, ...v] = line.split(':');
      if (k && v.length) meta[k.trim()] = v.join(':').trim().replace(/^["']|["']$/g, '');
    });
    body = fmMatch[2];
  }
  return { body, meta };
};
