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

const FEATURES = [
  {
    title: 'Intelligent AI Engine',
    body: 'Powered by our advanced AI Engine for intelligent structural rewriting, keyword optimization, and achievement phrasing.',
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
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  return (
    <div className="bg-white text-ink-900 selection:bg-brand-100 selection:text-brand-900 min-h-screen flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar onOpenPrivacy={() => setPrivacyModalOpen(true)} ctaText="Start Building Free" ctaLink="/builder" />

      {/* Hero Section — Sleek Modern SaaS Split-Hero Layout */}
      <section className="relative overflow-hidden border-b border-ink-100 bg-gradient-to-b from-brand-50/40 via-white to-white">
        {/* Ambient Radial Mesh Background */}
        <div className="pointer-events-none absolute -top-40 right-10 h-[500px] w-[500px] rounded-full bg-brand-200/30 blur-3xl opacity-60" aria-hidden="true" />
        <div className="pointer-events-none absolute top-48 -left-20 h-80 w-80 rounded-full bg-indigo-100/40 blur-3xl" aria-hidden="true" />

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24 relative">
          <div>
            {/* Modern Pill Badge */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200/90 bg-white/90 px-3.5 py-1 text-xs font-semibold text-brand-800 shadow-2xs backdrop-blur-sm">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              <span>100% In-Memory • Zero Database • Truthful AI Engine</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.35rem]">
              Build a better CV for <span className="bg-gradient-to-r from-brand-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">every job</span>.
            </h1>

            {/* Subtitle */}
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
              Upload your CV, let our AI Engine optimize your experience with the Google XYZ formula, and export a verified ATS-compliant resume with zero login and strict Truth Guard™ protection.
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link
                to="/builder?mode=ats"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-brand-500/25 transition hover:bg-brand-700 hover:shadow-brand-500/35 active:scale-95"
              >
                <span>Check ATS Score — Free</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
              <Link
                to="/builder?mode=improve"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-6 py-3.5 text-sm font-bold text-ink-800 shadow-2xs transition hover:bg-ink-50 hover:border-ink-300 active:scale-95"
              >
                <span>Improve Existing CV</span>
              </Link>
            </div>

            <p className="mt-3.5 text-xs text-ink-500 flex items-center gap-1.5">
              <span>🔒</span>
              <span>No credit card or login required. Your source CV facts are never modified without proof.</span>
            </p>

            {/* Quick 1-Click Sample CV Test-Drive Link */}
            <div className="mt-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/90 px-4 py-2 text-xs font-medium text-ink-800 shadow-2xs transition hover:bg-brand-50/60">
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

          {/* Right Column: Sleek Interactive AI Engine & ATS Intelligence Card */}
          <div className="relative mx-auto w-full max-w-lg lg:max-w-none" aria-hidden="true">
            {/* Ambient Backlight Glow */}
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-brand-500/20 via-indigo-500/20 to-purple-500/20 blur-2xl opacity-70" />

            {/* Main Interactive Studio Glass Card */}
            <div className="relative rounded-3xl border border-slate-200/90 bg-white/95 p-6 sm:p-7 shadow-2xl shadow-brand-900/10 backdrop-blur-xl transition hover:shadow-brand-900/15 duration-300">
              {/* Window Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-2 font-mono text-[11px] font-semibold text-slate-500">
                    Aarav_Sharma_Resume.pdf
                  </span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Truth Guard™ Verified
                </div>
              </div>

              {/* Role Title and ATS Compatibility Ring */}
              <div className="mt-5 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
                    Target Job Fit Benchmark
                  </span>
                  <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">
                    Senior Cloud Solutions Architect
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tier-1 Candidate Fit • Top 3% of Applicant Pool
                  </p>
                </div>
                {/* Modern Circular Score Badge */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-700 text-white shadow-md shadow-brand-600/30">
                    <span className="text-2xl font-black">94</span>
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-2xs">
                      ✓
                    </span>
                  </div>
                  <span className="mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">ATS Score</span>
                </div>
              </div>

              {/* Key Optimized Skills & Google XYZ Badges */}
              <div className="mt-5 space-y-2 text-xs">
                <div className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3.5 py-2.5 border border-slate-200/70">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 text-xs font-bold">✓</span>
                    <span className="font-semibold text-slate-800">Kubernetes, Terraform &amp; AWS Multi-Region</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">100% Match</span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3.5 py-2.5 border border-slate-200/70">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-100 text-brand-700 text-xs font-bold">⚡</span>
                    <span className="font-semibold text-slate-800">Google XYZ Rewriting: £420k compute saving quantified</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">Optimized</span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3.5 py-2.5 border border-slate-200/70">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold">🛡️</span>
                    <span className="font-semibold text-slate-800">Truth Guard™ Audit: 0 fabricated claims, 100% evidenced</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">Grounded</span>
                </div>
              </div>

              {/* Bottom Quick Metric Bar */}
              <div className="mt-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 p-4 text-white shadow-inner flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                    Automated ATS Compliance
                  </div>
                  <div className="text-xs font-semibold text-slate-200 mt-0.5">
                    Standard single-column format • Clean parseable text layer
                  </div>
                </div>
                <Link
                  to="/builder?sample=true"
                  className="rounded-lg bg-brand-600 hover:bg-brand-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition active:scale-95"
                >
                  Inspect CV →
                </Link>
              </div>
            </div>

            {/* Subtle Floating Lift Badge */}
            <div className="hidden sm:flex absolute -bottom-5 -right-4 items-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-2.5 shadow-xl shadow-slate-900/10 backdrop-blur-md">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 text-lg">
                📈
              </span>
              <div>
                <div className="text-xs font-extrabold text-slate-900">+32% Interview Call Rate</div>
                <div className="text-[10px] text-slate-500">Based on Google XYZ bullet standard</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-ink-100 bg-ink-50/60 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="section-heading text-center">From raw CV to tailored resume in four steps</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-ink-600">
            Curevo AI is built on one foundational principle: your real experience is the single source of truth. Analysis and tailoring work for you — our AI Engine never invents for you.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.step} className="card p-6 transition hover:shadow-lift">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-xs">
                  {s.step}
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CV analysis + Job matching split (from original 503b246) */}
      <section className="py-20 border-b border-ink-100 bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">CV analysis &amp; audit</p>
            <h2 className="section-heading mt-2">Know your baseline before you apply</h2>
            <p className="mt-4 text-ink-600 leading-relaxed">
              Curevo AI’s ATS Compatibility score breaks your CV into five clear categories and shows exactly what is working and what needs improvement — with concrete rule-based recommendations, never vague hints.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
              {[
                'Formatting: standard single-column headings, parseable contact block, consistent dates',
                'Content: Google XYZ achievement bullets, action verbs, quantified outcomes',
                'Skills: recognised industry technology tokens, organised categorization',
                'Readability: bullet length, typographical hierarchy, clean spacing',
              ].map((t) => (
                <li key={t} className="flex gap-2.5 items-start">
                  <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-6 shadow-card">
            <div className="flex items-center justify-between border-b border-ink-100 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">ATS Compatibility Breakdown</p>
                <p className="text-2xl font-extrabold text-ink-900">
                  74<span className="text-sm font-medium text-ink-400"> / 100</span>
                </p>
              </div>
              <span className="chip bg-brand-50 text-brand-700 border border-brand-200">Curevo AI metric</span>
            </div>

            <div className="mt-4 space-y-3">
              {[
                ['Formatting', 92],
                ['Structure', 95],
                ['Content', 68],
                ['Skills', 72],
                ['Readability', 86],
              ].map(([label, v]) => (
                <div key={label as string} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-ink-600">{label}</span>
                  <div className="h-2 flex-1 rounded-full bg-ink-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(v as number) >= 75 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${v}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold text-ink-800">{v}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-emerald-50 p-3.5 border border-emerald-100">
                <p className="text-xs font-semibold text-emerald-800">What is working</p>
                <p className="mt-1 text-xs text-emerald-700">Standard headings · complete contact info · consistent dates</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3.5 border border-amber-100">
                <p className="text-xs font-semibold text-amber-800">Needs improvement</p>
                <p className="mt-1 text-xs text-amber-700">Passive phrasing · generic summary · unquantified bullets</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Truth Guard Section (Dark Contrast Surface from original 503b246) */}
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
              <p className="mt-4 text-base leading-relaxed text-ink-300">
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

      {/* Features */}
      <section id="features" className="py-20 bg-white border-b border-ink-100">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="section-heading text-center">Everything you need to apply with confidence</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6 transition hover:shadow-lift">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
                    <path d={f.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
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
                  className="flex w-full items-center justify-between px-6 py-4.5 text-left text-sm font-semibold text-ink-900 hover:bg-ink-50 transition"
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

      {/* Final CTA Banner */}
      <section className="py-20 bg-white text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="section-heading">Your next application deserves a standout CV.</h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-600">
            No signup, no login, and no payment required. Start building or improving your resume in seconds.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/builder?mode=ats"
              className="btn-primary px-7 py-3 text-sm font-semibold shadow-sm"
            >
              Check ATS Score — Free
            </Link>
            <Link
              to="/builder?mode=improve"
              className="btn-secondary px-7 py-3 text-sm font-semibold shadow-sm"
            >
              Improve My Existing CV
            </Link>
            <Link
              to="/builder?mode=create"
              className="btn-secondary px-7 py-3 text-sm font-semibold shadow-sm"
            >
              Create from Scratch
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-100 py-10 bg-white mt-auto">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
          <Logo />
          <p className="text-sm text-ink-500 text-center sm:text-left">
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
            <Link to="/builder" className="hover:text-ink-900 transition">Resume Builder</Link>
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
