import { useState, useRef, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadPdfBlob } from '../api';
import { Logo, ScoreRing, ScoreBar, Spinner } from '../components/ui';
import ResumePreview from '../components/ResumePreview';
import type { ResumeData, ATSAnalysis, TruthReport, ChangeLogEntry } from '../types';

type Mode = 'improve' | 'create';
type Step = 'idle' | 'processing' | 'ready';

interface ExperienceFormItem {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

interface EducationFormItem {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  grade: string;
}

interface ProjectFormItem {
  name: string;
  description: string;
  tech: string;
  link: string;
}

interface CertFormItem {
  name: string;
  issuer: string;
  year: string;
}

export interface TruthBadgeInfo {
  text: string;
  className: string;
  icon: string;
  title: string;
}

export function getTruthBadgeInfo(truth: TruthReport | null | undefined): TruthBadgeInfo | null {
  if (!truth) return null;

  const total = truth.checks?.length ?? 0;
  if (total === 0) {
    return {
      className: 'bg-slate-100 border-slate-200 text-slate-700',
      icon: 'ℹ',
      text: 'Truth Guard: Unmodified Source Facts',
      title: 'No rewritten claims required verification.',
    };
  }

  const supported = truth.checks.filter((c) => c.status === 'supported').length;
  const warnings = truth.checks.filter((c) => c.status === 'warning').length;
  const autoFixedCount = truth.autoFixed?.length ?? 0;
  const pct = Math.round((supported / total) * 100);

  // Strictly require passedAll, all checks supported, and 0 auto-fixes for 100% Grounded
  if (truth.passedAll && supported === total && autoFixedCount === 0 && warnings === 0) {
    return {
      className: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      icon: '✓',
      text: `Truth Guard: 100% Grounded (${supported}/${total} verified)`,
      title: `All ${total} evaluated claims strictly match verified source facts.`,
    };
  }

  if (autoFixedCount > 0 && warnings === 0) {
    return {
      className: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: '✓',
      text: `Truth Guard: ${supported}/${total} Grounded (${autoFixedCount} auto-repaired)`,
      title: `${autoFixedCount} bullet(s) were safely reverted to source CV wording to prevent hallucination.`,
    };
  }

  if (warnings > 0) {
    return {
      className: 'bg-amber-50 border-amber-200 text-amber-800',
      icon: '⚠',
      text: `Truth Guard: ${pct}% Grounded (${warnings} flagged)`,
      title: `${warnings} claim(s) could not be fully verified against source facts.`,
    };
  }

  return {
    className: 'bg-amber-50 border-amber-200 text-amber-800',
    icon: '•',
    text: `Truth Guard: ${pct}% Grounded (${supported}/${total} verified)`,
    title: `${supported} of ${total} claims verified against source facts.`,
  };
}

const TEMPLATES = [
  { id: 'classic', label: 'Classic' },
  { id: 'modern', label: 'Modern' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'professional', label: 'Professional' },
  { id: 'technical', label: 'Technical' },
  { id: 'executive', label: 'Executive' },
];

export default function PublicBuilder() {
  const [mode, setMode] = useState<Mode>('improve');
  const [step, setStep] = useState<Step>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ code?: string; fallbackResume?: ResumeData; fallbackAts?: ATSAnalysis } | null>(null);

  // Resume and evaluation state (100% in React memory)
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [ats, setAts] = useState<ATSAnalysis | null>(null);
  const [truth, setTruth] = useState<TruthReport | null>(null);
  const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('classic');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [showChangeLog, setShowChangeLog] = useState<boolean>(false);

  // Form inputs for Option 1 (Improve CV)
  const [jobText, setJobText] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form inputs for Option 2 (Create from Scratch)
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [headline, setHeadline] = useState<string>('');
  const [linkedin, setLinkedin] = useState<string>('');
  const [github, setGithub] = useState<string>('');
  const [portfolio, setPortfolio] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [experiences, setExperiences] = useState<ExperienceFormItem[]>([
    { company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '' },
  ]);
  const [educations, setEducations] = useState<EducationFormItem[]>([
    { institution: '', degree: '', field: '', startDate: '', endDate: '', grade: '' },
  ]);
  const [technicalSkills, setTechnicalSkills] = useState<string>('');
  const [softSkills, setSoftSkills] = useState<string>('');
  const [projects, setProjects] = useState<ProjectFormItem[]>([]);
  const [certifications, setCertifications] = useState<CertFormItem[]>([]);

  // ---------------------------------------------------------------------------
  // Reset / Start Over (wipes memory completely)
  // ---------------------------------------------------------------------------
  const handleStartOver = () => {
    setStep('idle');
    setResume(null);
    setAts(null);
    setTruth(null);
    setChangeLog([]);
    setErrorMessage(null);
    setErrorDetails(null);
    setStatusMessage('');
    setJobText('');
    setSelectedTemplate('classic');
  };

  // ---------------------------------------------------------------------------
  // Option 1: Automatic Upload -> Parse -> Improve Workflow
  // ---------------------------------------------------------------------------
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'docx', 'txt'].includes(ext)) {
      setErrorMessage('Please upload a PDF, DOCX, or TXT file.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 8 MB limit. Please upload a smaller document.');
      return;
    }

    setErrorMessage(null);
    setErrorDetails(null);
    setStep('processing');
    setStatusMessage('Uploading and extracting resume text...');

    try {
      // 1. Parse via hardened parser
      const formData = new FormData();
      formData.append('file', file);
      const parseRes = await api.upload<{
        resume: ResumeData;
        ats: ATSAnalysis;
        confidence: Record<string, unknown>;
        notes: string[];
      }>('/public/parse', formData);

      const parsedResume = parseRes.resume;
      const parsedAts = parseRes.ats;

      // 2. Automatically rebuild with NVIDIA Nemotron
      setStatusMessage('Rebuilding with NVIDIA Nemotron AI and verifying truth...');
      try {
        const improveRes = await api.post<{
          resume: ResumeData;
          changeLog: ChangeLogEntry[];
          truth: TruthReport;
          atsAfter: ATSAnalysis;
          matchAfter: unknown;
          agent: { usedAi: boolean; provider: string; model: string };
        }>('/public/improve', {
          resume: parsedResume,
          jobText: jobText.trim() || undefined,
        });

        setResume(improveRes.resume);
        setAts(improveRes.atsAfter);
        setTruth(improveRes.truth);
        setChangeLog(improveRes.changeLog || []);
        setStep('ready');
      } catch (err: unknown) {
        // If AI is unconfigured or failed, present honest error & allow viewing original
        const apiErr = err as { code?: string; message?: string; status?: number };
        let msg = apiErr.message || 'AI resume improvement failed.';
        if (apiErr.code === 'AI_NOT_CONFIGURED' || apiErr.status === 503) {
          msg = 'NVIDIA Nemotron AI is not configured on the backend server. You can still preview your parsed CV, view ATS scores, and download your PDF.';
        } else if (apiErr.code === 'AI_TIMEOUT' || apiErr.status === 504) {
          msg = 'The NVIDIA AI service timed out while rebuilding your resume. Please try again.';
        } else if (apiErr.code === 'CONCURRENCY_LIMIT' || apiErr.status === 429) {
          msg = 'The AI service is currently busy. Please wait a moment and try again.';
        }

        setErrorMessage(msg);
        setErrorDetails({
          code: apiErr.code,
          fallbackResume: parsedResume,
          fallbackAts: parsedAts,
        });
        setStep('idle');
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setErrorMessage(apiErr.message || 'Could not parse this resume file. Please ensure it contains machine-readable text.');
      setStep('idle');
    }
  };

  const handleUseParsedFallback = () => {
    if (errorDetails?.fallbackResume && errorDetails?.fallbackAts) {
      setResume(errorDetails.fallbackResume);
      setAts(errorDetails.fallbackAts);
      setTruth({ passedAll: true, checks: [], autoFixed: [] });
      setChangeLog([]);
      setErrorMessage(null);
      setErrorDetails(null);
      setStep('ready');
    }
  };

  // ---------------------------------------------------------------------------
  // Option 2: Create from Scratch Workflow
  // ---------------------------------------------------------------------------
  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMessage('Full name is required.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('A valid email address is required.');
      return;
    }

    setErrorMessage(null);
    setErrorDetails(null);
    setStep('processing');
    setStatusMessage('NVIDIA Nemotron is crafting your professional resume and verifying facts...');

    try {
      const payloadDetails = {
        personal: {
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          location: location.trim() || undefined,
          headline: headline.trim() || undefined,
          linkedin: linkedin.trim() || undefined,
          github: github.trim() || undefined,
          portfolio: portfolio.trim() || undefined,
        },
        summary: summary.trim() || undefined,
        experience: experiences
          .filter((exp) => exp.company.trim() || exp.title.trim())
          .map((exp) => ({
            company: exp.company.trim(),
            title: exp.title.trim(),
            location: exp.location.trim() || undefined,
            startDate: exp.startDate.trim(),
            endDate: exp.current ? 'Present' : exp.endDate.trim() || undefined,
            current: exp.current,
            description: exp.description.trim() || undefined,
          })),
        education: educations
          .filter((ed) => ed.institution.trim() || ed.degree.trim())
          .map((ed) => ({
            institution: ed.institution.trim(),
            degree: ed.degree.trim(),
            field: ed.field.trim() || undefined,
            startDate: ed.startDate.trim() || undefined,
            endDate: ed.endDate.trim() || undefined,
            grade: ed.grade.trim() || undefined,
          })),
        skills: {
          technical: technicalSkills.split(',').map((s) => s.trim()).filter(Boolean),
          soft: softSkills.split(',').map((s) => s.trim()).filter(Boolean),
        },
        projects: projects
          .filter((p) => p.name.trim())
          .map((p) => ({
            name: p.name.trim(),
            description: p.description.trim() || undefined,
            tech: p.tech.split(',').map((s) => s.trim()).filter(Boolean),
            link: p.link.trim() || undefined,
          })),
        certifications: certifications
          .filter((c) => c.name.trim())
          .map((c) => ({
            name: c.name.trim(),
            issuer: c.issuer.trim() || undefined,
            year: c.year.trim() || undefined,
          })),
        targetRole: headline.trim() || undefined,
      };

      const createRes = await api.post<{
        resume: ResumeData;
        ats: ATSAnalysis;
        match: unknown;
        changeLog: ChangeLogEntry[];
        truth: TruthReport;
        agent: { usedAi: boolean; provider: string; model: string };
      }>('/public/create', {
        details: payloadDetails,
        jobText: jobText.trim() || undefined,
      });

      setResume(createRes.resume);
      setAts(createRes.ats);
      setTruth(createRes.truth);
      setChangeLog(createRes.changeLog || []);
      setStep('ready');
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string; status?: number };
      let msg = apiErr.message || 'Failed to create resume with AI.';
      if (apiErr.code === 'AI_NOT_CONFIGURED' || apiErr.status === 503) {
        msg = 'NVIDIA Nemotron AI is not configured on the backend server. Please configure server API credentials.';
      }
      setErrorMessage(msg);
      setStep('idle');
    }
  };

  // ---------------------------------------------------------------------------
  // PDF Download Helper
  // ---------------------------------------------------------------------------
  const handleDownloadPdf = async () => {
    if (!resume) return;
    setIsDownloading(true);
    try {
      const fileName = `${(resume.personal.fullName || 'Resume').replace(/[^a-zA-Z0-9]+/g, '_')}_CurevoAI.pdf`;
      await downloadPdfBlob(
        '/public/pdf',
        {
          resume,
          template: selectedTemplate,
        },
        fileName
      );
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setErrorMessage(apiErr.message || 'Failed to download PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-ink-900 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2">
            <Logo />
            <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
              No Login
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {step === 'ready' && (
              <button onClick={handleStartOver} className="btn-secondary text-xs sm:text-sm">
                Start Over
              </button>
            )}
            <Link to="/" className="text-sm font-medium text-ink-600 hover:text-ink-900">
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Title */}
      <section className="bg-white border-b border-ink-100 py-8 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            100% In-Memory — Zero Database — No Sign-up Required
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink-900">
            Your next resume starts here.
          </h1>
          <p className="mt-2 text-base sm:text-lg text-ink-600">
            Powered by NVIDIA Nemotron AI with strict Truth Guard verification. Choose an option to begin.
          </p>

          {/* Mode Tabs (Only shown when not in ready state) */}
          {step !== 'ready' && (
            <div className="mt-6 inline-flex rounded-xl bg-slate-100 p-1.5 border border-ink-100">
              <button
                type="button"
                onClick={() => { setMode('improve'); setErrorMessage(null); }}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                  mode === 'improve'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                1. Improve my existing CV
              </button>
              <button
                type="button"
                onClick={() => { setMode('create'); setErrorMessage(null); }}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                  mode === 'create'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                2. Create a resume from scratch
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Error Banner */}
        {errorMessage && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-red-900">Action Required</p>
                <p className="mt-1">{errorMessage}</p>
                {errorDetails?.fallbackResume && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={handleUseParsedFallback}
                      className="btn-secondary text-xs bg-white text-ink-800"
                    >
                      Preview Parsed Resume & ATS Score Anyway
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-red-500 hover:text-red-700"
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Processing State */}
        {step === 'processing' && (
          <div className="card p-12 text-center max-w-md mx-auto my-12 shadow-md">
            <Spinner className="mx-auto h-12 w-12 text-brand-600 mb-4" />
            <h3 className="text-lg font-bold text-ink-900">Processing Your Resume</h3>
            <p className="mt-2 text-sm text-ink-600">{statusMessage}</p>
            <p className="mt-4 text-xs text-ink-400">
              Truth Guard is inspecting claims against your source facts...
            </p>
          </div>
        )}

        {/* Option 1: Improve Existing CV */}
        {step === 'idle' && mode === 'improve' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="card p-6 sm:p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-2">Upload Your Resume</h2>
              <p className="text-sm text-ink-600 mb-6">
                Drag and drop your file. Our hardened parser reads your experience, then NVIDIA Nemotron AI automatically rebuilds your resume with zero hallucinations.
              </p>

              {/* Optional Job Description */}
              <div className="mb-6">
                <label htmlFor="jd-input" className="label text-sm font-semibold">
                  Target Job Description <span className="text-xs font-normal text-ink-500">(Optional — paste to tailor keywords)</span>
                </label>
                <textarea
                  id="jd-input"
                  rows={4}
                  value={jobText}
                  onChange={(e) => setJobText(e.target.value)}
                  placeholder="Paste the job description or requirements here to target specific skills..."
                  className="input font-mono text-xs"
                />
              </div>

              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                }}
                className={`rounded-xl border-2 border-dashed p-8 text-center transition cursor-pointer ${
                  dragActive ? 'border-brand-500 bg-brand-50/50' : 'border-ink-200 bg-slate-50 hover:bg-slate-100/70'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                  }}
                />
                <svg className="mx-auto h-12 w-12 text-ink-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-base font-semibold text-ink-800">
                  Click to choose a file or drag and drop
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Supported formats: PDF, DOCX, TXT (Maximum 8 MB)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Option 2: Create from Scratch Form */}
        {step === 'idle' && mode === 'create' && (
          <form onSubmit={handleCreateSubmit} className="max-w-3xl mx-auto space-y-8">
            {/* Personal Details */}
            <div className="card p-6 sm:p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-4">1. Personal Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Alex Johnson"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. alex@example.com"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +44 7700 900123"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. London, UK"
                    className="input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Target Role / Headline</label>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">LinkedIn Profile URL</label>
                  <input
                    type="text"
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    placeholder="linkedin.com/in/alexjohnson"
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="label">GitHub Profile URL</label>
                  <input
                    type="text"
                    value={github}
                    onChange={(e) => setGithub(e.target.value)}
                    placeholder="github.com/alexjohnson"
                    className="input text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Portfolio / Website URL</label>
                  <input
                    type="text"
                    value={portfolio}
                    onChange={(e) => setPortfolio(e.target.value)}
                    placeholder="https://alexjohnson.dev"
                    className="input text-xs"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="label">Professional Summary Notes (Optional)</label>
                <textarea
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Outline your background, years of experience, or main specialties..."
                  className="input"
                />
              </div>
            </div>

            {/* Work Experience */}
            <div className="card p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-ink-900">2. Work Experience</h2>
                <button
                  type="button"
                  onClick={() =>
                    setExperiences([
                      ...experiences,
                      { company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '' },
                    ])
                  }
                  className="btn-secondary text-xs"
                >
                  + Add Experience
                </button>
              </div>

              {experiences.map((exp, idx) => (
                <div key={idx} className="mb-6 p-4 rounded-xl border border-ink-100 bg-slate-50 relative">
                  {experiences.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setExperiences(experiences.filter((_, i) => i !== idx))}
                      className="absolute top-3 right-3 text-red-500 hover:text-red-700 text-xs font-semibold"
                    >
                      Remove
                    </button>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="label text-xs">Job Title *</label>
                      <input
                        type="text"
                        required
                        value={exp.title}
                        onChange={(e) => {
                          const updated = [...experiences];
                          updated[idx].title = e.target.value;
                          setExperiences(updated);
                        }}
                        placeholder="e.g. Software Engineer"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Company *</label>
                      <input
                        type="text"
                        required
                        value={exp.company}
                        onChange={(e) => {
                          const updated = [...experiences];
                          updated[idx].company = e.target.value;
                          setExperiences(updated);
                        }}
                        placeholder="e.g. Acme Corp"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Start Date *</label>
                      <input
                        type="text"
                        required
                        value={exp.startDate}
                        onChange={(e) => {
                          const updated = [...experiences];
                          updated[idx].startDate = e.target.value;
                          setExperiences(updated);
                        }}
                        placeholder="e.g. 2021 or Jan 2021"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">End Date</label>
                      <input
                        type="text"
                        disabled={exp.current}
                        value={exp.current ? 'Present' : exp.endDate}
                        onChange={(e) => {
                          const updated = [...experiences];
                          updated[idx].endDate = e.target.value;
                          setExperiences(updated);
                        }}
                        placeholder="e.g. 2023 or Present"
                        className="input disabled:bg-slate-100"
                      />
                      <label className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-600">
                        <input
                          type="checkbox"
                          checked={exp.current}
                          onChange={(e) => {
                            const updated = [...experiences];
                            updated[idx].current = e.target.checked;
                            if (e.target.checked) updated[idx].endDate = 'Present';
                            setExperiences(updated);
                          }}
                        />
                        Currently working here
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="label text-xs">Responsibilities & Achievements</label>
                    <textarea
                      rows={3}
                      value={exp.description}
                      onChange={(e) => {
                        const updated = [...experiences];
                        updated[idx].description = e.target.value;
                        setExperiences(updated);
                      }}
                      placeholder="List your key contributions, technologies used, and outcomes (one per line or paragraph)..."
                      className="input text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Education */}
            <div className="card p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-ink-900">3. Education</h2>
                <button
                  type="button"
                  onClick={() =>
                    setEducations([
                      ...educations,
                      { institution: '', degree: '', field: '', startDate: '', endDate: '', grade: '' },
                    ])
                  }
                  className="btn-secondary text-xs"
                >
                  + Add Education
                </button>
              </div>

              {educations.map((ed, idx) => (
                <div key={idx} className="mb-4 p-4 rounded-xl border border-ink-100 bg-slate-50 relative">
                  {educations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setEducations(educations.filter((_, i) => i !== idx))}
                      className="absolute top-3 right-3 text-red-500 hover:text-red-700 text-xs font-semibold"
                    >
                      Remove
                    </button>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Degree / Qualification *</label>
                      <input
                        type="text"
                        required
                        value={ed.degree}
                        onChange={(e) => {
                          const updated = [...educations];
                          updated[idx].degree = e.target.value;
                          setEducations(updated);
                        }}
                        placeholder="e.g. BSc Computer Science"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Institution / University *</label>
                      <input
                        type="text"
                        required
                        value={ed.institution}
                        onChange={(e) => {
                          const updated = [...educations];
                          updated[idx].institution = e.target.value;
                          setEducations(updated);
                        }}
                        placeholder="e.g. University of Manchester"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Field of Study</label>
                      <input
                        type="text"
                        value={ed.field}
                        onChange={(e) => {
                          const updated = [...educations];
                          updated[idx].field = e.target.value;
                          setEducations(updated);
                        }}
                        placeholder="e.g. Software Engineering"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Years (Start – End)</label>
                      <input
                        type="text"
                        value={ed.endDate ? `${ed.startDate} - ${ed.endDate}` : ed.startDate}
                        onChange={(e) => {
                          const updated = [...educations];
                          updated[idx].startDate = e.target.value;
                          setEducations(updated);
                        }}
                        placeholder="e.g. 2018 - 2022"
                        className="input"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Skills */}
            <div className="card p-6 sm:p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-4">4. Skills</h2>
              <div className="space-y-4">
                <div>
                  <label className="label text-xs font-semibold">Technical Skills (comma-separated)</label>
                  <input
                    type="text"
                    value={technicalSkills}
                    onChange={(e) => setTechnicalSkills(e.target.value)}
                    placeholder="e.g. TypeScript, React, Node.js, AWS, PostgreSQL, Docker"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label text-xs font-semibold">Soft Skills (comma-separated)</label>
                  <input
                    type="text"
                    value={softSkills}
                    onChange={(e) => setSoftSkills(e.target.value)}
                    placeholder="e.g. Leadership, Agile, Technical Writing, Problem Solving"
                    className="input"
                  />
                </div>
              </div>
            </div>

            {/* Projects */}
            <div className="card p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-ink-900">5. Projects (Optional)</h2>
                <button
                  type="button"
                  onClick={() =>
                    setProjects([
                      ...projects,
                      { name: '', description: '', tech: '', link: '' },
                    ])
                  }
                  className="btn-secondary text-xs"
                >
                  + Add Project
                </button>
              </div>

              {projects.map((proj, idx) => (
                <div key={idx} className="mb-4 p-4 rounded-xl border border-ink-100 bg-slate-50 relative">
                  <button
                    type="button"
                    onClick={() => setProjects(projects.filter((_, i) => i !== idx))}
                    className="absolute top-3 right-3 text-red-500 hover:text-red-700 text-xs font-semibold"
                  >
                    Remove
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                    <div>
                      <label className="label text-xs">Project Name</label>
                      <input
                        type="text"
                        value={proj.name}
                        onChange={(e) => {
                          const updated = [...projects];
                          updated[idx].name = e.target.value;
                          setProjects(updated);
                        }}
                        placeholder="e.g. Open Source Telemetry"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Technologies (comma-separated)</label>
                      <input
                        type="text"
                        value={proj.tech}
                        onChange={(e) => {
                          const updated = [...projects];
                          updated[idx].tech = e.target.value;
                          setProjects(updated);
                        }}
                        placeholder="e.g. React, WebSockets, Go"
                        className="input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label text-xs">Description</label>
                    <textarea
                      rows={2}
                      value={proj.description}
                      onChange={(e) => {
                        const updated = [...projects];
                        updated[idx].description = e.target.value;
                        setProjects(updated);
                      }}
                      placeholder="Brief overview of what you built and outcomes..."
                      className="input text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Certifications */}
            <div className="card p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-ink-900">6. Certifications (Optional)</h2>
                <button
                  type="button"
                  onClick={() =>
                    setCertifications([
                      ...certifications,
                      { name: '', issuer: '', year: '' },
                    ])
                  }
                  className="btn-secondary text-xs"
                >
                  + Add Certification
                </button>
              </div>

              {certifications.map((c, idx) => (
                <div key={idx} className="mb-3 p-3 rounded-xl border border-ink-100 bg-slate-50 relative flex flex-wrap sm:flex-nowrap gap-3 items-center">
                  <div className="flex-1 min-w-[150px]">
                    <label className="label text-xs">Certification Name</label>
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) => {
                        const updated = [...certifications];
                        updated[idx].name = e.target.value;
                        setCertifications(updated);
                      }}
                      placeholder="e.g. AWS Certified Developer"
                      className="input"
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <label className="label text-xs">Issuer</label>
                    <input
                      type="text"
                      value={c.issuer}
                      onChange={(e) => {
                        const updated = [...certifications];
                        updated[idx].issuer = e.target.value;
                        setCertifications(updated);
                      }}
                      placeholder="e.g. AWS"
                      className="input"
                    />
                  </div>
                  <div className="w-full sm:w-28">
                    <label className="label text-xs">Year</label>
                    <input
                      type="text"
                      value={c.year}
                      onChange={(e) => {
                        const updated = [...certifications];
                        updated[idx].year = e.target.value;
                        setCertifications(updated);
                      }}
                      placeholder="e.g. 2023"
                      className="input"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCertifications(certifications.filter((_, i) => i !== idx))}
                    className="text-red-500 hover:text-red-700 text-xs font-semibold self-end mb-2.5"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {/* Optional Job Description */}
            <div className="card p-6 sm:p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-2">7. Target Job Description (Optional)</h2>
              <p className="text-xs text-ink-600 mb-3">
                Paste the job requirements to tailor the tone and keywords using your facts.
              </p>
              <textarea
                rows={4}
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                placeholder="Paste the target job description here..."
                className="input font-mono text-xs"
              />
            </div>

            {/* Submit */}
            <div className="text-center pt-2">
              <button type="submit" className="btn-primary w-full sm:w-auto px-8 py-3 text-base">
                Build Complete Resume with NVIDIA AI
              </button>
            </div>
          </form>
        )}

        {/* Results Screen (`step === 'ready'`) */}
        {step === 'ready' && resume && (
          <div className="space-y-8">
            {/* ATS Score & Overview Header Card */}
            <div className="card p-6 sm:p-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-ink-100">
                <div className="flex items-center gap-6">
                  {ats && (
                    <ScoreRing
                      score={ats.overallScore}
                      size={110}
                      label="ATS Score"
                    />
                  )}
                  <div>
                    <h2 className="text-2xl font-bold text-ink-900">{resume.personal.fullName}</h2>
                    <p className="text-sm text-ink-600">{resume.personal.headline || 'Resume Ready'}</p>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      {(() => {
                        const badge = getTruthBadgeInfo(truth);
                        if (!badge) return null;
                        return (
                          <span
                            title={badge.title}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                          >
                            <span>{badge.icon}</span> {badge.text}
                          </span>
                        );
                      })()}
                      {ats?.completeness && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs text-ink-700">
                          {ats.completeness.evaluatedChecks} Checks Evaluated
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* PDF Actions & Template Selector */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                  <div className="w-full sm:w-auto">
                    <label htmlFor="template-select" className="sr-only">Template</label>
                    <select
                      id="template-select"
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="input py-2 text-sm"
                    >
                      {TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>
                          Template: {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isDownloading}
                    className="btn-primary w-full sm:w-auto"
                  >
                    {isDownloading ? (
                      <>
                        <Spinner className="h-4 w-4 text-white" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download PDF
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Category Score Breakdown */}
              {ats && (
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <ScoreBar label="Formatting" score={ats.formattingScore} />
                  <ScoreBar label="Structure" score={ats.structureScore} />
                  <ScoreBar label="Content" score={ats.contentScore} />
                  <ScoreBar label="Skills" score={ats.skillsScore} />
                  <ScoreBar label="Readability" score={ats.readabilityScore} />
                </div>
              )}

              {/* Change Log Toggle (if changes exist) */}
              {changeLog.length > 0 && (
                <div className="mt-6 pt-4 border-t border-ink-100">
                  <button
                    type="button"
                    onClick={() => setShowChangeLog(!showChangeLog)}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-800 inline-flex items-center gap-1"
                  >
                    {showChangeLog ? 'Hide' : 'View'} AI Improvement Change Log ({changeLog.length} edits verified)
                    <span>{showChangeLog ? '▲' : '▼'}</span>
                  </button>
                  {showChangeLog && (
                    <div className="mt-3 space-y-2 text-xs bg-slate-50 p-4 rounded-xl border border-ink-100 max-h-60 overflow-y-auto">
                      {changeLog.map((change, i) => (
                        <div key={i} className="border-b border-ink-100 pb-2 last:border-none last:pb-0">
                          <span className="font-semibold text-ink-800">[{change.section}]</span>{' '}
                          <span className="text-emerald-700 font-medium">{change.reason}</span>
                          <p className="text-ink-500 mt-0.5 italic">{change.after}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Document Preview */}
            <div className="card p-4 sm:p-8 bg-slate-200/50 flex justify-center overflow-x-auto">
              <ResumePreview resume={resume} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-ink-100 bg-white py-6 px-4 text-center text-xs text-ink-500">
        <p>Curevo AI — Zero-persistence, no-signup resume builder. Your career facts remain strictly private in memory.</p>
      </footer>
    </div>
  );
}
