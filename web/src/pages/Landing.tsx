import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';
import Navbar from '../components/Navbar';
import DataPrivacyModal from '../components/DataPrivacyModal';

// --- Section Data & Configurations ---

const TRUST_METRICS = [
  { value: '100% Free', label: 'Public access, no paywalls or card required' },
  { value: '0 Database', label: 'Ephemeral memory with zero server storage' },
  { value: '9-Dimension', label: 'Deterministic ATS compatibility parser checks' },
  { value: 'Google XYZ', label: 'High-impact bullet optimization formula' },
  { value: 'Truth Guard™', label: 'Algorithmic factual grounding verification' },
];

const TEMPLATES = [
  { id: 'classic', name: 'Classic', desc: 'Timeless single-column layout for conservative industries (Banking, Law, Academia).' },
  { id: 'modern', name: 'Modern', desc: 'Sleek, balanced typography optimized for high-growth tech and startup applications.' },
  { id: 'minimal', name: 'Minimal', desc: 'High white space, zero distraction design that lets candidate achievements speak.' },
  { id: 'professional', name: 'Professional', desc: 'Structured hierarchy ideal for mid-to-senior corporate and consulting roles.' },
  { id: 'technical', name: 'Technical', desc: 'Dense, skill-forward layout prioritizing technical stacks, repos, and systems.' },
  { id: 'executive', name: 'Executive', desc: 'Strategic emphasis on leadership scope, P&L, team scale, and board impact.' },
];

const ROLE_PRESETS = [
  { title: 'Senior Cloud Solutions Architect', score: 94, tech: 'AWS, Kubernetes, Terraform, Go, CI/CD', bullets: 'Cut cloud compute costs by £420k while sustaining 99.999% uptime.' },
  { title: 'Lead Product Designer (Design Systems)', score: 92, tech: 'Figma, Design Tokens, React, User Research, WCAG 2.1', bullets: 'Spearheaded unified design system reducing component delivery time by 38%.' },
  { title: 'Senior Java Backend Engineer', score: 84, tech: 'Java 21, Spring Boot, PostgreSQL, Kafka, Redis', bullets: 'Architected distributed event-driven payment pipelines processing 45k TPS.' },
  { title: 'Staff Full-Stack Engineer', score: 91, tech: 'TypeScript, Next.js, Node.js, GraphQL, Docker', bullets: 'Overhauled core customer checkout funnel boosting conversion by 26%.' },
  { title: 'Senior Data Scientist & ML Engineer', score: 89, tech: 'Python, PyTorch, SQL, Pandas, Scikit-learn', bullets: 'Engineered predictive recommendation models generating £1.2M incremental ARR.' },
];

const WORKFLOW_TABS = [
  {
    id: 'builder',
    label: 'CV Builder',
    icon: '📄',
    headline: 'Build and polish your CV with the AI Engine',
    desc: 'Craft ATS-safe single-column resumes from scratch or by uploading an existing PDF/DOCX. Our AI Engine rewrites passive statements into Google XYZ achievements.',
    ctaText: 'Open CV Builder',
    ctaLink: '/builder?mode=create',
    badge: 'Core Builder',
    preview: {
      type: 'builder',
      title: 'Real-Time Resume Editor',
      points: [
        'Single-column ATS standard margins (0.5 – 0.75 in)',
        'Live instant ATS scoring updates as you edit',
        'Google XYZ bullet suggestions with quantified impact',
        'Direct download in native high-resolution vector PDF',
      ],
    },
  },
  {
    id: 'checker',
    label: 'ATS Checker',
    icon: '🎯',
    headline: 'Inspect your deterministic ATS compatibility score',
    desc: 'Uncover how recruitment algorithms score your resume before submitting. Receive concrete line-by-line recommendations across formatting, structure, skills, and readability.',
    ctaText: 'Check Your ATS Score',
    ctaLink: '/builder?mode=ats',
    badge: 'Scoring Engine',
    preview: {
      type: 'score',
      score: 74,
      categories: [
        { name: 'Formatting & Layout', score: 92 },
        { name: 'Structure & Sections', score: 95 },
        { name: 'Quantified Content', score: 68 },
        { name: 'Technical Skills', score: 72 },
        { name: 'Readability & Grammar', score: 86 },
      ],
    },
  },
  {
    id: 'prepare',
    label: 'Prepare Application',
    icon: '🚀',
    headline: 'Job description matching and cover letter generation',
    desc: 'Supply any target job specification. Curevo AI analyzes keyword overlap, surfaces missing competencies, refines experience bullets, and drafts a compelling matching cover letter.',
    ctaText: 'Start Prepare Stepper',
    ctaLink: '/prepare-application',
    badge: 'All-in-One Stepper',
    preview: {
      type: 'stepper',
      steps: [
        '1. Ingest CV facts & parse target job description',
        '2. Keyword extraction & semantic overlap calculation',
        '3. Google XYZ bullet alignment with Truth Guard™ checks',
        '4. Tailored cover letter & synchronized PDF package',
      ],
    },
  },
  {
    id: 'jobs',
    label: 'Job Discovery',
    icon: '🔍',
    headline: 'Search tech opportunities and view instant CV match scores',
    desc: 'Discover active openings across the UK, US, and Europe. Curevo AI automatically computes your qualification match score for every listed position.',
    ctaText: 'Find Matching Jobs',
    ctaLink: '/jobs',
    badge: 'Opportunity Search',
    preview: {
      type: 'jobs',
      roles: [
        { role: 'Cloud Infrastructure Architect', comp: '£95,000 – £120,000', match: '94% Match' },
        { role: 'Senior Platform Engineer', comp: '£85,000 – £105,000', match: '88% Match' },
        { role: 'Site Reliability Specialist', comp: '£80,000 – £98,000', match: '82% Match' },
      ],
    },
  },
  {
    id: 'tracker',
    label: 'Application Tracker',
    icon: '📋',
    headline: 'Organize your entire pipeline with an interactive Kanban board',
    desc: 'Keep track of applications across Wishlist, Applied, Interview, Offer, and Rejected stages. Store interview notes and salary details locally without spreadsheets.',
    ctaText: 'Open Application Tracker',
    ctaLink: '/applications',
    badge: 'Productivity Pipeline',
    preview: {
      type: 'tracker',
      columns: [
        { name: 'Wishlist', count: 4 },
        { name: 'Applied', count: 7 },
        { name: 'Interviewing', count: 2 },
        { name: 'Offers', count: 1 },
      ],
    },
  },
  {
    id: 'interview',
    label: 'Interview Coach',
    icon: '🎙️',
    headline: 'Simulate role-specific technical and behavioral interviews',
    desc: 'Practice answers tailored to your CV and target role. Build a structured STAR Story Bank (Situation, Task, Action, Result) with real-time AI feedback.',
    ctaText: 'Practice Interviews',
    ctaLink: '/interview',
    badge: 'AI Coaching',
    preview: {
      type: 'interview',
      feedback: 'STAR Structure Breakdown: Strong Situation & Task definition. Quantified Result (24% lift) firmly grounded in candidate source facts.',
    },
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Optimizer',
    icon: '💼',
    headline: 'Transform your resume into a recruiter-magnet profile',
    desc: 'Extract your strongest achievements into an engaging LinkedIn headline, storytelling About section, and optimized keyword clusters to boost recruiter visibility.',
    ctaText: 'Optimize LinkedIn',
    ctaLink: '/linkedin',
    badge: 'Personal Branding',
    preview: {
      type: 'linkedin',
      headline: 'Senior Cloud Solutions Architect | Kubernetes, AWS & Distributed Systems | Driving 99.999% Uptime',
    },
  },
];

const HOW_IT_HELPS_CARDS = [
  {
    title: 'Sharpen your writing as you type',
    body: 'The AI Engine recommends stronger verbs, eliminates passive phrasing, and highlights opportunities for metrics. You stay in full control — no change is applied without your consent.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 text-brand-600" aria-hidden="true">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Tailor your CV in one click',
    body: 'Paste any target job description. Curevo AI identifies essential qualifications, aligns your experience to keyword expectations, and verifies all claims against your source facts.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 text-brand-600" aria-hidden="true">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Choose from 20+ professional CV sections',
    body: 'Add standard or specialized sections: Work Experience, Education, Certifications, Publications, Technical Skills, Languages, Projects, Volunteer Work, and Awards.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 text-brand-600" aria-hidden="true">
        <path d="M4 6h16M4 10h16M4 14h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'See your ATS job match score before you apply',
    body: 'Get a clear percentage match score for your target role. Pinpoint matched skills, partial competencies, and missing keywords before submitting your application.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 text-brand-600" aria-hidden="true">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const FAQS = [
  {
    q: 'What makes Curevo AI different from traditional CV builders?',
    a: 'Traditional builders require accounts, charge recurring subscription fees, or use AI that hallucinates fake statistics and credentials. Curevo AI is 100% free with no login, processes data ephemerally in React memory without a database, and enforces strict Truth Guard™ algorithmic verification to ensure all claims match your source facts.',
  },
  {
    q: 'Is Curevo AI completely free with no registration required?',
    a: 'Yes. All features — including CV building, ATS compatibility scoring, job matching, cover letter generation, interview coaching, and high-resolution PDF export — are immediately available to everyone with zero sign-up and no credit card required.',
  },
  {
    q: 'Where is my CV data stored?',
    a: 'Your CV data is stored exclusively in your browser\'s local memory (localStorage) while you work. Curevo AI does not connect to any PostgreSQL database, user account table, or persistent disk storage. When you clear your browser data or use incognito, your data is completely discarded.',
  },
  {
    q: 'How does Truth Guard™ protect my application integrity?',
    a: 'Truth Guard™ algorithmically cross-references every generated bullet against your original source CV facts. If the AI Engine introduces unevidenced technologies, fabricated percentages, or hallucinated companies, Truth Guard™ automatically repairs or reverts the bullet to your original wording.',
  },
  {
    q: 'What does the ATS Compatibility score evaluate?',
    a: 'Curevo AI calculates a transparent, deterministic 0–100 score evaluating 5 categories: Formatting (standard headings, contact block), Structure (clear single-column sections), Content (Google XYZ bullets and quantified outcomes), Skills (industry technology tokens), and Readability (length and typographic clarity).',
  },
  {
    q: 'Can I download my resume as a PDF and back up my data?',
    a: 'Yes. You can download an ATS-safe, clean text-layer PDF with one click. You can also export a complete encrypted or plaintext JSON backup of your CV, applications, and interview data anytime via the Privacy & Backup modal.',
  },
];

export default function Landing() {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedRole, setSelectedRole] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  const currentTab = WORKFLOW_TABS[activeTab];

  return (
    <div className="bg-white text-ink-900 selection:bg-brand-100 selection:text-brand-900 min-h-screen flex flex-col font-sans">
      {/* SECTION A: Minimal Top Navigation */}
      <Navbar onOpenPrivacy={() => setPrivacyModalOpen(true)} ctaText="Start Building Free" ctaLink="/builder" />

      {/* SECTION B: Enhancv-Inspired Split Hero */}
      <section className="relative overflow-hidden border-b border-ink-100 bg-white">
        {/* Soft Pastel Ambient Gradients */}
        <div className="pointer-events-none absolute -top-40 right-10 h-[520px] w-[520px] rounded-full bg-brand-50 blur-3xl opacity-75" aria-hidden="true" />
        <div className="pointer-events-none absolute top-48 -left-20 h-80 w-80 rounded-full bg-purple-50 blur-3xl opacity-70" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-10 right-1/4 h-72 w-72 rounded-full bg-sky-50 blur-3xl opacity-50" aria-hidden="true" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:py-24 relative">
          {/* Left Column (col-span-7) */}
          <div className="lg:col-span-7 space-y-6 text-left">
            {/* Pill Badge */}
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1 text-xs font-semibold text-brand-700">
              <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" aria-hidden="true" />
              Curevo AI • 100% In-Memory • Truthful AI Engine
            </p>

            {/* Main Headline with Purple Gradient Accent */}
            <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.5rem]">
              Land More Interviews{' '}
              <span className="text-purple-600 block sm:inline">with a CV built for every opportunity.</span>
            </h1>

            {/* Supporting Copy */}
            <p className="max-w-xl text-lg leading-relaxed text-ink-600">
              Build your CV with AI, get an ATS check and improve it for the opportunities you want — all with strict factual grounding and zero sign-up required.
            </p>

            {/* Two Prominent CTAs */}
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
                Get Your CV Score
              </Link>
            </div>

            {/* Trust Information Underneath */}
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
                <span>AI Engine assistance</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-brand-600 font-bold">✓</span>
                <span>Truth Guard verification</span>
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

          {/* Right Column: Realistic Floating CV Document Preview (col-span-5) */}
          <div className="lg:col-span-5 relative flex justify-center">
            {/* Ambient Multi-Hue Glow Behind the Document */}
            <div className="pointer-events-none absolute inset-0 -m-6 rounded-3xl bg-gradient-to-tr from-brand-100/60 via-purple-100/40 to-sky-100/50 blur-2xl -z-10" aria-hidden="true" />

            {/* The Floating CV Paper */}
            <div className="w-full max-w-[420px] rounded-xl bg-white p-6 sm:p-7 shadow-resume ring-1 ring-ink-100 transition-transform duration-300 hover:-translate-y-1 text-left">
              {/* Top Banner Tag */}
              <div className="flex items-center justify-between border-b border-ink-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                    Sample CV · Formatted with Curevo AI
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

      {/* SECTION C: Product Benefits — Clean Three-Column Feature Presentation */}
      <section className="py-16 bg-white border-b border-ink-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 border border-brand-200 text-brand-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-900">ATS-friendly, professionally designed CVs</h3>
                <p className="mt-1.5 text-sm text-ink-600 leading-relaxed">
                  Engineered strictly with single-column margins, clean typography hierarchy, and standard headings that parse error-free across major ATS platforms.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50 border border-purple-200 text-purple-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
                  <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-900">Customisable resume templates</h3>
                <p className="mt-1.5 text-sm text-ink-600 leading-relaxed">
                  Choose between 6 tailored templates (Classic, Modern, Minimal, Professional, Technical, Executive) with adjustable margins and section ordering.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50 border border-sky-200 text-sky-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
                  <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-900">Professional formatting &amp; PDF export</h3>
                <p className="mt-1.5 text-sm text-ink-600 leading-relaxed">
                  Download binary vector PDFs generated natively on the server with selectable text layers and full privacy guarantees.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION D: Product Demonstration — "How Curevo AI Helps Today's Jobseekers" */}
      <section className="py-20 bg-ink-50/50 border-b border-ink-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600">Intelligent Workflow</h2>
            <p className="mt-2 text-3xl font-extrabold text-ink-900 sm:text-4xl">
              How Curevo AI helps today&apos;s jobseekers
            </p>
            <p className="mt-3 text-base text-ink-600">
              Transform raw career facts into compelling, recruiter-ready applications with assistance at every step.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_HELPS_CARDS.map((card) => (
              <div key={card.title} className="card p-6 transition hover:shadow-lift flex flex-col justify-between">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white border border-ink-200 shadow-xs mb-4">
                    {card.icon}
                  </div>
                  <h3 className="text-base font-bold text-ink-900 leading-snug">{card.title}</h3>
                  <p className="mt-3 text-xs leading-relaxed text-ink-600">{card.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION E: Social Proof & Product Credibility (Verified Privacy & Architectural Metrics) */}
      <section className="py-16 bg-white border-b border-ink-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600">Privacy &amp; Engineering Standards</h2>
            <p className="mt-2 text-2xl font-extrabold text-ink-900 sm:text-3xl">
              Engineered for genuine privacy and career outcomes
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 text-center">
            {TRUST_METRICS.map((m) => (
              <div key={m.value} className="rounded-xl border border-ink-100 bg-ink-50/60 p-5 shadow-xs">
                <p className="text-2xl font-extrabold text-brand-700">{m.value}</p>
                <p className="mt-2 text-xs font-medium text-ink-600">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION F: ATS Compatibility — Deep Breakdown & Diagnostic Card */}
      <section className="py-20 bg-ink-50/40 border-b border-ink-100">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-6 space-y-4 text-left">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-700">
                Applicant Tracking System Auditing
              </span>
              <h2 className="text-3xl font-extrabold text-ink-900 sm:text-4xl">
                CVs optimised for applicant tracking systems (ATS)
              </h2>
              <p className="text-sm text-ink-600 leading-relaxed">
                Most resumes get filtered before a human recruiter ever sees them. Curevo AI tests your CV against standard algorithmic parser heuristics so your experience parses cleanly.
              </p>

              <div className="pt-2 space-y-2.5 text-xs text-ink-700">
                {[
                  'Readable contact details (email, phone, location, LinkedIn)',
                  'Full work experience section parsing and date extraction',
                  'Optimised skills categorization and technical keyword density',
                  'Google XYZ formula bullets with quantified achievements',
                  'Standard single-column hierarchy with ATS-safe headings',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      ✓
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <Link to="/builder?mode=ats" className="btn-primary px-6 py-3 text-sm font-bold shadow-xs">
                  Run Free ATS Check →
                </Link>
              </div>
            </div>

            {/* Relocated Diagnostic ATS Compatibility Card */}
            <div className="lg:col-span-6">
              <div className="card p-6 shadow-lift border border-ink-100 bg-white text-left">
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
                    ['Formatting & Layout', 92],
                    ['Structure & Sections', 95],
                    ['Quantified Content', 68],
                    ['Technical Skills', 72],
                    ['Readability & Grammar', 86],
                  ].map(([label, v]) => (
                    <div key={label as string} className="flex items-center gap-3">
                      <span className="w-32 text-xs font-medium text-ink-600">{label}</span>
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
        </div>
      </section>

      {/* SECTION G: Whole Career Workflow — "Your Whole Job Search, in One Place" */}
      <section className="py-20 bg-white border-b border-ink-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600">Unified Suite</h2>
            <p className="mt-2 text-3xl font-extrabold text-ink-900 sm:text-4xl">
              Your whole job search, in one place
            </p>
            <p className="mt-3 text-base text-ink-600">
              Most jobseekers juggle three or four disjointed tools. Curevo AI brings CV writing, checking, tailoring, job discovery, pipeline tracking, and interview coaching together under one roof.
            </p>
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-ink-100 pb-4">
            {WORKFLOW_TABS.map((tab, idx) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(idx)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
                  activeTab === idx
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-ink-50 text-ink-700 hover:bg-ink-100 hover:text-ink-900'
                }`}
                role="tab"
                aria-selected={activeTab === idx}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content Display */}
          <div className="mt-10 grid items-center gap-10 lg:grid-cols-12 max-w-6xl mx-auto">
            <div className="lg:col-span-6 space-y-4 text-left">
              <span className="chip bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold">
                {currentTab.badge}
              </span>
              <h3 className="text-2xl font-extrabold text-ink-900 leading-snug">
                {currentTab.headline}
              </h3>
              <p className="text-sm text-ink-600 leading-relaxed">
                {currentTab.desc}
              </p>
              <div className="pt-2">
                <Link to={currentTab.ctaLink} className="btn-primary px-6 py-3 text-sm font-bold shadow-xs">
                  {currentTab.ctaText} →
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="card p-6 shadow-lift border border-ink-100 bg-ink-50/50 text-left">
                {currentTab.id === 'builder' && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Editor Capabilities</p>
                    <ul className="space-y-2 text-xs text-ink-700">
                      {(currentTab.preview as { points: string[] }).points.map((pt) => (
                        <li key={pt} className="flex items-center gap-2">
                          <span className="text-brand-600 font-bold">✓</span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {currentTab.id === 'checker' && (
                  <div>
                    <div className="flex items-center justify-between border-b border-ink-200 pb-3 mb-3">
                      <span className="text-xs font-bold text-ink-700">Deterministic ATS Scoring</span>
                      <span className="text-lg font-extrabold text-brand-700">74 / 100</span>
                    </div>
                    <div className="space-y-2">
                      {(currentTab.preview as { categories: { name: string; score: number }[] }).categories.map((c) => (
                        <div key={c.name} className="flex items-center justify-between text-xs">
                          <span className="text-ink-600">{c.name}</span>
                          <span className="font-bold text-ink-800">{c.score}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentTab.id === 'prepare' && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Application Pipeline</p>
                    {(currentTab.preview as { steps: string[] }).steps.map((st) => (
                      <div key={st} className="rounded-lg bg-white p-2.5 border border-ink-200 text-xs text-ink-800 font-medium">
                        {st}
                      </div>
                    ))}
                  </div>
                )}

                {currentTab.id === 'jobs' && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Live Opportunity Matches</p>
                    {(currentTab.preview as { roles: { role: string; comp: string; match: string }[] }).roles.map((r) => (
                      <div key={r.role} className="flex items-center justify-between rounded-lg bg-white p-3 border border-ink-200 text-xs">
                        <div>
                          <p className="font-bold text-ink-900">{r.role}</p>
                          <p className="text-ink-500">{r.comp}</p>
                        </div>
                        <span className="chip bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                          {r.match}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {currentTab.id === 'tracker' && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400 mb-3">Pipeline Stages</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {(currentTab.preview as { columns: { name: string; count: number }[] }).columns.map((col) => (
                        <div key={col.name} className="rounded-lg bg-white p-3 border border-ink-200 text-center">
                          <p className="text-xl font-extrabold text-brand-700">{col.count}</p>
                          <p className="text-xs font-medium text-ink-600 mt-0.5">{col.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentTab.id === 'interview' && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">AI Coach Evaluation</p>
                    <div className="rounded-lg bg-white p-3.5 border border-ink-200 text-xs text-ink-700 leading-relaxed">
                      {(currentTab.preview as { feedback: string }).feedback}
                    </div>
                  </div>
                )}

                {currentTab.id === 'linkedin' && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Generated Recruiter Headline</p>
                    <div className="rounded-lg bg-white p-3.5 border border-ink-200 text-xs font-medium text-ink-800 leading-relaxed">
                      &quot;{(currentTab.preview as { headline: string }).headline}&quot;
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION H: Professional CV Sections & Role Presets */}
      <section className="py-20 bg-ink-50/50 border-b border-ink-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600">Tailored by Industry</h2>
            <p className="mt-2 text-3xl font-extrabold text-ink-900 sm:text-4xl">
              The CV builder that&apos;s right for your job and experience
            </p>
            <p className="mt-3 text-base text-ink-600">
              Inspect verified sample benchmarks for top career trajectories formatted with Google XYZ bullets.
            </p>
          </div>

          {/* Role Filter Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            {ROLE_PRESETS.map((role, idx) => (
              <button
                key={role.title}
                type="button"
                onClick={() => setSelectedRole(idx)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition cursor-pointer ${
                  selectedRole === idx
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white text-ink-700 border border-ink-200 hover:border-brand-300'
                }`}
              >
                {role.title.split(' ')[0]} {role.title.split(' ')[1]}
              </button>
            ))}
          </div>

          {/* Active Role Preview Card */}
          <div className="max-w-3xl mx-auto card p-6 shadow-lift bg-white text-left">
            <div className="flex items-center justify-between border-b border-ink-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">Target Benchmark Role</p>
                <h3 className="text-lg font-bold text-ink-900">{ROLE_PRESETS[selectedRole].title}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ink-400">Benchmark Match</span>
                <span className="chip bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                  {ROLE_PRESETS[selectedRole].score}/100
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-bold text-ink-700">Verified Technical Keywords:</p>
                <p className="text-xs text-ink-600 mt-1">{ROLE_PRESETS[selectedRole].tech}</p>
              </div>

              <div>
                <p className="text-xs font-bold text-ink-700">Sample Google XYZ Achievement Bullet:</p>
                <div className="mt-1 rounded-lg bg-ink-50 p-3 border border-ink-100 text-xs text-ink-800 font-medium">
                  &quot;{ROLE_PRESETS[selectedRole].bullets}&quot;
                </div>
              </div>
            </div>
          </div>

          {/* Supported Templates Grid */}
          <div className="mt-14 max-w-6xl mx-auto">
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink-500 text-center mb-6">
              6 ATS-Compliant Layout Templates Included
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {TEMPLATES.map((tmpl) => (
                <Link
                  key={tmpl.id}
                  to={`/builder?template=${tmpl.id}`}
                  className="card p-4 transition hover:shadow-lift hover:border-brand-400 text-left flex flex-col justify-between group"
                >
                  <div>
                    <span className="font-bold text-sm text-ink-900 group-hover:text-brand-700 transition">
                      {tmpl.name}
                    </span>
                    <p className="mt-1.5 text-[11px] text-ink-500 leading-snug">{tmpl.desc}</p>
                  </div>
                  <span className="mt-3 text-[10px] font-bold text-brand-600 flex items-center gap-0.5">
                    Use Template &rarr;
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION I: ATS Job Matching — Relocated Senior Java Backend Engineer Match Card */}
      <section className="py-20 bg-white border-b border-ink-100">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1 text-xs font-semibold text-brand-700">
              Deterministic Semantic Matching
            </span>
            <h2 className="mt-3 text-3xl font-extrabold text-ink-900 sm:text-4xl">
              See your ATS job match score before you apply
            </h2>
            <p className="mt-3 text-base text-ink-600">
              Compare your experience against any real job advert. Surface exact skill matches, identify partial overlaps, and catch missing criteria before submitting.
            </p>
          </div>

          <div className="max-w-xl mx-auto card p-6 shadow-lift border border-ink-100 bg-white text-left">
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
        </div>
      </section>

      {/* SECTION J: Truth Guard™ Engine (Dark Contrast Surface) */}
      <section id="truth" className="bg-ink-900 py-24 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2 text-left">
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

            {/* Terminal-style Truth Guard Demo */}
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

      {/* SECTION J: Frequently Asked Questions (Accessible Accordion) */}
      <section id="faq" className="border-b border-ink-100 bg-ink-50/60 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="section-heading">Frequently asked questions about Curevo AI</h2>
            <p className="mt-3 text-ink-600 text-sm">
              Learn how Curevo AI operates with zero database retention and algorithmic grounding checks.
            </p>
          </div>

          <div className="mt-10 space-y-3">
            {FAQS.map((f, i) => (
              <div key={f.q} className="card overflow-hidden text-left">
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

      {/* SECTION K: Final CTA Banner */}
      <section className="py-20 bg-white text-center border-b border-ink-100">
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
              Get Your CV Score
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

      {/* Enhancv-Style Comprehensive 4-Column Footer */}
      <footer className="py-14 bg-white mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5 border-b border-ink-100 pb-12">
            {/* Column 1: Logo & Brand Summary */}
            <div className="lg:col-span-2 space-y-4 text-left">
              <Logo />
              <p className="text-xs text-ink-500 leading-relaxed max-w-sm">
                Curevo AI is a free, 100% in-memory ATS resume builder and career companion. Built on genuine factual grounding with strict Truth Guard™ protection and zero database persistence.
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setPrivacyModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-100 transition cursor-pointer"
                >
                  <span>🛡️</span> Data Privacy &amp; Backup
                </button>
              </div>
            </div>

            {/* Column 2: Core Builder */}
            <div className="text-left space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-900">CV Builder</p>
              <ul className="space-y-2 text-xs text-ink-600">
                <li><Link to="/builder" className="hover:text-brand-700 transition">Create CV</Link></li>
                <li><Link to="/builder?mode=ats" className="hover:text-brand-700 transition">Check ATS Score</Link></li>
                <li><Link to="/builder?sample=true" className="hover:text-brand-700 transition">Try Sample CV</Link></li>
                <li><Link to="/builder?template=classic" className="hover:text-brand-700 transition">CV Templates</Link></li>
              </ul>
            </div>

            {/* Column 3: Career Tools */}
            <div className="text-left space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-900">Career Tools</p>
              <ul className="space-y-2 text-xs text-ink-600">
                <li><Link to="/prepare-application" className="hover:text-brand-700 transition">Prepare Application</Link></li>
                <li><Link to="/jobs" className="hover:text-brand-700 transition">Job Search</Link></li>
                <li><Link to="/applications" className="hover:text-brand-700 transition">Application Tracker</Link></li>
                <li><Link to="/interview" className="hover:text-brand-700 transition">AI Interview Coach</Link></li>
                <li><Link to="/linkedin" className="hover:text-brand-700 transition">LinkedIn Optimizer</Link></li>
              </ul>
            </div>

            {/* Column 4: Standards & Integrity */}
            <div className="text-left space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-900">Integrity</p>
              <ul className="space-y-2 text-xs text-ink-600">
                <li><a href="#truth" className="hover:text-brand-700 transition">Truth Guard™ Engine</a></li>
                <li><a href="#how" className="hover:text-brand-700 transition">How It Works</a></li>
                <li><a href="#faq" className="hover:text-brand-700 transition">Stateless Architecture</a></li>
                <li><span className="text-brand-600 font-medium">100% In-Memory Execution</span></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-400">
            <p>© {new Date().getFullYear()} Curevo AI. All rights reserved. Free and open for all jobseekers.</p>
            <div className="flex items-center gap-4 text-ink-500">
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(true)}
                className="hover:text-ink-900 transition cursor-pointer"
              >
                Privacy Notice
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(true)}
                className="hover:text-ink-900 transition cursor-pointer"
              >
                Data Export &amp; Backup
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Data Privacy & Portability Modal */}
      <DataPrivacyModal
        isOpen={privacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
      />
    </div>
  );
}
