import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Logo, Spinner } from '../components/ui';
import ResumeFormEditor from '../components/ResumeFormEditor';
import ResumePreview from '../components/ResumePreview';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import type { ResumeData } from '../types';

type Stage = 'choose' | 'upload' | 'questionnaire' | 'review';

function emptyResume(): ResumeData {
  return {
    personal: { fullName: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '', headline: '' },
    summary: '',
    experience: [],
    projects: [],
    education: [],
    skills: { technical: [], soft: [] },
    certifications: [],
    languages: [],
    achievements: [],
    sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
    hiddenSections: [],
  };
}

export default function Onboarding() {
  const [stage, setStage] = useState<Stage>('choose');
  const [resume, setResume] = useState<ResumeData>(emptyResume());
  const [notes, setNotes] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh } = useAuth();

  const patch = useCallback((fn: (draft: ResumeData) => void) => {
    setResume((r) => {
      const draft = JSON.parse(JSON.stringify(r)) as ResumeData;
      fn(draft);
      return draft;
    });
  }, []);

  async function saveMaster() {
    setBusy(true);
    try {
      await api.put('/master', { resume, title: 'Master CV' });
      await refresh();
      toast.show('Master CV saved — welcome to EnhanceCV!', 'success');
      navigate('/app');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not save your Master CV.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    const ok = /\.(pdf|docx)$/i.test(file.name);
    if (!ok) {
      toast.show('Please upload a PDF or DOCX file.', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.show('File is too large (max 8 MB).', 'error');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.upload<{ resume: ResumeData; confidence: Record<string, string>; notes: string[] }>('/master/parse-upload', form);
      setResume({ ...emptyResume(), ...res.resume });
      setNotes(res.notes || []);
      setConfidence(res.confidence || {});
      setStage('review');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not parse this file. Try a text-based PDF or DOCX.', 'error');
    } finally {
      setBusy(false);
    }
  }

  // ---------------- CHOOSE ----------------
  if (stage === 'choose') {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl">
          <h1 className="text-center text-2xl font-bold text-ink-900">Do you already have a CV?</h1>
          <p className="mt-2 text-center text-ink-500">Your Master CV is the source of truth for everything EnhanceCV does.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <button
              className="card group p-8 text-left transition hover:border-brand-300 hover:shadow-lift"
              onClick={() => setStage('upload')}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
                  <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-ink-900">I have a CV</h2>
              <p className="mt-1.5 text-sm text-ink-500">Upload a PDF or DOCX. We extract the data, you review and correct it before anything is saved.</p>
            </button>
            <button
              className="card group p-8 text-left transition hover:border-brand-300 hover:shadow-lift"
              onClick={() => setStage('questionnaire')}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-ink-900">I don&apos;t have a CV</h2>
              <p className="mt-1.5 text-sm text-ink-500">Build one step by step with a guided questionnaire. Every field is optional except your name.</p>
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------------- UPLOAD ----------------
  if (stage === 'upload') {
    return (
      <Shell>
        <div className="mx-auto max-w-xl">
          <BackLink onClick={() => setStage('choose')} />
          <h1 className="text-center text-2xl font-bold text-ink-900">Upload your CV</h1>
          <p className="mt-2 text-center text-ink-500">PDF or DOCX, up to 8 MB. The file is parsed in memory and never shared.</p>
          <div
            className={`mt-8 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-14 text-center transition ${
              dragOver ? 'border-brand-400 bg-brand-50' : 'border-ink-200 bg-white'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            role="button"
            tabIndex={0}
            aria-label="Upload your CV file"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}
          >
            {busy ? <Spinner className="h-8 w-8 text-brand-500" /> : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10 text-ink-300" aria-hidden="true">
                  <path d="M7 21h10a2 2 0 002-2V9.4a2 2 0 00-.6-1.4l-4.4-4.4A2 2 0 0012.6 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 8v8m-4-4h8" strokeLinecap="round" />
                </svg>
                <p className="mt-3 text-sm font-medium text-ink-700">Drag your CV here, or click to browse</p>
                <p className="mt-1 text-xs text-ink-400">PDF or DOCX · max 8 MB · text-based files only (no scans)</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
          </div>
          {busy && <p className="mt-4 text-center text-sm text-ink-500">Reading your document…</p>}
        </div>
      </Shell>
    );
  }

  // ---------------- QUESTIONNAIRE ----------------
  if (stage === 'questionnaire') {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl">
          <BackLink onClick={() => setStage('choose')} />
          <h1 className="text-center text-2xl font-bold text-ink-900">Let&apos;s build your Master CV</h1>
          <p className="mt-2 text-center text-ink-500">
            Answer what you can — everything except your name can be skipped and edited later.
          </p>
          <div className="mt-8">
            <ResumeFormEditor resume={resume} onChange={patch} showPersonal />
          </div>
          <div className="mt-8 flex justify-center">
            <button className="btn-primary px-8 py-3" disabled={busy || !resume.personal.fullName.trim()} onClick={() => setStage('review')}>
              Review my CV
            </button>
          </div>
          {!resume.personal.fullName.trim() && <p className="mt-2 text-center text-xs text-ink-400">Add your name to continue.</p>}
        </div>
      </Shell>
    );
  }

  // ---------------- REVIEW ----------------
  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <BackLink onClick={() => setStage(resume.experience.length || resume.summary ? 'questionnaire' : 'upload')} />
        <h1 className="text-center text-2xl font-bold text-ink-900">Review your extracted CV</h1>
        <p className="mt-2 text-center text-ink-500">
          Extraction is helpful but imperfect — check every section and fix anything wrong before saving.
        </p>
        {notes.length > 0 && (
          <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
            {notes.map((n) => (
              <p key={n}>• {n}</p>
            ))}
          </div>
        )}
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Edit</h2>
            <ResumeFormEditor resume={resume} onChange={patch} />
            {Object.keys(confidence).length > 0 && (
              <div className="card mt-3 p-4">
                <p className="text-xs font-semibold text-ink-500">EXTRACTION CONFIDENCE</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(confidence).map(([k, v]) => (
                    <span key={k} className={`chip ${v === 'high' ? 'bg-emerald-50 text-emerald-700' : v === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="lg:sticky lg:top-6 lg:self-start">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Preview</h2>
            <div className="max-h-[80vh] overflow-y-auto rounded-xl bg-ink-100 p-4">
              <div style={{ zoom: 0.7 }}>
                <ResumePreview resume={resume} />
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-4 mt-8 flex justify-center">
          <button className="btn-primary px-8 py-3 shadow-lift" disabled={busy} onClick={() => void saveMaster()}>
            {busy && <Spinner className="h-4 w-4" />} Save as my Master CV
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <span className="text-sm text-ink-400">Step 1 of 1 · Master CV</span>
        </div>
      </header>
      <div className="px-4 py-10 sm:px-6">{children}</div>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn-ghost mb-4 -ml-3" onClick={onClick}>
      ← Back
    </button>
  );
}
