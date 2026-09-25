import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from './ui';
import { useAuth } from '../state/AuthContext';

const NAV = [
  { to: '/app', label: 'Dashboard', end: true, icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10' },
  { to: '/app/master', label: 'Master CV', icon: 'M8 4h8a2 2 0 012 2v14l-6-3-6 3V6a2 2 0 012-2z' },
  { to: '/app/resumes', label: 'Resumes', icon: 'M7 4h10a1 1 0 011 1v15l-6-3-6 3V5a1 1 0 011-1z' },
  { to: '/app/jobs', label: 'Jobs', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to: '/app/jobs-discovery', label: 'Find Jobs', icon: 'M21 21l-5.2-5.2M17 10a7 7 0 11-14 0 7 7 0 0114 0z' },
  { to: '/app/interview', label: 'Interview', icon: 'M12 6.25v5.5L15 13M12 3a9 9 0 100 18 9 9 0 000-18z' },
  { to: '/app/applications', label: 'Applications', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { to: '/app/templates', label: 'Templates', icon: 'M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z' },
  { to: '/app/ai-tools', label: 'AI Tools', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { to: '/app/billing', label: 'Billing', icon: 'M3 7h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 7l2-3h14l2 3M7 12h4' },
  { to: '/app/health', label: 'Health', icon: 'M4.5 12.5l7.5 7.5 7.5-7.5a5 5 0 10-7.5-6.5 5 5 0 10-7.5 6.5z' },
  { to: '/app/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
];

const MOBILE_NAV = [NAV[0], NAV[1], NAV[3], NAV[6], NAV[7]];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <NavLink to="/app" aria-label="Curevo AI dashboard">
              <Logo />
            </NavLink>
          </div>
          <div className="flex items-center gap-3">
            <NavLink to="/tailor" className="btn-primary hidden sm:inline-flex">
              Tailor My CV
            </NavLink>
            {isAdmin && (
              <NavLink to="/app/admin" className="btn-ghost hidden md:inline-flex">Admin</NavLink>
            )}
            <div className="flex items-center gap-2 border-l border-ink-100 pl-3">
              <span className="hidden text-sm font-medium text-ink-700 sm:inline">{user?.name || user?.email}</span>
              <button
                className="btn-ghost"
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-24 flex flex-col gap-1" aria-label="Main navigation">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                  }`
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
                  <path d={n.icon} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {n.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/app/admin"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                  }`
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
                  <path d="M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Admin
              </NavLink>
            )}
            <div className="mt-4 rounded-xl border border-ink-100 bg-white p-4">
              <p className="text-sm font-semibold text-ink-900">Zero fabrication</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                Your Master CV is the source of truth. Every AI suggestion is validated against it before you ever see it.
              </p>
            </div>
          </nav>
        </aside>

        {/* Mobile nav */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white md:hidden">
          <nav className="flex justify-around py-1.5" aria-label="Mobile navigation">
            {MOBILE_NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
                    isActive ? 'text-brand-600' : 'text-ink-500'
                  }`
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
                  <path d={n.icon} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <main className="min-w-0 flex-1 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
