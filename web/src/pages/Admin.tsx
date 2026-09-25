// Admin dashboard — server-side ADMIN authorisation (403 for everyone else).

import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { PageSpinner } from '../components/ui';
import { useToast } from '../state/ToastContext';

interface AdminStats {
  users: { total: number; verified: number; admins: number };
  content: { masterCvs: number; jobDescriptions: number; resumeVersions: number };
  ai: { runs: number; fallbackRuns: number };
  artifacts: { coverLetters: number; linkedinGenerations: number; applications: number; pdfDownloads: number };
  subscriptions: { active: number };
}

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  email_verified: boolean;
  onboarded: boolean;
  created_at: string;
  plan: string | null;
  subscription_status: string | null;
  resume_count: number;
  ai_runs: number;
}

export default function Admin() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [errors, setErrors] = useState<{ id: string; code: string; message: string; request_id: string | null; created_at: string }[] | null>(null);
  const [usage, setUsage] = useState<{ byFeature: { feature: string; uses: number }[]; byPlan: { plan: string; users: number }[]; topEvents: { event: string; count: number }[] } | null>(null);
  const toast = useToast();

  useEffect(() => {
    void (async () => {
      try {
        const [s, u, e, us] = await Promise.all([
          api.get<AdminStats>('/admin/stats'),
          api.get<{ users: AdminUserRow[]; total: number }>(`/admin/users?page=1&pageSize=20`),
          api.get<{ errors: typeof errors }>(`/admin/errors?page=1&pageSize=20`),
          api.get<NonNullable<typeof usage>>('/admin/usage'),
        ]);
        setStats(s);
        setUsers(u.users);
        setUsersTotal(u.total);
        setErrors(e.errors || []);
        setUsage(us);
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : 'Admin data unavailable.', 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!stats) return <PageSpinner />;

  const cards: { label: string; value: number | string }[] = [
    { label: 'Total users', value: stats.users.total },
    { label: 'Verified users', value: stats.users.verified },
    { label: 'Active subscriptions', value: stats.subscriptions.active },
    { label: 'Master CVs', value: stats.content.masterCvs },
    { label: 'Resume versions', value: stats.content.resumeVersions },
    { label: 'AI generations', value: stats.ai.runs },
    { label: 'AI fallback runs', value: stats.ai.fallbackRuns },
    { label: 'PDF downloads', value: stats.artifacts.pdfDownloads },
    { label: 'Cover letters', value: stats.artifacts.coverLetters },
    { label: 'LinkedIn generations', value: stats.artifacts.linkedinGenerations },
    { label: 'Applications', value: stats.artifacts.applications },
    { label: 'Job descriptions', value: stats.content.jobDescriptions },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Admin</h1>
        <p className="mt-1 text-sm text-ink-500">Aggregate platform statistics. Resume contents are never shown here.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-xs font-medium text-ink-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-ink-900">{c.value}</p>
          </div>
        ))}
      </div>

      {usage && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900">Usage this month</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
              {usage.byFeature.length === 0 && <li className="text-ink-400">No usage recorded yet.</li>}
              {usage.byFeature.map((f) => <li key={f.feature} className="flex justify-between"><span>{f.feature}</span><span className="font-semibold">{f.uses}</span></li>)}
            </ul>
          </div>
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900">Users by plan</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
              {usage.byPlan.map((p) => <li key={p.plan} className="flex justify-between"><span>{p.plan}</span><span className="font-semibold">{p.users}</span></li>)}
            </ul>
          </div>
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900">Top events (30 days)</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
              {usage.topEvents.slice(0, 8).map((e) => <li key={e.event} className="flex justify-between"><span>{e.event}</span><span className="font-semibold">{e.count}</span></li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-900">Users ({usersTotal})</h2>
          <div className="flex gap-2">
            <button className="btn-ghost px-2 py-1 text-xs" disabled={usersPage <= 1} onClick={() => setUsersPage((p) => Math.max(1, p - 1))}>Prev</button>
            <button className="btn-ghost px-2 py-1 text-xs" disabled={usersPage * 20 >= usersTotal} onClick={() => setUsersPage((p) => p + 1)}>Next</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Verified</th>
                <th className="px-4 py-2.5">Plan</th>
                <th className="px-4 py-2.5">Resumes</th>
                <th className="px-4 py-2.5">AI runs</th>
                <th className="px-4 py-2.5">Joined</th>
              </tr>
            </thead>
            <tbody>
              {(users || []).map((u) => (
                <tr key={u.id} className="border-t border-ink-100">
                  <td className="px-4 py-2.5 text-ink-800">{u.email}</td>
                  <td className="px-4 py-2.5 text-ink-600">{u.name}</td>
                  <td className="px-4 py-2.5">{u.role === 'ADMIN' ? <span className="chip bg-violet-50 text-violet-700">ADMIN</span> : <span className="chip bg-ink-100 text-ink-500">USER</span>}</td>
                  <td className="px-4 py-2.5">{u.email_verified ? '✓' : '—'}</td>
                  <td className="px-4 py-2.5">{u.plan || 'FREE'}{u.subscription_status ? ` (${u.subscription_status})` : ''}</td>
                  <td className="px-4 py-2.5">{u.resume_count}</td>
                  <td className="px-4 py-2.5">{u.ai_runs}</td>
                  <td className="px-4 py-2.5 text-ink-400">{u.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <h2 className="border-b border-ink-100 px-5 py-4 text-sm font-semibold text-ink-900">Recent errors (sanitised)</h2>
        {errors && errors.length === 0 && <p className="px-5 py-4 text-sm text-ink-400">No errors recorded.</p>}
        <ul className="divide-y divide-ink-100">
          {(errors || []).map((e) => (
            <li key={e.id} className="px-5 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="chip bg-red-50 text-red-700">{e.code}</span>
                <span className="text-xs text-ink-400">{e.created_at}{e.request_id ? ` · ${e.request_id}` : ''}</span>
              </div>
              <p className="mt-1 text-ink-600">{e.message}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
