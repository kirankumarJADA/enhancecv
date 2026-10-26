import { useState, useRef, useEffect, FormEvent, DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, downloadPdfBlob } from '../api';
import { Logo, ScoreRing, ScoreBar, Spinner } from '../components/ui';
import ResumePreview from '../components/ResumePreview';
import AdvancedAtsAuditView from '../components/AdvancedAtsAuditView';
import type { ResumeData, ATSAnalysis, TruthReport, ChangeLogEntry } from '../types';

type Mode = 'improve' | 'create';
type Step = 'idle' | 'processing' | 'ready';
type ResultTab = 'preview' | 'ats' | 'truth' | 'changelog';

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

export function createUploadFormData(file: File): FormData {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
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
  { id: 'classic', label: 'Classic', desc: 'Clean, traditional single-column layout' },
  { id: 'modern', label: 'Modern', desc: 'Refined sapphire headers with crisp hierarchy' },
  { id: 'minimal', label: 'Minimal', desc: 'Subtle hairlines and balanced white-space' },
  { id: 'professional', label: 'Professional', desc: 'High-contrast typography for corporate roles' },
  { id: 'technical', label: 'Technical', desc: 'Optimized for engineering and tech stacks' },
  { id: 'executive', label: 'Executive', desc: 'Distinguished leadership framing' },
];

export default function PublicBuilder() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'create' ? 'create' : 'improve');
  const [step, setStep] = useState<Step>('idle');
  const [activeTab, setActiveTab] = useState<ResultTab>('preview');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [processingStage, setProcessingStage] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ code?: string; fallbackResume?: ResumeData; fallbackAts?: ATSAnalysis } | null>(null);

  // Resume and evaluation state (100% in React memory)
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [ats, setAts] = useState<ATSAnalysis | null>(null);
  const [truth, setTruth] = useState<TruthReport | null>(null);
  const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('classic');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Drag and Drop state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  // Option 1 inputs
  const [targetRole, setTargetRole] = useState<string>('');
  const [jobText, setJobText] = useState<string>('');
  const [showJobAccordion, setShowJobAccordion] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Option 2 Form inputs
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [portfolio, setPortfolio] = useState<string>('');
  const [linkedin, setLinkedin] = useState<string>('');
  const [github, setGithub] = useState<string>('');
  const [careerTitle, setCareerTitle] = useState<string>('');
  const [skillsRaw, setSkillsRaw] = useState<string>('');

  const [experiences, setExperiences] = useState<ExperienceFormItem[]>([
    { company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '' },
  ]);

  const [educations, setEducations] = useState<EducationFormItem[]>([
    { institution: '', degree: '', field: '', startDate: '', endDate: '', grade: '' },
  ]);

  const [projects, setProjects] = useState<ProjectFormItem[]>([]);
  const [certifications, setCertifications] = useState<CertFormItem[]>([]);

  // Update mode if URL query parameter changes
  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'create' || urlMode === 'improve') {
      setMode(urlMode);
    }
  }, [searchParams]);

  // Reset to initial state
  const handleStartOver = () => {
    setStep('idle');
    setResume(null);
    setAts(null);
    setTruth(null);
    setChangeLog([]);
    setErrorMessage(null);
    setErrorDetails(null);
    setSelectedFileName(null);
    setActiveTab('preview');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ---------------------------------------------------------------------------
  // Option 1: File Upload & Automatic AI Improvement Flow
  // ---------------------------------------------------------------------------
  const handleFileSelect = async (file: File) => {
    if (!file) return;

    // File format check
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'docx', 'txt'].includes(ext)) {
      setErrorMessage('Please upload a PDF, DOCX, or TXT file.');
      return;
    }

    // 8MB size check
    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 8 MB limit. Please upload a smaller document.');
      return;
    }

    setSelectedFileName(file.name);
    setErrorMessage(null);
    setErrorDetails(null);
    setStep('processing');
    setProcessingStage(1);
    setStatusMessage('Uploading and extracting structured facts from your resume...');

    try {
      const formData = createUploadFormData(file);

      // 1. Parse CV
      const parseRes = await api.upload<{ resume: ResumeData; ats: ATSAnalysis }>('/public/parse', formData);
      const parsedResume = parseRes.resume;
      const parsedAts = parseRes.ats;

      // 2. Automatically rebuild with NVIDIA Nemotron
      setProcessingStage(2);
      setStatusMessage('Restructuring achievements with NVIDIA Nemotron AI (Google XYZ format)...');

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
          targetRole: targetRole.trim() || undefined,
          jobText: jobText.trim() || undefined,
        });

        setProcessingStage(3);
        setStatusMessage('Auditing claims with Truth Guard and recomputing ATS compatibility...');

        setResume(improveRes.resume);
        setAts(improveRes.atsAfter);
        setTruth(improveRes.truth);
        setChangeLog(improveRes.changeLog || []);
        setStep('ready');
      } catch (err: unknown) {
        // AI failure fallback: Allow user to view parsed resume
        const apiErr = err as { code?: string; message?: string; status?: number };
        let userMsg = apiErr.message || 'AI resume rebuild failed.';
        if (apiErr.code === 'AI_NOT_CONFIGURED' || apiErr.status === 503) {
          userMsg = 'NVIDIA Nemotron AI is not configured on the backend server. You can still preview your parsed CV, view ATS scores, and download your PDF.';
        } else if (apiErr.code === 'AI_TIMEOUT' || apiErr.status === 504) {
          userMsg = 'The NVIDIA AI service timed out while rebuilding your resume. Please try again.';
        } else if (apiErr.code === 'CONCURRENCY_LIMIT' || apiErr.status === 429) {
          userMsg = 'The AI service is currently busy. Please wait a moment and try again.';
        }

        setErrorDetails({
          code: apiErr.code,
          fallbackResume: parsedResume,
          fallbackAts: parsedAts,
        });
        setErrorMessage(userMsg);
        setStep('idle');
      }
    } catch (parseErr: unknown) {
      const apiErr = parseErr as { message?: string };
      setErrorMessage(apiErr.message || 'Failed to parse resume document. Please verify the file is text-based and uncorrupted.');
      setStep('idle');
    }
  };

  // Fallback: Proceed with parsed resume when AI is offline
  const handleProceedWithParsed = () => {
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

  // Drag and drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileSelect(file);
    }
  };

  // ---------------------------------------------------------------------------
  // Option 2: Create from Scratch Form Submission
  // ---------------------------------------------------------------------------
  const handleCreateResume = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMessage('Full name is required to build your resume.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('A valid email address is required.');
      return;
    }

    setErrorMessage(null);
    setStep('processing');
    setProcessingStage(2);
    setStatusMessage('Generating professional resume with NVIDIA Nemotron AI...');

    const payloadDetails = {
      personal: {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        location: location.trim() || undefined,
        portfolio: portfolio.trim() || undefined,
        linkedin: linkedin.trim() || undefined,
        github: github.trim() || undefined,
      },
      targetRole: careerTitle.trim() || undefined,
      skills: skillsRaw
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      experience: experiences
        .filter((exp) => exp.company.trim() || exp.title.trim())
        .map((exp) => ({
          company: exp.company.trim(),
          title: exp.title.trim(),
          location: exp.location.trim() || undefined,
          startDate: exp.startDate.trim() || undefined,
          endDate: exp.current ? 'Present' : exp.endDate.trim() || undefined,
          current: exp.current,
          bullets: exp.description
            .split('\n')
            .map((b) => b.trim().replace(/^[-*•]\s*/, ''))
            .filter(Boolean),
        })),
      education: educations
        .filter((edu) => edu.institution.trim() || edu.degree.trim())
        .map((edu) => ({
          institution: edu.institution.trim(),
          degree: edu.degree.trim(),
          field: edu.field.trim() || undefined,
          startDate: edu.startDate.trim() || undefined,
          endDate: edu.endDate.trim() || undefined,
          grade: edu.grade.trim() || undefined,
        })),
      projects: projects
        .filter((p) => p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          tech: p.tech
            .split(/[,;]/)
            .map((t) => t.trim())
            .filter(Boolean),
          link: p.link.trim() || undefined,
          bullets: p.description
            .split('\n')
            .map((b) => b.trim().replace(/^[-*•]\s*/, ''))
            .filter(Boolean),
        })),
      certifications: certifications
        .filter((c) => c.name.trim())
        .map((c) => ({
          name: c.name.trim(),
          issuer: c.issuer.trim() || undefined,
          year: c.year.trim() || undefined,
        })),
    };

    try {
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
      const fileName = `${(resume.personal.fullName || 'Resume').replace(/[^a-zA-Z0-9]+/g, '_')}_Curevo_AI.pdf`;
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

  const truthBadge = getTruthBadgeInfo(truth);

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-2">
              <Logo />
            </Link>
            <span className="hidden sm:inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
              No Login Required
            </span>
          </div>

          <div className="flex items-center gap-3">
            {step === 'ready' && (
              <button
                type="button"
                onClick={handleStartOver}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-slate-500">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Start Over
              </button>
            )}
            <Link
              to="/"
              className="text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 transition"
            >
              Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* Banner Section (Only shown when not ready) */}
        {step !== 'ready' && (
          <section className="bg-white border-b border-slate-200 py-10 px-4 sm:px-6">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                <span className="h-2 w-2 rounded-full bg-teal-500" />
                100% In-Memory • Zero Database • No Sign-up Required
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                Curevo AI Resume Builder
              </h1>
              <p className="mt-2 text-base text-slate-600 max-w-xl mx-auto">
                Powered by NVIDIA Nemotron AI with strict Truth Guard™ verification. Choose an option below to begin.
              </p>

              {/* Mode Toggle Tabs */}
              <div className="mt-6 inline-flex rounded-xl bg-slate-100 p-1.5 border border-slate-200 shadow-inner">
                <button
                  type="button"
                  onClick={() => { setMode('improve'); setErrorMessage(null); }}
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition duration-150 ${
                    mode === 'improve'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-brand-600">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  Improve My Existing CV
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('create'); setErrorMessage(null); }}
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition duration-150 ${
                    mode === 'create'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-700">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                  Create from Scratch
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-8">
          {/* Global Error Banner */}
          {errorMessage && (
            <div className="card border-red-200 bg-red-50/90 p-5 text-red-800 shadow-sm mb-6 max-w-3xl mx-auto" role="alert">
              <div className="flex items-start gap-3">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-red-500 shrink-0 mt-0.5">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="font-bold text-sm">Action Notice</p>
                  <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
                  {errorDetails?.fallbackResume && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={handleProceedWithParsed}
                        className="btn-primary text-xs bg-red-700 hover:bg-red-800"
                      >
                        Proceed with Parsed CV as-is (Preview & PDF)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Processing State with Multi-Stage Progress Animation */}
          {step === 'processing' && (
            <div className="card p-12 text-center max-w-md mx-auto my-12 shadow-lg border-slate-200">
              <Spinner className="mx-auto h-12 w-12 text-brand-600 mb-4" />
              <h3 className="text-xl font-bold text-slate-900">Processing Your Resume</h3>
              <p className="mt-2 text-sm text-slate-600">{statusMessage}</p>

              {/* Progress Milestones */}
              <div className="mt-6 space-y-2 text-left text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className={`flex items-center gap-2 ${processingStage >= 1 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                  {processingStage > 1 ? (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600" aria-hidden="true"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 mx-1" aria-hidden="true" />
                  )}
                  <span>1. Ingesting and extracting structured facts</span>
                </div>
                <div className={`flex items-center gap-2 ${processingStage >= 2 ? 'text-teal-700 font-semibold' : 'text-slate-400'}`}>
                  {processingStage > 2 ? (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600" aria-hidden="true"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 mx-1" aria-hidden="true" />
                  )}
                  <span>2. NVIDIA Nemotron AI accomplishment rewriting</span>
                </div>
                <div className={`flex items-center gap-2 ${processingStage >= 3 ? 'text-teal-700 font-semibold' : 'text-slate-400'}`}>
                  {processingStage >= 3 ? (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600" aria-hidden="true"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 mx-1" aria-hidden="true" />
                  )}
                  <span>3. Truth Guard™ anti-hallucination verification</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 mx-1" aria-hidden="true" />
                  <span>4. Deterministic ATS scoring &amp; PDF formatting</span>
                </div>
              </div>
            </div>
          )}

          {/* Option 1: Improve Existing CV View */}
          {step === 'idle' && mode === 'improve' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="card p-6 sm:p-8 border-slate-200 shadow-sm bg-white">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-slate-900">Upload Your Resume</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Upload your current CV to automatically extract facts and rebuild it with verified AI.
                  </p>
                </div>

                {/* Drag and Drop Zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`mt-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition cursor-pointer ${
                    isDragging
                      ? 'border-brand-500 bg-brand-50/50'
                      : 'border-slate-300 hover:border-brand-400 bg-slate-50/50'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileSelect(file);
                    }}
                  />
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mb-3 shadow-sm">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
                      <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-base font-bold text-slate-900">
                    Click to select file or drag &amp; drop here
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Supports <span className="font-semibold text-slate-700">PDF, DOCX, TXT</span> documents up to <span className="font-semibold text-slate-700">8 MB</span>
                  </p>
                  {selectedFileName && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-teal-600" aria-hidden="true">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                      </svg>
                      <span>Selected: {selectedFileName}</span>
                    </div>
                  )}
                </div>

                {/* Optional Job Description Accordion */}
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => setShowJobAccordion(!showJobAccordion)}
                    className="flex w-full items-center justify-between text-xs font-bold text-slate-700 hover:text-teal-700 transition"
                  >
                    <span>Optional: Target Role &amp; Job Description</span>
                    <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                      <span>{showJobAccordion ? 'Hide details' : 'Add details to optimize match'}</span>
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`h-4 w-4 transition-transform duration-200 ${showJobAccordion ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      >
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </button>

                  {showJobAccordion && (
                    <div className="mt-4 space-y-4 text-left">
                      <div>
                        <label htmlFor="target-role" className="label text-xs">Target Job Title</label>
                        <input
                          id="target-role"
                          type="text"
                          className="input"
                          placeholder="e.g. Senior Java Backend Engineer"
                          value={targetRole}
                          onChange={(e) => setTargetRole(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="job-text" className="label text-xs">Job Description (paste full posting)</label>
                        <textarea
                          id="job-text"
                          className="input min-h-[140px] text-xs leading-relaxed"
                          placeholder="Paste the job posting to align keywords and technical requirements..."
                          value={jobText}
                          onChange={(e) => setJobText(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Option 2: Create from Scratch Form View */}
          {step === 'idle' && mode === 'create' && (
            <form onSubmit={handleCreateResume} className="max-w-3xl mx-auto space-y-8">
              {/* Card 1: Personal Details */}
              <div className="card p-6 sm:p-8 bg-white border-slate-200 shadow-sm">
                <div className="border-b border-slate-100 pb-3 mb-5">
                  <h2 className="text-xl font-bold text-slate-900">1. Personal &amp; Contact Details</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Required for ATS header structure.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="fullName" className="label text-xs">Full Name *</label>
                    <input
                      id="fullName"
                      required
                      type="text"
                      className="input"
                      placeholder="e.g. Alex Morgan"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="label text-xs">Email Address *</label>
                    <input
                      id="email"
                      required
                      type="email"
                      className="input"
                      placeholder="e.g. alex.morgan@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="label text-xs">Phone Number</label>
                    <input
                      id="phone"
                      type="text"
                      className="input"
                      placeholder="+1 (555) 019-2834"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="location" className="label text-xs">Location (City, Country)</label>
                    <input
                      id="location"
                      type="text"
                      className="input"
                      placeholder="e.g. London, UK or Remote"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="linkedin" className="label text-xs">LinkedIn URL</label>
                    <input
                      id="linkedin"
                      type="text"
                      className="input"
                      placeholder="linkedin.com/in/alexmorgan"
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="github" className="label text-xs">GitHub URL</label>
                    <input
                      id="github"
                      type="text"
                      className="input"
                      placeholder="github.com/alexmorgan"
                      value={github}
                      onChange={(e) => setGithub(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="portfolio" className="label text-xs">Portfolio / Personal Website</label>
                    <input
                      id="portfolio"
                      type="text"
                      className="input"
                      placeholder="https://alexmorgan.dev"
                      value={portfolio}
                      onChange={(e) => setPortfolio(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Target Role & Skills */}
              <div className="card p-6 sm:p-8 bg-white border-slate-200 shadow-sm">
                <div className="border-b border-slate-100 pb-3 mb-5">
                  <h2 className="text-xl font-bold text-slate-900">2. Career Goal &amp; Technical Skills</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Defines resume summary and technical taxonomy.</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="careerTitle" className="label text-xs">Target Role or Career Headline</label>
                    <input
                      id="careerTitle"
                      type="text"
                      className="input"
                      placeholder="e.g. Senior Software Engineer • Cloud Architecture"
                      value={careerTitle}
                      onChange={(e) => setCareerTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="skillsRaw" className="label text-xs">Skills (comma or newline separated)</label>
                    <textarea
                      id="skillsRaw"
                      className="input min-h-[90px] text-xs"
                      placeholder="TypeScript, Python, PostgreSQL, Docker, AWS, React, REST APIs, Microservices"
                      value={skillsRaw}
                      onChange={(e) => setSkillsRaw(e.target.value)}
                    />
                    {skillsRaw && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {skillsRaw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).map((skill, idx) => (
                          <span key={idx} className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card 3: Work Experience */}
              <div className="card p-6 sm:p-8 bg-white border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">3. Work Experience</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Curevo AI converts your raw bullets into Google XYZ achievement format.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExperiences([
                        ...experiences,
                        { company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '' },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-lg"
                  >
                    + Add Position
                  </button>
                </div>

                {experiences.map((exp, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">Position {idx + 1}</span>
                      {experiences.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setExperiences(experiences.filter((_, i) => i !== idx))}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label text-xs">Job Title</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Lead Developer"
                          value={exp.title}
                          onChange={(e) => {
                            const updated = [...experiences];
                            updated[idx].title = e.target.value;
                            setExperiences(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Company Name</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Stripe"
                          value={exp.company}
                          onChange={(e) => {
                            const updated = [...experiences];
                            updated[idx].company = e.target.value;
                            setExperiences(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Start Date</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. 2021"
                          value={exp.startDate}
                          onChange={(e) => {
                            const updated = [...experiences];
                            updated[idx].startDate = e.target.value;
                            setExperiences(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="label text-xs">End Date</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. 2024 or Present"
                          disabled={exp.current}
                          value={exp.current ? 'Present' : exp.endDate}
                          onChange={(e) => {
                            const updated = [...experiences];
                            updated[idx].endDate = e.target.value;
                            setExperiences(updated);
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label text-xs">Achievements &amp; Responsibilities (one per line)</label>
                      <textarea
                        className="input min-h-[90px] text-xs leading-relaxed"
                        placeholder="Built scalable payment pipeline processing 50K daily orders&#10;Decreased API latency by 40% via Redis caching"
                        value={exp.description}
                        onChange={(e) => {
                          const updated = [...experiences];
                          updated[idx].description = e.target.value;
                          setExperiences(updated);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Card 4: Education */}
              <div className="card p-6 sm:p-8 bg-white border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">4. Education</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Degrees, universities, and graduation dates.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEducations([
                        ...educations,
                        { institution: '', degree: '', field: '', startDate: '', endDate: '', grade: '' },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-lg"
                  >
                    + Add Degree
                  </button>
                </div>

                {educations.map((edu, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">Degree {idx + 1}</span>
                      {educations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEducations(educations.filter((_, i) => i !== idx))}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label text-xs">Degree &amp; Major</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. B.S. in Computer Science"
                          value={edu.degree}
                          onChange={(e) => {
                            const updated = [...educations];
                            updated[idx].degree = e.target.value;
                            setEducations(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="label text-xs">University / Institution</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. University of Manchester"
                          value={edu.institution}
                          onChange={(e) => {
                            const updated = [...educations];
                            updated[idx].institution = e.target.value;
                            setEducations(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Graduation Year</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. 2022"
                          value={edu.endDate}
                          onChange={(e) => {
                            const updated = [...educations];
                            updated[idx].endDate = e.target.value;
                            setEducations(updated);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Card 5: Projects */}
              <div className="card p-6 sm:p-8 bg-white border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">5. Key Projects (Optional)</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Showcase technical repositories and software builds.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setProjects([
                        ...projects,
                        { name: '', description: '', tech: '', link: '' },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-lg"
                  >
                    + Add Project
                  </button>
                </div>

                {projects.map((proj, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">Project {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => setProjects(projects.filter((_, i) => i !== idx))}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label text-xs">Project Name</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Real-Time Chat Engine"
                          value={proj.name}
                          onChange={(e) => {
                            const updated = [...projects];
                            updated[idx].name = e.target.value;
                            setProjects(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Technologies (comma-separated)</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Go, WebSockets, Redis"
                          value={proj.tech}
                          onChange={(e) => {
                            const updated = [...projects];
                            updated[idx].tech = e.target.value;
                            setProjects(updated);
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label text-xs">Project Highlights &amp; Outcomes</label>
                      <textarea
                        className="input min-h-[70px] text-xs leading-relaxed"
                        placeholder="Engineered low-latency broker serving 10K concurrent connections"
                        value={proj.description}
                        onChange={(e) => {
                          const updated = [...projects];
                          updated[idx].description = e.target.value;
                          setProjects(updated);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Card 6: Certifications */}
              <div className="card p-6 sm:p-8 bg-white border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">6. Certifications (Optional)</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Industry certifications and verified credentials.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCertifications([
                        ...certifications,
                        { name: '', issuer: '', year: '' },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-lg"
                  >
                    + Add Certification
                  </button>
                </div>

                {certifications.map((cert, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">Certification {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => setCertifications(certifications.filter((_, i) => i !== idx))}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <label className="label text-xs">Certification Name</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. AWS Certified Solutions Architect"
                          value={cert.name}
                          onChange={(e) => {
                            const updated = [...certifications];
                            updated[idx].name = e.target.value;
                            setCertifications(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Year</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. 2024"
                          value={cert.year}
                          onChange={(e) => {
                            const updated = [...certifications];
                            updated[idx].year = e.target.value;
                            setCertifications(updated);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 px-6 text-sm font-bold text-white shadow-md hover:bg-slate-800 active:scale-95 transition"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-teal-400">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  Generate Professional Resume with AI
                </button>
              </div>
            </form>
          )}

          {/* Ready State / Complete Resume Workspace */}
          {step === 'ready' && resume && (
            <div className="space-y-6">
              {/* Workspace Top Control Panel */}
              <div className="card p-6 bg-white border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  {ats && (
                    <ScoreRing
                      score={ats.audit ? ats.audit.overallScore : ats.overallScore}
                      size={100}
                      label="ATS Score"
                    />
                  )}
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{resume.personal.fullName}</h2>
                    <p className="text-sm text-slate-500">{resume.personal.headline || 'Resume Ready'}</p>
                    <div className="mt-2.5 flex flex-wrap gap-2 items-center">
                      {truthBadge && (
                        <span
                          title={truthBadge.title}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${truthBadge.className}`}
                        >
                          <span>{truthBadge.icon}</span> {truthBadge.text}
                        </span>
                      )}
                      {ats?.audit && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 border border-slate-800 text-white px-2.5 py-0.5 text-xs font-semibold">
                          9 ATS Dimensions Audited
                        </span>
                      )}
                      {ats?.completeness && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs text-slate-700">
                          {ats.completeness.evaluatedChecks} Checks Evaluated
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* PDF Actions & Template Switcher */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                  <div className="w-full sm:w-auto">
                    <label htmlFor="template-select" className="sr-only">Template</label>
                    <select
                      id="template-select"
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="input py-2 text-xs font-semibold text-slate-700 bg-slate-50 border-slate-300"
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
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 active:scale-95"
                  >
                    {isDownloading ? (
                      <>
                        <Spinner className="h-4 w-4" /> Generating PDF...
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-teal-400">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        Download ATS-Friendly PDF
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Workspace Navigation Tabs */}
              <div className="flex border-b border-slate-200 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`px-4 py-2 text-sm font-bold border-b-2 transition ${
                    activeTab === 'preview'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Document Preview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ats')}
                  className={`px-4 py-2 text-sm font-bold border-b-2 transition ${
                    activeTab === 'ats'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Advanced ATS Audit {ats && `(${ats.audit ? ats.audit.overallScore : ats.overallScore}/100)`}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('truth')}
                  className={`px-4 py-2 text-sm font-bold border-b-2 transition ${
                    activeTab === 'truth'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Truth Guard™ Audit
                </button>
                {changeLog.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('changelog')}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition ${
                      activeTab === 'changelog'
                        ? 'border-slate-900 text-slate-900'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    AI Changes ({changeLog.length})
                  </button>
                )}
              </div>

              {/* Tab 1: Live Document Preview */}
              {activeTab === 'preview' && (
                <div className="card p-6 bg-slate-100/70 border-slate-200 flex justify-center overflow-x-auto">
                  <div className="w-full max-w-4xl shadow-xl rounded-xl overflow-hidden bg-white">
                    <ResumePreview resume={resume} template={selectedTemplate} />
                  </div>
                </div>
              )}

              {/* Tab 2: ATS Breakdown / Advanced ATS Audit */}
              {activeTab === 'ats' && ats && (
                ats.audit ? (
                  <AdvancedAtsAuditView audit={ats.audit} legacyAts={ats} />
                ) : (
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="card p-6 bg-white border-slate-200 space-y-4">
                      <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
                        ATS Category Breakdown
                      </h3>
                      <div className="space-y-3">
                        <ScoreBar label="Formatting & Headers" score={ats.formattingScore} />
                        <ScoreBar label="Content & Metrics" score={ats.contentScore} />
                        <ScoreBar label="Section Structure" score={ats.structureScore} />
                        <ScoreBar label="Technical Skills" score={ats.skillsScore} />
                        <ScoreBar label="Readability & Tone" score={ats.readabilityScore} />
                      </div>
                    </div>

                    <div className="card p-6 bg-white border-slate-200 space-y-4">
                      <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
                        ATS Completeness &amp; Checklist
                      </h3>
                      {ats.completeness && (
                        <p className="text-xs text-slate-500">
                          {ats.completeness.evaluatedChecks} of {ats.completeness.totalChecks} checks evaluated ({ats.completeness.status}).
                        </p>
                      )}
                      <div className="space-y-2 text-xs">
                        {ats.recommendations && ats.recommendations.length > 0 ? (
                          ats.recommendations.map((rec, i) => (
                            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                              <span className="text-brand-600 font-bold">•</span>
                              <span className="text-slate-700">{rec}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-emerald-700 font-medium">All major ATS compatibility checks passed cleanly!</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* Tab 3: Truth Guard Audit */}
              {activeTab === 'truth' && (
                <div className="card p-6 bg-white border-slate-200 space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Truth Guard™ Audit Log</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Every bullet is inspected against candidate facts to guarantee zero hallucinations.</p>
                    </div>
                    {truthBadge && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${truthBadge.className}`}>
                        <span>{truthBadge.icon}</span> {truthBadge.text}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {truth?.checks && truth.checks.length > 0 ? (
                      truth.checks.map((c, i) => (
                        <div key={i} className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">{c.note || `Check #${i + 1}`}</span>
                            <span className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded-full ${
                              c.status === 'supported'
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.status === 'reverted'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {c.status}
                            </span>
                          </div>
                          <p className="text-slate-800 italic">&quot;{c.bullet}&quot;</p>
                          {c.unsupportedClaims && c.unsupportedClaims.length > 0 && (
                            <p className="text-red-600">Unsupported claims detected: {c.unsupportedClaims.join(', ')}</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">No rewritten bullet claims required verification.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 4: AI Transformation Log */}
              {activeTab === 'changelog' && changeLog.length > 0 && (
                <div className="card p-6 bg-white border-slate-200 space-y-4">
                  <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
                    NVIDIA Nemotron AI Transformation Log
                  </h3>
                  <div className="space-y-3">
                    {changeLog.map((log, i) => (
                      <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs space-y-1.5">
                        <div className="flex items-center justify-between font-bold text-slate-800">
                          <span>{log.section}</span>
                          <span className="text-brand-600 uppercase text-[10px] bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                            {log.label || log.type}
                          </span>
                        </div>
                        {log.before && (
                          <p className="text-red-700 bg-red-50/70 p-2 rounded border border-red-100">
                            <span className="font-semibold">Before:</span> {log.before}
                          </p>
                        )}
                        <p className="text-emerald-800 bg-emerald-50/70 p-2 rounded border border-emerald-100">
                          <span className="font-semibold">After:</span> {log.after}
                        </p>
                        {log.reason && (
                          <p className="text-slate-500 italic">Rationale: {log.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-auto">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Logo className="scale-90 origin-left" />
            <span>— 100% In-Memory ATS Resume Platform</span>
          </div>
          <p>© {new Date().getFullYear()} Curevo AI. Zero Database Storage.</p>
        </div>
      </footer>
    </div>
  );
}