import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { ScoreBar, ScoreRing, Spinner, StatusChip } from '../components/ui';
import { useToast } from '../state/ToastContext';
import type { ChangeLogEntry, JobAnalysis, MatchAnalysis, ResumeData, TruthReport } from '../types';

interface TailorResponse {
  runId: string;
  versionId: string;
  title: string;
  before: { ats: number; match: number; keywordCoverage: number; matchedSkills: number; missingSkills: number };
  after: { ats: number; match: number; keywordCoverage: number; matchedSkills: number; missingSkills: number };
  changeLog: ChangeLogEntry[];
  truth: TruthReport;
  resume: ResumeData;
}

type Stage = 'input' | 'analysed' | 'generating' | 'result';

export default function Tailor() {
  const [stage, setStage] = useState<Stage>('input');
  const [jdText, setJdText] = useState('');
  const [jobId, setJobId] = useState('');
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [match, setMatch] = useState<MatchAnalysis | null>(null);
  const [result, setResult] = useState<TailorResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Tailor Your CV — EnhanceCV';
  }, []);

  async function loadExample() {
    try {
      const res = await api.get<{ text: string }>('/jobs/example');
      setJdText(res.text);
    } catch {
      toast.show('Could not load the example job description.', 'error');
    }
  }

  async function analyse() {
    if (jdText.trim().length < 80) {
      toast.show('Paste the complete job description first (at least a few sentences).', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ jobId: string; analysis: JobAnalysis; match: MatchAnalysis | null }>('/jobs/analyse', { text: jdText });
      setJobId(res.jobId);
      setAnalysis(res.analysis);
      setMatch(res.match);
      setStage('analysed');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Analysis failed. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setStage('generating');
    try {
      const res = await api.post<TailorResponse>(`/jobs/${jobId}/tailor`, {});
      setResult(res);
      setStage('result');
      window.scrollTo({ top: 0 });
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Tailoring failed. Please try again.', 'error');
      setStage('analysed');
    }
  }

  // ---------------- INPUT ----------------
  if (stage === 'input' || (stage === 'analysed' && !analysis)) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Tailor Your CV</h1>
          <p className="mt-1 text-sm text-ink-500">
            Paste a complete job description. EnhanceCV analyses it, matches it against your Master CV and generates a truthful tailored version.
          </p>
        </div>
        <div className="card p-6">
          <label className="label" htmlFor="jd">Job description</label>
          <textarea
            id="jd"
            className="input min-h-[360px] font-mono text-[13px] leading-relaxed"
            placeholder="Paste the complete job description here..."
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-primary px-6" onClick={() => void analyse()} disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} Analyse Job
            </button>
            <button className="btn-secondary" onClick={() => setJdText('')} disabled={busy}>Clear</button>
            <button className="btn-ghost" onClick={() => void loadExample()} disabled={busy}>Use example JD</button>
            <span className="ml-auto text-xs text-ink-400">{jdText.trim().split(/\s+/).filter(Boolean).length} words</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- GENERATING ----------------
  if (stage === 'generating') {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <Spinner className="h-10 w-10 text-brand-500" />
        <h2 className="mt-6 text-lg font-semibold text-ink-900">Tailoring your CV…</h2>
        <ol className="mx-auto mt-6 max-w-xs space-y-2 text-left text-sm text-ink-500">
          <li>✓ Running the tailoring engine</li>
          <li>✓ Improving weak bullets (evidence-checked)</li>
          <li>✓ Validating every claim against your Master CV</li>
          <li>✓ Scoring the tailored result</li>
        </ol>
      </div>
    );
  }

  // ---------------- RESULT ----------------
  if (stage === 'result' && result) {
    const improved = result.after.ats - result.before.ats;
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Your tailored CV is ready</h1>
            <p className="mt-1 text-sm text-ink-500">{result.title}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => navigate('/app/resumes')}>My Resumes</button>
            <button className="btn-primary" onClick={() => navigate(`/app/resumes/${result.versionId}/edit`)}>Open in Editor</button>
          </div>
        </div>

        {/* Before / after */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="card p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Current CV (Master)</p>
            <div className="mt-3 flex items-center gap-4">
              <ScoreRing score={result.before.ats} size={80} label="ATS" />
              <ScoreRing score={result.before.match} size={80} label="Job Match" />
            </div>
            <p className="mt-3 text-xs text-ink-500">Keyword coverage {result.before.keywordCoverage}% · {result.before.matchedSkills} matched skills · {result.before.missingSkills} missing</p>
          </div>
          <div className="card border-emerald-100 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Tailored CV (recalculated)</p>
            <div className="mt-3 flex items-center gap-4">
              <ScoreRing score={result.after.ats} size={80} label={`ATS ${improved >= 0 ? '+' : ''}${improved}`} />
              <ScoreRing score={result.after.match} size={80} label={`Match ${result.after.match - result.before.match >= 0 ? '+' : ''}${result.after.match - result.before.match}`} />
            </div>
            <p className="mt-3 text-xs text-ink-500">Keyword coverage {result.after.keywordCoverage}% · {result.after.matchedSkills} matched skills · {result.after.missingSkills} missing</p>
          </div>
        </div>

        {/* Truth check */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Truth check</h2>
            <span className={`chip ${result.truth.passedAll ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {result.truth.passedAll ? 'All bullets supported by Master CV' : `${result.truth.autoFixed.length} issue(s) auto-fixed`}
            </span>
          </div>
          <div className="mt-4 space-y-1.5 font-mono text-xs">
            {result.truth.checks.slice(0, 8).map((c, i) => (
              <p key={i} className={c.status === 'supported' ? 'text-emerald-700' : c.status === 'reverted' ? 'text-amber-700' : 'text-red-700'}>
                {c.status === 'supported' ? '✓' : '⚠'} {c.note || c.bullet.slice(0, 100)}
              </p>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-400">Every generated bullet is checked against your Master CV; unsupported claims are automatically reverted.</p>
        </div>

        {/* Change log */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900">What changed ({result.changeLog.length} improvements)</h2>
          <div className="mt-4 space-y-4">
            {result.changeLog.slice(0, 12).map((c, i) => (
              <div key={i} className="rounded-xl border border-ink-100 p-4">
                <div className="flex items-center gap-2">
                  <span className="chip bg-brand-50 text-brand-700">{c.type}</span>
                  <span className="text-xs font-medium text-ink-500">{c.section}</span>
                </div>
                <p className="mt-2 text-xs text-ink-500">{c.reason}</p>
                {c.before && c.after && c.before !== c.after && (
                  <div className="mt-2 grid gap-2 text-sm">
                    <p className="rounded-lg bg-red-50/70 px-3 py-2 text-red-800"><span className="font-semibold">Before:</span> {c.before.length > 240 ? `${c.before.slice(0, 240)}…` : c.before}</p>
                    <p className="rounded-lg bg-emerald-50/70 px-3 py-2 text-emerald-900"><span className="font-semibold">After:</span> {c.after.length > 240 ? `${c.after.slice(0, 240)}…` : c.after}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {result.changeLog.length > 12 && <p className="mt-3 text-xs text-ink-400">…and {result.changeLog.length - 12} more. Open the editor to review everything.</p>}
        </div>

        <div className="flex justify-center">
          <button className="btn-primary px-8 py-3" onClick={() => navigate(`/app/resumes/${result.versionId}/edit`)}>Edit & Download</button>
        </div>
      </div>
    );
  }

  // ---------------- ANALYSED ----------------
  const a = analysis!;
  const m = match;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Job Analysis</h1>
        <p className="mt-1 text-sm text-ink-500">{a.title}{a.company ? ` · ${a.company}` : ''} · {a.seniority}{a.yearsRequired ? ` · ${a.yearsRequired}+ years` : ''}</p>
      </div>

      {m ? (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          {/* Score card */}
          <div className="card p-6 lg:sticky lg:top-24 lg:self-start">
            <div className="text-center">
              <ScoreRing score={m.score} size={130} label="EnhanceCV Job Match" />
              <p className="mt-2 text-xs leading-relaxed text-ink-400">
                An explainable match metric — not a prediction of any employer's ATS.
              </p>
            </div>
            <div className="mt-5 space-y-3">
              {m.breakdown.filter((b) => b.weight >= 5).map((b) => (
                <ScoreBar key={b.key} label={b.label} score={b.score} hint={b.detail} />
              ))}
            </div>
          </div>

          {/* Requirements */}
          <div className="space-y-5">
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-ink-900">Requirements</h2>
              <div className="mt-3 space-y-2">
                {m.items.filter((i) => i.type === 'required').map((i) => (
                  <div key={i.requirement} className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2">
                    <div>
                      <span className="text-sm font-medium text-ink-800">{i.requirement}</span>
                      <span className="ml-2 text-xs text-ink-400">{i.evidence}</span>
                    </div>
                    <StatusChip status={i.status}>{i.status.toUpperCase()}</StatusChip>
                  </div>
                ))}
                {m.items.filter((i) => i.type === 'preferred').length > 0 && (
                  <>
                    <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Preferred</p>
                    {m.items.filter((i) => i.type === 'preferred').map((i) => (
                      <div key={i.requirement} className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2">
                        <div>
                          <span className="text-sm font-medium text-ink-800">{i.requirement}</span>
                          <span className="ml-2 text-xs text-ink-400">{i.evidence}</span>
                        </div>
                        <StatusChip status={i.status}>{i.status.toUpperCase()}</StatusChip>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {m.missingSkills.length > 0 && (
              <div className="card border-amber-100 bg-amber-50/50 p-6">
                <h2 className="text-sm font-semibold text-amber-900">Missing from your profile</h2>
                <p className="mt-1 text-xs text-amber-700">
                  These will <strong>not</strong> be added to your CV. If you actually have this experience, add evidence to your Master CV first.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.missingSkills.map((s) => (
                    <span key={s} className="chip bg-white text-amber-800 ring-1 ring-amber-200">{s}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="card p-6">
              <h2 className="text-sm font-semibold text-ink-900">Keyword coverage</h2>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${m.keywordCoverage.percent}%` }} />
                </div>
                <span className="text-sm font-semibold text-ink-800">{m.keywordCoverage.percent}%</span>
              </div>
              {m.keywordCoverage.missing.length > 0 && (
                <p className="mt-2 text-xs text-ink-500">Not yet in your CV: {m.keywordCoverage.missing.slice(0, 10).join(', ')}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="btn-primary px-6 py-3" onClick={() => void generate()}>Generate Tailored CV</button>
              <button className="btn-secondary py-3" onClick={() => { setStage('input'); setAnalysis(null); setMatch(null); }}>Analyse another job</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900">JD analysis complete</h2>
          <p className="mt-2 text-sm text-ink-500">
            Required skills: {a.requiredSkills.join(', ') || '—'}
          </p>
          <p className="mt-1 text-sm text-ink-500">Create your Master CV to see the match analysis.</p>
          <Link className="btn-primary mt-4 w-fit" to="/onboarding">Create Master CV</Link>
        </div>
      )}
    </div>
  );
}
