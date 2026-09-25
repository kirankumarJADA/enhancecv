import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { EmptyState, Modal } from '../components/ui';
import { useToast } from '../state/ToastContext';
import type { Application, ApplicationStatus } from '../types';

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  SAVED: 'bg-ink-100 text-ink-600',
  APPLIED: 'bg-brand-50 text-brand-700',
  SCREENING: 'bg-amber-50 text-amber-700',
  INTERVIEW: 'bg-violet-50 text-violet-700',
  OFFER: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  WITHDRAWN: 'bg-ink-100 text-ink-500',
};
const STATUSES: ApplicationStatus[] = ['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'];

export default function Applications() {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  async function load() {
    const res = await api.get<{ applications: Application[]; summary: { total: number; byStatus: Record<string, number> } }>('/applications');
    setApps(res.applications);
    setSummary(res.summary);
  }

  useEffect(() => {
    void load().catch(() => toast.show('Could not load applications.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeStatus(a: Application, status: ApplicationStatus) {
    try {
      await api.patch(`/applications/${a.id}`, { status });
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Update failed.', 'error');
    }
  }

  async function remove(a: Application) {
    try {
      await api.del(`/applications/${a.id}`);
      toast.show('Application deleted.', 'success');
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Delete failed.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Applications</h1>
          <p className="mt-1 text-sm text-ink-500">Track every role you are pursuing, from saved to offer.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ Add application</button>
      </div>

      {summary && (
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <span key={s} className={`chip ${STATUS_STYLES[s]}`}>{s}: {summary.byStatus[s] || 0}</span>
          ))}
        </div>
      )}

      {!apps ? null : apps.length === 0 ? (
        <EmptyState
          title="No applications tracked yet"
          body="Add a role you are pursuing — or create one straight from a job analysis — and track its status here."
          action={<button className="btn-primary" onClick={() => setCreating(true)}>Add your first application</button>}
        />
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <div key={a.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-ink-900">{a.role}</h2>
                    <span className="text-sm text-ink-500">· {a.company}</span>
                    <span className={`chip ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    {[a.location, a.salary, a.applied_date && `Applied ${a.applied_date}`].filter(Boolean).join(' · ')}
                    {a.job_url && (
                      <>
                        {' · '}
                        <a className="text-brand-600 hover:text-brand-700" href={a.job_url} target="_blank" rel="noreferrer">job link</a>
                      </>
                    )}
                  </p>
                  {a.notes && <p className="mt-2 text-sm text-ink-600">{a.notes}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-ink-400" htmlFor={`status-${a.id}`}>Status</label>
                  <select
                    id={`status-${a.id}`}
                    className="input w-36 py-1.5 text-xs"
                    value={a.status}
                    onChange={(e) => void changeStatus(a, e.target.value as ApplicationStatus)}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {a.resume_id && <Link className="btn-secondary px-3 py-1.5 text-xs" to={`/app/resumes/${a.resume_id}/edit`}>Resume</Link>}
                  <button className="btn-ghost px-2 py-1.5 text-xs text-red-600 hover:bg-red-50" onClick={() => void remove(a)} aria-label={`Delete application for ${a.role}`}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ApplicationForm open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />
    </div>
  );
}

function ApplicationForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [location, setLocation] = useState('');
  const [salary, setSalary] = useState('');
  const [notes, setNotes] = useState('');
  const [appliedDate, setAppliedDate] = useState('');
  const [status, setStatus] = useState<ApplicationStatus>('SAVED');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit() {
    setBusy(true);
    try {
      await api.post('/applications', { company, role, jobUrl, location, salary, notes, appliedDate, status });
      toast.show('Application added.', 'success');
      setCompany(''); setRole(''); setJobUrl(''); setLocation(''); setSalary(''); setNotes(''); setAppliedDate(''); setStatus('SAVED');
      onSaved();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not save.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add application">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="app-company">Company</label><input id="app-company" className="input" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div><label className="label" htmlFor="app-role">Role</label><input id="app-role" className="input" value={role} onChange={(e) => setRole(e.target.value)} /></div>
        </div>
        <div><label className="label" htmlFor="app-url">Job URL (optional)</label><input id="app-url" className="input" value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} placeholder="https://…" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="app-loc">Location</label><input id="app-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          <div><label className="label" htmlFor="app-salary">Salary</label><input id="app-salary" className="input" value={salary} onChange={(e) => setSalary(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="app-date">Applied date</label><input id="app-date" className="input" value={appliedDate} placeholder="MM/YYYY" onChange={(e) => setAppliedDate(e.target.value)} /></div>
          <div>
            <label className="label" htmlFor="app-status">Status</label>
            <select id="app-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label" htmlFor="app-notes">Notes</label><textarea id="app-notes" className="input min-h-[70px]" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !company.trim() || !role.trim()} onClick={() => void submit()}>Save</button>
        </div>
      </div>
    </Modal>
  );
}
