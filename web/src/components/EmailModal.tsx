// Curevo AI — User-Triggered Email Modal (Phase 9K)
//
// 100% Opt-In & Privacy-First.
// Dispatches a one-time copy of the candidate's CV or Interview Coaching Report.
// Requires explicit user consent; emails are never stored, sold, or used for marketing.

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { Spinner } from './ui';

export interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type: 'resume' | 'interview-report';
  payload: {
    candidateName?: string;
    resumeSummary?: string;
    role?: string;
    overallScore?: number;
    summary?: string;
  };
  onSuccess?: (message: string) => void;
}

export default function EmailModal({
  isOpen,
  onClose,
  title,
  type,
  payload,
  onSuccess,
}: EmailModalProps) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }
    if (!consent) {
      setError('You must check the consent box to receive this email.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint = type === 'resume' ? '/public/email/resume' : '/public/email/interview-report';
      const body =
        type === 'resume'
          ? {
              email: email.trim(),
              candidateName: payload.candidateName,
              resumeSummary: payload.resumeSummary || 'Standard CV profile',
              consent: true,
            }
          : {
              email: email.trim(),
              role: payload.role || 'Career Candidate',
              overallScore: payload.overallScore,
              summary: payload.summary || 'Interview performance evaluation',
              consent: true,
            };

      const res = await api.post<{ ok: boolean; delivered: boolean; message: string }>(endpoint, body);
      setSentMessage(res.message || 'Email successfully sent!');
      onSuccess?.(res.message || 'Email successfully sent!');
      setTimeout(() => {
        onClose();
        setSentMessage(null);
      }, 2000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to dispatch email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">✉️</span>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer p-1"
          >
            ✕
          </button>
        </div>

        {sentMessage ? (
          <div className="py-6 text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xl font-bold">
              ✓
            </div>
            <h4 className="text-sm font-bold text-slate-900">Email Dispatched!</h4>
            <p className="text-xs text-slate-600">{sentMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Receive a private, formatted copy directly in your inbox. No account or password required.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Your Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <span className="leading-tight">
                  I explicitly request and consent to receiving this one-time email from Curevo AI.
                  I understand Curevo AI never sells, shares, or retains my email for marketing.
                </span>
              </label>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !consent || !email.trim()}
                className="rounded-lg bg-teal-600 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {loading && <Spinner className="h-3.5 w-3.5 text-white" />}
                <span>{loading ? 'Sending...' : 'Send to My Inbox'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
