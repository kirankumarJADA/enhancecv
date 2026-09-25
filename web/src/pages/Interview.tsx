// Interview hub: Prepare (question package), Mock Interview (text mode with
// truth-checked evaluation), and History. Voice mode is recorded as a mode on
// sessions — speech capture is a browser-side concern and evaluation is
// provider-abstracted; without an AI provider the mock uses honest generic
// questions and says so.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { EmptyState, Spinner } from '../components/ui';
import { useToast } from '../state/ToastContext';
import type { AiStatus } from '../types';

interface PrepQuestion {
  id?: string;
  position?: number;
  category: string;
  question: string;
  why_it_may_be_asked: string;
  evidence_from_cv: string;
  recommended_answer_structure: string;
  sample_truthful_answer?: string;
  answer?: string | null;
  evaluation?: MockEvaluation | null;
}

interface MockEvaluation {
  relevance: { level: 'low' | 'medium' | 'high'; explanation: string };
  evidenceUsage: string;
  structure: string;
  clarity: string;
  completeness: string;
  unsupportedClaims: string[];
  improvements: string[];
  followUpQuestion: string;
  overallFeedback: string;
}

interface SessionSummary {
  id: string;
  kind: 'PREP' | 'MOCK';
  mode: string;
  status: string;
  job_title: string | null;
  question_count: number;
  answer_count: number;
  created_at: string;
  overall_feedback: string | null;
}

type Tab = 'prepare' | 'mock' | 'history';

export default function Interview() {
  const { id } = useParams<{ id?: string }>();
  const [tab, setTab] = useState<Tab>(id ? 'mock' : 'prepare');
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [history, setHistory] = useState<SessionSummary[] | null>(null);

  const loadHistory = useCallback(async () => {
    const res = await api.get<{ sessions: SessionSummary[] }>('/interview/history');
    setHistory(res.sessions);
  }, []);

  useEffect(() => {
    void api.get<AiStatus>('/ai/status').then(setAi).catch(() => setAi(null));
    void loadHistory().catch(() => setHistory([]));
  }, [loadHistory]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Interview</h1>
        <p className="mt-1 text-sm text-ink-500">Prepare with truth-grounded questions and practise with a mock interviewer. Sample answers are built only from your Master CV.</p>
      </div>

      <div className="flex gap-2" role="tablist">
        {([['prepare', 'Prepare'], ['mock', 'Mock Interview'], ['history', 'History']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200'}`}
            onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'prepare' && <PrepareTab aiEnabled={!!ai?.enabled} onDone={() => void loadHistory()} />}
      {tab === 'mock' && <MockTab aiEnabled={!!ai?.enabled} />}
      {tab === 'history' && <HistoryTab history={history} />}

      {history !== null && history.length === 0 && tab === 'history' && (
        <EmptyState title="No interview sessions yet" body="Generate a preparation package or start a mock interview — sessions are saved here with full feedback." />
      )}
    </div>
  );
}

function PrepareTab({ aiEnabled, onDone }: { aiEnabled: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sessionId: string; questions: PrepQuestion[]; studyPlan: string[]; meta: { rejectedClaims: number } } | null>(null);
  const [jobId, setJobId] = useState('');
  const toast = useToast();

  async function prepare() {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post<{ sessionId: string; questions: PrepQuestion[]; studyPlan: string[]; meta: { rejectedClaims: number } }>(
        '/interview/prepare',
        jobId ? { jobId } : {},
      );
      setResult(res);
      onDone();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Preparation failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <label className="label" htmlFor="prep-job">Job description (optional — from your Job Analyses ID)</label>
        <div className="flex gap-2">
          <input id="prep-job" className="input flex-1" placeholder="Leave empty for general preparation, or paste a jobId" value={jobId} onChange={(e) => setJobId(e.target.value)} />
          <button className="btn-primary" disabled={busy || !aiEnabled} onClick={() => void prepare()}>
            {busy && <Spinner className="h-4 w-4" />} Generate preparation
          </button>
        </div>
        {!aiEnabled && <p className="mt-2 text-xs text-amber-700">Interview preparation requires a configured AI provider on this deployment.</p>}
      </div>

      {result && (
        <>
          <div className="card border-brand-100 bg-brand-50/50 p-5">
            <h2 className="text-sm font-semibold text-brand-900">Study plan</h2>
            <ul className="mt-2 space-y-1 text-sm text-brand-800">
              {result.studyPlan.map((s, i) => <li key={i}>• {s}</li>)}
            </ul>
            {result.meta.rejectedClaims > 0 && (
              <p className="mt-2 text-xs text-amber-700">{result.meta.rejectedClaims} unsupported sentence(s) were removed from sample answers by the Truth Guard.</p>
            )}
          </div>
          {result.questions.map((q, i) => (
            <details key={i} className="card p-5" open={i === 0}>
              <summary className="cursor-pointer">
                <span className="chip bg-ink-100 text-ink-600">{q.category}</span>
                <span className="ml-2 text-sm font-semibold text-ink-900">{q.question}</span>
              </summary>
              <div className="mt-3 space-y-2 text-sm text-ink-600">
                <p><span className="font-semibold text-ink-700">Why it may be asked:</span> {q.why_it_may_be_asked}</p>
                <p><span className="font-semibold text-ink-700">Evidence from your CV:</span> {q.evidence_from_cv}</p>
                <p><span className="font-semibold text-ink-700">Answer structure:</span> {q.recommended_answer_structure}</p>
                <div className="rounded-xl bg-emerald-50/70 p-3 text-emerald-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Sample truthful answer (Truth-Guarded)</p>
                  <p className="mt-1">{q.sample_truthful_answer}</p>
                </div>
              </div>
            </details>
          ))}
        </>
      )}
    </div>
  );
}

function MockTab({ aiEnabled }: { aiEnabled: boolean }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'active' | 'paused' | 'completed'>('idle');
  const [current, setCurrent] = useState<{ id: string; question: string; category: string } | null>(null);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<MockEvaluation | null>(null);
  const [progress, setProgress] = useState<{ answered: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'TEXT' | 'VOICE'>('TEXT');
  const [feedback, setFeedback] = useState('');
  const toast = useToast();

  async function start() {
    setBusy(true);
    setEvaluation(null);
    setFeedback('');
    try {
      const res = await api.post<{ sessionId: string; questions: { id?: string; position?: number; category: string; question: string }[]; meta: { provider: string } }>('/interview/session', { mode });
      setSessionId(res.sessionId);
      setCurrent(res.questions[0] ? { id: res.questions[0].id!, question: res.questions[0].question, category: res.questions[0].category } : null);
      setStatus('active');
      if (res.meta.provider === 'deterministic') {
        toast.show('AI provider not configured — running with generic questions and deterministic feedback only.', 'info');
      }
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not start the session.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer() {
    if (!sessionId || !current) return;
    setBusy(true);
    try {
      const res = await api.post<{ evaluation: MockEvaluation; next: { id: string; question: string; category: string } | null; progress: { answered: number; total: number } }>(
        `/interview/session/${sessionId}/answer`,
        { questionId: current.id, answer },
      );
      setEvaluation(res.evaluation);
      setProgress(res.progress);
      setAnswer('');
      setCurrent(res.next);
      if (!res.next) {
        await finish();
      }
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Evaluation failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!sessionId) return;
    try {
      const res = await api.post<{ overallFeedback: string }>(`/interview/session/${sessionId}/finish`);
      setFeedback(res.overallFeedback);
      setStatus('completed');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not finish.', 'error');
    }
  }

  async function togglePause() {
    if (!sessionId) return;
    const res = await api.post<{ status: string }>(`/interview/session/${sessionId}/pause`);
    setStatus(res.status.toLowerCase() as typeof status);
  }

  if (status === 'idle') {
    return (
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink-900">Start a mock interview</h2>
        <p className="mt-1 text-xs text-ink-500">Text mode: answer each question and get a truth-checked, explainable evaluation. No numeric score is invented — dimensions are qualitative.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select className="input w-40" value={mode} onChange={(e) => setMode(e.target.value as 'TEXT' | 'VOICE')} aria-label="Interview mode">
            <option value="TEXT">Text mode</option>
            <option value="VOICE">Voice mode (browser mic)</option>
          </select>
          <button className="btn-primary" disabled={busy} onClick={() => void start()}>{busy && <Spinner className="h-4 w-4" />} Start</button>
        </div>
        {mode === 'VOICE' && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Voice mode uses your browser microphone (with your permission) and a speech provider when configured. Without a speech provider the transcript falls back to typed answers — nothing is faked.
          </p>
        )}
        {!aiEnabled && (
          <p className="mt-3 text-xs text-amber-700">No AI provider configured: the session will run with generic questions and deterministic progress tracking only.</p>
        )}
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink-900">Session complete</h2>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-ink-50 p-4 text-sm text-ink-700">{feedback}</pre>
        <button className="btn-primary mt-4" onClick={() => { setStatus('idle'); setSessionId(null); setEvaluation(null); }}>Start another</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {progress && <p className="text-xs text-ink-400">Progress: {progress.answered}/{progress.total} answered</p>}
      {evaluation && (
        <div className="card border-brand-100 bg-brand-50/40 p-5">
          <h3 className="text-sm font-semibold text-brand-900">Evaluation of your last answer</h3>
          <div className="mt-2 grid gap-2 text-sm text-ink-700 sm:grid-cols-2">
            <p><span className="font-semibold">Relevance:</span> {evaluation.relevance.level} — {evaluation.relevance.explanation}</p>
            <p><span className="font-semibold">Evidence usage:</span> {evaluation.evidenceUsage}</p>
            <p><span className="font-semibold">Structure:</span> {evaluation.structure}</p>
            <p><span className="font-semibold">Clarity:</span> {evaluation.clarity}</p>
            <p className="sm:col-span-2"><span className="font-semibold">Completeness:</span> {evaluation.completeness}</p>
          </div>
          {evaluation.unsupportedClaims.length > 0 && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Claims needing evidence (deterministic check against your Master CV): {evaluation.unsupportedClaims.join(', ')}
            </p>
          )}
          {evaluation.improvements.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-ink-600">
              {evaluation.improvements.map((im, i) => <li key={i}>• {im}</li>)}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-400">Suggested follow-up: {evaluation.followUpQuestion}</p>
        </div>
      )}

      {current ? (
        <div className="card p-6">
          <span className="chip bg-ink-100 text-ink-600">{current.category}</span>
          <p className="mt-2 text-base font-semibold text-ink-900">{current.question}</p>
          {mode === 'VOICE' && (
            <p className="mt-2 text-xs text-ink-400">
              Voice capture: use your browser dictation or a configured speech provider, then paste/refine the transcript below (no transcript is fabricated).
            </p>
          )}
          <textarea className="input mt-3 min-h-[140px]" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer…" aria-label="Your answer" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy || answer.trim().length < 10} onClick={() => void submitAnswer()}>{busy && <Spinner className="h-4 w-4" />} Submit answer</button>
            <button className="btn-secondary" onClick={() => void togglePause()}>{status === 'paused' ? 'Continue' : 'Pause'}</button>
            <button className="btn-ghost" onClick={() => void finish()}>End session</button>
            <button className="btn-ghost" onClick={() => { setStatus('idle'); setSessionId(null); setEvaluation(null); }}>Restart</button>
          </div>
        </div>
      ) : (
        !feedback && <div className="card p-6 text-sm text-ink-500">All questions answered — finish to see the summary.</div>
      )}
    </div>
  );
}

function HistoryTab({ history }: { history: SessionSummary[] | null }) {
  if (!history) return null;
  return (
    <div className="space-y-3">
      {history.map((s) => (
        <details key={s.id} className="card p-5">
          <summary className="cursor-pointer">
            <span className="chip bg-brand-50 text-brand-700">{s.kind}</span>
            <span className="ml-2 text-sm font-semibold text-ink-900">{s.job_title || (s.kind === 'PREP' ? 'General preparation' : 'Mock interview')}</span>
            <span className="ml-2 text-xs text-ink-400">{s.mode} · {s.answer_count}/{s.question_count} answered · {new Date(s.created_at + 'Z').toLocaleString()}</span>
          </summary>
          {s.overall_feedback && <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-ink-50 p-4 text-sm text-ink-700">{s.overall_feedback}</pre>}
          <SessionDetailLink id={s.id} />
        </details>
      ))}
    </div>
  );
}

function SessionDetailLink({ id }: { id: string }) {
  const [detail, setDetail] = useState<{ questions: PrepQuestion[] } | null>(null);
  return (
    <div className="mt-2">
      <button className="btn-ghost px-2 py-1 text-xs" onClick={async () => {
        if (detail) { setDetail(null); return; }
        const res = await api.get<{ questions: PrepQuestion[] }>(`/interview/session/${id}`);
        setDetail(res);
      }}>
        {detail ? 'Hide details' : 'Show questions & answers'}
      </button>
      {detail && (
        <div className="mt-3 space-y-3">
          {detail.questions.map((q, i) => (
            <div key={i} className="rounded-xl border border-ink-100 p-4 text-sm">
              <span className="chip bg-ink-100 text-ink-600">{q.category}</span>
              <p className="mt-1.5 font-medium text-ink-900">{q.question}</p>
              {q.sample_truthful_answer && <p className="mt-1 text-xs text-emerald-800">Model answer: {q.sample_truthful_answer}</p>}
              {q.answer && <p className="mt-1 text-ink-700">Your answer: {q.answer}</p>}
              {q.evaluation?.overallFeedback && <p className="mt-1 text-xs text-ink-500">{q.evaluation.overallFeedback}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
