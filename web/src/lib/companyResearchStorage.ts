// Curevo AI — Company Research Storage Manager (Phase 9H)
//
// 100% Client-side persistence for verified company research briefs.
// LocalStorage backed with automatic caching and JSON backup support.

export interface CompanyResearchData {
  company: string;
  overview: string;
  industry: string;
  businessModel: string;
  productsServices: string[];
  technologies: string[];
  recentDevelopments: Array<{
    title: string;
    fact: string;
    sourceUrl: string;
    retrievalDate: string;
  }>;
  roleContext: string;
  interviewTopics: string[];
  suggestedInterviewerQuestions: string[];
  cultureNotes: string[];
  retrievalDate: string;
  isCuratedBenchmark: boolean;
  cachedAt: string;
}

const STORAGE_KEY = 'curevo_company_research_v1';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getAllCompanyResearch(): Record<string, CompanyResearchData> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  return safeParse<Record<string, CompanyResearchData>>(localStorage.getItem(STORAGE_KEY), {});
}

export function getCompanyResearch(companyName: string): CompanyResearchData | null {
  if (!companyName) return null;
  const map = getAllCompanyResearch();
  return map[companyName.trim().toLowerCase()] || null;
}

export function saveCompanyResearch(data: Omit<CompanyResearchData, 'cachedAt'>): void {
  if (typeof window === 'undefined' || !window.localStorage || !data.company) return;
  const map = getAllCompanyResearch();
  const key = data.company.trim().toLowerCase();
  map[key] = {
    ...data,
    cachedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('[Company Research Storage] Failed to cache research:', err);
  }
}

export function clearCompanyResearch(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  localStorage.removeItem(STORAGE_KEY);
}
