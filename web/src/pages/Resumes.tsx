import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, downloadFile, ApiError } from '../api';
import { EmptyState, Modal, Spinner } from '../components/ui';
import { useToast } from '../state/ToastContext';
import type { ResumeSummary } from '../types';

export default function Resumes() {
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [renaming, setRenaming] = useState<ResumeSummary | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [deleting, setDeleting] = useState<ResumeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const navigate = useNavigate();

  async function load() {
    try {
      const res = await api.get<{ resumes: ResumeSummary[] }>('/resumes');
      setResumes(res.resumes);
    } catch {
      toast.show('Could not load resumes.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rename() {
    if (!renaming) return;
    try {
      const full = await api.get<{ resume: { content: unknown } }>(`/resumes/${renaming.id}`);
      await api.put(`/resumes/${renaming.id}`, { resume: full.resume.content, title: newTitle.trim() });
      toast.show('Renamed successfully.', 'success');
      setRenaming(null);
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Rename failed.', 'error');
    }
  }

  async function duplicate(r: ResumeSummary) {
    try {
      await api.post(`/resumes/${r.id}/duplicate`, { title: `Copy of ${r.title}` });
      toast.show('Duplicated resume version.', 'success');
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Duplicate failed.', 'error');
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await api.del(`/resumes/${deleting.id}`);
      toast.show('Deleted tailored resume.', 'success');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Delete failed.', 'error');
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner className="h-8 w-8 text-ink-300" /></div>;
  }

  const master = resumes?.find((r) => r.kind === 'master');
  const versions = resumes?.filter((r) => r.kind === 'tailored') || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Career Profiles & Resumes</h1>
          <p className="mt-1 text-sm text-ink-500">
            One Master CV as your permanent source of truth, plus independent, versioned outputs tailored for specific roles.
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/builder?mode=improve')}>
          Tailor New CV
        </button>
      </div>

      {master ? (
        <div className="card border-brand-200 bg-gradient-to-r from-brand-50/40 via-white to-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                  <path d="M8 4h8a2 2 0 012 2v14l-6-3-6 3V6a2 2 0 012-2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-ink-900">{master.title}</h2>
                  <span className="chip bg-brand-100 font-semibold text-brand-800">Permanent Master CV</span>
                  {master.atsScore !== null && (
                    <span className="chip bg-emerald-50 text-emerald-700 font-medium">
                      ATS {master.atsScore}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-500">
                  Updated {new Date(master.updatedAt).toLocaleString()} · Never overwritten by AI tailoring
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="btn-secondary text-xs" to="/app/master">
                Manage Master CV
              </Link>
              <button
                className="btn-secondary text-xs"
                onClick={() => downloadFile(`/api/resumes/master/pdf`, 'MasterCV.pdf')}
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card border-dashed border-ink-200 p-6 text-center">
          <h2 className="text-base font-semibold text-ink-900">No Master CV created yet</h2>
          <p className="mt-1 text-xs text-ink-500">Your Master CV serves as the foundation for all AI tailoring and analysis.</p>
          <div className="mt-4">
            <Link className="btn-primary text-xs" to="/app/master">Create Master CV</Link>
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">
            Tailored Resume Versions ({versions.length})
          </h2>
          <span className="text-xs text-ink-400">Independent snapshots</span>
        </div>

        {versions.length === 0 ? (
          <EmptyState
            title="No tailored versions saved yet"
            body="Tailor your Master CV to target job descriptions — each tailored CV is saved here as an independent, job-specific version."
            action={<button className="btn-primary" onClick={() => navigate('/builder?mode=improve')}>Tailor My CV</button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {versions.map((r) => (
              <div key={r.id} className="card flex flex-col justify-between p-5 transition hover:shadow-md">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink-900 line-clamp-1">{r.title}</h3>
                    {r.atsScore !== null && (
                      <span className={`chip shrink-0 ${r.atsScore >= 75 ? 'bg-emerald-50 text-emerald-700' : r.atsScore >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        ATS {r.atsScore}
                      </span>
                    )}
                  </div>
                  {r.targetRole && (
                    <p className="mt-1 text-xs font-medium text-brand-700">
                      Target: {r.targetRole} {r.targetCompany ? `at ${r.targetCompany}` : ''}
                    </p>
                  )}
                  {r.truthGuardResult?.passedAll && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-700">
                      <span className="font-bold">✓</span> Grounding Verified
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-ink-400">
                    Saved {new Date(r.updatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-3">
                  <button
                    className="btn-secondary px-2.5 py-1 text-xs"
                    onClick={() => downloadFile(`/api/resumes/${r.id}/pdf`, `${r.title}.pdf`)}
                  >
                    PDF
                  </button>
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => { setRenaming(r); setNewTitle(r.title); }}
                  >
                    Rename
                  </button>
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => void duplicate(r)}
                  >
                    Duplicate
                  </button>
                  <button
                    className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    onClick={() => setDeleting(r)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename Tailored Resume">
        <label className="label" htmlFor="rename">Title</label>
        <input id="rename" className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setRenaming(null)}>Cancel</button>
          <button className="btn-primary" onClick={() => void rename()} disabled={!newTitle.trim()}>Save</button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Tailored Resume">
        <p className="text-sm text-ink-600">
          Delete <strong>{deleting?.title}</strong>? Your Master CV and other tailored versions will remain completely unaffected. This action cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
          <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={() => void remove()}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
