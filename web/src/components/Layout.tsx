import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from './ui';
import { useAuth } from '../state/AuthContext';

const NAV = [
  { to: '/app', label: 'Dashboard', end: true, icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10' },
  { to: '/app/master', label: 'Master CV', icon: 'M8 4h8a2 2 0 012 2v14l-6-3-6 3V6a2 2 0 012-2z' },
  { to: '/app/resumes', label: 'My Resumes', icon: 'M7 4h10a1 1 0 011 1v15l-6-3-6 3V5a1 1 0 011-1z' },
  { to: '/app/jobs', label: 'Job Analyses', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to: '/app/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <NavLink to="/app" aria-label="EnhanceCV dashboard">
              <Logo />
            </NavLink>
          </div>
          <div className="flex items-center gap-3">
            <NavLink to="/tailor" className="btn-primary hidden sm:inline-flex">
              Tailor My CV
            </NavLink>
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
            <div className="mt-4 rounded-xl border border-ink-100 bg-white p-4">
              <p className="text-sm font-semibold text-ink-900">Zero fabrication</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                Your Master CV is the source of truth. Tailored CVs only reword, reorder and highlight — they never invent facts.
              </p>
            </div>
          </nav>
        </aside>

        {/* Mobile nav */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white md:hidden">
          <nav className="flex justify-around py-1.5" aria-label="Mobile navigation">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[11px] font-medium ${
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
