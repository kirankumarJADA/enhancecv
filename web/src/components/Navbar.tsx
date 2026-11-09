import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from './ui';
import DataPrivacyModal from './DataPrivacyModal';

interface NavbarProps {
  onOpenPrivacy?: () => void;
  ctaText?: string;
  ctaLink?: string;
}

export default function Navbar({ onOpenPrivacy, ctaText = 'Start Building Free', ctaLink = '/builder' }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setToolsDropdownOpen(false);
  }, [location.pathname, location.search]);

  // Click outside listener for Tools dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setToolsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleOpenPrivacy = () => {
    if (onOpenPrivacy) {
      onOpenPrivacy();
    } else {
      setPrivacyModalOpen(true);
    }
  };

  const isActive = (path: string, exact = false) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const isCareerToolsActive = [
    '/prepare-application',
    '/jobs',
    '/applications',
    '/interview',
    '/linkedin',
  ].some((p) => location.pathname.startsWith(p));

  const isLanding = location.pathname === '/';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-brand-500 rounded-lg">
              <Logo />
            </Link>
          </div>

          {/* Desktop Navigation (Organized, spacious, Linear/Stripe-level hierarchy) */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2 text-sm font-medium text-ink-600" aria-label="Main Navigation">
            <Link
              to="/builder"
              className={`px-3 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition ${
                isActive('/builder') && !location.search.includes('mode=ats')
                  ? 'text-brand-700 font-semibold bg-brand-50'
                  : 'hover:text-ink-900 hover:bg-ink-50'
              }`}
            >
              Resume Builder
            </Link>

            <Link
              to="/builder?mode=ats"
              className={`px-3 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition ${
                location.pathname === '/builder' && location.search.includes('mode=ats')
                  ? 'text-brand-700 font-semibold bg-brand-50'
                  : 'hover:text-ink-900 hover:bg-ink-50'
              }`}
            >
              Check ATS
            </Link>

            {/* Career Tools Popover Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition ${
                  isCareerToolsActive
                    ? 'text-brand-700 font-semibold bg-brand-50'
                    : 'hover:text-ink-900 hover:bg-ink-50'
                }`}
                aria-expanded={toolsDropdownOpen}
              >
                <span>Career Tools</span>
                <svg
                  className={`h-3.5 w-3.5 text-ink-400 transition-transform duration-150 ${toolsDropdownOpen ? 'rotate-180 text-brand-600' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {toolsDropdownOpen && (
                <div
                  className="absolute left-0 top-full mt-2 w-80 rounded-2xl border border-ink-100 bg-white/98 backdrop-blur-xl p-3 shadow-2xl ring-1 ring-black/5 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  role="menu"
                >
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                    Flagship Orchestrator
                  </div>
                  <Link
                    to="/prepare-application"
                    onClick={() => setToolsDropdownOpen(false)}
                    className="flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-brand-50/80 group"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 text-base group-hover:bg-brand-600 group-hover:text-white transition">
                      🚀
                    </span>
                    <div>
                      <div className="text-xs font-bold text-ink-900 group-hover:text-brand-700">Prepare Application</div>
                      <div className="text-[11px] text-ink-500">5-step guided orchestrator from target JD to interview</div>
                    </div>
                  </Link>

                  <div className="my-1.5 border-t border-ink-100" />
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                    Autonomous Career Suite
                  </div>
                  <div className="space-y-0.5">
                    <Link
                      to="/jobs"
                      onClick={() => setToolsDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 hover:text-brand-700 transition"
                    >
                      <span className="text-sm">🔍</span>
                      <span>Find Jobs &amp; Market Match</span>
                    </Link>
                    <Link
                      to="/applications"
                      onClick={() => setToolsDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 hover:text-brand-700 transition"
                    >
                      <span className="text-sm">📊</span>
                      <span>Application Tracker (Kanban)</span>
                    </Link>
                    <Link
                      to="/interview"
                      onClick={() => setToolsDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 hover:text-brand-700 transition"
                    >
                      <span className="text-sm">🎙️</span>
                      <span>AI Interview Coach (STAR)</span>
                    </Link>
                    <Link
                      to="/linkedin"
                      onClick={() => setToolsDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 hover:text-brand-700 transition"
                    >
                      <span className="text-sm">🌐</span>
                      <span>LinkedIn Profile Optimizer</span>
                    </Link>
                    <a
                      href="/curevo-ai-extension.zip"
                      download
                      onClick={() => setToolsDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 hover:text-brand-700 transition"
                    >
                      <span className="text-sm">🧩</span>
                      <span>Chrome Job Saver Extension (.zip)</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Informational anchor links */}
            {isLanding ? (
              <>
                <a
                  href="#how"
                  className="px-3 py-1.5 rounded-lg text-xs xl:text-sm text-ink-600 hover:text-ink-900 hover:bg-ink-50 transition"
                >
                  How It Works
                </a>
                <a
                  href="#truth"
                  className="px-3 py-1.5 rounded-lg text-xs xl:text-sm text-ink-600 hover:text-ink-900 hover:bg-ink-50 transition"
                >
                  Truth Guard™
                </a>
              </>
            ) : (
              <>
                <Link
                  to="/#how"
                  className="px-3 py-1.5 rounded-lg text-xs xl:text-sm text-ink-600 hover:text-ink-900 hover:bg-ink-50 transition"
                >
                  How It Works
                </Link>
                <Link
                  to="/#truth"
                  className="px-3 py-1.5 rounded-lg text-xs xl:text-sm text-ink-600 hover:text-ink-900 hover:bg-ink-50 transition"
                >
                  Truth Guard™
                </Link>
              </>
            )}
          </nav>

          {/* Desktop Right Action Area */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Privacy & Sovereignty */}
            <button
              type="button"
              onClick={handleOpenPrivacy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-ink-600 hover:text-ink-900 hover:bg-ink-50 transition"
              title="View data privacy, download complete JSON backup or restore"
              aria-label="Privacy and backup controls"
            >
              <span>🛡️</span>
              <span>Privacy &amp; Backup</span>
            </button>

            {/* Primary Action Button */}
            <Link
              to={ctaLink}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-700 hover:shadow-brand-500/30 active:scale-95 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <span>{ctaText}</span>
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-brand-200" aria-hidden="true">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>

          {/* Mobile & Tablet Header Controls (< lg) */}
          <div className="flex items-center gap-2 lg:hidden">
            {/* Compact CTA */}
            <Link
              to="/builder"
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
            >
              Build Free
            </Link>

            {/* Hamburger Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center rounded-lg border border-ink-200 bg-white p-2 text-ink-700 shadow-2xs hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-brand-500"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer Overlay (< lg) */}
        {mobileMenuOpen && (
          <div
            role="dialog"
            aria-modal="false"
            aria-label="Mobile Navigation"
            className="lg:hidden border-b border-ink-100 bg-white shadow-xl animate-fade-in"
          >
            <div className="max-h-[calc(100vh-4rem)] overflow-y-auto px-4 py-4 space-y-4 divide-y divide-ink-100">
              {/* Flagship Callout */}
              <div className="pt-1">
                <Link
                  to="/prepare-application"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-xl bg-brand-50 border border-brand-200 p-3 text-brand-900 font-bold transition hover:bg-brand-100"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">🚀</span>
                    <div>
                      <div className="text-sm font-bold text-ink-900">Prepare My Application</div>
                      <div className="text-xs font-normal text-brand-700">5-step guided orchestrator</div>
                    </div>
                  </div>
                  <span className="text-brand-600 font-bold">&rarr;</span>
                </Link>
              </div>

              {/* Primary Tools Grid */}
              <div className="pt-3 space-y-1">
                <div className="px-2 pb-1 text-2xs font-bold tracking-wider text-ink-400 uppercase">
                  Career Tools
                </div>

                <Link
                  to="/builder"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive('/builder') && !location.search.includes('mode=ats')
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>📄</span> Resume Builder
                  </span>
                  <span className="text-xs text-ink-400">6 Templates</span>
                </Link>

                <Link
                  to="/builder?mode=ats"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    location.pathname === '/builder' && location.search.includes('mode=ats')
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🎯</span> Check ATS Score
                  </span>
                  <span className="text-xs text-brand-600 font-bold">Audit</span>
                </Link>

                <Link
                  to="/jobs"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive('/jobs')
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🔍</span> Find Jobs
                  </span>
                  <span className="text-xs text-ink-400">Market Match</span>
                </Link>

                <Link
                  to="/applications"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive('/applications')
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>📊</span> Application Tracker
                  </span>
                  <span className="text-xs text-ink-400">Kanban</span>
                </Link>

                <Link
                  to="/interview"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive('/interview')
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🎙️</span> AI Interview Coach
                  </span>
                  <span className="text-xs text-brand-600 font-bold">STAR &amp; Voice</span>
                </Link>

                <Link
                  to="/linkedin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive('/linkedin')
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🌐</span> LinkedIn Optimizer
                  </span>
                  <span className="text-xs text-ink-400">Profile Boost</span>
                </Link>
              </div>

              {/* Utility Actions */}
              <div className="pt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleOpenPrivacy();
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-ink-700 hover:bg-ink-50"
                >
                  <span className="flex items-center gap-2">
                    <span>🛡️</span> Data Privacy &amp; Backup
                  </span>
                  <span className="text-xs text-brand-600 font-semibold">JSON Export</span>
                </button>

                <a
                  href="/curevo-ai-extension.zip"
                  download
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-ink-700 hover:bg-ink-50"
                >
                  <span className="flex items-center gap-2">
                    <span>🧩</span> Chrome Job Saver Extension
                  </span>
                  <span className="text-xs text-ink-400">.zip</span>
                </a>
              </div>

              {/* Information / Anchor Links */}
              {isLanding && (
                <div className="pt-3 pb-2 flex flex-wrap gap-3 text-xs text-ink-500">
                  <a href="#how" onClick={() => setMobileMenuOpen(false)} className="hover:text-ink-900">How It Works</a>
                  <span>•</span>
                  <a href="#truth" onClick={() => setMobileMenuOpen(false)} className="hover:text-ink-900">Truth Guard™</a>
                  <span>•</span>
                  <a href="#features" onClick={() => setMobileMenuOpen(false)} className="hover:text-ink-900">Features</a>
                  <span>•</span>
                  <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="hover:text-ink-900">FAQ</a>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Global Data Privacy Modal instance when opened from Navbar */}
      <DataPrivacyModal
        isOpen={privacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
      />
    </>
  );
}
