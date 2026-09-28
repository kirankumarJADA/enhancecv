// Structure-aware DOCX ingestion. mammoth.convertToHtml preserves paragraph
// boundaries, list items and bold runs — far richer than extractRawText.
// The HTML is walked into the same ParsedLine[] representation as PDFs.

import type { ParsedLine } from './types';

const BLOCK_RE = /<(p|h[1-6]|li)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

const MARK_BOLD_ON = '\u0001';
const MARK_BOLD_OFF = '\u0002';

/** Walks mammoth's HTML output into lines with bold / list-item signals. */
export function docxHtmlToLines(html: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const match of html.matchAll(BLOCK_RE)) {
    const tag = match[1].toLowerCase();
    const inner = match[2];
    const marked = inner
      .replace(/<(strong|b)(?:\s[^>]*)?>/gi, MARK_BOLD_ON)
      .replace(/<\/(strong|b)>/gi, MARK_BOLD_OFF)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '');

    for (const segment of marked.split('\n')) {
      let boldChars = 0;
      let totalChars = 0;
      let inBold = false;
      for (const ch of segment) {
        if (ch === MARK_BOLD_ON) inBold = true;
        else if (ch === MARK_BOLD_OFF) inBold = false;
        else if (!/\s/.test(ch) && ch !== '\u00a0') {
          totalChars++;
          if (inBold) boldChars++;
        }
      }
      const clean = decodeEntities(segment.replace(/[\u0001\u0002]/g, '')).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      const bold = tag.startsWith('h') || (totalChars > 0 && boldChars / totalChars > 0.6);
      lines.push({ text: clean, bold, isListItem: tag === 'li' });
    }
  }
  return lines;
}
