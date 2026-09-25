// Resume Health Center — deterministic component scores with explanations.
// AI involvement is explicitly labelled; no score is AI-generated.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { ScoreRing, Spinner } from '../components/ui';
import { useToast } from '../state/ToastContext';

interface HealthComponent {
  key: string;
  label: string;
  score: number;
  engine: 'deterministic';
  detail: string;
  issues?: { severity: string; message: string; recommendation: string }[];
}

interface HealthReport {
  resumeId: string;
  isMaster: boolean;
  components: HealthComponent[];
  aiLabel: string;
}

export default function HealthCenter() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(resumeId: string) {
    setBusy(true);
    try {
      const res = await api.get<HealthReport>(`/analytics/health${resumeId ? `?resumeId=${encodeURIComponent(resumeId)}` : ''}`);
      setReport(res);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not load the health report.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Resume Health Center</h1>
        <p className="mt-1 text-sm text-ink-500">Component-level health of your resume. Every score comes from the deterministic engines — nothing is invented.</p>
      </div>

      {busy && <div className="flex justify-center py-10"><Spinner className="h-8 w-8 text-brand-500" /></div>}

      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {report.components.map((c) => (
              <div key={c.key} className="card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink-900">{c.label}</h2>
                  <ScoreRing score={c.score} size={62} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-500">{c.detail}</p>
                {c.issues && c.issues.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-amber-700">
                    {c.issues.slice(0, 2).map((i) => <li key={i.message}>• {i.message}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="card p-5">
            <p className="text-xs text-ink-500">
              <span className="font-semibold text-ink-700">Engines:</span> all component scores above are computed by deterministic rules. {report.aiLabel}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn-secondary px-3 py-1.5 text-xs" to={report.isMaster ? '/app/master' : `/app/resumes/${report.resumeId}/edit`}>
                {report.isMaster ? 'Open Master CV editor' : 'Open resume editor'}
              </Link>
              <Link className="btn-ghost px-3 py-1.5 text-xs" to="/app/ai-tools">AI tools (grammar, translation)</Link>
              <Link className="btn-ghost px-3 py-1.5 text-xs" to="/tailor">Tailor to a job →</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
