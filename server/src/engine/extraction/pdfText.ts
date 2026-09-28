// Coordinate-aware PDF text extraction via pdfjs-dist (legacy build).
// Produces ParsedLine[] with reconstructed lines, reading-order handling for
// two-column layouts, and page-number header/footer removal.

import type { ParsedLine } from './types';

interface RawItem {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  bold: boolean;
}

interface PdfLine {
  text: string;
  y: number;
  xStart: number;
  xEnd: number;
  page: number;
  bold: boolean;
  /** 0 = full width, 1 = left column, 2 = right column */
  column: number;
  /** tallest item in the line (approximates line height) */
  height: number;
}

interface PdfTextItemLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
  hasEOL?: boolean;
}

interface PdfjsModule {
  getDocument(src: unknown): { promise: Promise<PdfDocLike> };
}

interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  destroy?(): Promise<void>;
}

interface PdfPageLike {
  getViewport(p: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: PdfTextItemLike[]; styles?: Record<string, { fontFamily?: string }> }>;
}

const BOLD_HINT_RE = /bold|black|heavy|semibol/i;
const PAGE_NO_RE = /^page\s*\d+(?:\s*(?:of|\/)\s*\d+)?$/i;

// pdfjs-dist ships ESM only (legacy/build/pdf.mjs). Under Vitest a plain
// dynamic import works (Vite keeps it native); in the tsc CommonJS build the
// import is rewritten to require(), which only loads .mjs on Node >= 22.12.
// Layer the two strategies so both runtimes get a native import.
const functionImport = new Function('s', 'return import(s);') as (s: string) => Promise<unknown>;

async function loadPdfjs(): Promise<PdfjsModule> {
  try {
    return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsModule;
  } catch {
    return (await functionImport('pdfjs-dist/legacy/build/pdf.mjs')) as PdfjsModule;
  }
}

function itemsToLines(items: RawItem[], page: number): PdfLine[] {
  const sorted = [...items].sort((a, b) => (b.y - a.y) || (a.x - b.x));

  // Group items into visual lines by baseline proximity.
  const groups: RawItem[][] = [];
  let group: RawItem[] = [];
  let groupY = Number.NaN;
  for (const item of sorted) {
    const tol = Math.max(1.5, item.fontSize * 0.45);
    if (Number.isNaN(groupY) || Math.abs(item.y - groupY) <= tol) {
      group.push(item);
      if (Number.isNaN(groupY)) groupY = item.y;
    } else {
      groups.push(group);
      group = [item];
      groupY = item.y;
    }
  }
  if (group.length) groups.push(group);

  const built: PdfLine[] = [];
  for (const g of groups) {
    const ordered = [...g].sort((a, b) => a.x - b.x);

    // Split a baseline group into segments wherever the horizontal gap is far
    // larger than a word gap: aligned left/right column text (and right-aligned
    // date columns) share baselines but are NOT one sentence.
    const segments: RawItem[][] = [];
    let segment: RawItem[] = [];
    let prevEnd = Number.NaN;
    for (const item of ordered) {
      if (!Number.isNaN(prevEnd)) {
        const gap = item.x - prevEnd;
        if (gap > Math.max(3 * item.fontSize, 24)) {
          segments.push(segment);
          segment = [];
        }
      }
      segment.push(item);
      prevEnd = item.x + item.width;
    }
    if (segment.length) segments.push(segment);

    for (const seg of segments) {
      let text = '';
      let segPrevEnd = Number.NaN;
      let xStart = Number.POSITIVE_INFINITY;
      let xEnd = Number.NEGATIVE_INFINITY;
      let boldChars = 0;
      let totalChars = 0;
      let height = 0;
      for (const item of seg) {
        if (!Number.isNaN(segPrevEnd)) {
          const gap = item.x - segPrevEnd;
          if (gap > 0.25 * item.fontSize && !text.endsWith(' ') && !item.text.startsWith(' ')) text += ' ';
        }
        text += item.text;
        boldChars += item.bold ? item.text.trim().length : 0;
        totalChars += item.text.trim().length;
        height = Math.max(height, item.fontSize);
        xStart = Math.min(xStart, item.x);
        xEnd = Math.max(xEnd, item.x + item.width);
        segPrevEnd = item.x + item.width;
      }
      if (!text.trim()) continue;
      built.push({
        text: text.replace(/\s+/g, ' ').trim(),
        y: seg[0].y,
        xStart,
        xEnd,
        page,
        bold: totalChars > 0 && boldChars / totalChars > 0.6,
        column: 0,
        height,
      });
    }
  }
  return built;
}

/**
 * Detects a vertical gutter splitting the page into two columns. Returns the
 * ordered lines (full-width header first, then left column top-to-bottom, then
 * right column) or null when the page reads as a single column.
 */
function orderColumns(lines: PdfLine[], pageWidth: number): PdfLine[] | null {
  let best: { left: PdfLine[]; right: PdfLine[]; cross: PdfLine[] } | null = null;
  for (let frac = 0.3; frac <= 0.701; frac += 0.02) {
    const g = pageWidth * frac;
    const left: PdfLine[] = [];
    const right: PdfLine[] = [];
    const cross: PdfLine[] = [];
    for (const line of lines) {
      if (line.xStart < g - 2 && line.xEnd > g + 2) cross.push(line);
      else if (line.xEnd <= g + 2) left.push(line);
      else right.push(line);
    }
    const viable = left.length >= 3 && right.length >= 3 && cross.length <= Math.max(1, Math.floor(lines.length * 0.2));
    if (viable && (!best || left.length + right.length > best.left.length + best.right.length)) {
      best = { left, right, cross };
    }
  }
  if (!best) return null;
  const byY = (a: PdfLine, b: PdfLine) => b.y - a.y;
  for (const line of best.cross) line.column = 0;
  for (const line of best.left) line.column = 1;
  for (const line of best.right) line.column = 2;
  return [...best.cross.sort(byY), ...best.left.sort(byY), ...best.right.sort(byY)];
}

export interface PdfLayoutResult {
  lines: ParsedLine[];
  pageCount: number;
  multiColumn: boolean;
}

export async function readPdfLayout(buffer: Buffer): Promise<PdfLayoutResult> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  }).promise;

  const allLines: PdfLine[] = [];
  let multiColumn = false;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const styles = content.styles || {};
    const items: RawItem[] = [];
    for (const item of content.items) {
      const text = item.str ?? '';
      if (!text.trim() || !item.transform) continue;
      const [, b, , d, e, f] = item.transform;
      const fontSize = Math.hypot(b, d) || item.height || 10;
      const fontKey = item.fontName || '';
      const family = styles[fontKey]?.fontFamily || '';
      items.push({
        text,
        x: e,
        y: f,
        width: item.width ?? text.length * fontSize * 0.5,
        fontSize,
        bold: BOLD_HINT_RE.test(fontKey) || BOLD_HINT_RE.test(family),
      });
    }
    const pageLines = itemsToLines(items, p);
    const ordered = orderColumns(pageLines, viewport.width);
    if (ordered) {
      multiColumn = true;
      allLines.push(...ordered);
    } else {
      allLines.push(...pageLines);
    }
  }
  await doc.destroy?.();

  const lines: ParsedLine[] = allLines
    .filter((l) => !PAGE_NO_RE.test(l.text) && !/^\d{1,3}$/.test(l.text))
    .map((l, i) => ({
      text: l.text,
      bold: l.bold,
      pageNumber: l.page,
      y: l.y,
      x: l.xStart,
      width: l.xEnd - l.xStart,
      height: l.height,
      column: l.column,
      index: i,
    }));

  return { lines, pageCount: doc.numPages, multiColumn };
}
