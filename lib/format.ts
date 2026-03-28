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

// Parse structured research brief into sections, stripping agent thinking/process narration
export const parseResearchBrief = (text: string): { sections: { title: string; content: string }[]; raw: string } => {
  if (!text) return { sections: [], raw: '' };

  // Strip thinking/process lines that agents leak into output
  const thinkingPatterns = [
    /^(Let me |I'll |I will |Now let me |While waiting|Let me check|Let me search|Let me fetch|The fetch didn't|I need to|I should|I'm going to|Looking at|Searching for|Fetching|Checking|Reading|Processing)/i,
    /^(Now I|First,? let me|Next,? let me|Finally,? let me|Let's |Alright|OK,? |Sure,? |Great,? )/i,
    /^(Waiting for|Polling|Retrying|Attempting|Running|Executing|Calling|Invoking)/i,
  ];

  const lines = text.split('\n');
  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim();
    return !thinkingPatterns.some(p => p.test(trimmed));
  });
  const cleaned = cleanedLines.join('\n').trim();

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

  // Strategy 1: Find content between double newline blocks that looks like a post
  // The actual post is usually the longest contiguous block of non-thinking text
  const thinkingPatterns = [
    /^(I'll |Let me |Now let me |Now I|While waiting|Let me |The fetch|I need to|I should|I'm going to)/i,
    /^(First,? let me|Next,? let me|Finally,? let me|Alright|Sure,? |Great,? )/i,
    /^(Waiting for|Polling|Retrying|Attempting|Running|Executing|Calling|Invoking)/i,
    /^(Word count:|Summary:|Topic:|Approach:|Voice:|Structure:|Saved to:|Supabase:|Draft written|Ready for)/i,
    /^(The post:|Here's the post|Here is the post)/i,
  ];

  const lines = text.split('\n');
  let bestBlock: string[] = [];
  let currentBlock: string[] = [];
  let inPost = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isThinking = thinkingPatterns.some(p => p.test(trimmed));
    const isMeta = /^(Word count|Summary|Topic|Approach|Voice|Structure|Saved to|Supabase|Draft written|Ready for):/i.test(trimmed);

    if (isThinking || isMeta) {
      // End of a content block
      if (currentBlock.length > bestBlock.length) {
        bestBlock = [...currentBlock];
      }
      currentBlock = [];
      inPost = false;
      continue;
    }

    // Skip "The post:" type headers
    if (/^the post:?\s*$/i.test(trimmed)) continue;

    // Start collecting content
    currentBlock.push(line);
    if (trimmed.length > 0) inPost = true;
  }

  // Check last block
  if (currentBlock.length > bestBlock.length) {
    bestBlock = [...currentBlock];
  }

  const extracted = bestBlock.join('\n').trim();

  // If we got a reasonable post (>80 chars), use it. Otherwise return cleaned full text.
  if (extracted.length > 80) return extracted;

  // Fallback: strip thinking lines and return the rest
  return lines.filter(line => {
    const trimmed = line.trim();
    return !thinkingPatterns.some(p => p.test(trimmed));
  }).join('\n').trim();
};

// Detect if content still has agent thinking/process narration
export const hasThinkingContent = (text: string): boolean => {
  if (!text) return false;
  const indicators = ['Let me ', "I'll ", 'Now let me ', 'Let me fetch', 'Let me search', 'The fetch didn\'t'];
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
