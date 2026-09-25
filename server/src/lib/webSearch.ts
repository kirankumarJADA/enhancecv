// Web search provider abstraction for the Company Research agent.
//
// Providers: 'none' (default — company research honestly unavailable) and
// 'serpapi'-style HTTP providers enabled purely by environment configuration.
// No provider is required for the app to boot; without one, research returns
// AI_NOT_CONFIGURED rather than AI-fabricated company "facts".

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchProvider {
  id: string;
  search(query: string, limit: number): Promise<WebSearchResult[]>;
}

class NoneProvider implements WebSearchProvider {
  id = 'none';
  async search(): Promise<WebSearchResult[]> {
    throw new Error('WEB_SEARCH_NOT_CONFIGURED');
  }
}

/**
 * Generic provider: uses RESEARCH_SEARCH_API_URL with a `{query}` placeholder
 * and expects a JSON array of {title, url, snippet} — this shape matches most
 * search APIs (or a thin worker that normalises to it). The key is passed as
 * a bearer token from RESEARCH_SEARCH_API_KEY.
 */
class GenericHttpProvider implements WebSearchProvider {
  id = 'generic-http';
  async search(query: string, limit: number): Promise<WebSearchResult[]> {
    const base = process.env.RESEARCH_SEARCH_API_URL || '';
    const url = base.replace('{query}', encodeURIComponent(query));
    const res = await fetch(url, {
      headers: process.env.RESEARCH_SEARCH_API_KEY
        ? { Authorization: `Bearer ${process.env.RESEARCH_SEARCH_API_KEY}` }
        : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`search status=${res.status}`);
    }
    const data = (await res.json()) as { title?: string; url?: string; snippet?: string }[];
    return data.slice(0, limit).map((d) => ({
      title: String(d.title || ''),
      url: String(d.url || ''),
      snippet: String(d.snippet || ''),
    }));
  }
}

export function getWebSearchProvider(): WebSearchProvider {
  if (process.env.RESEARCH_SEARCH_API_URL) {
    return new GenericHttpProvider();
  }
  return new NoneProvider();
}

export function isWebSearchConfigured(): boolean {
  return !(getWebSearchProvider() instanceof NoneProvider);
}

// --- test seam -------------------------------------------------------------

let searchProvider: WebSearchProvider | null = null;

export function __setWebSearchProviderForTests(p: WebSearchProvider | null): void {
  searchProvider = p;
}

export function resolveSearchProvider(): WebSearchProvider {
  return searchProvider || getWebSearchProvider();
}
