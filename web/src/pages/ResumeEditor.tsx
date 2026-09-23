// Three-pane resume editor: sections editor (left), live preview (center),
// AI suggestions + analysis (right). Includes undo/redo, section visibility,
// section reordering and PDF download.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, downloadFile, ApiError } from '../api';
import ResumeFormEditor from '../components/ResumeFormEditor';
import ResumePreview from '../components/ResumePreview';
import { ScoreRing, Spinner, StatusChip } from '../components/ui';
import { useToast } from '../state/ToastContext';
import type { ATSAnalysis, MatchAnalysis, ResumeData, SectionKey, Suggestion } from '../types';

const SECTION_LABELS: Record<SectionKey, string> = {
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  certifications: 'Certifications',
  languages: 'Languages',
  achievements: 'Achievements',
};

export default function ResumeEditor() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [kind, setKind] = useState<'master' | 'tailored'>('tailored');
  const [ats, setAts] = useState<ATSAnalysis | null>(null);
  const [match, setMatch] = useState<MatchAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'suggestions' | 'analysis'>('suggestions');
  const [pane, setPane] = useState<'edit' | 'preview'>('edit'); // mobile toggle
  const undoStack = useRef<ResumeData[]>([]);
  const redoStack = useRef<ResumeData[]>([]);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const r = await api.get<{ resume: { title: string; content: ResumeData; kind: 'master' | 'tailored' } }>(`/resumes/${id}`);
        setTitle(r.resume.title);
        setResume(r.resume.content);
        setKind(r.resume.kind);
        const [a, s] = await Promise.all([
          api.get<{ analysis: ATSAnalysis }>(`/resumes/${id}/ats`),
          api.get<{ suggestions: Suggestion[] }>(`/resumes/${id}/suggestions`),
        ]);
        setAts(a.analysis);
        setSuggestions(s.suggestions);
        if (r.resume.kind === 'tailored') {
          try {
            const m = await api.get<{ match: MatchAnalysis }>(`/resumes/${id}/match`);
            setMatch(m.match);
          } catch {
            /* not linked to a job */
          }
        }
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : 'Could not load this resume.', 'error');
        navigate('/app/resumes');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const apply = useCallback((fn: (draft: ResumeData) => void) => {
    setResume((r) => {
      if (!r) return r;
      undoStack.current.push(r);
      if (undoStack.current.length > 60) undoStack.current.shift();
      redoStack.current = [];
      const draft = JSON.parse(JSON.stringify(r)) as ResumeData;
      fn(draft);
      return draft;
    });
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    setResume((r) => {
      const prev = undoStack.current.pop();
      if (!prev || !r) return r;
      redoStack.current.push(r);
      return prev;
    });
    setDirty(true);
  }, []);

  const redo = useCallback(() => {
    setResume((r) => {
      const next = redoStack.current.pop();
      if (!next || !r) return r;
      undoStack.current.push(r);
      return next;
    });
    setDirty(true);
  }, []);

  async function save() {
    if (!resume) return;
    setBusy(true);
    try {
      const res = await api.put<{ atsScore: number }>(`/resumes/${id}`, { resume, title });
      const a = await api.get<{ analysis: ATSAnalysis }>(`/resumes/${id}/ats`);
      setAts(a.analysis);
      const s = await api.get<{ suggestions: Suggestion[] }>(`/resumes/${id}/suggestions`);
      setSuggestions(s.suggestions);
      if (kind === 'tailored') {
        try {
          const m = await api.get<{ match: MatchAnalysis }>(`/resumes/${id}/match`);
          setMatch(m.match);
        } catch { /* unlinked */ }
      }
      setDirty(false);
      toast.show(`Saved — ATS ${res.atsScore}/100`, 'success');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Save failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function applySuggestion(s: Suggestion) {
    if (!resume) return;
    apply((d) => {
      if (s.kind === 'skill' && s.current === d.skills.technical.join(', ')) {
        d.skills.technical = s.suggested.split(',').map((x) => x.trim()).filter(Boolean);
        return;
      }
      if (s.itemId && s.bulletIndex !== undefined) {
        for (const exp of d.experience) {
          if (exp.id === s.itemId) {
            exp.bullets[s.bulletIndex] = s.suggested;
            return;
          }
        }
        for (const p of d.projects) {
          if (p.id === s.itemId) {
            p.bullets[s.bulletIndex] = s.suggested;
            return;
          }
        }
      }
      if (s.kind === 'summary') {
        // summary suggestions ask the user to write one; focus the field instead
        return;
      }
    });
    setSuggestions((list) => list.filter((x) => x.id !== s.id));
    toast.show('Suggestion applied — remember to save.', 'success');
  }

  function toggleSection(key: SectionKey) {
    apply((d) => {
      d.hiddenSections = d.hiddenSections.includes(key)
        ? d.hiddenSections.filter((k) => k !== key)
        : [...d.hiddenSections, key];
    });
  }

  function moveSection(key: SectionKey, dir: -1 | 1) {
    apply((d) => {
      const i = d.sectionOrder.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.sectionOrder.length) return;
      const [item] = d.sectionOrder.splice(i, 1);
      d.sectionOrder.splice(j, 0, item);
    });
  }

  if (!resume) {
    return <div className="flex justify-center py-24"><Spinner className="h-8 w-8 text-ink-300" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <input
            className="w-full max-w-md border-0 bg-transparent p-0 text-xl font-bold text-ink-900 focus:outline-none focus:ring-0"
            value={title}
            aria-label="Resume title"
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          />
          <p className="text-xs text-ink-400">
            {kind === 'master' ? 'Master CV' : 'Tailored version'} · {dirty ? 'Unsaved changes' : 'All changes saved'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={undo} disabled={undoStack.current.length === 0} aria-label="Undo">↶ Undo</button>
          <button className="btn-ghost" onClick={redo} disabled={redoStack.current.length === 0} aria-label="Redo">↷ Redo</button>
          <button className="btn-secondary" onClick={() => downloadFile(`/api/resumes/${id}/pdf`, `${title || 'resume'}.pdf`)}>Download PDF</button>
          <button className="btn-primary" onClick={() => void save()} disabled={busy || !dirty}>
            {busy && <Spinner className="h-4 w-4" />} Save
          </button>
        </div>
      </div>

      {/* Mobile pane switch */}
      <div className="flex gap-2 lg:hidden">
        <button className={`flex-1 rounded-lg py-2 text-sm font-medium ${pane === 'edit' ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200'}`} onClick={() => setPane('edit')}>Edit</button>
        <button className={`flex-1 rounded-lg py-2 text-sm font-medium ${pane === 'preview' ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200'}`} onClick={() => setPane('preview')}>Preview</button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(340px,380px)_minmax(0,1fr)_320px]">
        {/* LEFT: sections */}
        <div className={`space-y-3 ${pane === 'edit' ? '' : 'hidden lg:block'}`}>
          <div className="card p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Sections</h2>
            <ul className="space-y-1">
              {resume.sectionOrder.map((key, i) => {
                const hidden = resume.hiddenSections.includes(key);
                return (
                  <li key={key} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-ink-50">
                    <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-ink-700">
                      <input type="checkbox" checked={!hidden} onChange={() => toggleSection(key)} aria-label={`Show ${SECTION_LABELS[key]} section`} />
                      {SECTION_LABELS[key]}
                    </label>
                    <span className="flex gap-0.5">
                      <button className="btn-ghost px-1.5 py-0.5 text-xs" onClick={() => moveSection(key, -1)} disabled={i === 0} aria-label={`Move ${SECTION_LABELS[key]} up`}>↑</button>
                      <button className="btn-ghost px-1.5 py-0.5 text-xs" onClick={() => moveSection(key, 1)} disabled={i === resume.sectionOrder.length - 1} aria-label={`Move ${SECTION_LABELS[key]} down`}>↓</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <ResumeFormEditor resume={resume} onChange={apply} showPersonal={false} />
        </div>

        {/* CENTER: preview */}
        <div className={`${pane === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="xl:sticky xl:top-24">
            <div className="max-h-[calc(100vh-160px)] overflow-y-auto rounded-2xl bg-ink-100 p-5">
              <div style={{ zoom: 0.75 }}>
                <ResumePreview resume={resume} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: AI + analysis */}
        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          {ats && (
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink-900">ATS Compatibility</h2>
                <span className="chip bg-ink-100 text-ink-600">EnhanceCV metric</span>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <ScoreRing score={ats.overallScore} size={78} />
                <div className="min-w-0 flex-1 space-y-1 text-xs text-ink-500">
                  <p>Content {ats.contentScore} · Skills {ats.skillsScore}</p>
                  <p>Formatting {ats.formattingScore} · Structure {ats.structureScore}</p>
                  <p>Readability {ats.readabilityScore}</p>
                </div>
              </div>
              {match && (
                <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
                  <span className="text-sm font-medium text-ink-700">Job Match</span>
                  <StatusChip status={match.score >= 70 ? 'matched' : match.score >= 50 ? 'partial' : 'missing'}>{match.score}/100</StatusChip>
                </div>
              )}
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="flex border-b border-ink-100" role="tablist">
              <button className={`flex-1 px-4 py-3 text-sm font-semibold ${tab === 'suggestions' ? 'border-b-2 border-brand-600 text-brand-700' : 'text-ink-500'}`} role="tab" aria-selected={tab === 'suggestions'} onClick={() => setTab('suggestions')}>
                AI Suggestions ({suggestions.length})
              </button>
              <button className={`flex-1 px-4 py-3 text-sm font-semibold ${tab === 'analysis' ? 'border-b-2 border-brand-600 text-brand-700' : 'text-ink-500'}`} role="tab" aria-selected={tab === 'analysis'} onClick={() => setTab('analysis')}>
                Details
              </button>
            </div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
              {tab === 'suggestions' ? (
                suggestions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-400">No suggestions right now — save to re-run the checker.</p>
                ) : (
                  suggestions.map((s) => (
                    <div key={s.id} className="rounded-xl border border-ink-100 p-4">
                      <div className="flex items-center gap-2">
                        <span className="chip bg-brand-50 text-brand-700">{s.kind}</span>
                        <span className="text-xs font-medium text-ink-500">{s.section}</span>
                      </div>
                      <p className="mt-2 text-xs text-ink-500">{s.reason}</p>
                      {s.suggested && s.suggested !== s.current && s.kind !== 'quantification' && (
                        <>
                          <p className="mt-2 rounded-lg bg-red-50/70 px-3 py-1.5 text-xs text-red-800"><strong>Current:</strong> {s.current}</p>
                          <p className="mt-1.5 rounded-lg bg-emerald-50/70 px-3 py-1.5 text-xs text-emerald-900"><strong>Suggested:</strong> {s.suggested}</p>
                        </>
                      )}
                      {s.kind === 'quantification' && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{s.reason}</p>
                      )}
                      {s.suggested && s.suggested !== s.current && s.kind !== 'quantification' && (
                        <div className="mt-3 flex gap-2">
                          <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => applySuggestion(s)}>Accept</button>
                          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setSuggestions((l) => l.filter((x) => x.id !== s.id))}>Reject</button>
                        </div>
                      )}
                    </div>
                  ))
                )
              ) : (
                <div className="space-y-4 text-sm">
                  {ats && (
                    <>
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">What needs improvement</h3>
                        {ats.issues.length === 0 ? (
                          <p className="mt-2 text-ink-500">Nothing flagged — nice work.</p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {ats.issues.slice(0, 6).map((i) => (
                              <li key={i.message} className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
                                <p className="text-xs font-medium text-ink-800">{i.message}</p>
                                <p className="mt-0.5 text-xs text-ink-500">{i.recommendation}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">What is working</h3>
                        <ul className="mt-2 space-y-1.5">
                          {ats.working.slice(0, 5).map((w) => (
                            <li key={w} className="text-xs text-ink-600">✓ {w}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                  <Link to="/app/master" className="inline-block text-xs font-semibold text-brand-600 hover:text-brand-700">
                    Compare with Master CV →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
