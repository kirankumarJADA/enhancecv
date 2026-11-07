import { useState, useEffect } from 'react';
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
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

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

  const isLanding = location.pathname === '/';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Brand Logo & Free Badge */}
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-teal-500 rounded-lg">
              <Logo />
            </Link>
            <span className="hidden xl:inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 border border-teal-200">
              100% Free &amp; Anonymous
            </span>
          </div>

          {/* Desktop Navigation (grouped, balanced spacing) */}
          <nav className="hidden lg:flex items-center gap-1.5 xl:gap-2 text-sm font-medium text-slate-600" aria-label="Main Navigation">
            {/* Flagship Prepare Application Stepper */}
            <Link
              to="/prepare-application"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                isActive('/prepare-application')
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 hover:text-teal-950'
              }`}
            >
              <span>🚀</span>
              <span>Prepare Application</span>
            </Link>

            <Link
              to="/builder"
              className={`px-3 py-1.5 rounded-lg transition ${
                isActive('/builder') && !location.search.includes('mode=ats')
                  ? 'text-slate-950 font-bold bg-slate-100'
                  : 'hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              Resume Builder
            </Link>

            <Link
              to="/builder?mode=ats"
              className={`px-3 py-1.5 rounded-lg transition ${
                location.pathname === '/builder' && location.search.includes('mode=ats')
                  ? 'text-slate-950 font-bold bg-slate-100'
                  : 'hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              Check ATS
            </Link>

            <Link
              to="/jobs"
              className={`px-3 py-1.5 rounded-lg transition ${
                isActive('/jobs')
                  ? 'text-slate-950 font-bold bg-slate-100'
                  : 'hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              Find Jobs
            </Link>

            <Link
              to="/applications"
              className={`px-3 py-1.5 rounded-lg transition ${
                isActive('/applications')
                  ? 'text-slate-950 font-bold bg-slate-100'
                  : 'hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              Tracker
            </Link>

            <Link
              to="/interview"
              className={`px-3 py-1.5 rounded-lg transition ${
                isActive('/interview')
                  ? 'text-slate-950 font-bold bg-slate-100'
                  : 'hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              Interview Coach
            </Link>

            <Link
              to="/linkedin"
              className={`px-3 py-1.5 rounded-lg transition ${
                isActive('/linkedin')
                  ? 'text-slate-950 font-bold bg-slate-100'
                  : 'hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              LinkedIn
            </Link>

            {/* Informational anchor links on landing page */}
            {isLanding && (
              <>
                <a href="#how" className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 transition">
                  How It Works
                </a>
                <a href="#truth" className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 transition">
                  Truth Guard™
                </a>
                <a href="#faq" className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 transition">
                  FAQ
                </a>
              </>
            )}
          </nav>

          {/* Desktop Right Action Area */}
          <div className="hidden lg:flex items-center gap-2.5">
            {/* Privacy & Sovereignty */}
            <button
              type="button"
              onClick={handleOpenPrivacy}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
              title="View data privacy, download complete JSON backup or restore"
              aria-label="Privacy and backup controls"
            >
              <span>🛡️</span>
              <span className="hidden xl:inline">Privacy &amp; Backup</span>
            </button>

            {/* Chrome Extension Download Quick Link */}
            <a
              href="/curevo-ai-extension.zip"
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
              title="Download Curevo AI Chrome Extension (Manifest V3 .zip)"
              aria-label="Download Chrome extension"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-teal-600" aria-hidden="true">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Extension</span>
            </a>

            {/* Primary Action Button */}
            <Link
              to={ctaLink}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-teal-500"
            >
              <span>{ctaText}</span>
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-teal-400" aria-hidden="true">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>

          {/* Mobile & Tablet Header Controls (< lg) */}
          <div className="flex items-center gap-2 lg:hidden">
            {/* Compact CTA */}
            <Link
              to="/builder"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
            >
              Build Free
            </Link>

            {/* Hamburger Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 shadow-2xs hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-500"
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
            className="lg:hidden border-b border-slate-200 bg-white shadow-xl animate-fade-in"
          >
            <div className="max-h-[calc(100vh-4rem)] overflow-y-auto px-4 py-4 space-y-4 divide-y divide-slate-100">
              {/* Flagship Callout */}
              <div className="pt-1">
                <Link
                  to="/prepare-application"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-xl bg-teal-50 border border-teal-200 p-3 text-teal-900 font-bold transition hover:bg-teal-100"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">🚀</span>
                    <div>
                      <div className="text-sm font-bold">Prepare My Application</div>
                      <div className="text-xs font-normal text-teal-700">5-step guided orchestrator</div>
                    </div>
                  </div>
                  <span className="text-teal-600 font-bold">&rarr;</span>
                </Link>
              </div>

              {/* Primary Tools Grid */}
              <div className="pt-3 space-y-1">
                <div className="px-2 pb-1 text-2xs font-bold tracking-wider text-slate-400 uppercase">
                  Career Tools
                </div>

                <Link
                  to="/builder"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive('/builder') && !location.search.includes('mode=ats')
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>📄</span> Resume Builder
                  </span>
                  <span className="text-xs text-slate-400">6 Templates</span>
                </Link>

                <Link
                  to="/builder?mode=ats"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    location.pathname === '/builder' && location.search.includes('mode=ats')
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🎯</span> Check ATS Score
                  </span>
                  <span className="text-xs text-teal-600 font-bold">Audit</span>
                </Link>

                <Link
                  to="/jobs"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive('/jobs')
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🔍</span> Find Jobs
                  </span>
                  <span className="text-xs text-slate-400">Market Match</span>
                </Link>

                <Link
                  to="/applications"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive('/applications')
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>📊</span> Application Tracker
                  </span>
                  <span className="text-xs text-slate-400">Kanban</span>
                </Link>

                <Link
                  to="/interview"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive('/interview')
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🎙️</span> AI Interview Coach
                  </span>
                  <span className="text-xs text-teal-600 font-bold">STAR &amp; Voice</span>
                </Link>

                <Link
                  to="/linkedin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    isActive('/linkedin')
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🌐</span> LinkedIn Optimizer
                  </span>
                  <span className="text-xs text-slate-400">Profile Boost</span>
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
                  className="flex w-full items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <span>🛡️</span> Data Privacy &amp; Backup
                  </span>
                  <span className="text-xs text-teal-700 font-semibold">JSON Export</span>
                </button>

                <a
                  href="/curevo-ai-extension.zip"
                  download
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <span>🧩</span> Chrome Job Saver Extension
                  </span>
                  <span className="text-xs text-slate-500">.zip</span>
                </a>
              </div>

              {/* Information / Anchor Links */}
              {isLanding && (
                <div className="pt-3 pb-2 flex flex-wrap gap-3 text-xs text-slate-500">
                  <a href="#how" onClick={() => setMobileMenuOpen(false)} className="hover:text-slate-900">How It Works</a>
                  <span>•</span>
                  <a href="#truth" onClick={() => setMobileMenuOpen(false)} className="hover:text-slate-900">Truth Guard™</a>
                  <span>•</span>
                  <a href="#features" onClick={() => setMobileMenuOpen(false)} className="hover:text-slate-900">Features</a>
                  <span>•</span>
                  <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="hover:text-slate-900">FAQ</a>
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
