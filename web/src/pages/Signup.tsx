import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Logo, Spinner } from '../components/ui';
import { useAuth } from '../state/AuthContext';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [devActionUrl, setDevActionUrl] = useState('');
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ user: { devActionUrl?: string } }>('/auth/signup', { name, email, password });
      if (res.user.devActionUrl) setDevActionUrl(res.user.devActionUrl);
      await refresh();
      if (!res.user.devActionUrl) navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4">
      <Link to="/" aria-label="EnhanceCV home"><Logo /></Link>
      <div className="card mt-6 w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-ink-900">Create your free account</h1>
        <p className="mt-1 text-sm text-ink-500">Free forever during the MVP — no card, no premium wall.</p>
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="name">Full name</label>
            <input id="name" className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="mt-1 text-xs text-ink-400">At least 8 characters.</p>
          </div>
          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} Create account
          </button>
        </form>
        {devActionUrl && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800" role="status">
            <p className="font-semibold">Verify your email to finish setup.</p>
            <p className="mt-1 text-xs">This deployment has no email provider configured, so here is your verification link directly:</p>
            <a className="mt-1.5 block break-all font-mono text-xs text-brand-700 underline" href={devActionUrl}>{devActionUrl}</a>
            <button className="btn-primary mt-3 w-full py-2.5" onClick={() => navigate('/onboarding', { replace: true })}>Continue anyway →</button>
          </div>
        )}
        <p className="mt-6 text-center text-sm text-ink-500">
          Already have an account?{' '}
          <Link className="font-semibold text-brand-600 hover:text-brand-700" to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
