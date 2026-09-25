// AI Tools: usage snapshot, cover letter generation and LinkedIn optimisation.
// Generation features require a configured AI provider — the UI shows a clear
// "not configured" state rather than faking results.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GrammarTool, TranslateTool, ResearchTool } from './AIToolsTabs';
import { api, ApiError, downloadFile } from '../api';
import { EmptyState, Spinner } from '../components/ui';
import { useToast } from '../state/ToastContext';
import type { AiStatus, CoverLetterSummary, LinkedinSuggestions, UsageSnapshot } from '../types';

const FEATURE_LABELS: Record<string, string> = {
  tailoring: 'AI tailoring',
  critique: 'AI critiques',
  coverLetter: 'Cover letters',
  linkedin: 'LinkedIn generations',
};

export default function AITools() {
  const [tab, setTab] = useState<'usage' | 'grammar' | 'translate' | 'research'>('usage');
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [letters, setLetters] = useState<CoverLetterSummary[] | null>(null);
  const [busy, setBusy] = useState('');
  const [linkedin, setLinkedin] = useState<LinkedinSuggestions | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const [u, s, l] = await Promise.all([
      api.get<UsageSnapshot>('/ai/usage'),
      api.get<AiStatus>('/ai/status'),
      api.get<{ coverLetters: CoverLetterSummary[] }>('/ai/cover-letters'),
    ]);
    setUsage(u);
    setAiStatus(s);
    setLetters(l.coverLetters);
  }, []);

  useEffect(() => {
    void load().catch(() => toast.show('Could not load AI tools.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function generateCoverLetter() {
    setBusy('cover');
    try {
      const res = await api.post<{ id: string }>('/ai/cover-letter', {});
      toast.show('Cover letter generated and saved.', 'success');
      await load();
      return res.id;
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Generation failed.', 'error');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function generateLinkedin() {
    setBusy('linkedin');
    setLinkedin(null);
    try {
      const res = await api.post<{ suggestions: LinkedinSuggestions }>('/ai/linkedin', {});
      setLinkedin(res.suggestions);
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Generation failed.', 'error');
    } finally {
      setBusy('');
    }
  }

  async function deleteLetter(id: string) {
    try {
      await api.del(`/ai/cover-letters/${id}`);
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Delete failed.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">AI Tools</h1>
        <p className="mt-1 text-sm text-ink-500">
          Truth-guarded AI helpers. Every claim is validated against your Master CV — nothing invented.
        </p>
      </div>

      {/* Usage */}
      {usage && (
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-900">This month's usage — {usage.plan} plan</h2>
            <Link className="text-xs font-semibold text-brand-600 hover:text-brand-700" to="/app/billing">Manage plan →</Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {usage.features.map((f) => {
              const pct = f.limit === 0 ? 100 : Math.min(100, Math.round((f.used / f.limit) * 100));
              const nearLimit = f.limit > 0 && f.used >= f.limit;
              return (
                <div key={f.feature} className="rounded-xl border border-ink-100 p-4">
                  <p className="text-xs font-medium text-ink-500">{FEATURE_LABELS[f.feature] || f.feature}</p>
                  <p className={`mt-1 text-lg font-bold ${nearLimit ? 'text-red-600' : 'text-ink-900'}`}>
                    {f.used} / {f.limit}
                  </p>
                  <div className="mt-2 h-1.5 rounded-full bg-ink-100">
                    <div className={`h-full rounded-full ${nearLimit ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!aiStatus?.enabled && (
        <div className="card border-amber-200 bg-amber-50/60 p-5">
          <h2 className="text-sm font-semibold text-amber-900">AI provider not configured</h2>
          <p className="mt-1 text-sm text-amber-800">
            Cover letters and LinkedIn optimisation need an AI provider configured on the server. Everything else in Curevo AI — analysis, matching, tailoring, PDF — keeps working without it.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist">
        {([['usage', 'Resume & Letters'], ['grammar', 'Grammar'], ['translate', 'Translate'], ['research', 'Company Research']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200'}`}
            onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'grammar' && <GrammarTool aiEnabled={!!aiStatus?.enabled} />}
      {tab === 'translate' && <TranslateTool aiEnabled={!!aiStatus?.enabled} />}
      {tab === 'research' && <ResearchTool aiEnabled={!!aiStatus?.enabled} />}

      <div className={tab === 'usage' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
        {/* Cover letters */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900">Cover Letter</h2>
          <p className="mt-1 text-xs text-ink-500">Truth-guarded letter based on your Master CV. Your most recent resume version and job are used when available.</p>
          <button className="btn-primary mt-4 w-full" disabled={busy !== '' || !aiStatus?.enabled} onClick={() => void generateCoverLetter()}>
            {busy === 'cover' && <Spinner className="h-4 w-4" />} Generate cover letter
          </button>

          {letters && letters.length > 0 && (
            <div className="mt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Saved letters ({letters.length})</p>
              {letters.slice(0, 5).map((l) => (
                <details key={l.id} className="rounded-xl border border-ink-100 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-ink-800">{l.title}</summary>
                  <div className="mt-3 space-y-2 text-sm text-ink-700">
                    <p>{l.letter.greeting}</p>
                    {l.letter.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                    <p>{l.letter.closing}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => downloadFile(`/api/ai/cover-letters/${l.id}/download`, 'Cover_Letter.pdf')}>Download PDF</button>
                    <button className="btn-ghost px-3 py-1.5 text-xs text-red-600 hover:bg-red-50" onClick={() => void deleteLetter(l.id)}>Delete</button>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

        {/* LinkedIn */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900">LinkedIn Optimizer</h2>
          <p className="mt-1 text-xs text-ink-500">Headline, About section, experience rewrites and skills — validated against your Master CV before shown.</p>
          <button className="btn-primary mt-4 w-full" disabled={busy !== '' || !aiStatus?.enabled} onClick={() => void generateLinkedin()}>
            {busy === 'linkedin' && <Spinner className="h-4 w-4" />} Generate suggestions
          </button>

          {linkedin && (
            <div className="mt-5 space-y-4 text-sm">
              <div className="rounded-xl border border-ink-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Headline</p>
                <p className="mt-1 text-ink-800">{linkedin.headline}</p>
                <CopyButton text={linkedin.headline} />
              </div>
              <div className="rounded-xl border border-ink-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">About</p>
                <p className="mt-1 whitespace-pre-wrap text-ink-800">{linkedin.about}</p>
                <CopyButton text={linkedin.about} />
              </div>
              {linkedin.experienceBullets.length > 0 && (
                <div className="rounded-xl border border-ink-100 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Experience rewrites (validated)</p>
                  <ul className="mt-2 space-y-2 text-xs">
                    {linkedin.experienceBullets.map((b, i) => (
                      <li key={i}>
                        <p className="text-red-700">− {b.current}</p>
                        <p className="text-emerald-800">+ {b.suggested}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {linkedin.skills.length > 0 && (
                <div className="rounded-xl border border-ink-100 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Skills to list</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {linkedin.skills.map((s) => <span key={s} className="chip bg-brand-50 text-brand-700">{s}</span>)}
                  </div>
                </div>
              )}
              <p className="text-xs text-ink-400">{linkedin.summaryNote}</p>
            </div>
          )}
        </div>
      </div>

      {letters && letters.length === 0 && !aiStatus?.enabled && (
        <EmptyState title="AI generation unavailable" body="Without an AI provider, these tools are disabled rather than faked. Configure AI_PROVIDER and AI_API_KEY on the server to enable them." />
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const toast = useToast();
  return (
    <button
      className="btn-ghost mt-2 px-2 py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.show('Copied.', 'success');
        } catch {
          toast.show('Could not copy — select the text manually.', 'error');
        }
      }}
    >
      Copy
    </button>
  );
}
