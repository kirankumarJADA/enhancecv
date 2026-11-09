import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';
import Navbar from '../components/Navbar';
import DataPrivacyModal from '../components/DataPrivacyModal';

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Upload or Enter Facts',
    body: 'Upload your existing CV (PDF, DOCX, or TXT) for an instant AI rebuild, or use our structured builder to supply your career facts from scratch.',
  },
  {
    step: '2',
    title: 'AI Engine Rebuild',
    body: 'Our backend AI Engine crafts achievement-oriented bullets using the Google XYZ format ("Accomplished [X] by doing [Y]") starting with high-impact action verbs.',
  },
  {
    step: '3',
    title: 'Truth Guard™ Audit',
    body: 'Rewritten bullets are checked against your source facts. Any unevidenced technologies or invented metrics are automatically reverted to your original CV wording.',
  },
  {
    step: '4',
    title: 'Instant ATS PDF Download',
    body: 'Inspect your deterministic ATS compatibility score, preview across all six standard single-column templates, and download your finished PDF in one click.',
  },
];

const TRUST_PILLARS = [
  {
    title: '100% Free Public Access',
    desc: 'No credit card, no monthly subscription, and no paywalls. All builder tools and exports are completely open.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-brand-600" aria-hidden="true">
        <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Zero Database Retention',
    desc: 'Purely in-memory and client-side draft storage. We never store your resume or personal details in a database.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-brand-600" aria-hidden="true">
        <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Deterministic ATS Scoring',
    desc: 'Transparent 0–100 score evaluating formatting, structure, skills, and readability derived from implemented ATS rules.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-brand-600" aria-hidden="true">
        <path d="M9 17v-6m4 6V7m4 10v-3M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Intelligent AI Engine',
    desc: 'Transforms passive phrasing into high-impact Google XYZ achievements with tailored keywords for target roles.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-brand-600" aria-hidden="true">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Truth Guard™ Verification',
    desc: 'Factual grounding checks automatically revert any unevidenced technologies or fabricated statistics.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-brand-600" aria-hidden="true">
        <path d="M9 12l2 2 4-4m5.6 1.2A8.5 8.5 0 113.4 13.2a8.5 8.5 0 0117.2-4z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const CAREER_TOOLS = [
  {
    title: 'CV Builder & Rebuilder',
    desc: 'Build from scratch or upload your existing document. Choose between 6 ATS-safe clean single-column templates.',
    link: '/builder',
    badge: 'Core Builder',
    icon: '📄',
  },
  {
    title: 'ATS Compatibility Checker',
    desc: 'Instantly score your resume against real-world ATS parsing algorithms and get actionable bullet fixes.',
    link: '/builder?mode=ats',
    badge: 'Scoring',
    icon: '🎯',
  },
  {
    title: 'Prepare Application Stepper',
    desc: 'Step-by-step orchestrator matching your CV directly to any target job description with a tailored cover letter.',
    link: '/prepare-application',
    badge: 'Orchestrator',
    icon: '🚀',
  },
  {
    title: 'Job Search & Matches',
    desc: 'Search tech jobs in the UK, US, and Europe and see automated keyword match percentages for your CV.',
    link: '/jobs',
    badge: 'Discovery',
    icon: '🔍',
  },
  {
    title: 'Application Kanban Tracker',
    desc: 'Organize your job hunt across Wishlist, Applied, Interview, Offer, and Rejected without external spreadsheets.',
    link: '/applications',
    badge: 'Productivity',
    icon: '📋',
  },
  {
    title: 'AI Interview Practice Coach',
    desc: 'Simulate technical and behavioral interviews with real-time feedback and structured STAR story generation.',
    link: '/interview',
    badge: 'Coaching',
    icon: '🎙️',
  },
  {
    title: 'LinkedIn Profile Optimizer',
    desc: 'Transform your CV into an engaging LinkedIn headline, about section, and recruiter-visible keyword profile.',
    link: '/linkedin',
    badge: 'Branding',
    icon: '💼',
  },
];

const FAQS = [
  {
    q: 'Is Curevo AI completely free with no login required?',
    a: 'Yes. Curevo AI is 100% free with no account creation, no password resets, no credit card, and no paywalls. Both the existing CV rebuild flow and the create from scratch builder are available to everyone immediately.',
  },
  {
    q: 'How does Truth Guard™ protect factual grounding?',
    a: 'Traditional AI resume tools often hallucinate technologies or invent statistics that fail during background checks or interviews. Curevo AI enforces a strict Truth Guard engine: proposed bullets are checked for unevidenced technologies and new numeric metrics. Any bullet introducing ungrounded tools or fabricated numbers is automatically reverted to your original source CV text.',
  },
  {
    q: 'What does the ATS Compatibility score mean?',
    a: 'It is Curevo AI\'s transparent deterministic metric across five categories (formatting, structure, content, skills, and readability) calculated from concrete rule-based checks. It verifies standard headers, date consistency, bullet point metrics, and technical keyword density.',
  },
  {
    q: 'What file formats can I upload?',
    a: 'You can upload text-based PDF, DOCX, and TXT files up to 8 MB. Our ingestion engine extracts structured experience, education, skills, and contact information with sandboxed decompression protection.',
  },
  {
    q: 'Is my resume data stored on your servers?',
    a: 'No. Curevo AI is entirely stateless. The backend does not connect to any PostgreSQL database, user account table, or persistent disk storage. Your resume data lives exclusively in your browser\'s React memory while you work and is discarded when you close the tab.',
  },
];

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  return (
    <div className="bg-white text-ink-900 selection:bg-brand-100 selection:text-brand-900 min-h-screen flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar onOpenPrivacy={() => setPrivacyModalOpen(true)} ctaText="Start Building Free" ctaLink="/builder" />

      {/* Hero Section — Enhancv-Inspired Split Hero */}
      <section className="relative overflow-hidden border-b border-ink-100 bg-white">
        {/* Soft Pastel Ambient Glows */}
        <div className="pointer-events-none absolute -top-40 right-10 h-[500px] w-[500px] rounded-full bg-brand-50 blur-3xl opacity-70" aria-hidden="true" />
        <div className="pointer-events-none absolute top-48 -left-20 h-80 w-80 rounded-full bg-purple-50 blur-3xl opacity-60" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-10 right-1/4 h-72 w-72 rounded-full bg-sky-50 blur-3xl opacity-50" aria-hidden="true" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:py-24 relative">
          {/* Left Column: Headline, Copy, CTAs, Trust Row (col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Pill Badge */}
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1 text-xs font-semibold text-brand-700">
              <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" aria-hidden="true" />
              Curevo AI • 100% In-Memory • Truthful AI Engine
            </p>

            {/* Main Headline with Purple Highlight */}
            <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.5rem]">
              Land More Interviews{' '}
              <span className="text-purple-600 block sm:inline">with a CV built for every opportunity.</span>
            </h1>

            {/* Subtitle */}
            <p className="max-w-xl text-lg leading-relaxed text-ink-600">
              Build your CV with AI, check its ATS compatibility, and tailor it to the jobs you want — all with strict factual grounding and zero sign-up required.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/builder?mode=create"
                className="btn-primary px-7 py-3.5 text-base font-bold shadow-sm"
              >
                Build Your CV →
              </Link>
              <Link
                to="/builder?mode=ats"
                className="btn-secondary px-6 py-3.5 text-base font-semibold shadow-xs"
              >
                Check Your CV Score
              </Link>
            </div>

            {/* Trust Row */}
            <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-ink-600 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="text-brand-600 font-bold">✓</span>
                <span>No sign-up required</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-brand-600 font-bold">✓</span>
                <span>ATS analysis</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-brand-600 font-bold">✓</span>
                <span>AI bullet engine</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-brand-600 font-bold">✓</span>
                <span>Truth Guard™ verified</span>
              </div>
            </div>

            {/* Quick 1-Click Sample CV Test-Drive Link */}
            <div className="pt-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/70 px-4 py-2 text-xs font-medium text-ink-800 transition hover:bg-brand-100/80">
                <span className="font-semibold text-brand-700">Want to explore without uploading?</span>
                <Link
                  to="/builder?sample=true"
                  className="inline-flex items-center gap-1 font-bold text-brand-600 hover:text-brand-800 underline decoration-brand-300 hover:decoration-brand-700 underline-offset-2"
                >
                  <span>Try with a Sample CV</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column: Realistic Floating CV Document Hero Preview (col-span-5) */}
          <div className="lg:col-span-5 relative flex justify-center">
            {/* Ambient Multi-Hue Glow Behind the CV */}
            <div className="pointer-events-none absolute inset-0 -m-6 rounded-3xl bg-gradient-to-tr from-brand-100/60 via-purple-100/40 to-sky-100/50 blur-2xl -z-10" aria-hidden="true" />

            {/* The Floating CV Paper */}
            <div className="w-full max-w-[420px] rounded-xl bg-white p-6 sm:p-7 shadow-resume ring-1 ring-ink-100 transition-transform duration-300 hover:-translate-y-1">
              {/* Top Banner Tag */}
              <div className="flex items-center justify-between border-b border-ink-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                    Curevo AI Verified CV
                  </span>
                </div>
                <span className="chip bg-brand-50 text-brand-700 border border-brand-200 text-[10px] font-semibold">
                  ATS Score: 92/100
                </span>
              </div>

              {/* Candidate Header */}
              <div>
                <h2 className="text-xl font-extrabold text-ink-900 tracking-tight">Sarah Jenkins</h2>
                <p className="text-xs font-bold text-purple-600 mt-0.5">
                  Senior Product Designer &amp; Design Systems Lead
                </p>
                <p className="text-[11px] text-ink-400 mt-1">
                  London, UK • sarah.jenkins@example.com • linkedin.com/in/sarahjenkins
                </p>
              </div>

              {/* Professional Summary */}
              <div className="mt-4 pt-3 border-t border-ink-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  Professional Summary
                </p>
                <p className="mt-1 text-xs text-ink-600 leading-relaxed">
                  Strategic Product Designer with 7+ years orchestrating design systems and multi-platform SaaS experiences. Proven track record increasing enterprise adoption and design-to-code velocity using scalable component libraries and rigorous accessibility standards.
                </p>
              </div>

              {/* Core Skills Chips */}
              <div className="mt-4 pt-3 border-t border-ink-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  Core Competencies
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {['Design Systems', 'Figma & Tokens', 'User Research', 'React & CSS', 'ATS Compliance', 'Information Architecture'].map((skill) => (
                    <span key={skill} className="rounded-md bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-700 border border-ink-200/60">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Experience Snippet */}
              <div className="mt-4 pt-3 border-t border-ink-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  Experience
                </p>

                <div className="mt-2 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-ink-900">Lead Product Designer</span>
                      <span className="text-[11px] text-ink-400">2022 – Present</span>
                    </div>
                    <p className="text-[11px] text-brand-700 font-semibold">Monolith Financial • London</p>
                    <ul className="mt-1 space-y-1 text-[11px] text-ink-600">
                      <li className="flex items-start gap-1.5">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>Spearheaded unified design system across 4 web apps, reducing component delivery time by 38%.</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>Redesigned onboarding funnel resulting in a 24% boost in customer conversion across 450k monthly active users.</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-ink-900">Senior UI/UX Designer</span>
                      <span className="text-[11px] text-ink-400">2019 – 2022</span>
                    </div>
                    <p className="text-[11px] text-brand-700 font-semibold">Vantage Scale • Manchester</p>
                    <ul className="mt-1 space-y-1 text-[11px] text-ink-600">
                      <li className="flex items-start gap-1.5">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>Architected scalable design token pipeline adopted by 40+ cross-functional engineers.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Education */}
              <div className="mt-4 pt-3 border-t border-ink-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  Education &amp; Credentials
                </p>
                <div className="mt-1 text-[11px] text-ink-700 flex justify-between">
                  <span className="font-medium">BSc (Hons) Human-Computer Interaction</span>
                  <span className="text-ink-400">Univ. of Manchester</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-700 flex justify-between">
                  <span className="font-medium">NN/g UX Master Certified</span>
                  <span className="text-ink-400">Credential #9482</span>
                </div>
              </div>

              {/* Floating Bottom Stamp */}
              <div className="mt-4 pt-3 border-t border-dashed border-ink-200 flex items-center justify-between text-[11px]">
                <span className="text-ink-400">Single-Column Standard Layout</span>
                <span className="font-semibold text-brand-700 flex items-center gap-1">
                  <span>✓</span> 100% Parseable PDF
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Trust Pillars & Core Guarantees */}
      <section className="py-16 bg-ink-50/60 border-b border-ink-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600">Built for Trust</h2>
            <p className="mt-2 text-2xl font-extrabold text-ink-900 sm:text-3xl">
              Why job seekers choose Curevo AI
            </p>
            <p className="mt-2 text-sm text-ink-600">
              Unlike ordinary resume builders that charge hidden fees or hallucinate credentials, Curevo AI is transparent and factually grounded.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {TRUST_PILLARS.map((pillar) => (
              <div key={pillar.title} className="card p-5 transition hover:shadow-lift flex flex-col justify-between">
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 border border-brand-100 mb-4">
                    {pillar.icon}
                  </div>
                  <h3 className="text-sm font-bold text-ink-900">{pillar.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-ink-600">{pillar.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: How it Works (4 Steps) */}
      <section id="how" className="py-20 bg-white border-b border-ink-100">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600">Simple Process</h2>
            <p className="mt-2 text-3xl font-extrabold text-ink-900 sm:text-4xl">
              From raw CV to tailored resume in four steps
            </p>
            <p className="mt-3 text-base text-ink-600">
              Curevo AI is built on one foundational principle: your real experience is the single source of truth.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.step} className="card p-6 transition hover:shadow-lift relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-xs">
                  {s.step}
                </div>
                <h3 className="mt-4 text-base font-bold text-ink-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Complete Career Suite / Tools */}
      <section id="tools" className="py-20 bg-ink-50/50 border-b border-ink-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600">The Complete Platform</h2>
            <p className="mt-2 text-3xl font-extrabold text-ink-900 sm:text-4xl">
              Everything you need to navigate modern hiring
            </p>
            <p className="mt-3 text-base text-ink-600">
              From crafting your resume to discovering matching jobs and practicing interview answers.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {CAREER_TOOLS.map((tool) => (
              <Link
                key={tool.title}
                to={tool.link}
                className="card p-6 transition hover:shadow-lift hover:border-brand-300 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl">{tool.icon}</span>
                    <span className="chip bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold">
                      {tool.badge}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-ink-900 group-hover:text-brand-700 transition">
                    {tool.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-ink-600">
                    {tool.desc}
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-ink-100 flex items-center gap-1 text-xs font-bold text-brand-600 group-hover:translate-x-0.5 transition-transform">
                  <span>Open Tool</span>
                  <span>&rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Section 5: ATS & Job Match Workflow (Relocated Signature Cards) */}
      <section className="py-20 bg-white border-b border-ink-100">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1 text-xs font-semibold text-brand-700">
              Deterministic Matching &amp; ATS Scoring
            </span>
            <h2 className="mt-3 text-3xl font-extrabold text-ink-900 sm:text-4xl">
              Inspect your match score before applying
            </h2>
            <p className="mt-3 text-base text-ink-600">
              See exactly how candidate skills align with target job descriptions, verified with strict Truth Guard™ auditing.
            </p>
          </div>

          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* Relocated Card 1: Job Match Card (84 Score) */}
            <div className="card p-6 shadow-lift border border-ink-100 bg-white">
              <div className="flex items-center justify-between border-b border-ink-100 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Illustrative Job Match</p>
                  <p className="text-lg font-bold text-ink-900">Senior Java Backend Engineer</p>
                  <p className="text-xs text-ink-500">Benchmark Role · Tech Ecosystem</p>
                </div>
                <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-full border-[5px] border-emerald-500 bg-white shadow-xs">
                  <span className="text-xl font-extrabold text-ink-900">84</span>
                </div>
              </div>

              <div className="mt-5 space-y-2 text-xs">
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 border border-emerald-100">
                  <span className="font-medium text-emerald-800">Java, Spring Boot, REST APIs</span>
                  <span className="chip bg-emerald-100 text-emerald-800 text-[11px]">Matched</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 border border-amber-100">
                  <span className="font-medium text-amber-800">Microservices, CI/CD</span>
                  <span className="chip bg-amber-100 text-amber-800 text-[11px]">Partial</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 border border-red-100">
                  <span className="font-medium text-red-800">AWS, Kubernetes, Terraform</span>
                  <span className="chip bg-red-100 text-red-800 text-[11px]">Missing</span>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-ink-100 bg-ink-50 p-3.5">
                <p className="text-xs font-semibold text-ink-700 tracking-wide uppercase">Truth Guard™ Audit</p>
                <p className="mt-1 text-xs text-ink-600">
                  ✓ Supported by Source CV · ✓ Supported by Source CV · ✓ Reverted 1 unevidenced claim
                </p>
              </div>
            </div>

            {/* Relocated Card 2: ATS Compatibility Breakdown (74/100) */}
            <div className="card p-6 shadow-lift border border-ink-100 bg-white">
              <div className="flex items-center justify-between border-b border-ink-100 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">ATS Compatibility Breakdown</p>
                  <p className="text-2xl font-extrabold text-ink-900">
                    74<span className="text-sm font-medium text-ink-400"> / 100</span>
                  </p>
                </div>
                <span className="chip bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold">
                  Curevo AI Metric
                </span>
              </div>

              <div className="mt-4 space-y-2.5">
                {[
                  ['Formatting', 92],
                  ['Structure', 95],
                  ['Content', 68],
                  ['Skills', 72],
                  ['Readability', 86],
                ].map(([label, v]) => (
                  <div key={label as string} className="flex items-center gap-3">
                    <span className="w-24 text-xs font-medium text-ink-600">{label}</span>
                    <div className="h-2 flex-1 rounded-full bg-ink-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${(v as number) >= 75 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${v}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs font-bold text-ink-800">{v}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-emerald-50 p-3 border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-800">What is working</p>
                  <p className="mt-1 text-[11px] text-emerald-700 leading-snug">Standard headings · complete contact info · consistent dates</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 border border-amber-100">
                  <p className="text-xs font-bold text-amber-800">Needs improvement</p>
                  <p className="mt-1 text-[11px] text-amber-700 leading-snug">Passive phrasing · generic summary · unquantified bullets</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: Truth Guard Engine (Dark Contrast Surface) */}
      <section id="truth" className="bg-ink-900 py-24 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3.5 py-1 text-xs font-semibold text-brand-300">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden="true" />
                Truth Guard™ Engine
              </span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
                If your source facts don’t support it, it doesn’t go in.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink-300">
                Most AI tools invent skills, certifications, and inflated metrics to boost keyword scores. That leads to disqualification in interviews. Curevo AI programmatically cross-references technologies and numbers in rewritten bullets against source facts, reverting ungrounded additions.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4">
                  <p className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    <span>Allowed AI Operations</span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-ink-300">
                    Convert passive phrases to action verbs • Structure with Google XYZ format • Reorder technical skills • Highlight relevant achievements.
                  </p>
                </div>

                <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4">
                  <p className="text-sm font-bold text-red-400 flex items-center gap-1.5">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    <span>Strictly Blocked</span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-ink-300">
                    Inventing employers, degrees, or certifications • Fabricating metrics or percentages • Adding ungrounded skills or tools.
                  </p>
                </div>
              </div>
            </div>

            {/* Terminal-style Truth Guard demo */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 font-mono text-xs shadow-xl text-ink-200">
              <div className="flex items-center gap-1.5 border-b border-white/10 pb-3">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-ink-400 text-[11px]">curevo-truth-guard-audit.log</span>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-ink-400">// Inspecting Proposed Experience Bullet:</p>
                <p className="text-amber-300">
                  &quot;Architected distributed microservices handling 10M req/sec using AWS &amp; Kubernetes.&quot;
                </p>
                <div className="mt-3 rounded-lg bg-black/40 p-3 border border-white/10 space-y-1">
                  <p className="text-ink-400">[AUDIT] Checking claims against candidate source facts...</p>
                  <p className="text-red-400">[CLAIM REJECTED] &quot;10M req/sec&quot; not in source facts.</p>
                  <p className="text-red-400">[CLAIM REJECTED] &quot;AWS &amp; Kubernetes&quot; not in source facts.</p>
                  <p className="text-emerald-400">[TRUTH GUARD REVERT] Reverted to source experience wording.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: FAQ Accordion */}
      <section id="faq" className="border-b border-ink-100 bg-ink-50/60 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="section-heading">Frequently asked questions</h2>
            <p className="mt-3 text-ink-600 text-sm">
              Learn how Curevo AI operates with zero database retention and algorithmic grounding checks.
            </p>
          </div>

          <div className="mt-10 space-y-3">
            {FAQS.map((f, i) => (
              <div key={f.q} className="card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-6 py-4.5 text-left text-sm font-semibold text-ink-900 hover:bg-ink-50 transition cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span>{f.q}</span>
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`ml-4 h-5 w-5 text-ink-400 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 pt-1 text-sm leading-relaxed text-ink-600 border-t border-ink-100">
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 8: Final CTA Banner */}
      <section className="py-20 bg-white text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="section-heading">Your next application deserves a standout CV.</h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-600">
            No signup, no login, and no payment required. Start building or improving your resume in seconds.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/builder?mode=create"
              className="btn-primary px-7 py-3.5 text-sm font-bold shadow-sm"
            >
              Build Your CV Free →
            </Link>
            <Link
              to="/builder?mode=ats"
              className="btn-secondary px-7 py-3.5 text-sm font-semibold shadow-xs"
            >
              Check ATS Score
            </Link>
            <Link
              to="/builder?mode=improve"
              className="btn-secondary px-7 py-3.5 text-sm font-semibold shadow-xs"
            >
              Improve Existing CV
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-100 py-10 bg-white mt-auto">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
          <Logo />
          <p className="text-xs text-ink-500 text-center sm:text-left">
            Curevo AI — Your next resume starts here. © {new Date().getFullYear()} Curevo AI. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-5 text-xs text-ink-600 font-medium">
            <button
              type="button"
              onClick={() => setPrivacyModalOpen(true)}
              className="text-brand-600 hover:text-brand-800 font-bold cursor-pointer flex items-center gap-1"
            >
              <span>🛡️</span> Privacy &amp; Portability
            </button>
            <Link to="/prepare-application" className="hover:text-ink-900 transition">Prepare Application</Link>
            <Link to="/builder?mode=ats" className="hover:text-ink-900 transition font-semibold text-brand-600">Check ATS Score</Link>
            <Link to="/builder" className="hover:text-ink-900 transition">CV Builder</Link>
            <a href="#truth" className="hover:text-ink-900 transition">Truth Guard™</a>
          </div>
        </div>
      </footer>

      {/* Privacy Modal */}
      <DataPrivacyModal
        isOpen={privacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
      />
    </div>
  );
}
