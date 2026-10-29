import { useState, useRef, useEffect, FormEvent, DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, downloadPdfBlob } from '../api';
import { Logo, ScoreRing, ScoreBar, Spinner } from '../components/ui';
import ResumePreview from '../components/ResumePreview';
import AdvancedAtsAuditView from '../components/AdvancedAtsAuditView';
import ResumeFormEditor from '../components/ResumeFormEditor';
import { getSampleCv, SAMPLE_ATS_FALLBACK } from '../data/sampleCv';
import { SAMPLE_JD_PRESETS } from '../data/sampleJdPresets';
import type {
  ResumeData,
  ATSAnalysis,
  TruthReport,
  ChangeLogEntry,
  MatchAnalysis,
  JobAnalysis,
  PageSize,
  CoverLetter,
  CoverLetterTone,
  CoverLetterResponse,
} from '../types';

type Mode = 'improve' | 'create';
type Step = 'idle' | 'processing' | 'ready';
type ResultTab = 'preview' | 'edit' | 'ats' | 'match' | 'cover' | 'truth' | 'changelog';

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

export interface AttestedEntry {
  id: string;
  requirement: string;
  destination: 'skill' | 'bullet';
  contextNote: string;
  bulletText?: string;
  expId?: string;
  expCompany?: string;
  addedAt: number;
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

  // Strictly require passedAll, all checks supported, and 0 auto-fixes for Grounding Verified
  if (truth.passedAll && supported === total && autoFixedCount === 0 && warnings === 0) {
    return {
      className: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      icon: '✓',
      text: `Truth Guard: Grounding Verified (${supported}/${total} supported)`,
      title: `All ${total} evaluated claims strictly match source CV facts.`,
    };
  }

  if (autoFixedCount > 0 && warnings === 0) {
    return {
      className: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: '✓',
      text: `Truth Guard: ${supported}/${total} Grounded (${autoFixedCount} auto-repaired)`,
      title: `${autoFixedCount} bullet(s) were safely reverted to source CV wording to protect factual accuracy.`,
    };
  }

  if (warnings > 0) {
    return {
      className: 'bg-amber-50 border-amber-200 text-amber-800',
      icon: '⚠',
      text: `Truth Guard: ${pct}% Grounded (${warnings} flagged)`,
      title: `${warnings} claim(s) could not be fully grounded against source facts.`,
    };
  }

  return {
    className: 'bg-amber-50 border-amber-200 text-amber-800',
    icon: '•',
    text: `Truth Guard: ${pct}% Grounded (${supported}/${total} supported)`,
    title: `${supported} of ${total} claims supported by source facts.`,
  };
}

export function normalizeResume(r: Partial<ResumeData> | null | undefined): ResumeData {
  const data = r || {};
  return {
    personal: {
      fullName: data.personal?.fullName || '',
      email: data.personal?.email || '',
      phone: data.personal?.phone || '',
      location: data.personal?.location || '',
      linkedin: data.personal?.linkedin || '',
      github: data.personal?.github || '',
      portfolio: data.personal?.portfolio || '',
      headline: data.personal?.headline || '',
      otherLinks: data.personal?.otherLinks || [],
    },
    summary: data.summary || '',
    experience: (data.experience || []).map((e) => ({
      ...e,
      bullets: e.bullets || [],
    })),
    projects: (data.projects || []).map((p) => ({
      ...p,
      bullets: p.bullets || [],
      tech: p.tech || [],
    })),
    education: data.education || [],
    skills: {
      technical: data.skills?.technical || [],
      soft: data.skills?.soft || [],
    },
    certifications: data.certifications || [],
    languages: data.languages || [],
    achievements: data.achievements || [],
    customSections: data.customSections || [],
    sectionOrder: data.sectionOrder || ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
    hiddenSections: data.hiddenSections || [],
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
  const [selectedMarginDensity, setSelectedMarginDensity] = useState<'compact' | 'normal' | 'spacious'>('normal');
  const [selectedPageSize, setSelectedPageSize] = useState<PageSize>('A4');
  const [previewScale, setPreviewScale] = useState<number>(1);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Direct Content Editor & Real-Time ATS Audit State
  const [isAuditing, setIsAuditing] = useState<boolean>(false);

  // Job Match and Actionable Gap Resolution State
  const [match, setMatch] = useState<MatchAnalysis | null>(null);
  const [activeJobText, setActiveJobText] = useState<string>('');
  const [activeTargetRole, setActiveTargetRole] = useState<string>('');
  const [matchFilter, setMatchFilter] = useState<'all' | 'matched' | 'missing'>('all');
  const [isMatching, setIsMatching] = useState<boolean>(false);
  const [showSwitchJd, setShowSwitchJd] = useState<boolean>(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Evidence Resolver for candidate-provided missing qualifications
  const [evidenceFormSkill, setEvidenceFormSkill] = useState<string | null>(null);
  const [evidenceTargetType, setEvidenceTargetType] = useState<'skill' | 'bullet'>('skill');
  const [evidenceTargetExpId, setEvidenceTargetExpId] = useState<string>('');
  const [evidenceBulletText, setEvidenceBulletText] = useState<string>('');
  const [evidenceContextNote, setEvidenceContextNote] = useState<string>('');
  const [evidenceConfirmed, setEvidenceConfirmed] = useState<boolean>(false);
  const [attestedEntries, setAttestedEntries] = useState<AttestedEntry[]>([]);
  const [evidenceSuccessToast, setEvidenceSuccessToast] = useState<string | null>(null);

  // Tailor to Job state in ready step
  const [showTailorModal, setShowTailorModal] = useState<boolean>(false);
  const [tailorTargetRole, setTailorTargetRole] = useState<string>('');
  const [tailorJobText, setTailorJobText] = useState<string>('');
  const [isTailoring, setIsTailoring] = useState<boolean>(false);
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [tailoringStageText, setTailoringStageText] = useState<string>('');
  const [tailoringElapsedSeconds, setTailoringElapsedSeconds] = useState<number>(0);

  // AI & ResumeSkills Cover Letter Generator State
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null);
  const [originalGeneratedCover, setOriginalGeneratedCover] = useState<CoverLetter | null>(null);
  const [coverRole, setCoverRole] = useState<string>('');
  const [coverCompany, setCoverCompany] = useState<string>('');
  const [coverJdText, setCoverJdText] = useState<string>('');
  const [coverTone, setCoverTone] = useState<CoverLetterTone>('professional');
  const [isGeneratingCover, setIsGeneratingCover] = useState<boolean>(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverRejectedCount, setCoverRejectedCount] = useState<number>(0);
  const [coverProvider, setCoverProvider] = useState<string>('');
  const [coverIsFallback, setCoverIsFallback] = useState<boolean>(false);
  const [coverCopiedToast, setCoverCopiedToast] = useState<boolean>(false);
  const [isDownloadingCoverPdf, setIsDownloadingCoverPdf] = useState<boolean>(false);
  const [hasEditedCover, setHasEditedCover] = useState<boolean>(false);

  // Sample CV Mode state
  const [isSampleCv, setIsSampleCv] = useState<boolean>(false);

  // 1-Click Sample CV Loader: Immediately loads complete synthetic engineering profile
  // and audits ATS score without requiring file upload or account creation.
  const handleLoadSampleCv = async () => {
    setErrorMessage(null);
    setErrorDetails(null);
    setSelectedFileName(null);
    setTailorTargetRole('');
    setTailorJobText('');
    setTailorError(null);
    setShowTailorModal(false);
    setMatch(null);
    setActiveJobText('');
    setActiveTargetRole('');
    setChangeLog([]);

    const sample = getSampleCv();
    const normalized = normalizeResume(sample);
    setResume(normalized);
    setIsSampleCv(true);
    setTruth({ passedAll: true, checks: [], autoFixed: [] });
    // Use verified baseline immediately for instantaneous, zero-latency visual rendering
    setAts(SAMPLE_ATS_FALLBACK);
    setStep('ready');
    setActiveTab('preview');

    // Run deterministic ATS audit on the server to keep engine contracts synchronized
    try {
      const res = await api.post<{ ats: ATSAnalysis }>('/public/audit', { resume: normalized });
      if (res.ats) {
        setAts(res.ats);
      }
    } catch (err) {
      // Gracefully maintain verified baseline fallback on network/offline interruption
      console.warn('Live ATS audit unreachable, using verified fallback:', err);
    }
  };

  // Immutable React state updater for direct form editing
  const handleResumeChange = (updater: (draft: ResumeData) => void) => {
    setResume((prev) => {
      if (!prev) return prev;
      const draft = JSON.parse(JSON.stringify(normalizeResume(prev))) as ResumeData;
      updater(draft);
      return normalizeResume(draft);
    });
  };

  // Re-check ATS Audit in real-time without resetting state
  const handleRecheckAts = async (overrideResume?: ResumeData) => {
    const target = overrideResume || resume;
    if (!target) return;
    setIsAuditing(true);
    try {
      const res = await api.post<{ ats: ATSAnalysis }>('/public/audit', { resume: target });
      if (res.ats) {
        setAts(res.ats);
      }
    } catch (err) {
      console.error('Failed to re-audit ATS score:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  // Re-check Match in real-time when resume or verified evidence changes
  const handleRecheckMatch = async (targetResume?: ResumeData, targetJobText?: string) => {
    const cv = targetResume || resume;
    const text = targetJobText !== undefined ? targetJobText : (activeJobText || tailorJobText || jobText);
    if (!cv || !text.trim()) return;
    setIsMatching(true);
    try {
      const res = await api.post<{ job: JobAnalysis; match: MatchAnalysis }>('/public/match', {
        resume: cv,
        jobText: text.trim(),
      });
      if (res.match) {
        setMatch(res.match);
      }
    } catch (err) {
      console.error('Failed to recheck job match:', err);
    } finally {
      setIsMatching(false);
    }
  };

  // Analyze a new Job Description directly from the Job Match tab
  const handleAnalyzeNewJd = async (jdString: string, roleString?: string) => {
    if (!resume || !jdString.trim()) return;
    setIsMatching(true);
    try {
      const res = await api.post<{ job: JobAnalysis; match: MatchAnalysis }>('/public/match', {
        resume,
        jobText: jdString.trim(),
      });
      if (res.match) {
        setMatch(res.match);
        setActiveJobText(jdString.trim());
        if (roleString?.trim()) setActiveTargetRole(roleString.trim());
        else if (res.job?.title) setActiveTargetRole(res.job.title);
        setShowSwitchJd(false);
      }
    } catch (err) {
      console.error('Failed to analyze job match:', err);
    } finally {
      setIsMatching(false);
    }
  };

  // Candidate Explicit Evidence Resolver: Incorporate candidate-attested experience for missing skills
  const handleIncorporateEvidence = async (skillToIncorporate: string) => {
    if (!resume || !skillToIncorporate) return;
    if (!evidenceConfirmed) return;
    if (!evidenceContextNote.trim()) return;

    const updated = JSON.parse(JSON.stringify(resume)) as ResumeData;
    let changeReason = '';
    const newId = `attested_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let targetCompany = '';

    if (evidenceTargetType === 'skill') {
      if (!updated.skills.technical.map((s) => s.toLowerCase()).includes(skillToIncorporate.toLowerCase())) {
        updated.skills.technical.push(skillToIncorporate);
      }
      changeReason = `Candidate attested hands-on proficiency in ${skillToIncorporate} ("${evidenceContextNote.trim()}").`;
    } else if (evidenceTargetType === 'bullet' && evidenceBulletText.trim()) {
      const expIdx = updated.experience.findIndex((e) => e.id === evidenceTargetExpId || !evidenceTargetExpId);
      if (expIdx >= 0) {
        targetCompany = updated.experience[expIdx].company;
        updated.experience[expIdx].bullets.push(evidenceBulletText.trim());
        changeReason = `Candidate attested experience bullet for ${skillToIncorporate} at ${targetCompany} ("${evidenceContextNote.trim()}").`;
      }
    }

    const attestedEntry: AttestedEntry = {
      id: newId,
      requirement: skillToIncorporate,
      destination: evidenceTargetType,
      contextNote: evidenceContextNote.trim(),
      bulletText: evidenceTargetType === 'bullet' ? evidenceBulletText.trim() : undefined,
      expId: evidenceTargetType === 'bullet' ? (evidenceTargetExpId || updated.experience[0]?.id) : undefined,
      expCompany: targetCompany || undefined,
      addedAt: Date.now(),
    };

    setAttestedEntries((prev) => [...prev, attestedEntry]);

    if (changeReason) {
      setChangeLog((prev) => [
        ...prev,
        {
          type: evidenceTargetType === 'skill' ? 'skill' : 'bullet',
          section: evidenceTargetType === 'skill' ? 'Technical Skills' : `Experience (${targetCompany || 'Work History'})`,
          before: '',
          after: evidenceTargetType === 'skill' ? skillToIncorporate : evidenceBulletText.trim(),
          reason: changeReason,
          label: 'candidate_attested',
          evidence: `Candidate-attested: "${evidenceContextNote.trim()}"`,
          provenance: 'candidate_attested',
        },
      ]);
    }

    const normalized = normalizeResume(updated);
    setResume(normalized);
    setEvidenceFormSkill(null);
    setEvidenceBulletText('');
    setEvidenceContextNote('');
    setEvidenceConfirmed(false);
    setEvidenceSuccessToast(`Candidate-attested evidence for "${skillToIncorporate}" incorporated into your CV! Scores re-evaluating...`);
    setTimeout(() => setEvidenceSuccessToast(null), 4500);

    // Re-check ATS and Job Match against updated CV
    try {
      await Promise.all([
        handleRecheckAts(normalized),
        handleRecheckMatch(normalized),
      ]);
    } catch (err) {
      console.error('Failed to re-audit after adding candidate evidence:', err);
    }
  };

  // Remove candidate-attested evidence and restore original factual state
  const handleRemoveAttestedEvidence = async (entryId: string) => {
    if (!resume) return;
    const entry = attestedEntries.find((e) => e.id === entryId);
    if (!entry) return;

    const updated = JSON.parse(JSON.stringify(resume)) as ResumeData;

    if (entry.destination === 'skill') {
      updated.skills.technical = updated.skills.technical.filter(
        (s) => s.toLowerCase() !== entry.requirement.toLowerCase()
      );
    } else if (entry.destination === 'bullet') {
      const expIdx = updated.experience.findIndex((e) => e.id === entry.expId);
      if (expIdx >= 0 && entry.bulletText) {
        updated.experience[expIdx].bullets = updated.experience[expIdx].bullets.filter(
          (b) => b !== entry.bulletText
        );
      }
    }

    setAttestedEntries((prev) => prev.filter((e) => e.id !== entryId));
    setChangeLog((prev) => [
      ...prev,
      {
        type: entry.destination === 'skill' ? 'skill' : 'bullet',
        section: entry.destination === 'skill' ? 'Technical Skills' : 'Experience',
        before: entry.destination === 'skill' ? entry.requirement : (entry.bulletText || entry.requirement),
        after: '',
        reason: `Candidate removed attested evidence for ${entry.requirement}.`,
        label: 'candidate_removed',
        evidence: 'Removed by candidate',
        provenance: 'candidate_attested',
      },
    ]);

    const normalized = normalizeResume(updated);
    setResume(normalized);
    setEvidenceSuccessToast(`Candidate-attested evidence for "${entry.requirement}" removed. Scores re-evaluated.`);
    setTimeout(() => setEvidenceSuccessToast(null), 4500);

    try {
      await Promise.all([
        handleRecheckAts(normalized),
        handleRecheckMatch(normalized),
      ]);
    } catch (err) {
      console.error('Failed to re-audit after removing candidate evidence:', err);
    }
  };

  // Tailor resume to target role/job description without account gates or data loss
  const handleRunTailoring = async () => {
    if (!resume) return;
    if (!tailorJobText.trim() && !tailorTargetRole.trim()) {
      setTailorError('Please enter a target job role or paste a job description.');
      return;
    }
    setIsTailoring(true);
    setTailorError(null);
    setTailoringElapsedSeconds(0);
    setTailoringStageText(
      'Processing AI tailoring request with NVIDIA Nemotron. The backend server is evaluating requirements, generating proposed rewrites, and checking claims against your CV evidence.'
    );

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setTailoringElapsedSeconds(elapsed);
    }, 1000);

    try {
      const improveRes = await api.post<{
        resume: ResumeData;
        targetRole?: string;
        changeLog: ChangeLogEntry[];
        truth: TruthReport;
        atsAfter: ATSAnalysis;
        matchAfter: MatchAnalysis;
        agent: { usedAi: boolean; provider: string; model: string };
      }>('/public/improve', {
        resume,
        targetRole: tailorTargetRole.trim() || undefined,
        jobText: tailorJobText.trim() || undefined,
      });

      if (improveRes.resume) {
        setResume(normalizeResume(improveRes.resume));
      }
      if (improveRes.atsAfter) {
        setAts(improveRes.atsAfter);
      }
      if (improveRes.truth) {
        setTruth(improveRes.truth);
      }
      if (improveRes.changeLog) {
        setChangeLog(improveRes.changeLog);
      }
      if (improveRes.matchAfter) {
        setMatch(improveRes.matchAfter);
      }
      if (tailorJobText.trim()) {
        setActiveJobText(tailorJobText.trim());
      }
      if (improveRes.targetRole || tailorTargetRole.trim()) {
        setActiveTargetRole(improveRes.targetRole || tailorTargetRole.trim());
      }
      setShowTailorModal(false);
      setActiveTab('match');
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string; status?: number };
      let msg = apiErr.message || 'AI tailoring encountered an issue. Please try again.';
      if (apiErr.code === 'AI_NOT_CONFIGURED' || apiErr.status === 503) {
        msg = 'NVIDIA Nemotron AI is not configured on the backend server. Manual editing remains active.';
      } else if (apiErr.code === 'AI_TIMEOUT' || apiErr.status === 504) {
        msg = 'The NVIDIA AI service timed out while tailoring your resume. Please try again with a shorter job summary.';
      } else if (apiErr.code === 'CONCURRENCY_LIMIT' || apiErr.status === 429) {
        msg = 'The AI service is currently busy. Please wait a moment and try again.';
      }
      setTailorError(msg);
    } finally {
      clearInterval(timer);
      setIsTailoring(false);
    }
  };

  // Synchronize target role, company, and JD when entering Cover Letter tab
  useEffect(() => {
    if (activeTab === 'cover') {
      if (!coverRole && activeTargetRole) {
        setCoverRole(activeTargetRole);
      }
      if (!coverJdText && activeJobText) {
        setCoverJdText(activeJobText);
      }
    }
  }, [activeTab, activeTargetRole, activeJobText, coverRole, coverJdText]);

  // Handle Cover Letter Generation
  const handleGenerateCoverLetter = async () => {
    if (!resume) return;
    setIsGeneratingCover(true);
    setCoverError(null);

    try {
      const res = await api.post<CoverLetterResponse>('/public/cover-letter', {
        resume,
        jobDescription: coverJdText.trim() || undefined,
        targetRole: coverRole.trim() || undefined,
        company: coverCompany.trim() || undefined,
        tone: coverTone,
      });

      setCoverLetter(res.letter);
      setOriginalGeneratedCover(JSON.parse(JSON.stringify(res.letter)));
      setCoverRejectedCount(res.rejectedCount || 0);
      setCoverProvider(res.provider || 'AI');
      setCoverIsFallback(Boolean(res.isFallback));
      setHasEditedCover(false);
      if (res.targetRole && !coverRole) setCoverRole(res.targetRole);
      if (res.company && !coverCompany) setCoverCompany(res.company);
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string };
      setCoverError(apiErr?.message || 'Failed to generate cover letter. Please verify your resume content and try again.');
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleCopyCoverLetter = () => {
    if (!coverLetter) return;
    const fullText = [
      coverLetter.greeting,
      '',
      coverLetter.paragraphs.join('\n\n'),
      '',
      coverLetter.closing,
    ].join('\n');

    navigator.clipboard.writeText(fullText).then(() => {
      setCoverCopiedToast(true);
      setTimeout(() => setCoverCopiedToast(false), 2500);
    });
  };

  const handleDownloadCoverLetterPdf = async () => {
    if (!coverLetter || !resume) return;
    setIsDownloadingCoverPdf(true);
    try {
      const candidateName = resume.personal.fullName || 'Candidate';
      const cleanName = candidateName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      const cleanRole = (coverRole || 'Role').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      const filename = `${cleanName}_${cleanRole}_Cover_Letter_Curevo_AI.pdf`;

      await downloadPdfBlob(
        '/public/cover-letter/pdf',
        {
          letter: coverLetter,
          candidateName,
          role: coverRole || undefined,
          company: coverCompany || undefined,
          pageSize: selectedPageSize,
        },
        filename
      );
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      alert(`Could not download Cover Letter PDF: ${apiErr?.message || 'Unknown error'}`);
    } finally {
      setIsDownloadingCoverPdf(false);
    }
  };

  const handleParagraphChange = (index: number, newText: string) => {
    if (!coverLetter) return;
    const updated = [...coverLetter.paragraphs];
    updated[index] = newText;
    setCoverLetter({ ...coverLetter, paragraphs: updated });
    setHasEditedCover(true);
  };

  const handleAddParagraph = () => {
    if (!coverLetter) return;
    setCoverLetter({
      ...coverLetter,
      paragraphs: [...coverLetter.paragraphs, 'Enter additional paragraph details here...'],
    });
    setHasEditedCover(true);
  };

  const handleRemoveParagraph = (index: number) => {
    if (!coverLetter || coverLetter.paragraphs.length <= 1) return;
    const updated = coverLetter.paragraphs.filter((_, i) => i !== index);
    setCoverLetter({ ...coverLetter, paragraphs: updated });
    setHasEditedCover(true);
  };

  const handleResetCoverEdits = () => {
    if (!originalGeneratedCover) return;
    setCoverLetter(JSON.parse(JSON.stringify(originalGeneratedCover)));
    setHasEditedCover(false);
  };

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
    const isSampleParam = searchParams.get('sample') === 'true' || urlMode === 'sample';
    if (isSampleParam) {
      void handleLoadSampleCv();
    } else if (urlMode === 'create' || urlMode === 'improve') {
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
    setShowTailorModal(false);
    setTailorTargetRole('');
    setTailorJobText('');
    setTailorError(null);
    setIsSampleCv(false);
    setPreviewScale(1);
    setMatch(null);
    setActiveJobText('');
    setActiveTargetRole('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ---------------------------------------------------------------------------
  // In-Memory Draft Protection (beforeunload, popstate, in-app navigation)
  // ---------------------------------------------------------------------------
  const hasUnsavedDraft =
    step === 'ready' ||
    Boolean(
      fullName.trim() ||
      careerTitle.trim() ||
      skillsRaw.trim() ||
      (experiences[0]?.company.trim() || experiences[0]?.title.trim()) ||
      selectedFileName
    );

  // Before-unload warning for browser refresh and tab closure
  useEffect(() => {
    if (!hasUnsavedDraft) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedDraft]);

  // Popstate guard for browser Back / Forward buttons
  useEffect(() => {
    if (!hasUnsavedDraft) return;

    window.history.pushState({ enhancecvDraft: true }, '', window.location.href);

    const handlePopState = () => {
      if (hasUnsavedDraft) {
        const leave = window.confirm(
          'You have an active resume draft in memory. Navigating away will discard your changes. Are you sure you want to leave?'
        );
        if (!leave) {
          window.history.pushState({ enhancecvDraft: true }, '', window.location.href);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasUnsavedDraft]);

  // Guard for in-app links (Logo, Home)
  const handleNavHome = (e: React.MouseEvent) => {
    if (hasUnsavedDraft) {
      const leave = window.confirm(
        'You have an active resume draft in memory. Navigating to Home will discard your changes. Are you sure you want to leave?'
      );
      if (!leave) {
        e.preventDefault();
      }
    }
  };

  // Guard for "Start Over" button
  const handleStartOverPrompt = () => {
    if (hasUnsavedDraft) {
      const discard = window.confirm(
        'Are you sure you want to start over? Any unsaved edits will be discarded.'
      );
      if (!discard) return;
    }
    handleStartOver();
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
          targetRole?: string;
          changeLog: ChangeLogEntry[];
          truth: TruthReport;
          atsAfter: ATSAnalysis;
          matchAfter: MatchAnalysis;
          agent: { usedAi: boolean; provider: string; model: string };
        }>('/public/improve', {
          resume: parsedResume,
          targetRole: targetRole.trim() || undefined,
          jobText: jobText.trim() || undefined,
        });

        setProcessingStage(3);
        setStatusMessage('Auditing claims with Truth Guard and recomputing ATS compatibility...');

        setResume(normalizeResume(improveRes.resume));
        setAts(improveRes.atsAfter);
        setTruth(improveRes.truth);
        setChangeLog(improveRes.changeLog || []);
        if (improveRes.matchAfter) {
          setMatch(improveRes.matchAfter);
        }
        if (jobText.trim()) {
          setActiveJobText(jobText.trim());
        }
        if (improveRes.targetRole || targetRole.trim()) {
          setActiveTargetRole(improveRes.targetRole || targetRole.trim());
        }
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
      setResume(normalizeResume(errorDetails.fallbackResume));
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
        match?: MatchAnalysis;
        changeLog: ChangeLogEntry[];
        truth: TruthReport;
        agent: { usedAi: boolean; provider: string; model: string };
      }>('/public/create', {
        details: payloadDetails,
        jobText: jobText.trim() || undefined,
      });

      setResume(normalizeResume(createRes.resume));
      setAts(createRes.ats);
      setTruth(createRes.truth);
      setChangeLog(createRes.changeLog || []);
      if (createRes.match) {
        setMatch(createRes.match);
      }
      if (jobText.trim()) {
        setActiveJobText(jobText.trim());
      }
      if (careerTitle.trim()) {
        setActiveTargetRole(careerTitle.trim());
      }
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
          marginDensity: selectedMarginDensity,
          pageSize: selectedPageSize,
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
            <Link to="/" onClick={handleNavHome} className="inline-flex items-center gap-2">
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
                onClick={handleStartOverPrompt}
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
              onClick={handleNavHome}
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

        <div className={`mx-auto px-4 sm:px-6 pt-8 ${step === 'ready' ? 'max-w-7xl 2xl:max-w-[1600px]' : 'max-w-7xl'}`}>
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
                  <span>3. Truth Guard™ factual grounding verification</span>
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
                    Upload your current CV to automatically extract facts and tailor it with fact-grounded AI.
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

                {/* 1-Click Sample CV Action */}
                <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-center sm:text-left transition hover:bg-teal-50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm font-bold text-base" aria-hidden="true">
                      ⚡
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Don&apos;t have a CV file ready?</p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Test-drive the editor, 9-dimension ATS audit, and PDF export instantly with a complete fictional engineering profile.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLoadSampleCv}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-teal-600 bg-white px-4 py-2 text-xs font-bold text-teal-800 shadow-sm transition hover:bg-teal-600 hover:text-white active:scale-95 shrink-0"
                  >
                    <span>Try with a Sample CV</span>
                    <span aria-hidden="true">&rarr;</span>
                  </button>
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
              {/* 1-Click Sample CV Action for Create Mode */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-center sm:text-left shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm font-bold text-base" aria-hidden="true">
                    ⚡
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Want to explore a completed example first?</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Load a full fictional engineering profile to preview the ATS layout and formatting before typing.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoadSampleCv}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-teal-600 bg-white px-4 py-2 text-xs font-bold text-teal-800 shadow-sm transition hover:bg-teal-600 hover:text-white active:scale-95 shrink-0"
                >
                  <span>Try with a Sample CV</span>
                  <span aria-hidden="true">&rarr;</span>
                </button>
              </div>

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
                    <p className="text-xs text-slate-500 mt-0.5">Industry certifications and professional credentials.</p>
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
              {/* Sample CV Disclaimer & Status Banner */}
              {isSampleCv && (
                <div className="card p-3.5 bg-teal-50/90 border-teal-200 text-teal-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm" role="status">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white font-bold text-[11px]" aria-hidden="true">
                      ℹ
                    </span>
                    <div>
                      <span className="font-bold">Fictional Sample CV Loaded:</span>{' '}
                      <span>
                        You are test-driving Curevo AI with a sample engineering profile. You can edit any section in the editor, check the 9-dimension ATS score, or export an A4/Letter PDF. This sample is illustrative and not tailored to a specific live job posting.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartOver}
                    className="inline-flex items-center gap-1 text-teal-800 hover:text-teal-950 font-bold underline shrink-0 self-start sm:self-auto"
                  >
                    <span>Upload Your Own CV</span>
                    <span aria-hidden="true">&rarr;</span>
                  </button>
                </div>
              )}

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
                  <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
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

                    <label htmlFor="margin-density-select" className="sr-only">Spacing Density</label>
                    <select
                      id="margin-density-select"
                      value={selectedMarginDensity}
                      onChange={(e) => setSelectedMarginDensity(e.target.value as 'compact' | 'normal' | 'spacious')}
                      className="input py-2 text-xs font-semibold text-slate-700 bg-slate-50 border-slate-300"
                    >
                      <option value="compact">Spacing: Compact (1-Page)</option>
                      <option value="normal">Spacing: Normal (Standard)</option>
                      <option value="spacious">Spacing: Spacious</option>
                    </select>

                    <label htmlFor="page-size-select" className="sr-only">Paper Size</label>
                    <select
                      id="page-size-select"
                      value={selectedPageSize}
                      onChange={(e) => setSelectedPageSize(e.target.value as PageSize)}
                      className="input py-2 text-xs font-semibold text-slate-700 bg-slate-50 border-slate-300"
                    >
                      <option value="A4">Size: A4 (UK / Intl)</option>
                      <option value="LETTER">Size: US Letter</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTailorTargetRole(resume.personal.headline || '');
                      setTailorError(null);
                      setShowTailorModal(true);
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 hover:border-slate-400 active:scale-95"
                  >
                    <span className="text-amber-500 font-bold">⚡</span> Tailor to Job
                  </button>
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
              <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
                {/* On mobile (< lg): Tab 1 is Document Preview */}
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`lg:hidden px-4 py-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${
                    activeTab === 'preview'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Document Preview
                </button>
                {/* On mobile (< lg): Tab 2 is Edit Content */}
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className={`lg:hidden px-4 py-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${
                    activeTab === 'edit'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Edit Content
                </button>

                {/* On desktop (>= lg): Unified Editor & Live Preview workspace tab */}
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`hidden lg:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${
                    activeTab === 'preview' || activeTab === 'edit'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <svg className="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                  Editor &amp; Live Preview
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('ats')}
                  className={`px-4 py-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${
                    activeTab === 'ats'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Advanced ATS Audit {ats && `(${ats.audit ? ats.audit.overallScore : ats.overallScore}/100)`}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('match')}
                  className={`px-4 py-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${
                    activeTab === 'match'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Job Match {match ? `(${match.score}%)` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('cover')}
                  className={`px-4 py-2 text-sm font-bold border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
                    activeTab === 'cover'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>✉️</span>
                  Cover Letter {coverLetter ? '✓' : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('truth')}
                  className={`px-4 py-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${
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
                    className={`px-4 py-2 text-sm font-bold border-b-2 whitespace-nowrap transition ${
                      activeTab === 'changelog'
                        ? 'border-slate-900 text-slate-900'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    AI Changes ({changeLog.length})
                  </button>
                )}
              </div>

              {/* Responsive Desktop Side-by-Side & Mobile Tabbed Workspace */}
              {(activeTab === 'preview' || activeTab === 'edit') && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Direct Content Editor */}
                  <div
                    className={`space-y-4 lg:col-span-5 xl:col-span-5 ${
                      activeTab === 'edit' ? 'block' : 'hidden lg:block'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 card p-4 bg-slate-50 border-slate-200">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Direct Content Editor</h3>
                        <p className="text-xs text-slate-500">Edit any section directly in memory. Changes reflect immediately in preview &amp; PDF.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRecheckAts()}
                          disabled={isAuditing}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                        >
                          {isAuditing ? <Spinner className="h-3.5 w-3.5" /> : <span>✓</span>}
                          {isAuditing ? 'Auditing...' : 'Re-check ATS'}
                        </button>
                        {/* Mobile only: Quick jump to Document Preview tab */}
                        <button
                          type="button"
                          onClick={() => setActiveTab('preview')}
                          className="lg:hidden inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
                        >
                          View Live Preview →
                        </button>
                      </div>
                    </div>

                    <ResumeFormEditor
                      resume={resume}
                      onChange={handleResumeChange}
                      openAll={true}
                      targetSkills={match ? [...match.matchedSkills, ...match.missingSkills] : undefined}
                      missingSkills={match ? match.missingSkills : undefined}
                    />
                  </div>

                  {/* Right Column: Live Document Preview */}
                  <div
                    className={`lg:col-span-7 xl:col-span-7 ${
                      activeTab === 'preview' ? 'block' : 'hidden lg:block'
                    } lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto space-y-3`}
                  >
                    {/* Live Preview Header Toolbar */}
                    <div className="card p-3 bg-white border-slate-200 shadow-sm flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">Live Paper Preview</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-600 font-medium">
                          {selectedPageSize === 'LETTER' ? 'US Letter' : 'A4'}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">
                          ({selectedPageSize === 'LETTER' ? '8.5 × 11 in' : '210 × 297 mm'})
                        </span>
                      </div>

                      {/* Preview Zoom Controls */}
                      <div className="flex items-center gap-1.5" role="toolbar" aria-label="Preview zoom controls">
                        <button
                          type="button"
                          onClick={() => setPreviewScale((s) => Math.max(0.6, Math.round((s - 0.1) * 10) / 10))}
                          disabled={previewScale <= 0.6}
                          className="p-1 rounded border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition"
                          aria-label="Zoom out preview"
                          title="Zoom out"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewScale(1)}
                          className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-[11px] font-mono font-bold text-slate-700 hover:bg-slate-100 transition"
                          aria-label="Reset preview zoom"
                          title="Reset zoom to 100%"
                        >
                          {Math.round(previewScale * 100)}%
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewScale((s) => Math.min(1.4, Math.round((s + 0.1) * 10) / 10))}
                          disabled={previewScale >= 1.4}
                          className="p-1 rounded border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition"
                          aria-label="Zoom in preview"
                          title="Zoom in"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Paper Canvas Container */}
                    <div className="card p-4 sm:p-6 bg-slate-100/70 border-slate-200 flex justify-center overflow-x-auto shadow-inner rounded-xl">
                      <div className="w-full max-w-4xl shadow-xl rounded-xl overflow-hidden bg-white">
                        <ResumePreview
                          resume={resume}
                          template={selectedTemplate}
                          marginDensity={selectedMarginDensity}
                          pageSize={selectedPageSize}
                          scale={previewScale}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: ATS Breakdown / Advanced ATS Audit */}
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

              {/* Tab: Job Match Analysis & Actionable Gaps */}
              {activeTab === 'match' && (
                <div className="space-y-6">
                  {!match ? (
                    <div className="card p-8 bg-white border-slate-200 shadow-sm max-w-2xl mx-auto space-y-4">
                      <div className="text-center space-y-1">
                        <div className="text-3xl">🎯</div>
                        <h3 className="text-xl font-bold text-slate-900">Analyze CV Against a Target Job</h3>
                        <p className="text-xs text-slate-500">
                          Compare your documented CV evidence against any job description to discover supported skills, missing qualifications, and actionable improvements.
                        </p>
                      </div>
                      <div className="space-y-3 pt-2">
                        {/* Quick-Fill Sample Job Description Presets */}
                        <div className="rounded-xl border border-teal-200/90 bg-teal-50/60 p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between flex-wrap gap-1.5">
                            <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                              <span>⚡</span> Quick-Fill Sample Job Description Presets:
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-800 bg-teal-100/90 px-2 py-0.5 rounded border border-teal-200">
                              Fictional Exploration Roles
                            </span>
                          </div>
                          <p className="text-[11px] text-teal-900/80 leading-relaxed">
                            Click any preset below to load realistic engineering requirements. You can review, edit, or customize any detail before analyzing.
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {SAMPLE_JD_PRESETS.map((preset) => {
                              const isSelected = selectedPresetId === preset.id || tailorTargetRole === preset.roleTitle;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedPresetId(preset.id);
                                    setTailorTargetRole(preset.roleTitle);
                                    setTailorJobText(preset.jobText);
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border shadow-2xs cursor-pointer flex items-center gap-1.5 ${
                                    isSelected
                                      ? 'bg-teal-700 text-white border-teal-800 ring-2 ring-teal-300'
                                      : 'bg-white text-slate-800 border-slate-300 hover:bg-teal-50 hover:border-teal-400'
                                  }`}
                                  aria-label={`Select sample job description preset for ${preset.title}`}
                                >
                                  <span className="text-[10px] opacity-75">{preset.badge}</span>
                                  <span>{preset.title}</span>
                                </button>
                              );
                            })}
                            {(tailorJobText || tailorTargetRole) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPresetId(null);
                                  setTailorTargetRole('');
                                  setTailorJobText('');
                                }}
                                className="text-[11px] text-slate-500 hover:text-red-600 underline px-2 py-1 ml-auto cursor-pointer"
                                aria-label="Clear job description inputs"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="label text-xs font-bold text-slate-700 mb-0">Target Role Title (Optional)</label>
                            {selectedPresetId && (
                              <span className="text-[10px] text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                Sample Preset Active
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            className="input w-full text-xs"
                            placeholder="e.g. Senior Java Backend Engineer"
                            value={tailorTargetRole}
                            onChange={(e) => {
                              setSelectedPresetId(null);
                              setTailorTargetRole(e.target.value);
                            }}
                          />
                        </div>
                        <div>
                          <label className="label text-xs font-bold text-slate-700">Job Description / Requirements</label>
                          <textarea
                            className="input w-full text-xs min-h-[140px] font-mono leading-relaxed"
                            placeholder="Paste the job description or requirements here, or click a sample preset above..."
                            value={tailorJobText}
                            onChange={(e) => {
                              setSelectedPresetId(null);
                              setTailorJobText(e.target.value);
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2">
                          <span className="text-[11px] text-slate-400 italic">
                            * Analysis runs only when you click Analyze Job Match.
                          </span>
                          <button
                            type="button"
                            disabled={isMatching || (!tailorJobText.trim() && !tailorTargetRole.trim())}
                            onClick={() => handleAnalyzeNewJd(tailorJobText, tailorTargetRole)}
                            className="btn-primary text-xs px-5 py-2.5 inline-flex items-center gap-2 cursor-pointer"
                          >
                            {isMatching ? <Spinner className="h-4 w-4" /> : <span>🔍</span>}
                            {isMatching ? 'Analyzing Match...' : 'Analyze Job Match'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Success Toast for Candidate Evidence Incorporation */}
                      {evidenceSuccessToast && (
                        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between shadow-sm animate-in fade-in">
                          <span className="font-semibold flex items-center gap-1.5">
                            <span>✓</span> {evidenceSuccessToast}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEvidenceSuccessToast(null)}
                            className="text-emerald-700 font-bold hover:text-emerald-900 text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      {/* Top Header Card: Overall Match & Target Role */}
                      <div className="card p-6 bg-white border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-5">
                          <ScoreRing score={match.score} size={100} label="Job Match" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                                Explainable Match
                              </span>
                              {activeTargetRole && (
                                <span className="text-xs font-medium text-slate-600">
                                  Target Role: <strong className="text-slate-900">{activeTargetRole}</strong>
                                  {SAMPLE_JD_PRESETS.some((p) => p.roleTitle.toLowerCase() === activeTargetRole.toLowerCase()) && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                      Fictional Exploration Role
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mt-1">Curevo AI Job Description Alignment</h3>
                            <p className="text-xs text-slate-500 max-w-xl mt-0.5">
                              Evaluated against documented facts in your CV across required skills, experience relevance, and responsibilities. Zero score gaming: missing qualifications remain honestly identified.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowSwitchJd(!showSwitchJd)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
                            aria-expanded={showSwitchJd}
                          >
                            <span>🔄</span> {showSwitchJd ? 'Close Selector' : 'Switch Target Job'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowTailorModal(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition cursor-pointer"
                          >
                            <span>⚡</span> Re-Tailor with AI
                          </button>
                        </div>
                      </div>

                      {/* Expandable Switch / Select Target Job Panel */}
                      {showSwitchJd && (
                        <div className="card p-5 bg-white border-teal-200 shadow-sm space-y-3 animate-in fade-in">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base">🎯</span>
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Switch Target Job or Choose a Sample Preset
                              </h4>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowSwitchJd(false)}
                              className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                            >
                              ✕ Close
                            </button>
                          </div>

                          <div className="rounded-xl border border-teal-200/90 bg-teal-50/60 p-3 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                                <span>⚡</span> Quick-Fill Sample Job Description Presets:
                              </span>
                              <span className="text-[10px] font-semibold text-teal-800 bg-teal-100 px-2 py-0.5 rounded">
                                Fictional roles
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {SAMPLE_JD_PRESETS.map((preset) => {
                                const isSelected = selectedPresetId === preset.id || tailorTargetRole === preset.roleTitle;
                                return (
                                  <button
                                    key={`switch-${preset.id}`}
                                    type="button"
                                    onClick={() => {
                                      setSelectedPresetId(preset.id);
                                      setTailorTargetRole(preset.roleTitle);
                                      setTailorJobText(preset.jobText);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border shadow-2xs cursor-pointer flex items-center gap-1.5 ${
                                      isSelected
                                        ? 'bg-teal-700 text-white border-teal-800 ring-2 ring-teal-300'
                                        : 'bg-white text-slate-800 border-slate-300 hover:bg-teal-50 hover:border-teal-400'
                                    }`}
                                  >
                                    <span className="text-[10px] opacity-75">{preset.badge}</span>
                                    <span>{preset.title}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <label className="label text-xs font-bold text-slate-700">Target Role Title</label>
                              <input
                                type="text"
                                className="input w-full text-xs"
                                value={tailorTargetRole}
                                onChange={(e) => setTailorTargetRole(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="label text-xs font-bold text-slate-700">Job Description / Requirements</label>
                              <textarea
                                className="input w-full text-xs min-h-[120px] font-mono leading-relaxed"
                                value={tailorJobText}
                                onChange={(e) => setTailorJobText(e.target.value)}
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className="text-[11px] text-slate-400 italic">
                                * Re-analyzes against documented CV evidence.
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setShowSwitchJd(false)}
                                  className="btn-ghost text-xs px-3 py-1.5 cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isMatching || (!tailorJobText.trim() && !tailorTargetRole.trim())}
                                  onClick={() => handleAnalyzeNewJd(tailorJobText, tailorTargetRole)}
                                  className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  {isMatching ? <Spinner className="h-3.5 w-3.5" /> : <span>🔍</span>}
                                  {isMatching ? 'Re-analyzing...' : 'Analyze Match'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 7-Dimension Score Breakdown */}
                      <div className="card p-6 bg-white border-slate-200 shadow-sm space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                          Evaluation Breakdown Across 7 Dimensions
                        </h4>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {match.breakdown.map((b) => (
                            <div key={b.key} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-800">{b.label}</span>
                                <span className="font-mono font-bold text-slate-900">{b.score}% (wt {b.weight}%)</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${b.score >= 70 ? 'bg-emerald-600' : b.score >= 50 ? 'bg-teal-600' : 'bg-amber-500'}`}
                                  style={{ width: `${b.score}%` }}
                                />
                              </div>
                              <p className="text-[11px] text-slate-500 leading-tight">{b.detail}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ResumeSkills Strategic ATS Advisory Panel */}
                      {match.advisory && (
                        <div className="card p-6 bg-white border-slate-200 shadow-sm space-y-5">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                            <div>
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold mb-1">
                                <span>⚡</span> ResumeSkills™ ATS Advisory &amp; Optimization
                              </div>
                              <h4 className="text-base font-bold text-slate-900">Role-Specific Gap Analysis &amp; Action Plan</h4>
                              <p className="text-xs text-slate-500 mt-0.5">{match.advisory.summary}</p>
                            </div>
                            {match.advisory.candidateQuestions && match.advisory.candidateQuestions.length > 0 && (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-800 shrink-0">
                                {match.advisory.candidateQuestions.length} Discovery Question{match.advisory.candidateQuestions.length === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>

                          {/* Key Strengths & Critical Gaps Dual Grid */}
                          <div className="grid gap-4 md:grid-cols-2">
                            {/* Evidenced Strengths */}
                            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                <span>Evidenced Role Strengths</span>
                              </div>
                              <ul className="space-y-1.5 text-xs text-emerald-950">
                                {match.advisory.keyStrengths.map((s, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="text-emerald-600 font-bold shrink-0">✓</span>
                                    <span>{s}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Critical Gaps */}
                            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                                <span className="h-2 w-2 rounded-full bg-amber-500" />
                                <span>Critical Gaps (Not Evidenced in CV)</span>
                              </div>
                              <ul className="space-y-1.5 text-xs text-amber-950">
                                {match.advisory.criticalGaps.map((g, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="text-amber-600 font-bold shrink-0">⚠</span>
                                    <span>{g}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          {/* Actionable Recommendations List */}
                          {match.advisory.recommendations && match.advisory.recommendations.length > 0 && (
                            <div className="space-y-3 pt-1">
                              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                Targeted Recommendations ({match.advisory.recommendations.length})
                              </h5>
                              <div className="grid gap-3">
                                {match.advisory.recommendations.map((rec) => (
                                  <div
                                    key={rec.id}
                                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-900 text-sm">{rec.title}</span>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-200 text-slate-700">
                                          {rec.category.replace('_', ' ')}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-medium text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                                          📍 {rec.section}
                                        </span>
                                        {rec.requiresCandidateInput ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                                            Requires Candidate Input
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-800">
                                            Actionable Now
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2 text-slate-600">
                                      <div>
                                        <span className="font-semibold text-slate-700">Identified Issue:</span> {rec.issue}
                                      </div>
                                      <div>
                                        <span className="font-semibold text-slate-700">Why It Matters:</span> {rec.whyItMatters}
                                      </div>
                                    </div>

                                    <div className="pt-1.5 border-t border-slate-200/60 flex flex-col gap-1.5">
                                      <div className="text-teal-950 font-medium">
                                        <strong className="text-teal-900">Action Step:</strong> {rec.actionableStep}
                                      </div>
                                      {rec.candidateQuestion && (
                                        <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 font-medium flex items-start gap-2">
                                          <span className="text-amber-700 font-bold shrink-0">❓ Discovery Question:</span>
                                          <span>
                                            {rec.candidateQuestion}{' '}
                                            {rec.metricPlaceholder && (
                                              <code className="px-1 py-0.5 bg-amber-100 rounded text-amber-900 font-mono text-[11px]">
                                                {rec.metricPlaceholder}
                                              </code>
                                            )}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Candidate Discovery Questions (from ResumeSkills Quantification Guide) */}
                          {match.advisory.candidateQuestions && match.advisory.candidateQuestions.length > 0 && (
                            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2 text-xs">
                              <h5 className="font-bold text-blue-900 flex items-center gap-1.5">
                                <span>💬</span> Candidate Discovery Questions (from ResumeSkills Quantification Guide)
                              </h5>
                              <p className="text-blue-800 text-[11px]">
                                Factual grounding strictly prevents inventing numbers or metrics. Answer these questions to add verified data points to your experience:
                              </p>
                              <ul className="space-y-1 text-blue-950">
                                {match.advisory.candidateQuestions.map((q, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="font-bold text-blue-600">•</span>
                                    <span>{q}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Requirements & Skills Filterable View */}
                      <div className="card p-6 bg-white border-slate-200 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">Requirements &amp; Competencies Analysis</h4>
                            <p className="text-xs text-slate-500">Every requirement mapped to documented CV sections and actionable advice.</p>
                          </div>
                          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                            <button
                              type="button"
                              onClick={() => setMatchFilter('all')}
                              className={`px-3 py-1 rounded-lg font-semibold transition ${matchFilter === 'all' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              All ({match.items.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setMatchFilter('matched')}
                              className={`px-3 py-1 rounded-lg font-semibold transition ${matchFilter === 'matched' ? 'bg-white shadow text-emerald-800' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              Evidenced in CV ({match.items.filter((i) => i.status === 'matched').length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setMatchFilter('missing')}
                              className={`px-3 py-1 rounded-lg font-semibold transition ${matchFilter === 'missing' ? 'bg-white shadow text-amber-800' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              Missing / Gaps ({match.items.filter((i) => i.status === 'missing').length})
                            </button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {match.items
                            .filter((i) => {
                              if (matchFilter === 'matched') return i.status === 'matched';
                              if (matchFilter === 'missing') return i.status === 'missing';
                              return true;
                            })
                            .map((item, idx) => {
                              const attestedMatch = attestedEntries.find(
                                (ae) => ae.requirement.toLowerCase() === item.requirement.toLowerCase()
                              );
                              const isAttested = !!attestedMatch || item.provenance === 'candidate_attested';

                              return (
                              <div
                                key={`${item.requirement}-${idx}`}
                                className={`p-4 rounded-xl border text-xs space-y-2 transition ${
                                  isAttested
                                    ? 'border-blue-200 bg-blue-50/30'
                                    : item.status === 'matched'
                                    ? 'border-emerald-200 bg-emerald-50/30'
                                    : item.status === 'partial'
                                    ? 'border-amber-200 bg-amber-50/30'
                                    : 'border-slate-200 bg-slate-50/60'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold ${
                                      item.status === 'matched'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : item.status === 'partial'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-200 text-slate-600'
                                    }`}>
                                      {item.status === 'matched' ? '✓' : item.status === 'partial' ? '½' : '✕'}
                                    </span>
                                    <span className="font-bold text-slate-900 text-sm">{item.requirement}</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                      item.type === 'required'
                                        ? 'bg-red-50 text-red-700 border border-red-200'
                                        : item.type === 'preferred'
                                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                                    }`}>
                                      {item.type}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isAttested ? (
                                      <span className="px-2.5 py-1 rounded-md font-bold text-[10px] uppercase bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
                                        Candidate-Attested
                                      </span>
                                    ) : item.status !== 'missing' ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                        Source CV
                                      </span>
                                    ) : null}
                                    {item.section && item.status !== 'missing' && (
                                      <span className="text-[11px] font-medium text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs">
                                        📍 {item.section}
                                      </span>
                                    )}
                                    <span className={`px-2.5 py-1 rounded-md font-bold text-[10px] uppercase ${
                                      item.status === 'matched'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : item.status === 'partial'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}>
                                      {item.status === 'matched' ? 'Evidenced' : item.status === 'partial' ? 'Partial' : 'Missing from CV'}
                                    </span>
                                  </div>
                                </div>

                                <p className="text-slate-600">{item.evidence}</p>

                                {item.actionableAdvice && (
                                  <div className="pt-1 text-[11px] text-slate-500 border-t border-slate-200/60 flex items-start gap-1.5">
                                    <span className="font-bold text-slate-700 shrink-0">Advice:</span>
                                    <span>{item.actionableAdvice}</span>
                                  </div>
                                )}

                                {/* Candidate-Attested Evidence Removal */}
                                {attestedMatch && (
                                  <div className="pt-1.5 flex items-center justify-between border-t border-slate-200/60 text-xs">
                                    <span className="text-[11px] text-blue-700 font-medium">
                                      Attested ({attestedMatch.destination === 'skill' ? 'Technical Skills' : `Experience @ ${attestedMatch.expCompany || 'Role'}`}): &ldquo;{attestedMatch.contextNote}&rdquo;
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAttestedEvidence(attestedMatch.id)}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg transition"
                                    >
                                      <span>✕</span> Remove candidate-attested evidence
                                    </button>
                                  </div>
                                )}

                                {/* Explicit Candidate Evidence Resolver (for missing skills) */}
                                {item.status === 'missing' && !isAttested && (
                                  <div className="pt-2 border-t border-slate-200/60">
                                    {evidenceFormSkill === item.requirement ? (
                                      <div className="p-3.5 rounded-lg bg-white border border-brand-200 shadow-sm space-y-3 animate-in fade-in">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-bold text-slate-900">
                                            Add Candidate-Attested Evidence for &ldquo;{item.requirement}&rdquo;
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEvidenceFormSkill(null);
                                              setEvidenceBulletText('');
                                              setEvidenceContextNote('');
                                              setEvidenceConfirmed(false);
                                            }}
                                            className="text-xs text-slate-400 hover:text-slate-600"
                                          >
                                            ✕ Close
                                          </button>
                                        </div>
                                        <p className="text-[11px] text-slate-500">
                                          Provide truthful details from your career background. Factual grounding ensures this claim is attributed as candidate-attested and not claimed as an independently verified fact.
                                        </p>

                                        <div className="space-y-2">
                                          <div className="flex items-center gap-3">
                                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`target-type-${idx}`}
                                                checked={evidenceTargetType === 'skill'}
                                                onChange={() => setEvidenceTargetType('skill')}
                                              />
                                              <span>Add to Technical Skills</span>
                                            </label>
                                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`target-type-${idx}`}
                                                checked={evidenceTargetType === 'bullet'}
                                                onChange={() => setEvidenceTargetType('bullet')}
                                              />
                                              <span>Add as Achievement Bullet to Experience</span>
                                            </label>
                                          </div>

                                          {evidenceTargetType === 'bullet' && (
                                            <div className="space-y-2 pt-1">
                                              <div>
                                                <label className="label text-[11px]">Select Role / Employer</label>
                                                <select
                                                  className="input w-full text-xs py-1"
                                                  value={evidenceTargetExpId}
                                                  onChange={(e) => setEvidenceTargetExpId(e.target.value)}
                                                >
                                                  {resume?.experience.map((exp) => (
                                                    <option key={exp.id} value={exp.id}>
                                                      {exp.title} @ {exp.company}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                              <div>
                                                <label className="label text-[11px]">Describe Your Hands-on Achievement with {item.requirement}</label>
                                                <textarea
                                                  className="input w-full text-xs min-h-[60px]"
                                                  placeholder={`e.g. Deployed and operated ${item.requirement} clusters in production, reducing deployment latency by 25%.`}
                                                  value={evidenceBulletText}
                                                  onChange={(e) => setEvidenceBulletText(e.target.value)}
                                                />
                                              </div>
                                            </div>
                                          )}

                                          <div>
                                            <label className="label text-[11px]">
                                              Supporting Context / Usage Details (Required)
                                            </label>
                                            <input
                                              type="text"
                                              className="input w-full text-xs py-1"
                                              placeholder={
                                                evidenceTargetType === 'skill'
                                                  ? 'e.g. 2 years production experience with Kubernetes on AWS EKS'
                                                  : 'e.g. Led migration of microservices architecture in Q3 2023'
                                              }
                                              value={evidenceContextNote}
                                              onChange={(e) => setEvidenceContextNote(e.target.value)}
                                            />
                                          </div>

                                          <div className="pt-1">
                                            <label className="inline-flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                                checked={evidenceConfirmed}
                                                onChange={(e) => setEvidenceConfirmed(e.target.checked)}
                                              />
                                              <span>
                                                I confirm that I possess real, hands-on experience with this requirement and can substantiate it in an interview.
                                              </span>
                                            </label>
                                          </div>

                                          <div className="flex items-center justify-end gap-2 pt-1">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEvidenceFormSkill(null);
                                                setEvidenceBulletText('');
                                                setEvidenceContextNote('');
                                                setEvidenceConfirmed(false);
                                              }}
                                              className="btn-ghost text-xs px-3 py-1"
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleIncorporateEvidence(item.requirement)}
                                              disabled={
                                                !evidenceConfirmed ||
                                                !evidenceContextNote.trim() ||
                                                (evidenceTargetType === 'bullet' && !evidenceBulletText.trim())
                                              }
                                              className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
                                            >
                                              Add Candidate-Attested Evidence
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEvidenceFormSkill(item.requirement);
                                          setEvidenceTargetType('skill');
                                          setEvidenceBulletText('');
                                          setEvidenceContextNote('');
                                          setEvidenceConfirmed(false);
                                          if (resume?.experience[0]) setEvidenceTargetExpId(resume.experience[0].id);
                                        }}
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-lg transition"
                                      >
                                        <span>+</span> I have this experience (Add candidate-attested evidence)
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Wording & Ordering Improvements Panel */}
                      <div className="card p-6 bg-white border-slate-200 shadow-sm space-y-3">
                        <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                          Applied Alignment &amp; Wording Improvements
                        </h4>
                        <p className="text-xs text-slate-500">
                          How your CV was tailored to maximize alignment with this job without inventing facts:
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 text-xs">
                          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
                            <span className="font-bold text-slate-800">🎯 Skills Prioritization</span>
                            <p className="text-slate-600">
                              Evidenced skills were reordered so the JD&apos;s highest-frequency requirements appear first for recruiter and ATS scanning.
                            </p>
                          </div>
                          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
                            <span className="font-bold text-slate-800">📄 Bullet Relevance Sorting</span>
                            <p className="text-slate-600">
                              Accomplishments with direct relevance to the target responsibilities were sorted to the top of each employment entry.
                            </p>
                          </div>
                          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
                            <span className="font-bold text-slate-800">🔤 Standardized Terminology</span>
                            <p className="text-slate-600">
                              Abbreviations and aliases supported by your CV were aligned with the JD&apos;s exact terms while preserving factual meaning.
                            </p>
                          </div>
                          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
                            <span className="font-bold text-slate-800">🛡️ Factual Identity Preservation</span>
                            <p className="text-slate-600">
                              Candidate headline, employer names, dates, and seniority remain strictly grounded in source CV facts. No fake senior titles.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Real-World Career Gaps & Honest Next Steps */}
                      <div className="card p-6 bg-slate-50 border-slate-200 shadow-sm space-y-3">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <span>ℹ️</span> Honest Career Gap Guidance
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          EnhanceCV never fabricates qualifications to artificially boost match scores. The missing skills listed above represent genuine gaps between your current documented experience and the employer&apos;s wishlist. To close these gaps in future applications:
                        </p>
                        <ul className="list-disc list-inside text-xs text-slate-600 space-y-1 pl-1">
                          <li>For missing certifications (e.g. CKA, AWS Solutions Architect), consider completing accredited training.</li>
                          <li>For missing tooling (e.g. Kubernetes, Terraform, Go), build and open-source a concrete proof-of-concept project.</li>
                          <li>For experience span gaps (e.g. 5+ years vs. 4 years), highlight the high volume and complexity of your existing achievements.</li>
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Tab 3: Cover Letter Generator */}
              {activeTab === 'cover' && (
                <div className="space-y-6">
                  {/* Overview Card */}
                  <div className="card p-6 bg-white border-slate-200 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold mb-1">
                          <span>⚡</span> ResumeSkills™ Cover Letter Framework
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">AI Cover Letter Generator</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Create a tailored, professional cover letter grounded 100% in your verified resume facts.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800">
                          🛡️ Zero Hallucination
                        </span>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-700">
                          📄 {selectedPageSize} PDF Ready
                        </span>
                      </div>
                    </div>

                    {/* Inputs & Parameters */}
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label htmlFor="cover-role-input" className="label text-xs font-bold text-slate-700">
                          Target Role (Optional)
                        </label>
                        <input
                          id="cover-role-input"
                          className="input w-full text-xs"
                          placeholder="e.g. Lead Cloud Platform Architect"
                          value={coverRole}
                          onChange={(e) => setCoverRole(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="cover-company-input" className="label text-xs font-bold text-slate-700">
                          Target Company (Optional)
                        </label>
                        <input
                          id="cover-company-input"
                          className="input w-full text-xs"
                          placeholder="e.g. NexaCloud Global Ltd"
                          value={coverCompany}
                          onChange={(e) => setCoverCompany(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="cover-tone-select" className="label text-xs font-bold text-slate-700">
                          Tone of Voice
                        </label>
                        <select
                          id="cover-tone-select"
                          className="input w-full text-xs"
                          value={coverTone}
                          onChange={(e) => setCoverTone(e.target.value as CoverLetterTone)}
                        >
                          <option value="professional">Professional &amp; Balanced (Standard)</option>
                          <option value="confident">Confident &amp; Direct</option>
                          <option value="enthusiastic">Enthusiastic &amp; Growth-Focused</option>
                          <option value="direct">Direct &amp; Executive</option>
                        </select>
                      </div>
                    </div>

                    {/* Quick-Fill Sample Presets for Cover Letter */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-700 flex items-center gap-1">
                          <span>⚡</span> Quick-Fill Target Job Preset:
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">Fictional roles for exploration</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {SAMPLE_JD_PRESETS.map((preset) => (
                          <button
                            key={`cover-${preset.id}`}
                            type="button"
                            onClick={() => {
                              setCoverJdText(preset.jobText);
                            }}
                            className="px-2.5 py-1 rounded-md bg-white border border-slate-300 text-xs text-slate-800 hover:bg-teal-50 hover:border-teal-400 transition shadow-2xs cursor-pointer"
                            aria-label={`Fill cover letter job description with sample ${preset.title}`}
                          >
                            {preset.title}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="cover-jd-textarea" className="label text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Job Description / Key Requirements (Optional)</span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          Tailors emphasis to employer requirements without fabricating skills
                        </span>
                      </label>
                      <textarea
                        id="cover-jd-textarea"
                        className="input w-full text-xs min-h-[90px]"
                        placeholder="Paste job posting text here to align opening hook and body paragraphs to specific role requirements..."
                        value={coverJdText}
                        onChange={(e) => setCoverJdText(e.target.value)}
                      />
                    </div>

                    {/* Insufficient facts warning if resume is empty */}
                    {!resume?.experience?.length && !resume?.summary && !resume?.skills?.technical?.length && (
                      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                        <span className="text-amber-600 font-bold text-sm shrink-0">⚠️</span>
                        <div>
                          <strong className="font-bold">Insufficient Resume Facts:</strong> Your current resume contains no work experience or summary.
                          Please enter your experience in the <em>Edit Content</em> tab or load a <em>Sample CV</em> first so the generator can ground the letter in real facts.
                        </div>
                      </div>
                    )}

                    {coverError && (
                      <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                        <span className="text-red-600 font-bold text-sm shrink-0">✕</span>
                        <div>{coverError}</div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <p className="text-[11px] text-slate-500">
                        Generates a 3-4 paragraph structured letter (Hook, Direct Match, Broader Value, Close).
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerateCoverLetter}
                        disabled={isGeneratingCover || (!resume?.experience?.length && !resume?.summary && !resume?.skills?.technical?.length)}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
                      >
                        {isGeneratingCover ? (
                          <>
                            <Spinner className="h-4 w-4" /> Generating Cover Letter...
                          </>
                        ) : (
                          <>
                            <span>⚡</span> {coverLetter ? 'Regenerate Cover Letter' : 'Generate Cover Letter'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Generated Cover Letter Interactive Canvas & Editor */}
                  {coverLetter && (
                    <div className="space-y-4">
                      {/* Action Bar */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            ✓ Truth Guard Grounded
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            Engine: {coverProvider || 'ResumeSkills'}
                          </span>
                          {coverIsFallback && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              ℹ️ Deterministic Rules
                            </span>
                          )}
                          {hasEditedCover && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                              ✏️ Edited
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {hasEditedCover && (
                            <button
                              type="button"
                              onClick={handleResetCoverEdits}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 transition"
                            >
                              ↺ Reset Edits
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleCopyCoverLetter}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition"
                          >
                            <span>📋</span>
                            <span>{coverCopiedToast ? 'Copied to Clipboard!' : 'Copy to Clipboard'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleDownloadCoverLetterPdf}
                            disabled={isDownloadingCoverPdf}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm disabled:opacity-50 transition"
                          >
                            {isDownloadingCoverPdf ? (
                              <>
                                <Spinner className="h-3.5 w-3.5" /> Downloading...
                              </>
                            ) : (
                              <>
                                <span>⬇️</span> Download PDF ({selectedPageSize})
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Truth Guard notices */}
                      {coverRejectedCount > 0 && (
                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                          <span className="text-amber-600 font-bold shrink-0">🛡️</span>
                          <div>
                            <strong>Truth Guard Active Protection:</strong> {coverRejectedCount} unevidenced statement(s) or invented number(s) were automatically stripped from the generated letter to ensure you never make ungrounded claims.
                          </div>
                        </div>
                      )}

                      {/* Interactive Document Sheet Canvas */}
                      <div className="card p-8 bg-white border-slate-200 shadow-sm space-y-6 max-w-4xl mx-auto font-sans">
                        {/* Letter Candidate Header */}
                        <div className="border-b border-slate-200 pb-4 text-slate-800 space-y-1">
                          <h4 className="text-xl font-bold text-slate-900">
                            {resume?.personal?.fullName || 'Candidate Full Name'}
                          </h4>
                          <p className="text-xs text-slate-500">
                            {[resume?.personal?.email, resume?.personal?.phone, resume?.personal?.location].filter(Boolean).join('  |  ')}
                          </p>
                          <p className="text-xs text-slate-400">
                            Date: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        </div>

                        {/* Greeting Input */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Salutation / Greeting
                          </label>
                          <input
                            className="input w-full text-sm font-semibold text-slate-900 bg-slate-50/50"
                            value={coverLetter.greeting}
                            onChange={(e) => {
                              setCoverLetter({ ...coverLetter, greeting: e.target.value });
                              setHasEditedCover(true);
                            }}
                          />
                        </div>

                        {/* Editable Paragraphs */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              Letter Body Paragraphs ({coverLetter.paragraphs.length})
                            </label>
                            <span className="text-[11px] text-slate-400">
                              Click any paragraph to edit directly
                            </span>
                          </div>

                          {coverLetter.paragraphs.map((p, idx) => (
                            <div key={idx} className="relative group border border-slate-200 rounded-xl p-3 bg-slate-50/30 hover:border-slate-300 transition space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                                <span>
                                  {idx === 0
                                    ? 'Paragraph 1: Opening Hook & Role Alignment'
                                    : idx === 1
                                    ? 'Paragraph 2: Strongest Evidenced Experience Match'
                                    : idx === 2
                                    ? 'Paragraph 3: Broader Value & Capabilities'
                                    : 'Paragraph 4: Call to Action & Conclusion'}
                                </span>
                                {coverLetter.paragraphs.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveParagraph(idx)}
                                    className="text-slate-400 hover:text-red-600 text-xs transition"
                                    title="Remove this paragraph"
                                  >
                                    ✕ Remove
                                  </button>
                                )}
                              </div>
                              <textarea
                                className="input w-full text-xs leading-relaxed text-slate-800 bg-white min-h-[90px]"
                                value={p}
                                onChange={(e) => handleParagraphChange(idx, e.target.value)}
                              />
                            </div>
                          ))}

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={handleAddParagraph}
                              className="text-xs font-semibold text-teal-700 hover:text-teal-900 border border-teal-200 bg-teal-50/50 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition"
                            >
                              + Add Paragraph
                            </button>
                          </div>
                        </div>

                        {/* Closing Input */}
                        <div className="space-y-1 pt-2 border-t border-slate-100">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Sign-off &amp; Signature
                          </label>
                          <textarea
                            className="input w-full text-sm font-medium text-slate-800 bg-slate-50/50 min-h-[60px]"
                            value={coverLetter.closing}
                            onChange={(e) => {
                              setCoverLetter({ ...coverLetter, closing: e.target.value });
                              setHasEditedCover(true);
                            }}
                          />
                        </div>
                      </div>

                      {/* ResumeSkills Framework Reference Card */}
                      <div className="card p-6 bg-slate-50 border-slate-200 shadow-sm space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <span>💡</span> Why This Cover Letter Converts (ResumeSkills Methodology)
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-2 text-xs text-slate-600">
                          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                            <strong className="text-slate-900">Specific Opening Hook:</strong> Grabs attention immediately by connecting your real background with the target company&apos;s mission instead of generic pleasantries.
                          </div>
                          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                            <strong className="text-slate-900">Direct Qualification Match:</strong> Connects their primary requirement to your top achievement using Google X-Y-Z formula metrics.
                          </div>
                          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                            <strong className="text-slate-900">Honest Competency Framing:</strong> Highlights transferable strengths without inventing unevidenced skills.
                          </div>
                          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                            <strong className="text-slate-900">Zero Hallucination Guarantee:</strong> Every claim in this letter matches your verified Master CV facts, ensuring interview readiness.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Truth Guard Audit */}
              {activeTab === 'truth' && (
                <div className="card p-6 bg-white border-slate-200 space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Truth Guard™ Audit Log</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Rewritten bullets are checked for unevidenced technologies and numbers against source CV facts.</p>
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
                          <div className="flex items-center gap-1.5">
                            {log.provenance && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                log.provenance === 'candidate_attested'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : log.provenance === 'source_cv'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}>
                                {log.provenance === 'candidate_attested'
                                  ? 'Candidate-Attested'
                                  : log.provenance === 'source_cv'
                                  ? 'Source CV'
                                  : 'AI-Derived'}
                              </span>
                            )}
                            <span className="text-brand-600 uppercase text-[10px] bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                              {log.label || log.type}
                            </span>
                          </div>
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

              {/* Modal: Tailor to Job */}
              {showTailorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
                  <div className="card w-full max-w-xl bg-white shadow-2xl border-slate-200 p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">⚡</span>
                        <div>
                          <h3 className="text-base font-bold text-slate-900">Tailor Resume to Target Job</h3>
                          <p className="text-xs text-slate-500">Align your bullet points with the role while Truth Guard checks factual grounding against your CV.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowTailorModal(false)}
                        className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1"
                        aria-label="Close tailor modal"
                      >
                        ✕
                      </button>
                    </div>

                    {tailorError && (
                      <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                        {tailorError}
                      </div>
                    )}

                    <div className="space-y-3">
                      {/* Presets in Tailor Modal */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <span>⚡</span> Quick-Fill Sample Preset:
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">Fictional roles</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {SAMPLE_JD_PRESETS.map((preset) => (
                            <button
                              key={`modal-${preset.id}`}
                              type="button"
                              onClick={() => {
                                setTailorTargetRole(preset.roleTitle);
                                setTailorJobText(preset.jobText);
                              }}
                              className="px-2.5 py-1 rounded-md bg-white border border-slate-300 text-xs text-slate-800 hover:bg-teal-50 hover:border-teal-400 transition shadow-2xs cursor-pointer"
                              aria-label={`Fill target role with sample ${preset.title}`}
                            >
                              {preset.title}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label htmlFor="tailor-target-role" className="label text-xs font-bold text-slate-700">Target Role / Job Title</label>
                        <input
                          id="tailor-target-role"
                          className="input w-full text-xs"
                          placeholder="e.g. Senior Frontend Engineer"
                          value={tailorTargetRole}
                          onChange={(e) => setTailorTargetRole(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="tailor-job-text" className="label text-xs font-bold text-slate-700">Job Description / Requirements</label>
                        <textarea
                          id="tailor-job-text"
                          className="input w-full text-xs min-h-[120px]"
                          placeholder="Paste the target job description or requirements here..."
                          value={tailorJobText}
                          onChange={(e) => setTailorJobText(e.target.value)}
                        />
                      </div>
                    </div>

                    {isTailoring && (
                      <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3 animate-in fade-in">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-teal-400">⚡ NVIDIA Nemotron Deep Reasoning in Progress</span>
                          <span className="text-slate-400 font-mono">{tailoringElapsedSeconds}s elapsed</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-200">
                          <Spinner className="h-4 w-4 text-teal-400 shrink-0" />
                          <span>{tailoringStageText}</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden relative">
                          <div className="bg-teal-400 h-1.5 w-1/3 rounded-full animate-pulse" />
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Single-request atomic processing: Backend evaluates job criteria, crafts targeted phrasing, and subjects rewritten skills and metrics to Truth Guard factual-grounding checks.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowTailorModal(false)}
                        disabled={isTailoring}
                        className="btn-ghost px-4 py-2 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleRunTailoring}
                        disabled={isTailoring}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                      >
                        {isTailoring ? (
                          <>
                            <Spinner className="h-4 w-4" /> Tailoring with Nemotron AI...
                          </>
                        ) : (
                          <>⚡ Run AI Tailoring</>
                        )}
                      </button>
                    </div>
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