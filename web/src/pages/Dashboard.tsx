import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, ScoreBar, ScoreRing } from '../components/ui';
import type { ATSAnalysis } from '../types';

interface DashboardData {
  user: { name: string; email: string; targetRole: string } | null;
  master: { id: string; completeness: number; atsScore: number; updatedAt: string } | null;
  ats: Pick<ATSAnalysis, 'overallScore' | 'formattingScore' | 'structureScore' | 'contentScore' | 'skillsScore' | 'readabilityScore' | 'issues' | 'working'> | null;
  resumes: { id: string; title: string; atsScore: number | null; updatedAt: string }[];
  jobs: { id: string; title: string; company: string; matchScore: number | null; createdAt: string }[];
  recentRun: { id: string; version_id: string; before_ats: number; after_ats: number; before_match: number; after_match: number; created_at: string } | null;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void api.get<DashboardData>('/dashboard').then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;

  const { master, ats } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">
            Welcome back{data.user?.name ? `, ${data.user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {data.user?.targetRole ? `Target role: ${data.user.targetRole}` : 'Analyse a job and tailor a truthful CV in minutes.'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/tailor')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Tailor My CV to a Job
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Master CV</h2>
              {master ? (
                <p className="mt-1 text-sm text-ink-500">{master.completeness}% complete</p>
              ) : (
                <p className="mt-1 text-sm text-ink-500">Not created yet</p>
              )}
            </div>
            <span className="chip bg-brand-50 text-brand-700">Source of truth</span>
          </div>
          {master ? (
            <>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${master.completeness}%` }} />
              </div>
              <Link className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700" to="/app/master">
                Edit Master CV →
              </Link>
            </>
          ) : (
            <Link className="btn-secondary mt-4 w-fit" to="/onboarding">Create it now</Link>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-start justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Current ATS Compatibility</h2>
            <span className="chip bg-ink-100 text-ink-600">EnhanceCV metric</span>
          </div>
          {ats ? (
            <div className="mt-3 flex items-center gap-5">
              <ScoreRing score={ats.overallScore} size={84} />
              <div className="flex-1 space-y-2">
                <ScoreBar label="Content" score={ats.contentScore} />
                <ScoreBar label="Skills" score={ats.skillsScore} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">Create your Master CV to see your baseline score.</p>
          )}
          {ats && <Link className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700" to="/app/master">View full analysis →</Link>}
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900">Recent Resumes</h2>
          {data.resumes.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {data.resumes.map((r) => (
                <li key={r.id}>
                  <Link to={`/app/resumes/${r.id}/edit`} className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-ink-50">
                    <span className="truncate text-sm font-medium text-ink-700 group-hover:text-brand-700">{r.title}</span>
                    {r.atsScore !== null && <span className="ml-2 shrink-0 text-sm font-semibold text-ink-500">{r.atsScore}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-500">No tailored resumes yet. Analyse a job to create your first one.</p>
          )}
          <Link className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700" to="/app/resumes">
            All resumes →
          </Link>
        </div>
      </div>

      {/* ATS issues */}
      {ats && ats.issues.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900">Top improvements for your Master CV</h2>
          <ul className="mt-3 space-y-2.5">
            {ats.issues.slice(0, 3).map((i) => (
              <li key={i.message} className="flex gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true">
                  <path d="M8.5 2.9a1.7 1.7 0 013 0l6.3 12.3A1.7 1.7 0 0116.3 18H3.7a1.7 1.7 0 01-1.5-2.8L8.5 2.9zM10 7a.9.9 0 00-.9 1v2.6a.9.9 0 001.8 0V8a.9.9 0 00-.9-1zm0 7.2a1 1 0 100 2 1 1 0 000-2z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-ink-800">{i.message}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{i.recommendation}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent job analyses */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900">Recent Job Analyses</h2>
          {data.jobs.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {data.jobs.map((j) => (
                <li key={j.id}>
                  <Link to={`/app/jobs#job-${j.id}`} className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-ink-50">
                    <span>
                      <span className="block truncate text-sm font-medium text-ink-700 group-hover:text-brand-700">{j.title}</span>
                      {j.company && <span className="block text-xs text-ink-400">{j.company}</span>}
                    </span>
                    {j.matchScore !== null && <span className={`chip ${j.matchScore >= 70 ? 'bg-emerald-50 text-emerald-700' : j.matchScore >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{j.matchScore}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-500">Paste a job description to see your first analysis here.</p>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900">Latest Tailoring Run</h2>
          {data.recentRun ? (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-ink-50 p-4 text-center">
                <p className="text-xs font-semibold uppercase text-ink-400">Before</p>
                <p className="mt-1 text-lg font-bold text-ink-800">ATS {data.recentRun.before_ats}</p>
                <p className="text-sm text-ink-500">Match {data.recentRun.before_match}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4 text-center">
                <p className="text-xs font-semibold uppercase text-emerald-600">After</p>
                <p className="mt-1 text-lg font-bold text-emerald-800">ATS {data.recentRun.after_ats}</p>
                <p className="text-sm text-emerald-700">Match {data.recentRun.after_match}</p>
              </div>
              <Link className="col-span-2 text-center text-sm font-semibold text-brand-600 hover:text-brand-700" to={`/app/resumes/${data.recentRun.version_id}/edit`}>
                Open the tailored resume →
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">Run your first tailoring to see before/after scores here.</p>
          )}
        </div>
      </div>

      {!master && (
        <EmptyState
          title="Start with your Master CV"
          body="Upload your existing CV or build one with the guided questionnaire. Everything else — analysis, matching, tailoring — builds on it."
          action={<Link className="btn-primary" to="/onboarding">Create Master CV</Link>}
        />
      )}
    </div>
  );
}
