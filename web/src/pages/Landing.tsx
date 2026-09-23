import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Add your Master CV',
    body: 'Upload your existing CV (PDF or DOCX) or build one with the guided questionnaire. This becomes your permanent source of truth.',
  },
  {
    step: '2',
    title: 'Analyse & match',
    body: 'Get a transparent ATS compatibility analysis, then paste any job description to see matched, partial and missing requirements — with evidence.',
  },
  {
    step: '3',
    title: 'Tailor truthfully',
    body: 'Generate a job-specific CV that rewords, reorders and highlights your real experience. The truth validator reverts anything your Master CV does not support.',
  },
  {
    step: '4',
    title: 'Edit & download',
    body: 'Fine-tune in the live editor with AI suggestions, then download a clean, ATS-friendly PDF and save the version for that role.',
  },
];

const FEATURES = [
  { title: 'EnhanceCV ATS Analysis', body: 'A transparent 0–100 compatibility score across formatting, structure, content, skills and readability — every point derived from implemented rules, not guesswork.', icon: 'M9 17v-6m4 6V7m4 10v-3M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z' },
  { title: 'Explainable Job Match', body: 'See exactly why a job scored 62: required skill coverage, responsibility alignment, keyword coverage and more — each with its own evidence.', icon: 'M4 6h16M4 12h16M4 18h7' },
  { title: 'Truth Validator', body: 'Every generated bullet is checked against your Master CV. Unsupported technologies or numbers are automatically reverted. Zero fabrication, by construction.', icon: 'M9 12l2 2 4-4m5.6 1.2A8.5 8.5 0 113.4 13.2a8.5 8.5 0 0117.2-4z' },
  { title: 'JD Analysis', body: 'Paste a job description and get structured data: required vs preferred skills, responsibilities, seniority, education and the keywords parsers look for.', icon: 'M21 21l-5.2-5.2M17 10a7 7 0 11-14 0 7 7 0 0114 0z' },
  { title: 'Resume Versions', body: 'One Master CV, many tailored versions. Rename, duplicate, edit and download each one independently — your Master stays untouched.', icon: 'M7 7h.01M7 3h5a2 2 0 011.4.6l4 4A2 2 0 0118 9v12a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z' },
  { title: 'ATS-friendly PDF', body: 'Single-column, standard headings, selectable text, consistent dates. The PDF is machine-readable because parsers read text, not graphics.', icon: 'M12 10v6m-3-3h6m-9 8h12a2 2 0 002-2V7l-5-5H6a2 2 0 00-2 2v14a2 2 0 002 2z' },
];

const FAQS = [
  {
    q: 'Is this really free?',
    a: 'Yes. EnhanceCV is a free MVP: no payment, no subscription wall, no premium tiers. The full workflow — master CV, analysis, matching, tailoring, editor, PDF — is available to every account.',
  },
  {
    q: 'How does EnhanceCV avoid making things up?',
    a: 'Tailoring is constrained by design: the AI may improve phrasing, reorder sections and highlight relevant experience, but every claim in a generated bullet is validated against your Master CV. Anything unsupported — a technology, an employer, a number — is automatically reverted.',
  },
  {
    q: 'What does the ATS score actually mean?',
    a: 'It is EnhanceCV\'s own transparent compatibility metric across five categories (formatting, structure, content, skills, readability), computed from implemented rules. It is not a prediction of how any specific employer\'s ATS will rank you — nobody can honestly promise that.',
  },
  {
    q: 'What file types can I upload?',
    a: 'Text-based PDF and DOCX files up to 8 MB. Scanned images are not supported — parsing needs real text. After upload, the extracted data is always shown for review and editing before anything is saved.',
  },
  {
    q: 'Who can see my CV data?',
    a: 'Only you. Each account is isolated at the database level: every request is scoped to your user, and cross-user access is tested and blocked.',
  },
];

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-ink-600 md:flex" aria-label="Site">
            <a href="#how" className="hover:text-ink-900">How it works</a>
            <a href="#features" className="hover:text-ink-900">Features</a>
            <a href="#faq" className="hover:text-ink-900">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="btn-ghost">Log in</Link>
            <Link to="/signup" className="btn-primary">Build My CV — Free</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-0 h-96 w-96 rounded-full bg-brand-50 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute top-40 -left-24 h-72 w-72 rounded-full bg-indigo-50 blur-3xl" aria-hidden="true" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
              Truthful AI tailoring — zero fabrication
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.4rem]">
              Build a better CV for every job.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
              Upload your CV, analyse how it matches a job description, and create a truthful job-specific CV in minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/signup" className="btn-primary px-6 py-3 text-base">Build My CV — Free</Link>
              <a href="#how" className="btn-secondary px-6 py-3 text-base">See How It Works</a>
            </div>
            <p className="mt-4 text-sm text-ink-500">No credit card. Your Master CV is never modified automatically.</p>
          </div>

          {/* Hero mock: match card */}
          <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
            <div className="card rotate-1 p-6 pb-14 shadow-lift">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Job Match</p>
                  <p className="text-lg font-bold text-ink-900">Senior Java Backend Engineer</p>
                  <p className="text-sm text-ink-500">Nomos Bank · Manchester</p>
                </div>
                <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-full border-[6px] border-emerald-500 bg-white">
                  <span className="text-xl font-extrabold text-ink-900">84</span>
                </div>
              </div>
              <div className="mt-5 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                  <span className="font-medium text-emerald-800">Java, Spring Boot, REST APIs</span>
                  <span className="chip bg-emerald-100 text-emerald-800">Matched</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                  <span className="font-medium text-amber-800">Microservices, CI/CD</span>
                  <span className="chip bg-amber-100 text-amber-800">Partial</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
                  <span className="font-medium text-red-800">AWS, Kubernetes, Terraform</span>
                  <span className="chip bg-red-100 text-red-800">Missing</span>
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-ink-100 bg-ink-50 p-3.5">
                <p className="text-xs font-semibold text-ink-700">TRUTH CHECK</p>
                <p className="mt-1.5 text-xs text-ink-600">✓ Supported by Master CV · ✓ Supported by Master CV · ✓ Reverted 1 unsupported claim</p>
              </div>
            </div>
            <div className="card absolute top-8 right-0 w-44 -rotate-3 p-4 shadow-lift">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">ATS Compatibility</p>
              <p className="mt-1 text-2xl font-extrabold text-ink-900">74<span className="text-sm font-medium text-ink-400">/100</span></p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-ink-100">
                <div className="h-full w-3/4 rounded-full bg-brand-500" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-ink-100 bg-ink-50/60 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="section-heading text-center">From Master CV to tailored CV in four steps</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-ink-600">
            EnhanceCV is built on one principle: your Master CV is the source of truth. Analysis and tailoring work for you — they never invent for you.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.step} className="card p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{s.step}</div>
                <h3 className="mt-4 text-base font-semibold text-ink-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CV analysis + Job matching split */}
      <section className="py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">CV analysis</p>
            <h2 className="section-heading mt-2">Know your baseline before you apply</h2>
            <p className="mt-4 text-ink-600">
              The EnhanceCV ATS Compatibility score breaks your CV into five categories and shows exactly what is working and what needs improvement — with concrete recommendations, never vague hints.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
              {['Formatting: standard headings, dates, parseable contact block', 'Content: action verbs, quantified outcomes, no vague fillers', 'Skills: recognised technology names, organised groups', 'Readability: bullet length, consistency, hierarchy'].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" fill="currentColor" aria-hidden="true"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" /></svg>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6 shadow-card">
            <div className="flex items-center justify-between border-b border-ink-100 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">ATS Compatibility</p>
                <p className="text-2xl font-extrabold text-ink-900">74<span className="text-sm font-medium text-ink-400"> / 100</span></p>
              </div>
              <span className="chip bg-brand-50 text-brand-700">EnhanceCV metric</span>
            </div>
            <div className="mt-4 space-y-3">
              {[['Formatting', 92], ['Structure', 95], ['Content', 68], ['Skills', 72], ['Readability', 86]].map(([label, v]) => (
                <div key={label as string} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-ink-600">{label}</span>
                  <div className="h-2 flex-1 rounded-full bg-ink-100">
                    <div className={`h-full rounded-full ${(v as number) >= 75 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${v}%` }} />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold text-ink-800">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-emerald-50 p-3.5">
                <p className="text-xs font-semibold text-emerald-800">What is working</p>
                <p className="mt-1 text-xs text-emerald-700">Standard headings · complete contact info · consistent dates</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3.5">
                <p className="text-xs font-semibold text-amber-800">Needs improvement</p>
                <p className="mt-1 text-xs text-amber-700">Weak bullets · generic summary · few measurable outcomes</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Truthful AI */}
      <section className="bg-ink-900 py-20 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-300">Truthful AI</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                If your CV doesn&apos;t support it, it doesn&apos;t go in.
              </h2>
              <p className="mt-4 leading-relaxed text-ink-300">
                Most AI resume tools will happily add &ldquo;AWS &amp; Kubernetes&rdquo; to a CV that never mentions them. That fails interviews. EnhanceCV takes the opposite stance: the Master CV is the single source of truth, and the tailoring engine can only work with what is already there.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-emerald-300">The AI may</p>
                  <p className="mt-1.5 text-sm text-ink-300">Rewrite weak bullets · reorder skills · align terminology · highlight relevant projects · improve clarity</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-red-300">The AI may never</p>
                  <p className="mt-1.5 text-sm text-ink-300">Invent employers, titles, dates, skills, technologies, metrics, certifications or achievements</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 font-mono text-sm" aria-hidden="true">
              <p className="text-ink-400">// truth validator</p>
              <p className="mt-3 text-ink-200">JD requires: AWS, Kubernetes, Terraform</p>
              <p className="mt-1 text-ink-200">Master CV contains: none of these</p>
              <p className="mt-3 text-red-300">✗ Not added to your resume</p>
              <p className="mt-1 text-emerald-300">✓ Shown to you as &ldquo;missing from your profile&rdquo;</p>
              <p className="mt-3 text-ink-400">// instead, EnhanceCV suggests:</p>
              <p className="mt-1 text-ink-200">&ldquo;Add evidence to your Master CV if you genuinely have this experience.&rdquo;</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
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

      {/* FAQ */}
      <section id="faq" className="border-t border-ink-100 bg-ink-50/60 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="section-heading text-center">Frequently asked questions</h2>
          <div className="mt-10 space-y-3">
            {FAQS.map((f, i) => (
              <div key={f.q} className="card overflow-hidden">
                <button
                  className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-ink-900"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  {f.q}
                  <span className={`text-ink-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
                </button>
                {openFaq === i && <p className="px-5 pb-4 text-sm leading-relaxed text-ink-600">{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="section-heading">Your next application deserves a better CV.</h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-600">
            Create your free account, bring your Master CV, and tailor your first application in minutes.
          </p>
          <div className="mt-8 flex justify-center">
            <Link to="/signup" className="btn-primary px-8 py-3 text-base">Build My CV — Free</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-100 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <Logo />
          <p className="text-sm text-ink-500">
            EnhanceCV — Build a better CV for every job. © {new Date().getFullYear()} EnhanceCV.
          </p>
          <p className="text-xs text-ink-400">
            Inspired by open-source concepts from{' '}
            <a className="underline hover:text-ink-600" href="https://github.com/sauravhathi/atsresume" target="_blank" rel="noreferrer">atsresume</a> and{' '}
            <a className="underline hover:text-ink-600" href="https://github.com/Paramchoudhary/ResumeSkills" target="_blank" rel="noreferrer">ResumeSkills</a> (MIT).
          </p>
        </div>
      </footer>
    </div>
  );
}
