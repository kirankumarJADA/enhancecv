import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Logo, Spinner } from '../components/ui';

export function VerifyEmailLanding() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'verifying' | 'ok' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // The backend redirects here after verifying; the query string carries the
    // outcome. If a raw token arrives (user copied a link), verify inline.
    const verified = params.get('verified');
    if (verified === '1') {
      setState('ok');
      return;
    }
    if (verified === '0') {
      const reason = params.get('reason');
      setState('error');
      setMessage(reason === 'expired' ? 'This verification link has expired. Please request a new one.' : 'This verification link is invalid or has already been used.');
      return;
    }
    const token = params.get('token');
    if (token) {
      window.location.href = `/api/auth/verify-email?token=${encodeURIComponent(token)}`;
      return;
    }
    setState('error');
    setMessage('No verification token found in this link.');
  }, [params]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4">
      <Link to="/" aria-label="Curevo AI home"><Logo /></Link>
      <div className="card mt-6 w-full max-w-md p-8 text-center">
        {state === 'verifying' && (
          <>
            <Spinner className="mx-auto h-8 w-8 text-brand-500" />
            <p className="mt-4 text-sm text-ink-500">Verifying your email…</p>
          </>
        )}
        {state === 'ok' && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">✓</div>
            <h1 className="mt-4 text-lg font-semibold text-ink-900">Email verified</h1>
            <p className="mt-1 text-sm text-ink-500">Your email address is confirmed. Everything is ready.</p>
            <Link className="btn-primary mt-6 w-full py-3" to="/login">Go to sign in</Link>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700" aria-hidden="true">✕</div>
            <h1 className="mt-4 text-lg font-semibold text-ink-900">Verification problem</h1>
            <p className="mt-1 text-sm text-ink-500">{message}</p>
            <Link className="btn-secondary mt-6 w-full py-3" to="/login">Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ emailConfigured: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ ok: boolean; emailConfigured: boolean }>('/auth/forgot-password', { email });
      setSent(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4">
      <Link to="/" aria-label="Curevo AI home"><Logo /></Link>
      <div className="card mt-6 w-full max-w-md p-8">
        {sent ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-ink-900">Check your inbox</h1>
            <p className="mt-2 text-sm text-ink-500">
              If an account exists for <strong>{email}</strong>, a reset link is on its way. The link is valid for one hour.
            </p>
            {!sent.emailConfigured && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This deployment has no email provider configured — the reset link was printed in the server logs instead.
              </p>
            )}
            <Link className="btn-secondary mt-6 w-full py-3" to="/login">Back to sign in</Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-ink-900">Reset your password</h1>
            <p className="mt-1 text-sm text-ink-500">Enter your account email and we'll send you a reset link.</p>
            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">{error}</div>}
            <form className="mt-6 space-y-4" onSubmit={submit}>
              <div>
                <label className="label" htmlFor="fp-email">Email</label>
                <input id="fp-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button className="btn-primary w-full py-3" disabled={busy}>Send reset link</button>
            </form>
            <p className="mt-6 text-center text-sm text-ink-500"><Link className="font-semibold text-brand-600" to="/login">Back to sign in</Link></p>
          </>
        )}
      </div>
    </div>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4">
      <Link to="/" aria-label="Curevo AI home"><Logo /></Link>
      <div className="card mt-6 w-full max-w-md p-8">
        {done ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-ink-900">Password updated</h1>
            <p className="mt-2 text-sm text-ink-500">You can now sign in with your new password.</p>
            <Link className="btn-primary mt-6 w-full py-3" to="/login">Sign in</Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-ink-900">Choose a new password</h1>
            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">{error}</div>}
            <form className="mt-6 space-y-4" onSubmit={submit}>
              <div>
                <label className="label" htmlFor="rp-token">Reset token</label>
                <input id="rp-token" className="input font-mono text-xs" required value={token} onChange={(e) => setToken(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="rp-password">New password</label>
                <input id="rp-password" className="input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="mt-1 text-xs text-ink-400">At least 8 characters.</p>
              </div>
              <button className="btn-primary w-full py-3" disabled={busy}>Update password</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
