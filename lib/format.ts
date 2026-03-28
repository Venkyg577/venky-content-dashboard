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

// Aggressively strip agent thinking/process narration from any text
const stripThinking = (text: string): string => {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.filter(line => {
    const t = line.trim();
    if (!t) return true; // keep blank lines
    // Kill any line that sounds like agent narration
    if (/^(let me |i'll |i will |now let me |now i |while waiting|the fetch|i need to|i should|i'm going to|looking at|searching for|fetching|checking|reading |processing)/i.test(t)) return false;
    if (/^(first,? let|next,? let|finally,? let|let's |alright|ok,? |sure,? |great,? |good!|excellent!|perfect)/i.test(t)) return false;
    if (/^(waiting for|polling|retrying|attempting|running|executing|calling|invoking)/i.test(t)) return false;
    if (/^(reddit content|let me try|let me also|let me compile|let me wait|let me check|let me search|let me fetch|let me use)/i.test(t)) return false;
    if (/^(now let me|i found|from my earlier|the (search|scrape|request|call) (didn't|failed|returned|timed out))/i.test(t)) return false;
    // Meta lines from agent summaries
    if (/^(word count|summary|topic|approach|voice|structure|saved to|supabase|draft written|ready for venky)/i.test(t)) return false;
    // Repeated colon-terminated labels that are agent meta
    if (/^(status|result|output|task|ref_id|payload)\s*:/i.test(t)) return false;
    return true;
  }).join('\n')
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// Parse structured research brief into sections, stripping agent thinking/process narration
export const parseResearchBrief = (text: string): { sections: { title: string; content: string }[]; raw: string } => {
  if (!text) return { sections: [], raw: '' };

  const cleaned = stripThinking(text);

  // Parse markdown ## sections
  const sectionRegex = /^##\s+(.+)$/gm;
  const sections: { title: string; content: string }[] = [];
  let match;
  const matches: { title: string; index: number }[] = [];

  while ((match = sectionRegex.exec(cleaned)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index + match[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? cleaned.lastIndexOf('##', matches[i + 1].index) : cleaned.length;
    const content = cleaned.substring(start, end).trim();
    if (content) {
      sections.push({ title: matches[i].title, content });
    }
  }

  // If no sections found, treat the whole thing as one section
  if (sections.length === 0 && cleaned.length > 0) {
    sections.push({ title: 'Research Brief', content: cleaned });
  }

  return { sections, raw: cleaned };
};

// Extract the actual post/draft content from agent output that contains thinking narration
export const extractDraftContent = (text: string): string => {
  if (!text) return '';

  // First strip all thinking lines
  const cleaned = stripThinking(text);

  // For drafts, find the longest contiguous block of real content
  // (the actual post is usually the biggest chunk between meta/narration)
  const blocks = cleaned.split(/\n{3,}/);
  let best = '';
  for (const block of blocks) {
    const trimmed = block.trim();
    // Skip blocks that are just meta labels or very short
    if (trimmed.length < 50) continue;
    if (/^(the post|here'?s the|here is the)/i.test(trimmed)) continue;
    if (trimmed.length > best.length) {
      best = trimmed;
    }
  }

  return best || cleaned;
};

// Detect if content still has agent thinking/process narration
export const hasThinkingContent = (text: string): boolean => {
  if (!text) return false;
  const indicators = [
    'Let me ', "I'll ", 'Now let me ', 'Let me fetch', 'Let me search',
    'The fetch didn\'t', 'Excellent!', 'Good!', 'Reddit content is being blocked',
    'Let me try', 'Let me compile', 'Let me also', 'Let me wait',
    'I found', 'From my earlier', 'Let me check',
  ];
  const count = indicators.filter(i => text.includes(i)).length;
  return count >= 2;
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
