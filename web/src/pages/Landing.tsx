import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Upload or Enter Facts',
    body: 'Upload your existing CV (PDF, DOCX, or TXT) for an instant AI rebuild, or use our structured builder to supply your career facts from scratch.',
  },
  {
    step: '2',
    title: 'NVIDIA Nemotron AI Rebuild',
    body: 'Our backend AI model crafts achievement-oriented bullets using the Google XYZ format ("Accomplished [X] by doing [Y]") starting with high-impact action verbs.',
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

const FEATURES = [
  {
    title: 'NVIDIA Nemotron AI Engine',
    body: 'Powered by nvidia/nemotron-3.5-lightning-30b-a3b for intelligent structural rewriting, keyword optimization, and achievement phrasing.',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    title: 'Truth Guard™ Verification',
    body: 'Factual grounding checks. Generated skills, technologies, and quantitative metrics are algorithmically verified against your source CV tokens; bullets with unevidenced technologies or fabricated numbers are automatically repaired or reverted to original wording.',
    icon: 'M9 12l2 2 4-4m5.6 1.2A8.5 8.5 0 113.4 13.2a8.5 8.5 0 0117.2-4z',
  },
  {
    title: 'Deterministic ATS Scoring',
    body: 'Transparent 0–100 compatibility score evaluating formatting, content, structure, skills, and readability derived from implemented ATS parser rules.',
    icon: 'M9 17v-6m4 6V7m4 10v-3M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z',
  },
  {
    title: '100% In-Memory Privacy',
    body: 'No login, no password, and zero database persistence. All resume processing occurs ephemerally in React memory and server worker sandbox.',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  },
  {
    title: '6 ATS-Safe PDF Templates',
    body: 'Classic, Modern, Minimal, Professional, Technical, and Executive templates designed strictly with ATS-parseable single-column margins and standard fonts.',
    icon: 'M12 10v6m-3-3h6m-9 8h12a2 2 0 002-2V7l-5-5H6a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    title: 'Instant Binary PDF Delivery',
    body: 'Download high-resolution, machine-readable PDFs generated natively on the server with clean text layers parsers can ingest without OCR errors.',
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  },
];

const FAQS = [
  {
    q: 'Is Curevo AI completely free with no login required?',
    a: 'Yes. Curevo AI is 100% free with no account creation, no password resets, no credit card, and no paywalls. Both the existing CV rebuild flow and the create from scratch builder are available to everyone immediately.',
  },
  {
    q: 'How does Truth Guard protect factual grounding?',
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

  return (
    <div className="bg-white text-slate-900 selection:bg-teal-100 selection:text-teal-900 min-h-screen flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex" aria-label="Main Navigation">
            <a href="#how" className="transition hover:text-slate-900">How It Works</a>
            <a href="#truth" className="transition hover:text-slate-900">Truth Guard™</a>
            <a href="#features" className="transition hover:text-slate-900">Features</a>
            <a href="#faq" className="transition hover:text-slate-900">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/builder"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              <span>Start Building Free</span>
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-teal-400" aria-hidden="true">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-slate-50 border-b border-slate-200 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            {/* Pill Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-300 bg-white px-3.5 py-1 text-xs font-semibold text-teal-800 shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-teal-600" aria-hidden="true" />
              <span>Curevo AI • 100% In-Memory • No Sign-up Required</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-6xl sm:leading-[1.12]">
              Curevo AI
              <span className="mt-2 block text-3xl font-extrabold text-slate-900 sm:text-5xl">
                Your next resume starts here.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-700 sm:text-xl sm:leading-relaxed">
              Upload your CV. Let AI rebuild it. Download your professional resume.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Powered by NVIDIA Nemotron AI with deterministic ATS scoring and strict Truth Guard™ verification.
            </p>

            {/* Dual Main Actions Prominently Displayed */}
            <div className="mt-10 grid gap-4 sm:grid-cols-2 max-w-2xl mx-auto text-left">
              {/* Option 1: Improve Existing CV */}
              <Link
                to="/builder?mode=improve"
                className="group relative flex flex-col justify-between rounded-xl border-2 border-teal-600 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm transition group-hover:bg-teal-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
                      <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="inline-flex items-center text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                    Recommended
                  </span>
                </div>
                <div className="mt-4">
                  <h2 className="text-xl font-bold text-slate-950 group-hover:text-teal-700">
                    Improve my existing CV
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                    Upload your current PDF, DOCX or TXT. AI automatically extracts facts, restructures bullets with Google XYZ formatting, and elevates your ATS score.
                  </p>
                </div>
                <div className="mt-5 flex items-center font-semibold text-sm text-teal-700 group-hover:text-teal-800">
                  <span>Upload &amp; Rebuild Now</span>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </Link>

              {/* Option 2: Create from Scratch */}
              <Link
                to="/builder?mode=create"
                className="group relative flex flex-col justify-between rounded-xl border border-slate-300 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm transition group-hover:bg-slate-800">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
                      <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="inline-flex items-center text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    From Scratch
                  </span>
                </div>
                <div className="mt-4">
                  <h2 className="text-xl font-bold text-slate-950 group-hover:text-slate-700">
                    Create a resume from scratch
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                    Supply your career details, education, and target role into clean grouped form sections. Curevo AI formats and organizes a complete ATS-ready document.
                  </p>
                </div>
                <div className="mt-5 flex items-center font-semibold text-sm text-slate-900 group-hover:text-slate-700">
                  <span>Start Blank Resume</span>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </Link>
            </div>

            {/* Quick 1-Click Sample CV Test-Drive Link */}
            <div className="mt-6 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50/90 px-4 py-2 text-xs font-medium text-teal-950 shadow-sm transition hover:bg-teal-100/80">
                <span className="font-semibold text-teal-800">Want to explore without uploading?</span>
                <Link
                  to="/builder?sample=true"
                  className="inline-flex items-center gap-1 font-bold text-teal-700 hover:text-teal-900 underline decoration-teal-400 hover:decoration-teal-700 underline-offset-2"
                >
                  <span>Try with a Sample CV</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>

            {/* Quick Guarantees */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-600 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd"/></svg>
                Zero signup or login
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd"/></svg>
                Zero database storage
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd"/></svg>
                PDF, DOCX &amp; TXT up to 8MB
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd"/></svg>
                All 6 ATS-Safe templates
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="border-b border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto">
            <span className="text-xs font-bold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
              The Curevo AI Process
            </span>
            <h2 className="section-heading mt-3">From raw CV to interview-winning resume</h2>
            <p className="mt-3 text-base text-slate-600">
              Curevo AI is built on one foundational principle: your real experience is the single source of truth. The AI transforms phrasing and structure while algorithmically checking technical skills and numerical metrics against source CV tokens (qualitative semantic descriptions are not exhaustively verified).
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.step} className="rounded-xl p-6 border border-slate-200 bg-slate-50 transition hover:border-slate-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white shadow-sm">
                  {s.step}
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-950">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Truth Guard Section (Dark Contrast Surface) */}
      <section id="truth" className="bg-slate-950 py-24 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 border border-teal-500/40 px-3 py-1 text-xs font-semibold text-teal-300">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                Truth Guard™ Engine
              </span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
                If your source facts don’t support it, it doesn’t go in.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-300">
                Most AI tools invent skills, certifications, and inflated metrics to boost keyword scores. That leads to disqualification in interviews. Curevo AI programmatically cross-references technologies and numbers in rewritten bullets against source facts, reverting ungrounded additions.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4">
                  <p className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Allowed AI Operations</span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
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
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    Inventing employers, degrees, or certifications • Fabricating metrics or percentages • Adding ungrounded skills or tools.
                  </p>
                </div>
              </div>
            </div>

            {/* Terminal-style Truth Guard demo */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 font-mono text-xs shadow-xl">
              <div className="flex items-center gap-1.5 border-b border-slate-800 pb-3">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-slate-400 text-[11px]">curevo-truth-guard-audit.log</span>
              </div>
              <div className="mt-4 space-y-2 text-slate-300">
                <p className="text-slate-400">// Inspecting Proposed Experience Bullet:</p>
                <p className="text-amber-300">
                  &quot;Architected distributed microservices handling 10M req/sec using AWS &amp; Kubernetes.&quot;
                </p>
                <div className="mt-3 rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-1">
                  <p className="text-slate-400">[AUDIT] Checking claims against candidate facts...</p>
                  <p className="text-red-400">[CLAIM REJECTED] &quot;10M req/sec&quot; not in source facts.</p>
                  <p className="text-red-400">[CLAIM REJECTED] &quot;AWS &amp; Kubernetes&quot; not in source facts.</p>
                  <p className="text-teal-400">[TRUTH GUARD REVERT] Reverted to source experience wording.</p>
                </div>
                <p className="pt-2 text-emerald-400 font-semibold flex items-center gap-1.5">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>Truth Guard Status: Technical skills and numerical metrics checked against source CV.</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-bold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
              Built For Results
            </span>
            <h2 className="section-heading mt-3">Everything required for modern job applications</h2>
            <p className="mt-3 text-slate-600">
              Deterministic scoring, genuine document restructuring, and professional machine-readable templates.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl p-6 border border-slate-200 bg-white transition hover:border-slate-400 group">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-900 group-hover:bg-slate-900 group-hover:text-white transition">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                    <path d={f.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-950">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section id="faq" className="bg-slate-50 py-24 border-b border-slate-200">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="section-heading">Frequently asked questions</h2>
            <p className="mt-3 text-slate-600 text-sm">
              Learn how Curevo AI operates with zero database retention and algorithmic grounding checks.
            </p>
          </div>

          <div className="mt-12 space-y-3">
            {FAQS.map((f, i) => (
              <div key={f.q} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-6 py-4.5 text-left text-sm font-bold text-slate-950 hover:bg-slate-50 transition"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span>{f.q}</span>
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`ml-4 h-5 w-5 text-slate-500 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 pt-1 text-sm leading-relaxed text-slate-600 border-t border-slate-100">
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="bg-slate-950 py-20 text-white text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
            Your next application deserves a standout CV.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-300">
            No signup, no login, and no payment required. Start building or improving your resume in seconds.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/builder?mode=improve"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-500 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <span>Improve My Existing CV</span>
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </Link>
            <Link
              to="/builder?mode=create"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-7 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Create from Scratch
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12 mt-auto">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
          <Logo />
          <p className="text-sm text-slate-600 text-center sm:text-left">
            Curevo AI — Your next resume starts here. © {new Date().getFullYear()} Curevo AI. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-xs text-slate-600 font-medium">
            <Link to="/builder" className="hover:text-slate-950 transition">Resume Builder</Link>
            <a href="#how" className="hover:text-slate-950 transition">How It Works</a>
            <a href="#truth" className="hover:text-slate-950 transition">Truth Guard™</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
