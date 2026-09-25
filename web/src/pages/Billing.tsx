// Billing page: plans, current status, checkout/portal. When Stripe is not
// configured the page says so honestly — it never fakes subscription state.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Spinner } from '../components/ui';
import { useToast } from '../state/ToastContext';
import { useAuth } from '../state/AuthContext';
import type { BillingPlan, BillingStatus, UsageSnapshot } from '../types';

export default function Billing() {
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [busy, setBusy] = useState('');
  const [params] = useSearchParams();
  const toast = useToast();
  const { refresh } = useAuth();

  useEffect(() => {
    void (async () => {
      try {
        const [p, s, u] = await Promise.all([
          api.get<{ plans: BillingPlan[]; billingConfigured: boolean }>('/billing/plans'),
          api.get<BillingStatus>('/billing/status'),
          api.get<UsageSnapshot>('/ai/usage'),
        ]);
        setPlans(p.plans);
        setStatus(s);
        setUsage(u);
        if (params.get('checkout') === 'success') {
          toast.show('Payment started — your plan updates automatically once the payment provider confirms it.', 'info');
        }
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : 'Could not load billing.', 'error');
        setPlans([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkout(planId: string) {
    setBusy(planId);
    try {
      const res = await api.post<{ url: string | null }>('/billing/checkout', { planId });
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Checkout unavailable.', 'error');
    } finally {
      setBusy('');
    }
  }

  async function openPortal() {
    setBusy('portal');
    try {
      const res = await api.post<{ url: string | null }>('/billing/portal', {});
      if (res.url) window.location.href = res.url;
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Portal unavailable.', 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Billing</h1>
        <p className="mt-1 text-sm text-ink-500">Plan limits are enforced server-side and reset every month.</p>
      </div>

      {params.get('checkout') === 'canceled' && (
        <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-600">Checkout was canceled — nothing was charged.</div>
      )}

      {status && (
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Current plan</h2>
              <p className="mt-1">
                <span className="chip bg-brand-50 text-brand-700">{status.plan}</span>
                {status.subscription && (
                  <span className="ml-2 text-xs text-ink-500">
                    subscription {status.subscription.status}
                    {status.subscription.currentPeriodEnd ? ` · renews ${new Date(status.subscription.currentPeriodEnd + 'Z').toLocaleDateString()}` : ''}
                  </span>
                )}
              </p>
            </div>
            {status.subscription?.hasPaymentMethod && (
              <button className="btn-secondary" disabled={busy === 'portal'} onClick={() => void openPortal()}>
                {busy === 'portal' && <Spinner className="h-4 w-4" />} Manage billing
              </button>
            )}
          </div>
          {!status.billingConfigured && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Online payments are not configured for this deployment. You can still use the Free plan — checkout will be available once the payment provider keys are set.
            </p>
          )}
          {usage && (
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-500">
              {usage.features.map((f) => (
                <span key={f.feature} className="chip bg-ink-100 text-ink-600">{f.feature}: {f.used}/{f.limit}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {(plans || []).map((p) => {
          const current = status?.plan === p.id;
          return (
            <div key={p.id} className={`card flex flex-col p-6 ${current ? 'border-brand-400 ring-1 ring-brand-200' : ''}`}>
              <h2 className="text-base font-semibold text-ink-900">{p.label}</h2>
              <p className="mt-1 flex-1 text-sm text-ink-500">{p.description}</p>
              <ul className="mt-4 space-y-1.5 text-xs text-ink-600">
                <li>• {p.limits.tailoring} AI tailoring / month</li>
                <li>• {p.limits.critique} critiques / month</li>
                <li>• {p.limits.coverLetter} cover letters / month</li>
                <li>• {p.limits.linkedin} LinkedIn generations / month</li>
              </ul>
              <button
                className={`mt-5 ${current ? 'btn-secondary' : 'btn-primary'}`}
                disabled={current || busy !== '' || !status?.billingConfigured || p.id === 'FREE'}
                onClick={() => void checkout(p.id)}
              >
                {busy === p.id && <Spinner className="h-4 w-4" />}
                {current ? 'Current plan' : p.id === 'FREE' ? 'Free forever' : 'Upgrade'}
              </button>
            </div>
          );
        })}
      </div>
      <button className="btn-ghost hidden" onClick={() => void refresh()} />
    </div>
  );
}
