import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useToast } from '../state/ToastContext';

export default function Profile() {
  const [name, setName] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [email, setEmail] = useState('');
  const [memberSince, setMemberSince] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    void api.get<{ profile: { name: string; email: string; targetRole: string; memberSince: string } }>('/profile')
      .then((r) => {
        setName(r.profile.name);
        setEmail(r.profile.email);
        setTargetRole(r.profile.targetRole);
        setMemberSince(r.profile.memberSince);
      })
      .catch(() => toast.show('Could not load your profile.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/profile', { name, targetRole });
      toast.show('Profile saved.', 'success');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Save failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/profile/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      toast.show('Password changed.', 'success');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not change password.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Profile & Settings</h1>
        <p className="mt-1 text-sm text-ink-500">Member since {memberSince ? new Date(memberSince + 'Z').toLocaleDateString() : '—'}</p>
      </div>

      <form className="card space-y-4 p-6" onSubmit={saveProfile}>
        <h2 className="text-sm font-semibold text-ink-900">Profile</h2>
        <div>
          <label className="label" htmlFor="p-name">Name</label>
          <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="p-email">Email</label>
          <input id="p-email" className="input bg-ink-50" value={email} disabled />
          <p className="mt-1 text-xs text-ink-400">Email is your login and cannot be changed in the MVP.</p>
        </div>
        <div>
          <label className="label" htmlFor="p-role">Target role</label>
          <input id="p-role" className="input" value={targetRole} placeholder="e.g. Backend Engineer" onChange={(e) => setTargetRole(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={busy}>Save profile</button>
      </form>

      <form className="card space-y-4 p-6" onSubmit={changePassword}>
        <h2 className="text-sm font-semibold text-ink-900">Change password</h2>
        <div>
          <label className="label" htmlFor="p-current">Current password</label>
          <input id="p-current" className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="p-new">New password</label>
          <input id="p-new" className="input" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          <p className="mt-1 text-xs text-ink-400">At least 8 characters.</p>
        </div>
        <button className="btn-secondary" disabled={busy}>Change password</button>
      </form>
    </div>
  );
}
