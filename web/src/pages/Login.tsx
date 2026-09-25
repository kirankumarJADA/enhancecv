import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Logo } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { Spinner } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/login', { email, password });
      await refresh();
      navigate((location.state as { from?: string } | null)?.from || '/app', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4">
      <Link to="/" aria-label="EnhanceCV home"><Logo /></Link>
      <div className="card mt-6 w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-ink-900">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-500">Sign in to continue building better CVs.</p>
        {params.get('verified') === '1' && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800" role="status">
            Email verified — thanks! You can sign in now.
          </div>
        )}
        {params.get('verified') === '0' && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800" role="alert">
            {params.get('reason') === 'expired' ? 'That verification link expired. Request a new one after signing in.' : 'That verification link was invalid or already used.'}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} Sign in
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-500">
          New to EnhanceCV?{' '}
          <Link className="font-semibold text-brand-600 hover:text-brand-700" to="/signup">Create a free account</Link>
        </p>
        <p className="mt-3 text-center text-xs text-ink-400">
          <Link className="hover:text-ink-600" to="/forgot-password">Forgot your password?</Link>
        </p>
      </div>
    </div>
  );
}
