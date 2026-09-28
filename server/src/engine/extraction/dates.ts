// Deterministic date-range parsing for resume timelines.
// Handles: "Jan 2025 – Mar 2025", "January 2025 - March 2025", "08/2022 - Present",
// "2017 - 2021", "Apr 2024–Jun 2024", single "May 2024" / "2024".

export interface ParsedDateRange {
  start: string; // 'MM/YYYY' or 'YYYY' or ''
  end: string; // 'MM/YYYY' | 'YYYY' | 'Present' | ''
  current: boolean;
  /** The raw substring as it appeared in the document, e.g. "Jan 2025 – Mar 2025". */
  display: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8,
  sep: 9, oct: 10, nov: 11, dec: 12,
};

// Full month names first so "January" wins over "jan"; the token must be a real
// month word followed by whitespace — "Marketing 2025" is not a date.
const MONTH_TOKEN = '(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)';
const MONTH_SRC = `\\b${MONTH_TOKEN}\\.?\\s+`;
const YEAR_SRC = '((?:19|20)\\d{2})';
const MM_SRC = '((?:0?[1-9]|1[0-2])\\/)';
const START_SRC = `(?:${MONTH_SRC}\\s*)?${MM_SRC}?\\s*${YEAR_SRC}`;
const SEP_SRC = '\\s*(?:-|–|—|to|until)\\s*';
const END_SRC = `(?:(?:${MONTH_SRC}\\s*)?${MM_SRC}?\\s*${YEAR_SRC}|(present|current|now|ongoing)\\b)`;

export const DATE_RANGE_RE = new RegExp(`${START_SRC}(?:${SEP_SRC}${END_SRC})?`, 'i');

// group indices in DATE_RANGE_RE matches
const G_START_MONTH = 1;
const G_START_MM = 2;
const G_START_YEAR = 3;
const G_END_MONTH = 4;
const G_END_MM = 5;
const G_END_YEAR = 6;
const G_PRESENT = 7;

function monthNumber(token: string | undefined): string {
  if (!token) return '';
  return String(MONTHS[token.toLowerCase().slice(0, 3)] ?? '').padStart(2, '0');
}

/** 'Jan 2025' -> '01/2025', '2025' -> '2025', '08/2022' -> '08/2022', 'Present' -> 'Present'. */
export function normalizeDate(raw: string): string {
  const t = raw.trim().replace(/[.,;]$/, '');
  if (!t) return '';
  if (/^(present|current|now|ongoing)$/i.test(t)) return 'Present';
  let m = t.match(new RegExp(`^${MONTH_SRC}\\s*${YEAR_SRC}$`, 'i'));
  if (m) return `${monthNumber(m[1])}/${m[2]}`;
  m = t.match(/^((?:0?[1-9]|1[0-2]))\/((?:19|20)\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}/${m[2]}`;
  if (/^(?:19|20)\d{2}$/.test(t)) return t;
  return '';
}

/**
 * Finds the first date range in a line of text. Returns null when the line has
 * no timeline. A lone "May 2024" / "2024" also counts (single-point range).
 */
export function findDateRange(text: string): ParsedDateRange | null {
  const m = text.match(DATE_RANGE_RE);
  if (!m) return null;
  const display = m[0].trim().replace(/^[\s|,;•·—-]+|[\s|,;•·—-]+$/g, '');
  const startRaw = `${m[G_START_MONTH] ? `${m[G_START_MONTH]} ` : ''}${m[G_START_MM] ?? ''}${m[G_START_YEAR] ?? ''}`;
  const isPresent = Boolean(m[G_PRESENT]);
  const endRaw = isPresent
    ? 'Present'
    : `${m[G_END_MONTH] ? `${m[G_END_MONTH]} ` : ''}${m[G_END_MM] ?? ''}${m[G_END_YEAR] ?? ''}`;
  const start = normalizeDate(startRaw);
  const end = endRaw ? normalizeDate(endRaw) : '';

  // A bare year with no month is only a date when it is a year range
  // ("2022 – 2026") or stands alone on the line ("2024"). "Marketing 2025
  // cohort" or "Class of 2026" must not anchor timeline entities.
  const hasMonth = Boolean(m[G_START_MONTH] || m[G_START_MM] || m[G_END_MONTH] || m[G_END_MM]);
  if (!hasMonth && !isPresent) {
    const yearRange = Boolean(start && end);
    if (!yearRange) {
      const remainder = text
        .replace(m[0], '')
        .replace(/[\s|,;:•·()()[\]–—-]/g, '');
      if (remainder.length > 0) return null;
    }
  }

  if (!start && !end && !isPresent) return null;
  return { start, end: end || (isPresent ? 'Present' : ''), current: isPresent, display };
}
