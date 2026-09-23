import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import ResumeFormEditor from '../components/ResumeFormEditor';
import ResumePreview from '../components/ResumePreview';
import { ScoreBar, ScoreRing, Spinner } from '../components/ui';
import { useToast } from '../state/ToastContext';
import type { ATSAnalysis, ResumeData } from '../types';

interface MasterResponse {
  master: { id: string; title: string; content: ResumeData; atsScore: number; completeness: number; updatedAt: string } | null;
}

export default function MasterCVPage() {
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [masterId, setMasterId] = useState('');
  const [ats, setAts] = useState<ATSAnalysis | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<MasterResponse>('/master');
        if (res.master) {
          setResume(res.master.content);
          setMasterId(res.master.id);
          const a = await api.get<{ analysis: ATSAnalysis }>('/master/ats');
          setAts(a.analysis);
        }
      } catch {
        toast.show('Could not load your Master CV.', 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = useCallback((fn: (draft: ResumeData) => void) => {
    setResume((r) => {
      if (!r) return r;
      const draft = JSON.parse(JSON.stringify(r)) as ResumeData;
      fn(draft);
      return draft;
    });
    setDirty(true);
  }, []);

  async function save() {
    if (!resume) return;
    setBusy(true);
    try {
      const res = await api.put<{ id: string; atsScore: number }>('/master', { resume, title: 'Master CV' });
      setMasterId(res.id);
      setDirty(false);
      const a = await api.get<{ analysis: ATSAnalysis }>('/master/ats');
      setAts(a.analysis);
      toast.show(`Saved — ATS compatibility ${res.atsScore}/100`, 'success');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not save changes.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner className="h-8 w-8 text-ink-300" /></div>;
  }

  if (!resume) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold text-ink-900">No Master CV yet</h1>
        <p className="mt-2 text-sm text-ink-500">Create it from the dashboard to unlock analysis and tailoring.</p>
        <a className="btn-primary mt-4" href="/onboarding">Create Master CV</a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Master CV</h1>
          <p className="mt-0.5 text-sm text-ink-500">Your permanent source of truth. Tailored versions are created from this — never the other way around.</p>
        </div>
        <button className="btn-primary" onClick={() => void save()} disabled={busy || !dirty}>
          {busy && <Spinner className="h-4 w-4" />} {dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <ResumeFormEditor resume={resume} onChange={patch} />

        <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900">ATS Compatibility</h2>
              <span className="chip bg-ink-100 text-ink-600">EnhanceCV metric</span>
            </div>
            {ats ? (
              <>
                <div className="mt-4 flex justify-center">
                  <ScoreRing score={ats.overallScore} size={110} label="out of 100" />
                </div>
                <div className="mt-5 space-y-3">
                  <ScoreBar label="Formatting" score={ats.formattingScore} />
                  <ScoreBar label="Structure" score={ats.structureScore} />
                  <ScoreBar label="Content" score={ats.contentScore} />
                  <ScoreBar label="Skills" score={ats.skillsScore} />
                  <ScoreBar label="Readability" score={ats.readabilityScore} />
                </div>
                <p className="mt-4 text-xs leading-relaxed text-ink-400">
                  {ats.metrics.bulletCount} bullets · {ats.metrics.technicalSkillCount} technical skills · ~{ats.metrics.estimatedPages} page(s)
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-500">Save your CV to see the analysis.</p>
            )}
          </div>

          {ats && ats.issues.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-ink-900">What needs improvement</h2>
              <ul className="mt-3 space-y-3">
                {ats.issues.slice(0, 5).map((i) => (
                  <li key={i.message} className="text-sm">
                    <p className="font-medium text-ink-800">{i.message}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{i.recommendation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ats && ats.working.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-ink-900">What is working</h2>
              <ul className="mt-3 space-y-2">
                {ats.working.slice(0, 5).map((w) => (
                  <li key={w} className="flex gap-2 text-sm text-ink-600">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true">
                      <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" />
                    </svg>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card overflow-hidden">
            <h2 className="px-5 pt-5 text-sm font-semibold text-ink-900">Preview</h2>
            <div className="mt-3 max-h-[60vh] overflow-y-auto bg-ink-100 p-4">
              <div style={{ zoom: 0.62 }}>
                <ResumePreview resume={resume} />
              </div>
            </div>
          </div>
          <input type="hidden" value={masterId} />
        </div>
      </div>
    </div>
  );
}
