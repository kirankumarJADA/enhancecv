// Text processing utilities shared by all engines.

export function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function toWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return toWords(text).length;
}

export function sentenceCase(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function stripBulletPrefix(line: string): string {
  return line
    .replace(/^\s*[\u2022\u25aa\u25cf\u2023\u2043\-–—*o>]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .trim();
}

export function isBulletLine(line: string): boolean {
  return /^\s*[\u2022\u25aa\u25cf\u2023\u2043\-–—*]\s+\S/.test(line) || /^\s*\d+[.)]\s+\S/.test(line);
}

export function containsMetric(text: string): boolean {
  return /\d/.test(text) && (/%|percent/i.test(text) || /\d+\s*(x|hours|days|weeks|months|users|customers|clients|requests|reqs|ms|milliseconds|seconds|million|thousand|k\b|\+|records|transactions|orders|tickets|items|people|members|engineers|developers|countries|regions|teams)/i.test(text) || /[$€£]\s*\d/.test(text) || /\b\d+\s*(to|[-–])\s*\d+\b/.test(text));
}

export const GENERIC_SUMMARY_MARKERS = [
  'hardworking',
  'team player',
  'passionate',
  'seeking a challenging',
  'looking for an opportunity',
  'dynamic professional',
  'results-driven professional',
  'self-motivated individual',
];

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

const STOPWORDS = new Set(
  `a an and are as at be by for from has have how in is it its of on or that the to was were will with you your our we they their this these those who whom which what when where why all any both each few more most other some such no nor not only own same so than too very can just should now must able using use used work working works experience experiences role roles job jobs team teams company companies candidate candidates ideal you'll we're requirements responsibilities skills skill strong excellent good great plus preferred required etc via across about within per over under years year new like including include includes ability abilities well also help helps helping support supporting ensure ensuring develop developing develop build building create creating manage managing`.
    split(/\s+/)
);

/** Extract salient keywords from free text, frequency-ranked, taxonomy-agnostic. */
export function extractKeywords(text: string, limit = 25): string[] {
  const words = toWords(text);
  const freq = new Map<string, number>();
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^[.\-/]+|[.\-/]+$/g, '');
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
    // capture simple bigrams of non-stopwords (e.g. "unit testing")
    if (i + 1 < words.length) {
      const w2 = words[i + 1];
      if (!STOPWORDS.has(w2) && w2.length >= 3 && /^\d+$/.test(w2) === false) {
        const bg = `${w} ${w2}`;
        freq.set(bg, (freq.get(bg) || 0) + 0.6);
      }
    }
  }
  return [...freq.entries()]
    .filter(([k, v]) => (k.includes(' ') ? v >= 1.2 : v >= 2))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => k);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
