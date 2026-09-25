// Jobs hub: discovery search, URL import, and saved jobs with transparent
// fit fields. Fit data is informational measurement — never a ranking.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { EmptyState, Spinner } from '../components/ui';
import { useToast } from '../state/ToastContext';
import { useAuth } from '../state/AuthContext';

interface FitSummary {
  matchPercentage: number;
  matchedRequirements: string[];
  missingRequirements: string[];
  partialRequirements: string[];
  relevantEvidence: { requirement: string; evidence: string }[];
  experienceGaps: string[];
  atsObservation: string;
}

interface SavedJob {
  id: string;
  company: string;
  title: string;
  location: string;
  salary: string;
  remote_type: string;
  url: string;
  source: string;
  description: string;
  status: string;
  match_score: number | null;
}

type Tab = 'search' | 'import' | 'saved';

export default function Jobs() {
  const [tab, setTab] = useState<Tab>('search');
  const [saved, setSaved] = useState<SavedJob[] | null>(null);
  const toast = useToast();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const loadSaved = useCallback(async () => {
    const res = await api.get<{ savedJobs: SavedJob[] }>('/jobs/saved');
    setSaved(res.savedJobs);
  }, []);

  useEffect(() => {
    void loadSaved().catch(() => setSaved([]));
  }, [loadSaved]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Jobs</h1>
        <p className="mt-1 text-sm text-ink-500">Discover roles, import postings and see transparent fit measurements against your Master CV.</p>
      </div>

      <div className="flex gap-2" role="tablist">
        {([['search', 'Job Search'], ['import', 'Import URL'], ['saved', `Saved Jobs${saved ? ` (${saved.length})` : ''}`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200'}`}
            onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'search' && <SearchTab onSaved={loadSaved} />}
      {tab === 'import' && <ImportTab onSaved={loadSaved} />}

      {tab === 'saved' && (
        !saved ? null : saved.length === 0 ? (
          <EmptyState title="No saved jobs" body="Run a discovery search or import a job URL — saved jobs keep transparent fit measurements and can be turned into applications in one click." />
        ) : (
          <div className="space-y-3">
            {saved.map((j) => (
              <div key={j.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-ink-900">{j.title}{j.company ? ` · ${j.company}` : ''}</h2>
                    <p className="mt-0.5 text-xs text-ink-400">{[j.location, j.salary, j.remote_type, j.source].filter(Boolean).join(' · ')}</p>
                  </div>
                  {j.match_score !== null && <span className={`chip ${j.match_score >= 70 ? 'bg-emerald-50 text-emerald-700' : j.match_score >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{j.match_score}% match</span>}
                </div>
                {j.description && <p className="mt-2 line-clamp-3 text-sm text-ink-600">{j.description.slice(0, 280)}{j.description.length > 280 ? '…' : ''}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn-primary px-3 py-1.5 text-xs"
                    onClick={async () => {
                      try {
                        await api.post<{ id: string }>('/applications/from-job', { savedJobId: j.id });
                        toast.show('Application created — tailor your CV next.', 'success');
                        void refresh();
                        navigate('/app/applications');
                      } catch (err) {
                        toast.show(err instanceof ApiError ? err.message : 'Could not create.', 'error');
                      }
                    }}
                  >
                    Add to Applications
                  </button>
                  {j.url && <a className="btn-secondary px-3 py-1.5 text-xs" href={j.url} target="_blank" rel="noreferrer">Open job</a>}
                  <button
                    className="btn-ghost px-2 py-1.5 text-xs"
                    onClick={async () => {
                      try {
                        await api.del(`/jobs/saved/${j.id}`);
                        await loadSaved();
                      } catch (err) {
                        toast.show(err instanceof ApiError ? err.message : 'Delete failed.', 'error');
                      }
                    }}
                  >
                    Remove
                  </button>
                  <button
                    className="btn-ghost px-2 py-1.5 text-xs"
                    onClick={async () => {
                      try {
                        await api.patch(`/jobs/saved/${j.id}`, { status: 'DISMISSED' });
                        await loadSaved();
                      } catch (err) {
                        toast.show(err instanceof ApiError ? err.message : 'Dismiss failed.', 'error');
                      }
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

interface DiscoverResult {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  remote_type: string;
  url: string;
  source: string;
  description: string;
  fit: FitSummary;
}

function SearchTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ title: '', keywords: '', location: '', remoteType: '', salary: '', employmentType: '', experienceLevel: '', industry: '' });
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function search() {
    setBusy(true);
    setResults(null);
    try {
      const res = await api.post<{ results: DiscoverResult[]; note: string }>('/jobs/discover', form);
      setResults(res.results);
      await onSaved();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Search failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="js-title">Job title</label><input id="js-title" className="input" value={form.title} onChange={set('title')} placeholder="e.g. Java Backend Engineer" /></div>
          <div><label className="label" htmlFor="js-keywords">Keywords</label><input id="js-keywords" className="input" value={form.keywords} onChange={set('keywords')} placeholder="Spring Boot, REST" /></div>
          <div><label className="label" htmlFor="js-location">Location</label><input id="js-location" className="input" value={form.location} onChange={set('location')} placeholder="Birmingham" /></div>
          <div>
            <label className="label" htmlFor="js-remote">Work type</label>
            <select id="js-remote" className="input" value={form.remoteType} onChange={set('remoteType')}>
              <option value="">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="on-site">On-site</option>
            </select>
          </div>
          <div><label className="label" htmlFor="js-salary">Salary</label><input id="js-salary" className="input" value={form.salary} onChange={set('salary')} placeholder="£40k+" /></div>
          <div>
            <label className="label" htmlFor="js-level">Experience level</label>
            <select id="js-level" className="input" value={form.experienceLevel} onChange={set('experienceLevel')}>
              <option value="">Any</option><option value="junior">Junior</option><option value="mid">Mid</option><option value="senior">Senior</option><option value="lead">Lead</option>
            </select>
          </div>
        </div>
        <button className="btn-primary" disabled={busy} onClick={() => void search()}>{busy && <Spinner className="h-4 w-4" />} Search jobs</button>
      </div>

      {results && results.length === 0 && <EmptyState title="No results" body="The configured job source returned no matching listings. Adjust the filters or import a job URL." />}
      {results && results.length > 0 && (
        <>
          <p className="text-xs text-ink-400">Fit fields are informational measurements against your Master CV — not a ranking or recommendation.</p>
          <div className="space-y-3">
            {results.map((r) => <JobResultCard key={r.id} r={r} onSaved={onSaved} />)}
          </div>
        </>
      )}
    </div>
  );
}

function JobResultCard({ r }: { r: DiscoverResult; onSaved?: () => Promise<void> }) {
  const fit = r.fit;
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">{r.title}{r.company ? ` · ${r.company}` : ''}</h3>
          <p className="mt-0.5 text-xs text-ink-400">{[r.location, r.salary, r.remote_type, r.source].filter(Boolean).join(' · ')}</p>
        </div>
        <span className={`chip ${fit.matchPercentage >= 70 ? 'bg-emerald-50 text-emerald-700' : fit.matchPercentage >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{fit.matchPercentage}% match</span>
      </div>
      <div className="mt-2 text-xs text-ink-600">
        <p><span className="font-semibold">Matching:</span> {fit.matchedRequirements.slice(0, 6).join(', ') || '—'}</p>
        <p><span className="font-semibold">Missing:</span> {fit.missingRequirements.slice(0, 6).join(', ') || '—'}</p>
        {fit.relevantEvidence.length > 0 && (
          <p className="mt-1"><span className="font-semibold">Evidence:</span> {fit.relevantEvidence[0].requirement} → {fit.relevantEvidence[0].evidence}</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {r.url && <a className="btn-secondary px-3 py-1.5 text-xs" href={r.url} target="_blank" rel="noreferrer">Open job</a>}
      </div>
    </div>
  );
}

function ImportTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ job: { title: string; company: string; location: string; salary: string; description: string; url: string }; fit: FitSummary } | null>(null);
  const [manual, setManual] = useState('');
  const toast = useToast();
  const navigate = useNavigate();

  async function importUrl() {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post<{ job: { title: string; company: string; location: string; salary: string; description: string; url: string }; fit: FitSummary }>('/jobs/import-url', { url });
      setResult(res);
      await onSaved();
      toast.show('Job imported and saved.', 'success');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Import failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function analyzeManual() {
    if (manual.trim().length < 80) {
      toast.show('Paste the complete job description first.', 'error');
      return;
    }
    navigate('/tailor');
    sessionStorage.setItem('curevo_manual_jd', manual);
  }

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <label className="label" htmlFor="job-url">Job posting URL</label>
        <div className="flex gap-2">
          <input id="job-url" className="input flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/job/123" />
          <button className="btn-primary" disabled={busy || !url.trim()} onClick={() => void importUrl()}>{busy && <Spinner className="h-4 w-4" />} Import</button>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Safe fetching only: http/https, public addresses, 12s timeout, 2 MB limit. Pages requiring login or JavaScript may fail — paste the description manually instead.
        </p>
      </div>

      {result && (
        <div className="card border-brand-100 bg-brand-50/40 p-5">
          <h3 className="text-sm font-semibold text-brand-900">{result.job.title}{result.job.company ? ` · ${result.job.company}` : ''}</h3>
          <p className="mt-0.5 text-xs text-ink-500">{[result.job.location, result.job.salary].filter(Boolean).join(' · ')}</p>
          <p className="mt-2 text-sm text-ink-700">Match: {result.fit.matchPercentage}% · Missing: {result.fit.missingRequirements.slice(0, 5).join(', ') || '—'}</p>
          <p className="mt-1 text-xs text-ink-400">{result.fit.atsObservation}</p>
        </div>
      )}

      <div className="card p-6">
        <label className="label" htmlFor="manual-jd">Or paste the job description manually</label>
        <textarea id="manual-jd" className="input min-h-[160px] font-mono text-[13px]" rows={6} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Paste the complete job description…" />
        <button className="btn-secondary mt-3" onClick={() => void analyzeManual()}>Continue to analysis</button>
      </div>
    </div>
  );
}
