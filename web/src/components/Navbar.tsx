import { useState, useEffect, useRef, KeyboardEvent } from 'react';
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
  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setToolsDropdownOpen(false);
  }, [location.pathname, location.search]);

  // Click outside listener for Tools dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target as Node)) {
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

  // Keyboard navigation for Tools dropdown
  const handleToolsKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') {
      setToolsDropdownOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setToolsDropdownOpen(true);
    }
  };

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

  const isToolsActive = [
    '/prepare-application',
    '/jobs',
    '/applications',
    '/interview',
    '/linkedin',
  ].some((p) => location.pathname.startsWith(p)) || (location.pathname === '/builder' && location.search.includes('mode=ats'));

  const isLanding = location.pathname === '/';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Brand Logo & Free Badge */}
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-brand-500 rounded-lg">
              <Logo />
            </Link>
            <span className="hidden xl:inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200">
              100% Free &amp; Anonymous
            </span>
          </div>

          {/* Minimal Desktop Navigation (Enhancv-inspired structure) */}
          <nav className="hidden lg:flex items-center gap-1.5 xl:gap-2.5 text-sm font-medium text-ink-600" aria-label="Main Navigation">
            <Link
              to="/builder"
              className={`px-3 py-2 rounded-lg transition ${
                isActive('/builder') && !location.search.includes('mode=ats')
                  ? 'text-brand-700 font-bold bg-brand-50'
                  : 'hover:text-ink-900 hover:bg-ink-50'
              }`}
            >
              CV Builder
            </Link>

            {/* Tools Dropdown with proper keyboard & ARIA semantics */}
            <div className="relative" ref={toolsDropdownRef}>
              <button
                type="button"
                id="tools-menu-button"
                aria-haspopup="menu"
                aria-expanded={toolsDropdownOpen}
                aria-controls="tools-menu-popover"
                onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                onKeyDown={handleToolsKeyDown}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition cursor-pointer ${
                  isToolsActive || toolsDropdownOpen
                    ? 'text-brand-700 font-bold bg-brand-50'
                    : 'hover:text-ink-900 hover:bg-ink-50'
                }`}
              >
                <span>Tools</span>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 transition-transform duration-150 ${toolsDropdownOpen ? 'rotate-180 text-brand-600' : 'text-ink-400'}`}
                  aria-hidden="true"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {toolsDropdownOpen && (
                <div
                  id="tools-menu-popover"
                  role="menu"
                  aria-labelledby="tools-menu-button"
                  className="absolute left-0 mt-2 w-72 origin-top-left rounded-2xl border border-ink-100 bg-white p-2 shadow-lift ring-1 ring-black/5 focus:outline-none z-50 animate-fade-in"
                >
                  <div className="px-3 py-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
                    Career Enhancement Suite
                  </div>
                  <Link
                    to="/builder?mode=ats"
                    role="menuitem"
                    onClick={() => setToolsDropdownOpen(false)}
                    className="flex items-start gap-2.5 rounded-xl p-2.5 transition hover:bg-brand-50/70 group"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 font-bold text-sm group-hover:bg-brand-100">
                      🎯
                    </span>
                    <div>
                      <div className="text-xs font-bold text-ink-900 group-hover:text-brand-700">ATS Checker</div>
                      <div className="text-[11px] text-ink-500">9-dimension deterministic ATS compatibility audit</div>
                    </div>
                  </Link>
                  <Link
                    to="/jobs"
                    role="menuitem"
                    onClick={() => setToolsDropdownOpen(false)}
                    className="flex items-start gap-2.5 rounded-xl p-2.5 transition hover:bg-brand-50/70 group"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 font-bold text-sm group-hover:bg-brand-100">
                      🔍
                    </span>
                    <div>
                      <div className="text-xs font-bold text-ink-900 group-hover:text-brand-700">Find Jobs</div>
                      <div className="text-[11px] text-ink-500">Live roles matched against your real CV skills</div>
                    </div>
                  </Link>
                  <Link
                    to="/applications"
                    role="menuitem"
                    onClick={() => setToolsDropdownOpen(false)}
                    className="flex items-start gap-2.5 rounded-xl p-2.5 transition hover:bg-brand-50/70 group"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 font-bold text-sm group-hover:bg-brand-100">
                      📊
                    </span>
                    <div>
                      <div className="text-xs font-bold text-ink-900 group-hover:text-brand-700">Application Tracker</div>
                      <div className="text-[11px] text-ink-500">Visual Kanban board for application stages</div>
                    </div>
                  </Link>
                  <Link
                    to="/interview"
                    role="menuitem"
                    onClick={() => setToolsDropdownOpen(false)}
                    className="flex items-start gap-2.5 rounded-xl p-2.5 transition hover:bg-brand-50/70 group"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 font-bold text-sm group-hover:bg-brand-100">
                      🎙️
                    </span>
                    <div>
                      <div className="text-xs font-bold text-ink-900 group-hover:text-brand-700">AI Interview Coach</div>
                      <div className="text-[11px] text-ink-500">Real-time mock interviews with STAR story bank</div>
                    </div>
                  </Link>
                  <Link
                    to="/linkedin"
                    role="menuitem"
                    onClick={() => setToolsDropdownOpen(false)}
                    className="flex items-start gap-2.5 rounded-xl p-2.5 transition hover:bg-brand-50/70 group"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 font-bold text-sm group-hover:bg-brand-100">
                      🌐
                    </span>
                    <div>
                      <div className="text-xs font-bold text-ink-900 group-hover:text-brand-700">LinkedIn Optimizer</div>
                      <div className="text-[11px] text-ink-500">Headline &amp; summary booster for recruiters</div>
                    </div>
                  </Link>
                  <Link
                    to="/prepare-application"
                    role="menuitem"
                    onClick={() => setToolsDropdownOpen(false)}
                    className="flex items-start gap-2.5 rounded-xl p-2.5 transition hover:bg-brand-50/70 group border-t border-ink-100 mt-1 pt-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 font-bold text-sm group-hover:bg-brand-200">
                      🚀
                    </span>
                    <div>
                      <div className="text-xs font-bold text-brand-800">Prepare Application</div>
                      <div className="text-[11px] text-brand-600">5-step guided orchestrator</div>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            <a
              href={isLanding ? '#how' : '/#how'}
              className="px-3 py-2 rounded-lg text-ink-600 hover:text-ink-900 hover:bg-ink-50 transition"
            >
              How It Works
            </a>
            <a
              href={isLanding ? '#truth' : '/#truth'}
              className="px-3 py-2 rounded-lg text-ink-600 hover:text-ink-900 hover:bg-ink-50 transition"
            >
              Truth Guard
            </a>
          </nav>

          {/* Desktop Right Action Area */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Privacy & Sovereignty */}
            <button
              type="button"
              onClick={handleOpenPrivacy}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900 transition px-2.5 py-2 cursor-pointer"
              title="View data privacy, download complete JSON backup or restore"
              aria-label="Privacy and backup controls"
            >
              <span>🛡️</span>
              <span>Privacy &amp; Backup</span>
            </button>

            {/* Primary Emerald Action Button */}
            <Link
              to={ctaLink}
              className="btn-primary text-xs xl:text-sm px-5 py-2.5 font-bold shadow-xs whitespace-nowrap"
            >
              {ctaText} →
            </Link>
          </div>

          {/* Mobile & Tablet Header Controls (< lg) */}
          <div className="flex items-center gap-2 lg:hidden">
            <Link
              to="/builder"
              className="btn-primary px-3 py-1.5 text-xs font-semibold text-white shadow-xs"
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
            id="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Menu"
            className="lg:hidden border-b border-ink-100 bg-white/95 backdrop-blur-md shadow-xl animate-fade-in"
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
                    <span>📄</span> CV Builder
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
                  className="flex w-full items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-ink-700 hover:bg-ink-50 cursor-pointer"
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
