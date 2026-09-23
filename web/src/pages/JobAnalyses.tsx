import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, ScoreRing, StatusChip } from '../components/ui';
import type { JobAnalysis, MatchAnalysis } from '../types';

interface JobListItem {
  id: string;
  title: string;
  company: string;
  createdAt: string;
  analysis: JobAnalysis | null;
  matchScore: number | null;
}

export default function JobAnalyses() {
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchAnalysis | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void api.get<{ jobs: JobListItem[] }>('/jobs').then((r) => setJobs(r.jobs)).catch(() => setJobs([]));
  }, []);

  async function open(id: string) {
    if (expanded === id) {
      setExpanded(null);
      setMatch(null);
      return;
    }
    setExpanded(id);
    setMatch(null);
    const res = await api.get<{ match: MatchAnalysis | null }>(`/jobs/${id}`);
    setMatch(res.match);
  }

  if (!jobs) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Job Analyses</h1>
          <p className="mt-1 text-sm text-ink-500">Every job description you have analysed, with its match against your Master CV.</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/tailor')}>Analyse a new job</button>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No job analyses yet"
          body="Paste a job description on the Tailor page to see required skills, match scores and gaps — then generate a truthful tailored CV."
          action={<button className="btn-primary" onClick={() => navigate('/tailor')}>Tailor My CV to a Job</button>}
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <div key={j.id} id={`job-${j.id}`} className="card overflow-hidden">
              <button
                className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 text-left"
                onClick={() => void open(j.id)}
                aria-expanded={expanded === j.id}
              >
                <div>
                  <h2 className="text-sm font-semibold text-ink-900">{j.title}</h2>
                  <p className="text-xs text-ink-400">
                    {j.company ? `${j.company} · ` : ''}
                    {new Date(j.createdAt + 'Z').toLocaleString()} · {j.analysis ? `${j.analysis.requiredSkills.length} required skills` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {j.matchScore !== null && (
                    <span className={`chip ${j.matchScore >= 70 ? 'bg-emerald-50 text-emerald-700' : j.matchScore >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                      Match {j.matchScore}
                    </span>
                  )}
                  <span className="text-ink-400" aria-hidden="true">{expanded === j.id ? '▾' : '▸'}</span>
                </div>
              </button>

              {expanded === j.id && j.analysis && (
                <div className="border-t border-ink-100 px-6 py-5">
                  <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
                    <div className="flex flex-col items-center">
                      {match ? (
                        <>
                          <ScoreRing score={match.score} size={120} label="Job Match" />
                          <p className="mt-2 text-center text-xs text-ink-400">{match.matchedSkills.length} matched · {match.partialSkills.length} partial · {match.missingSkills.length} missing</p>
                        </>
                      ) : (
                        <p className="text-sm text-ink-400">No match analysis stored for this job.</p>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Required skills</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {j.analysis.requiredSkills.map((s) => {
                            const item = match?.items.find((i) => i.requirement === s);
                            return item ? <StatusChip key={s} status={item.status}>{s}</StatusChip> : <span key={s} className="chip bg-ink-100 text-ink-600">{s}</span>;
                          })}
                        </div>
                      </div>
                      {j.analysis.preferredSkills.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Preferred</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {j.analysis.preferredSkills.map((s) => {
                              const item = match?.items.find((i) => i.requirement === s);
                              return item ? <StatusChip key={s} status={item.status}>{s}</StatusChip> : <span key={s} className="chip bg-ink-100 text-ink-600">{s}</span>;
                            })}
                          </div>
                        </div>
                      )}
                      {match && match.missingSkills.length > 0 && (
                        <p className="text-xs text-amber-700">
                          Missing from your profile: {match.missingSkills.join(', ')} — add evidence to your Master CV if you have this experience.
                        </p>
                      )}
                      <button className="btn-secondary" onClick={() => navigate('/tailor')}>Tailor this job again</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
