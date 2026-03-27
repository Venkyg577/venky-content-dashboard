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
