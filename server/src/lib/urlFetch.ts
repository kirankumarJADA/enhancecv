// SSRF-safe external URL fetching for job imports and (future) research.
//
// Protections:
// - Only http/https protocols.
// - Hostname-based blocking: localhost variants, loopback, private and
//   link-local ranges, cloud metadata endpoints, dot-internal names.
// - Enforced timeout and response size limit.
// - Redirect limit (3) with re-validation of every hop.
//
// This is hostname/IP-literal level protection. It is deliberately strict;
// a fetch that cannot be proven safe is refused.

import { AppError } from '../middleware/errors';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
]);

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  if ([a, b].some((n) => Number.isNaN(n))) return true; // malformed → refuse
  if (a === 10 || a === 127 || a === 0) return true; // private, loopback, this-network
  if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1' || h === '::' || h === '::ffff:127.0.0.1') return true;
  if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true; // link-local / unique-local
  if (h.startsWith('::ffff:')) {
    // IPv4-mapped
    return isPrivateIPv4(h.slice(7));
  }
  return false;
}

export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('INVALID_URL', 'That does not look like a valid URL.', 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError('INVALID_URL', 'Only http and https URLs can be imported.', 400);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    isPrivateIPv4(host) ||
    isPrivateIPv6(host)
  ) {
    throw new AppError('BLOCKED_URL', 'This URL points to a private or reserved address and cannot be imported.', 400);
  }
  if (url.port && !['80', '443', ''].includes(url.port)) {
    throw new AppError('INVALID_URL', 'Non-standard ports are not allowed.', 400);
  }
  return url;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

export interface FetchedPage {
  url: string;
  body: string;
  contentType: string;
}

/** Provider-agnostic fetcher seam (tests inject a stub). */
export type PageFetcher = (url: string) => Promise<FetchedPage>;

export const defaultPageFetcher: PageFetcher = async (raw: string): Promise<FetchedPage> => {
  let current = assertSafeUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': 'CurevoAI-JobImporter/1.0 (+https://curevo.ai)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new AppError('IMPORT_FAILED', 'The page redirected without a destination.', 422);
      current = assertSafeUrl(new URL(location, current).toString());
      continue;
    }
    if (!res.ok) {
      throw new AppError('IMPORT_FAILED', `The page could not be fetched (status ${res.status}).`, 422);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|application\/(json|ld\+json)/i.test(contentType)) {
      throw new AppError('IMPORT_FAILED', 'The URL does not point to an HTML page.', 422);
    }
    const lengthHeader = parseInt(res.headers.get('content-length') || '0', 10);
    if (lengthHeader > MAX_BYTES) {
      throw new AppError('IMPORT_FAILED', 'The page is too large to import.', 422);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      throw new AppError('IMPORT_FAILED', 'The page is too large to import.', 422);
    }
    return { url: current.toString(), body: buf.toString('utf8'), contentType };
  }
  throw new AppError('IMPORT_FAILED', 'Too many redirects.', 422);
};

let fetcher: PageFetcher = defaultPageFetcher;

/** Tests only: inject a stub fetcher. Pass null to reset. */
export function __setPageFetcherForTests(f: PageFetcher | null): void {
  fetcher = f || defaultPageFetcher;
}

export function getPageFetcher(): PageFetcher {
  return fetcher;
}
