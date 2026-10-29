// Isolated parser runner executing pdfjs-dist and mammoth inside worker threads.
// Guarantees hard timeout enforcement and immediate resource termination on timeout,
// failure, or cancellation, preventing unbounded CPU consumption and event-loop stalls.

import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'url';
import { AppError } from '../../middleware/errors';

let cachedPdfjsUrl: string | null = null;
function getPdfjsUrl(): string {
  if (!cachedPdfjsUrl) {
    try {
      cachedPdfjsUrl = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;
    } catch {
      cachedPdfjsUrl = 'pdfjs-dist/legacy/build/pdf.mjs';
    }
  }
  return cachedPdfjsUrl;
}

let cachedMammothPath: string | null = null;
function getMammothPath(): string {
  if (!cachedMammothPath) {
    try {
      cachedMammothPath = require.resolve('mammoth');
    } catch {
      cachedMammothPath = 'mammoth';
    }
  }
  return cachedMammothPath;
}

export interface RawPdfItem {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  bold: boolean;
}

export interface PdfWorkerPage {
  pageNumber: number;
  width: number;
  items: RawPdfItem[];
}

export interface PdfWorkerResult {
  numPages: number;
  pages: PdfWorkerPage[];
}

export interface DocxWorkerResult {
  html: string;
  rawText: string;
}

export const MAX_PDF_PAGES = 20;
export const DEFAULT_PARSER_TIMEOUT_MS = 15_000;

// Inline worker script for Mammoth DOCX parsing
const DOCX_WORKER_SCRIPT = `
const { parentPort } = require('node:worker_threads');

async function parseDocx(bufData, mammothPath) {
  const mammoth = require(mammothPath || 'mammoth');
  const buffer = Buffer.from(bufData);
  let html = '';
  let rawText = '';

  try {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    html = htmlResult.value || '';
  } catch {
    html = '';
  }

  if (!html) {
    const rawResult = await mammoth.extractRawText({ buffer });
    rawText = rawResult.value || '';
  }

  return { html, rawText };
}

parentPort.on('message', async (msg) => {
  try {
    const result = await parseDocx(msg.buffer, msg.mammothPath);
    parentPort.postMessage({ ok: true, result });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
  }
});
`;

// Inline worker script for PDFJS-dist layout item extraction
const PDF_WORKER_SCRIPT = `
const { parentPort } = require('node:worker_threads');

const BOLD_HINT_RE = /bold|black|heavy|semibol/i;

async function loadPdfjs(entryUrl) {
  const target = entryUrl || 'pdfjs-dist/legacy/build/pdf.mjs';
  try {
    return (await import(target));
  } catch {
    const fn = new Function('s', 'return import(s);');
    return (await fn(target));
  }
}

async function parsePdf(bufData, maxPages, entryUrl) {
  const pdfjs = await loadPdfjs(entryUrl);
  const buffer = Buffer.from(bufData);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  }).promise;

  const numPages = doc.numPages;
  if (numPages > maxPages) {
    await doc.destroy?.();
    throw new Error('PAGE_COUNT_EXCEEDED:' + numPages);
  }

  const pages = [];
  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const styles = content.styles || {};
    const items = [];

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

    pages.push({
      pageNumber: p,
      width: viewport.width,
      items,
    });
  }

  await doc.destroy?.();
  return { numPages, pages };
}

parentPort.on('message', async (msg) => {
  try {
    const result = await parsePdf(msg.buffer, msg.maxPages || 20, msg.entryUrl);
    parentPort.postMessage({ ok: true, result });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
  }
});
`;

/**
 * Executes a worker script with a hard timeout. If the timeout triggers or an
 * error occurs, worker.terminate() is called immediately, reclaiming memory and
 * terminating running loops.
 */
function runWorkerTask<T>(script: string, message: unknown, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    let worker: Worker | null = null;

    const cleanup = async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // ignore termination errors
        }
        worker = null;
      }
    };

    try {
      worker = new Worker(script, { eval: true });
    } catch (err) {
      settled = true;
      return reject(new AppError('PARSE_FAILED', 'Failed to initialize isolated parser worker.', 422));
    }

    timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(new AppError('PARSE_FAILED', 'Parsing timed out while processing this document.', 422));
    }, timeoutMs);

    worker.on('message', async (msg: { ok: boolean; result?: T; error?: string }) => {
      if (settled) return;
      settled = true;
      await cleanup();

      if (!msg.ok) {
        if (msg.error?.startsWith('PAGE_COUNT_EXCEEDED:')) {
          const count = msg.error.split(':')[1];
          return reject(
            new AppError('PARSE_FAILED', `Document exceeds the maximum page limit of ${MAX_PDF_PAGES} pages (found ${count}).`, 422),
          );
        }
        return reject(new AppError('PARSE_FAILED', 'We could not read this file. It may be empty, scanned, or corrupted.', 422));
      }

      resolve(msg.result as T);
    });

    worker.on('error', async (err: Error) => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(new AppError('PARSE_FAILED', `Parser worker encountered an error: ${err.message}`, 422));
    });

    worker.on('exit', async (exitCode: number) => {
      if (settled) return;
      settled = true;
      await cleanup();
      if (exitCode !== 0) {
        reject(new AppError('PARSE_FAILED', `Parser worker exited unexpectedly with code ${exitCode}.`, 422));
      }
    });

    worker.postMessage(message);
  });
}

/**
 * Parses a DOCX buffer in an isolated worker thread with hard timeout enforcement.
 */
export async function parseDocxInWorker(
  buffer: Buffer,
  timeoutMs: number = DEFAULT_PARSER_TIMEOUT_MS,
): Promise<DocxWorkerResult> {
  return runWorkerTask<DocxWorkerResult>(DOCX_WORKER_SCRIPT, { buffer, mammothPath: getMammothPath() }, timeoutMs);
}

/**
 * Parses a PDF buffer in an isolated worker thread with page capping and hard timeout enforcement.
 */
export async function parsePdfInWorker(
  buffer: Buffer,
  timeoutMs: number = DEFAULT_PARSER_TIMEOUT_MS,
  maxPages: number = MAX_PDF_PAGES,
): Promise<PdfWorkerResult> {
  return runWorkerTask<PdfWorkerResult>(PDF_WORKER_SCRIPT, { buffer, maxPages, entryUrl: getPdfjsUrl() }, timeoutMs);
}
