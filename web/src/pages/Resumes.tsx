import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, downloadFile, ApiError } from '../api';
import { EmptyState, Modal } from '../components/ui';
import { useToast } from '../state/ToastContext';
import type { ResumeSummary } from '../types';

export default function Resumes() {
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [renaming, setRenaming] = useState<ResumeSummary | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [deleting, setDeleting] = useState<ResumeSummary | null>(null);
  const toast = useToast();
  const navigate = useNavigate();

  async function load() {
    const res = await api.get<{ resumes: ResumeSummary[] }>('/resumes');
    setResumes(res.resumes);
  }

  useEffect(() => {
    void load().catch(() => toast.show('Could not load resumes.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rename() {
    if (!renaming) return;
    try {
      const full = await api.get<{ resume: { content: unknown } }>(`/resumes/${renaming.id}`);
      await api.put(`/resumes/${renaming.id}`, { resume: full.resume.content, title: newTitle });
      toast.show('Renamed.', 'success');
      setRenaming(null);
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Rename failed.', 'error');
    }
  }

  async function duplicate(r: ResumeSummary) {
    try {
      await api.post(`/resumes/${r.id}/duplicate`, { title: `Copy of ${r.title}` });
      toast.show('Duplicated.', 'success');
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Duplicate failed.', 'error');
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await api.del(`/resumes/${deleting.id}`);
      toast.show('Deleted.', 'success');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Delete failed.', 'error');
    }
  }

  if (!resumes) return null;

  const master = resumes.find((r) => r.kind === 'master');
  const versions = resumes.filter((r) => r.kind === 'tailored');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">My Resumes</h1>
        <p className="mt-1 text-sm text-ink-500">One Master CV, many job-specific versions. Each version is independent.</p>
      </div>

      {master && (
        <div className="card border-brand-100 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M8 4h8a2 2 0 012 2v14l-6-3-6 3V6a2 2 0 012-2z" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-ink-900">{master.title}</h2>
                  <span className="chip bg-brand-50 text-brand-700">Master</span>
                </div>
                <p className="text-xs text-ink-400">Updated {new Date(master.updatedAt + 'Z').toLocaleString()}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="btn-secondary" to="/app/master">Edit</Link>
              <button className="btn-secondary" onClick={() => downloadFile(`/api/resumes/${master.id}/pdf`, 'MasterCV.pdf')}>Download PDF</button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Tailored versions ({versions.length})</h2>
        {versions.length === 0 ? (
          <EmptyState
            title="No tailored versions yet"
            body="Tailor your Master CV to a job description — each tailored CV is saved here as its own version."
            action={<button className="btn-primary" onClick={() => navigate('/tailor')}>Tailor My CV</button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {versions.map((r) => (
              <div key={r.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink-900">{r.title}</h3>
                  {r.atsScore !== null && (
                    <span className={`chip ${r.atsScore >= 75 ? 'bg-emerald-50 text-emerald-700' : r.atsScore >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                      ATS {r.atsScore}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-400">Updated {new Date(r.updatedAt + 'Z').toLocaleString()}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => navigate(`/app/resumes/${r.id}/edit`)}>Edit</button>
                  <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => downloadFile(`/api/resumes/${r.id}/pdf`, `${r.title}.pdf`)}>PDF</button>
                  <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => { setRenaming(r); setNewTitle(r.title); }}>Rename</button>
                  <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => void duplicate(r)}>Duplicate</button>
                  <button className="btn-ghost px-2 py-1.5 text-xs text-red-600 hover:bg-red-50" onClick={() => setDeleting(r)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename resume">
        <label className="label" htmlFor="rename">Title</label>
        <input id="rename" className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setRenaming(null)}>Cancel</button>
          <button className="btn-primary" onClick={() => void rename()} disabled={!newTitle.trim()}>Save</button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete resume version">
        <p className="text-sm text-ink-600">
          Delete <strong>{deleting?.title}</strong>? Your Master CV will not be affected. This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
          <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={() => void remove()}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
