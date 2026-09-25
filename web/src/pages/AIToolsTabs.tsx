// Additional AI tools: Grammar, Translator, Company Research.
// All are truth-guarded and honestly disabled when the AI provider or the
// search provider is not configured.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Spinner } from '../components/ui';
import { useToast } from '../state/ToastContext';

export function GrammarTool({ aiEnabled }: { aiEnabled: boolean }) {
  const [suggestions, setSuggestions] = useState<{ id: string; section: string; current: string; suggested: string; reason: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<number | null>(null);
  const toast = useToast();

  async function run() {
    setBusy(true);
    setSuggestions(null);
    try {
      const res = await api.post<{ suggestions: { id: string; section: string; current: string; suggested: string; reason: string }[]; meta: { rejectedClaims: number } }>('/ai/grammar', {});
      setSuggestions(res.suggestions || []);
      setRejected(res.meta.rejectedClaims);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Grammar run failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink-900">Grammar & clarity</h2>
        <p className="mt-1 text-xs text-ink-500">
          Proofreads your Master CV. Truth Guard applies: suggestions that introduce new facts are dropped before you see them. Apply suggestions from the Master CV editor's suggestion panel after saving.
        </p>
        <button className="btn-primary mt-4 w-full" disabled={busy || !aiEnabled} onClick={() => void run()}>
          {busy && <Spinner className="h-4 w-4" />} Run grammar check
        </button>
      </div>
      {rejected !== null && rejected > 0 && <p className="text-xs text-amber-700">{rejected} suggestion(s) were rejected by the Truth Guard before you saw them.</p>}
      {suggestions && suggestions.length === 0 && <p className="text-sm text-emerald-700">No grammar or clarity improvements found — clean writing.</p>}
      {suggestions && suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <div key={s.id} className="card p-4 text-sm">
              <span className="chip bg-ink-100 text-ink-600">{s.section}</span>
              <p className="mt-2 rounded-lg bg-red-50/70 px-3 py-1.5 text-xs text-red-800"><strong>Original:</strong> {s.current}</p>
              <p className="mt-1.5 rounded-lg bg-emerald-50/70 px-3 py-1.5 text-xs text-emerald-900"><strong>Updated:</strong> {s.suggested}</p>
              <p className="mt-1.5 text-xs text-ink-500">{s.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const LANGUAGES = ['English (UK)', 'English (US)', 'German', 'French', 'Spanish', 'Italian', 'Dutch', 'Portuguese', 'Polish', 'Arabic', 'Hindi', 'Japanese'];

export function TranslateTool({ aiEnabled }: { aiEnabled: boolean }) {
  const [language, setLanguage] = useState('German');
  const [market, setMarket] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ versionId: string; title: string; warnings: string[] } | null>(null);
  const toast = useToast();
  const navigate = useNavigate();

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const master = await api.get<{ master: { id: string } | null }>('/master');
      if (!master.master) {
        toast.show('Create your Master CV first.', 'error');
        return;
      }
      const res = await api.post<{ versionId: string; title: string; warnings: string[] }>('/ai/translate', { resumeId: master.master.id, language, market });
      setResult(res);
      toast.show(`Translated resume saved as "${res.title}".`, 'success');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Translation failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink-900">Translate & localise</h2>
        <p className="mt-1 text-xs text-ink-500">Facts, numbers, dates, employers and technology names are preserved by deterministic validation. Saved as a new version — your Master CV stays untouched.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="tr-lang">Target language</label>
            <select id="tr-lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tr-market">Target market (optional)</label>
            <input id="tr-market" className="input" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="e.g. Germany" />
          </div>
        </div>
        <button className="btn-primary mt-4 w-full" disabled={busy || !aiEnabled} onClick={() => void run()}>{busy && <Spinner className="h-4 w-4" />} Translate Master CV</button>
      </div>
      {result && (
        <div className="card border-brand-100 bg-brand-50/40 p-5">
          <p className="text-sm font-semibold text-brand-900">{result.title}</p>
          {result.warnings.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-amber-700">{result.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
          ) : (
            <p className="mt-1 text-xs text-emerald-700">Validation passed: numbers, dates and technologies preserved.</p>
          )}
          <button className="btn-primary mt-3 px-3 py-1.5 text-xs" onClick={() => navigate(`/app/resumes/${result.versionId}/edit`)}>Open the translated version</button>
        </div>
      )}
    </div>
  );
}

interface CompanyResearchData {
  overview: string;
  productsServices: string[];
  industry: string;
  recentInformation: { fact: string; sourceUrl: string }[];
  roleContext: string;
  interviewTopics: string[];
  cultureNotes: string[];
}

export function ResearchTool({ aiEnabled }: { aiEnabled: boolean }) {
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CompanyResearchData | null>(null);
  const toast = useToast();

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post<{ research: CompanyResearchData }>('/ai/company-research', { company });
      setResult(res.research);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Research failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink-900">Company research</h2>
        <p className="mt-1 text-xs text-ink-500">Facts come from the configured web-search provider with source URLs — the AI only structures them. Without a provider this tool says so instead of inventing company facts.</p>
        <div className="mt-4 flex gap-2">
          <input className="input flex-1" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" aria-label="Company name" />
          <button className="btn-primary" disabled={busy || !aiEnabled || company.trim().length < 2} onClick={() => void run()}>{busy && <Spinner className="h-4 w-4" />} Research</button>
        </div>
      </div>
      {result && (
        <div className="card space-y-3 p-5 text-sm text-ink-700">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Overview · {result.industry}</p>
            <p className="mt-1">{result.overview}</p>
          </div>
          {result.productsServices.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Products / services</p>
              <ul className="mt-1 space-y-0.5">{result.productsServices.map((p, i) => <li key={i}>• {p}</li>)}</ul>
            </div>
          )}
          {result.recentInformation.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Recent public information (sourced)</p>
              <ul className="mt-1 space-y-1">
                {result.recentInformation.map((r, i) => (
                  <li key={i}>• {r.fact} <a className="text-brand-600 underline" href={r.sourceUrl} target="_blank" rel="noreferrer">source</a></li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Role context</p>
            <p className="mt-1">{result.roleContext}</p>
          </div>
          {result.interviewTopics.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Likely interview topics</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{result.interviewTopics.map((t, i) => <span key={i} className="chip bg-brand-50 text-brand-700">{t}</span>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
