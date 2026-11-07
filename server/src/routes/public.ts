// Curevo AI — Public Stateless Resume API powered by NVIDIA Nemotron.
//
// 100% in-memory, zero-database, zero-disk, no-login resume architecture.
// Implements:
//   - POST /api/public/parse   (PDF/DOCX/TXT upload -> hardened parser -> ATS score)
//   - POST /api/public/ats     (Deterministic ATS analysis)
//   - POST /api/public/match   (Deterministic Job Match analysis)
//   - POST /api/public/improve (NVIDIA Nemotron resume rebuild + Truth Guard + ATS)
//   - POST /api/public/create       (NVIDIA Nemotron resume creation from user facts)
//   - POST /api/public/pdf          (Stream PDF download across all 6 ATS-safe templates)
//   - POST /api/public/cover-letter (Truth-Guarded AI & ResumeSkills Cover Letter)
//   - POST /api/public/cover-letter/pdf (Stream ATS-safe Cover Letter PDF)

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { extractFile } from '../engine/extract';
import { analyseATS } from '../engine/ats';
import { analyseJobDescription } from '../engine/jd';
import { computeJobMatch } from '../engine/match';
import { runResumeAgent } from '../ai/resumeAgent';
import { createResumeFromDetails, CreateResumeDetails } from '../ai/createAgent';
import { generateCoverLetter, CoverLetter } from '../ai/coverLetterAgent';
import { renderResumePdf, pdfFileName, renderCoverLetterPdf, coverLetterFileName } from '../engine/pdf';
import { rateLimit } from '../middleware/rateLimit';
import { AppError } from '../middleware/errors';
import { AiUnavailableError, getAiStatus } from '../ai/provider';
import { getJobSourceProvider, isJobSourceConfigured, searchJobsWithCache } from '../lib/jobSource';
import { CURATED_JOBS } from '../data/curatedJobs';
import {
  generateInterviewPrep,
  evaluateStarAnswer,
  evaluateMockAnswer,
  generateFinalMockReport,
  INTERVIEW_CATEGORIES,
  type StarAnswerInput,
} from '../ai/interviewAgent';
import {
  optimizePublicLinkedin,
  generateDeterministicLinkedin,
  type PublicLinkedinInput,
} from '../ai/publicLinkedinAgent';
import {
  researchCompany,
  CURATED_COMPANY_RESEARCH,
} from '../ai/companyResearchAgent';
import { isWebSearchConfigured, resolveSearchProvider } from '../lib/webSearch';
import { sendEmail, isEmailConfigured } from '../lib/email';
import type { ResumeData, JobAnalysis, PageSize } from '../types';

const router = Router();

// Public status endpoint reporting provider, model and timeout (no secrets)
router.get('/status', (_req: Request, res: Response) => {
  res.json(getAiStatus());
});

// ---------------------------------------------------------------------------
// Upload Configuration: Memory storage only, 8MB max, PDF/DOCX/TXT only
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isSupported = /\.(pdf|docx|txt)$/i.test(file.originalname);
    if (!isSupported) {
      cb(new AppError('UNSUPPORTED_FILE_TYPE', 'Unsupported file type. Please upload a PDF, DOCX or TXT file.', 400));
      return;
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// In-Memory Concurrency Guard for AI Endpoints
// Bounds concurrent requests globally and per IP to prevent exhaustion
// ---------------------------------------------------------------------------
let activeAiRequests = 0;
const activePerIp = new Map<string, number>();
const MAX_GLOBAL_CONCURRENT = 5;
const MAX_PER_IP_CONCURRENT = 1;

export function aiConcurrencyGuard(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const ipActive = activePerIp.get(ip) || 0;

  if (ipActive >= MAX_PER_IP_CONCURRENT || activeAiRequests >= MAX_GLOBAL_CONCURRENT) {
    res.status(429).json({
      error: {
        code: 'CONCURRENCY_LIMIT',
        message: 'An AI request is already processing. Please wait for it to complete.',
      },
    });
    return;
  }

  activeAiRequests++;
  activePerIp.set(ip, ipActive + 1);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeAiRequests = Math.max(0, activeAiRequests - 1);
    const count = activePerIp.get(ip) || 1;
    if (count <= 1) {
      activePerIp.delete(ip);
    } else {
      activePerIp.set(ip, count - 1);
    }
  };

  res.on('finish', release);
  res.on('close', release);
  next();
}

/** Test hook to clear active AI concurrency tracking. */
export function __resetConcurrencyForTests(): void {
  activeAiRequests = 0;
  activePerIp.clear();
}

// ---------------------------------------------------------------------------
// Centralized Error Mapping for Public Endpoints
// ---------------------------------------------------------------------------
function handlePublicError(err: unknown, res: Response): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof AiUnavailableError) {
    let status = 503;
    if (err.code === 'AI_TIMEOUT') status = 504;
    else if (err.code === 'AI_RATE_LIMITED') status = 429;
    else if (err.code === 'AI_MALFORMED' || err.code === 'AI_PROVIDER_ERROR') status = 502;
    res.status(status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'The uploaded file exceeds the 8MB size limit.',
        },
      });
      return;
    }
    res.status(400).json({
      error: {
        code: 'UPLOAD_ERROR',
        message: err.message,
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Request could not be processed.',
    },
  });
}

function validateResume(data: unknown): ResumeData {
  if (!data || typeof data !== 'object') {
    throw new AppError('VALIDATION_ERROR', 'A valid resume object is required.', 400);
  }
  const resume = data as ResumeData;
  if (!resume.personal || !resume.personal.fullName || typeof resume.personal.fullName !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Resume must contain personal.fullName.', 400);
  }
  if (!resume.experience) resume.experience = [];
  if (!resume.education) resume.education = [];
  if (!resume.skills) resume.skills = { technical: [], soft: [] };
  if (!resume.projects) resume.projects = [];
  if (!resume.certifications) resume.certifications = [];
  if (!resume.languages) resume.languages = [];
  if (!resume.achievements) resume.achievements = [];
  if (!resume.customSections) resume.customSections = [];
  if (!resume.sectionOrder) {
    resume.sectionOrder = ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'];
  }
  if (!resume.hiddenSections) resume.hiddenSections = [];
  return resume;
}

function validateCoverLetter(data: unknown): CoverLetter {
  if (!data || typeof data !== 'object') {
    throw new AppError('VALIDATION_ERROR', 'A valid cover letter object is required.', 400);
  }
  const l = data as Record<string, unknown>;
  if (!l.greeting || typeof l.greeting !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Cover letter must contain a greeting string.', 400);
  }
  if (!Array.isArray(l.paragraphs) || l.paragraphs.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Cover letter must contain an array of paragraphs.', 400);
  }
  for (const p of l.paragraphs) {
    if (typeof p !== 'string' || p.trim().length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Each paragraph in the cover letter must be a non-empty string.', 400);
    }
  }
  if (!l.closing || typeof l.closing !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Cover letter must contain a closing string.', 400);
  }
  return {
    greeting: l.greeting.trim(),
    paragraphs: l.paragraphs.map((p) => (p as string).trim()),
    closing: l.closing.trim(),
  };
}

// ---------------------------------------------------------------------------
// 1. POST /api/public/parse
// Uploads file into memory -> hardened parser -> initial ATS scoring
// ---------------------------------------------------------------------------
router.post(
  '/parse',
  rateLimit({ windowMs: 15 * 60_000, max: 20 }),
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err) => {
      if (err) return handlePublicError(err, res);
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        throw new AppError('UNSUPPORTED_FILE_TYPE', 'No file uploaded. Please upload a PDF, DOCX or TXT file.', 400);
      }
      const extraction = await extractFile(req.file);
      const ats = analyseATS(extraction.resume, {
        resume: extraction.resume,
        parserNotes: extraction.notes,
        extractionConfidence: extraction.confidence,
      });

      res.json({
        resume: extraction.resume,
        ats,
        audit: ats.audit,
        confidence: extraction.confidence,
        notes: extraction.notes,
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 2. POST /api/public/ats
// Deterministic ATS score calculation for given resume data
// ---------------------------------------------------------------------------
router.post(
  '/ats',
  rateLimit({ windowMs: 15 * 60_000, max: 60 }),
  (req: Request, res: Response) => {
    try {
      const resume = validateResume(req.body.resume);
      const ats = analyseATS(resume);
      res.json({ ats, audit: ats.audit });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 2b. POST /api/public/audit
// Dedicated endpoint for the Advanced ATS Audit across 9 dimensions
// ---------------------------------------------------------------------------
router.post(
  '/audit',
  rateLimit({ windowMs: 15 * 60_000, max: 60 }),
  (req: Request, res: Response) => {
    try {
      const resume = validateResume(req.body.resume);
      const ats = analyseATS(resume);
      res.json({ audit: ats.audit, ats });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 3. POST /api/public/match
// Job Description match analysis (JD skills & keyword coverage)
// ---------------------------------------------------------------------------
router.post(
  '/match',
  rateLimit({ windowMs: 15 * 60_000, max: 60 }),
  (req: Request, res: Response) => {
    try {
      const resume = validateResume(req.body.resume);
      const jobText = typeof req.body.jobText === 'string' ? req.body.jobText.trim() : '';

      if (!jobText) {
        res.json({
          job: null,
          match: null,
          message: 'No job description provided.',
        });
        return;
      }

      const job = analyseJobDescription(jobText);
      const match = computeJobMatch(resume, job);
      res.json({ job, match });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 4. POST /api/public/improve
// NVIDIA Nemotron AI rebuilds the resume, validated by Truth Guard
// ---------------------------------------------------------------------------
router.post(
  '/improve',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  aiConcurrencyGuard,
  async (req: Request, res: Response) => {
    try {
      const resume = validateResume(req.body.resume);
      const jobText = typeof req.body.jobText === 'string' ? req.body.jobText.trim() : '';
      const explicitRole = typeof req.body.targetRole === 'string' ? req.body.targetRole.trim() : '';

      let job: JobAnalysis;
      if (jobText) {
        job = analyseJobDescription(jobText);
        if (explicitRole) {
          job.title = explicitRole;
        }
      } else {
        job = {
          title: explicitRole || resume.personal.headline || 'General applications',
          company: '',
          seniority: 'Not specified',
          yearsRequired: null,
          requiredSkills: resume.skills.technical.slice(0, 5),
          preferredSkills: [],
          softSkills: [],
          responsibilities: [],
          educationRequirements: [],
          certificationRequirements: [],
          keywords: [],
          domainTerms: [],
        };
      }

      const atsBefore = analyseATS(resume);
      const matchBefore = computeJobMatch(resume, job);

      const result = await runResumeAgent(resume, job, jobText, matchBefore, atsBefore, { requireAi: true });

      res.json({
        resume: result.resume,
        targetRole: result.targetRole || (job.title !== 'General applications' ? job.title : undefined),
        changeLog: result.changeLog,
        truth: result.truth,
        atsBefore,
        atsAfter: result.atsAfter,
        matchBefore,
        matchAfter: result.matchAfter,
        agent: result.agent,
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 5. POST /api/public/create
// Creates a new finished resume from supplied facts using NVIDIA Nemotron
// ---------------------------------------------------------------------------
router.post(
  '/create',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  aiConcurrencyGuard,
  async (req: Request, res: Response) => {
    try {
      const details = req.body.details as CreateResumeDetails;
      if (!details || typeof details !== 'object') {
        throw new AppError('VALIDATION_ERROR', 'Details object is required.', 400);
      }

      const jobText = typeof req.body.jobText === 'string' ? req.body.jobText.trim() : undefined;
      const result = await createResumeFromDetails(details, jobText);

      res.json({
        resume: result.resume,
        ats: result.ats,
        match: result.match,
        changeLog: result.changeLog,
        truth: result.truth,
        agent: result.agent,
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 6. POST /api/public/pdf
// Renders and streams downloadable PDF across all 6 ATS-safe templates
// ---------------------------------------------------------------------------
const ALLOWED_TEMPLATES = new Set([
  'classic',
  'modern',
  'minimal',
  'professional',
  'technical',
  'executive',
]);

router.post(
  '/pdf',
  rateLimit({ windowMs: 15 * 60_000, max: 30 }),
  (req: Request, res: Response) => {
    try {
      const resume = validateResume(req.body.resume);
      const template = (req.body.template || 'classic').toString().toLowerCase();

      if (!ALLOWED_TEMPLATES.has(template)) {
        throw new AppError(
          'INVALID_TEMPLATE',
          `Invalid template. Supported templates: ${Array.from(ALLOWED_TEMPLATES).join(', ')}`,
          400
        );
      }

      let marginDensity: 'compact' | 'normal' | 'spacious' | undefined = undefined;
      if (req.body.marginDensity) {
        const md = req.body.marginDensity.toString().toLowerCase();
        if (md === 'compact' || md === 'normal' || md === 'spacious') {
          marginDensity = md;
        } else {
          throw new AppError('INVALID_MARGIN_DENSITY', 'Supported margin densities: compact, normal, spacious', 400);
        }
      }

      let pageSize: PageSize = 'A4';
      if (req.body.pageSize !== undefined && req.body.pageSize !== null) {
        if (typeof req.body.pageSize !== 'string') {
          throw new AppError('VALIDATION_ERROR', 'Invalid pageSize. Supported values are A4 and LETTER.', 400);
        }
        const ps = req.body.pageSize.trim().toUpperCase();
        if (ps === 'A4' || ps === 'LETTER') {
          pageSize = ps as PageSize;
        } else {
          throw new AppError('VALIDATION_ERROR', 'Invalid pageSize. Supported values are A4 and LETTER.', 400);
        }
      }

      const stream = renderResumePdf(resume, { template, marginDensity, pageSize });
      const filename = pdfFileName(resume, req.body.role);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

      stream.pipe(res);
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 7. POST /api/public/cover-letter
// Generates a tailored, Truth-Guarded cover letter from candidate resume facts
// using the ResumeSkills framework
// ---------------------------------------------------------------------------
router.post(
  '/cover-letter',
  rateLimit({ windowMs: 15 * 60_000, max: 20 }),
  aiConcurrencyGuard,
  async (req: Request, res: Response) => {
    try {
      const resume = validateResume(req.body.resume);

      // Verify sufficient candidate background facts
      const hasExp =
        Array.isArray(resume.experience) &&
        resume.experience.length > 0 &&
        resume.experience.some((e) => (Array.isArray(e.bullets) && e.bullets.length > 0) || Boolean(e.title));
      const hasSummary = Boolean(resume.summary && resume.summary.trim().length > 10);
      const hasSkills = Boolean(resume.skills && Array.isArray(resume.skills.technical) && resume.skills.technical.length > 0);

      if (!hasExp && !hasSummary && !hasSkills) {
        throw new AppError(
          'INSUFFICIENT_INPUT',
          'Resume has insufficient background facts to generate a tailored cover letter. Please add work experience, a summary, or technical skills.',
          400
        );
      }

      const jdText =
        typeof req.body.jobDescription === 'string' && req.body.jobDescription.trim().length > 0
          ? req.body.jobDescription.slice(0, 10_000)
          : null;

      let job: JobAnalysis | null = null;
      let match: { matched: string[]; missing: string[] } | undefined = undefined;

      if (jdText) {
        job = analyseJobDescription(jdText);
        const matchRes = computeJobMatch(resume, job);
        match = {
          matched: matchRes.matchedSkills,
          missing: matchRes.missingSkills,
        };
      }

      const targetRole =
        typeof req.body.targetRole === 'string' && req.body.targetRole.trim()
          ? req.body.targetRole.trim().slice(0, 120)
          : job?.title || '';

      const company =
        typeof req.body.company === 'string' && req.body.company.trim()
          ? req.body.company.trim().slice(0, 120)
          : job?.company || '';

      const tone =
        typeof req.body.tone === 'string' && req.body.tone.trim()
          ? req.body.tone.trim().slice(0, 40)
          : 'professional';

      const result = await generateCoverLetter({
        master: resume,
        resume,
        job,
        jdText,
        targetRole,
        company,
        tone,
        match,
        fallbackOnAiFailure: true,
      });

      res.json({
        letter: result.letter,
        targetRole: targetRole || undefined,
        company: company || undefined,
        rejectedCount: result.rejectedCount,
        warnings: result.warnings || [],
        provider: result.provider,
        model: result.model,
        isFallback: Boolean(result.isFallback),
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 8. POST /api/public/cover-letter/pdf
// Renders and streams ATS-safe Cover Letter PDF with selectable text
// Supports A4 and US Letter page sizes
// ---------------------------------------------------------------------------
router.post(
  '/cover-letter/pdf',
  rateLimit({ windowMs: 15 * 60_000, max: 30 }),
  (req: Request, res: Response) => {
    try {
      const letter = validateCoverLetter(req.body.letter);
      const candidateName = typeof req.body.candidateName === 'string' && req.body.candidateName.trim()
        ? req.body.candidateName.trim()
        : 'Candidate';
      const role = typeof req.body.role === 'string' && req.body.role.trim() ? req.body.role.trim() : undefined;
      const company = typeof req.body.company === 'string' && req.body.company.trim() ? req.body.company.trim() : undefined;

      let pageSize: PageSize = 'A4';
      if (req.body.pageSize !== undefined && req.body.pageSize !== null) {
        if (typeof req.body.pageSize !== 'string') {
          throw new AppError('VALIDATION_ERROR', 'Invalid pageSize. Supported values are A4 and LETTER.', 400);
        }
        const ps = req.body.pageSize.trim().toUpperCase();
        if (ps === 'A4' || ps === 'LETTER') {
          pageSize = ps as PageSize;
        } else {
          throw new AppError('VALIDATION_ERROR', 'Invalid pageSize. Supported values are A4 and LETTER.', 400);
        }
      }

      const stream = renderCoverLetterPdf(letter, candidateName, pageSize);
      const filename = coverLetterFileName(candidateName, role, company);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

      stream.pipe(res);
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 7. GET /api/public/jobs/status
// Reports whether an external live jobs API provider is configured
// ---------------------------------------------------------------------------
router.get('/jobs/status', (_req: Request, res: Response) => {
    const provider = getJobSourceProvider();
    const configured = isJobSourceConfigured();
    res.json({
      ok: true,
      configured,
      isConfigured: configured,
      provider: configured ? 'live-api' : 'curated-presets',
      providerId: provider.id,
      providerName: provider.name,
      message: configured
        ? `Connected to ${provider.name}`
        : 'Live job provider not configured in environment. Displaying realistic curated benchmark roles.',
    });
  });

// ---------------------------------------------------------------------------
// 8. POST /api/public/jobs/discover
// Public, login-free job discovery with search, filtering, and curated benchmark fallback
// ---------------------------------------------------------------------------
router.post(
  '/jobs/discover',
  rateLimit({ windowMs: 15 * 60_000, max: 60 }),
  async (req: Request, res: Response) => {
    try {
      const query = typeof req.body.query === 'string' ? req.body.query.trim().toLowerCase() : '';
      const location = typeof req.body.location === 'string' ? req.body.location.trim().toLowerCase() : '';
      const remoteType = typeof req.body.remoteType === 'string' ? req.body.remoteType.trim().toLowerCase() : '';
      const employmentType = typeof req.body.employmentType === 'string' ? req.body.employmentType.trim().toLowerCase() : '';
      const limit = typeof req.body.limit === 'number' && req.body.limit > 0 ? Math.min(req.body.limit, 50) : 20;

      if (isJobSourceConfigured()) {
        const provider = getJobSourceProvider();
        const results = await searchJobsWithCache(
          {
            keywords: query,
            location: location || undefined,
            remoteType: remoteType || undefined,
            employmentType: employmentType || undefined,
          },
          limit
        );
        res.json({
          ok: true,
          jobs: results,
          total: results.length,
          source: provider.id,
          provider: provider.id,
          providerName: provider.name,
          configured: true,
          isConfigured: true,
        });
        return;
      }

      let filtered = CURATED_JOBS;
      if (query) {
        filtered = filtered.filter(
          (j) =>
            j.title.toLowerCase().includes(query) ||
            j.company.toLowerCase().includes(query) ||
            j.description.toLowerCase().includes(query) ||
            j.technologies.some((t) => t.toLowerCase().includes(query))
        );
      }
      if (location) {
        filtered = filtered.filter((j) => j.location.toLowerCase().includes(location));
      }
      if (remoteType && remoteType !== 'all') {
        filtered = filtered.filter((j) => j.remote_type.toLowerCase() === remoteType);
      }
      if (employmentType && employmentType !== 'all') {
        filtered = filtered.filter((j) => j.employment_type.toLowerCase() === employmentType);
      }

      res.json({
        ok: true,
        jobs: filtered.slice(0, limit),
        total: filtered.length,
        source: 'curated-presets',
        configured: false,
        isConfigured: false,
        message: 'Live job provider not configured in environment. Displaying realistic curated benchmark roles.',
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);


// ---------------------------------------------------------------------------
// Helper: safe resume normalization
// ---------------------------------------------------------------------------
function getSafeResume(raw: any): ResumeData {
  if (raw && typeof raw === 'object' && Array.isArray(raw.experience) && Array.isArray(raw.sectionOrder)) {
    return raw as ResumeData;
  }
  return {
    personal: {
      fullName: raw?.personal?.fullName || '',
      email: raw?.personal?.email || '',
      phone: raw?.personal?.phone || '',
      location: raw?.personal?.location || '',
      headline: raw?.personal?.headline || '',
    },
    summary: raw?.summary || '',
    experience: Array.isArray(raw?.experience) ? raw.experience : [],
    education: Array.isArray(raw?.education) ? raw.education : [],
    skills: {
      technical: Array.isArray(raw?.skills?.technical) ? raw.skills.technical : [],
      soft: Array.isArray(raw?.skills?.soft) ? raw.skills.soft : [],
    },
    projects: Array.isArray(raw?.projects) ? raw.projects : [],
    certifications: Array.isArray(raw?.certifications) ? raw.certifications : [],
    languages: Array.isArray(raw?.languages) ? raw.languages : [],
    achievements: Array.isArray(raw?.achievements) ? raw.achievements : [],
    customSections: Array.isArray(raw?.customSections) ? raw.customSections : [],
    sectionOrder: Array.isArray(raw?.sectionOrder) ? raw.sectionOrder : [
      'summary',
      'experience',
      'projects',
      'skills',
      'education',
      'certifications',
      'languages',
      'achievements',
    ],
    hiddenSections: Array.isArray(raw?.hiddenSections) ? raw.hiddenSections : [],
  };
}

// ---------------------------------------------------------------------------
// 9. GET /api/public/interview/status
// ---------------------------------------------------------------------------
router.get('/interview/status', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    ai: getAiStatus(),
    categories: INTERVIEW_CATEGORIES,
    framework: 'STAR (Situation, Task, Action, Result)',
  });
});

// ---------------------------------------------------------------------------
// 10. POST /api/public/interview/prep
// Generate role-specific, truth-grounded interview questions & study plan
// ---------------------------------------------------------------------------
router.post(
  '/interview/prep',
  rateLimit({ windowMs: 15 * 60_000, max: 60 }),
  aiConcurrencyGuard,
  async (req: Request, res: Response) => {
    try {
      const resume = getSafeResume(req.body.resume);
      const jdText =
        typeof req.body.jobDescription === 'string' && req.body.jobDescription.trim().length > 0
          ? req.body.jobDescription.slice(0, 10_000)
          : typeof req.body.jdText === 'string' && req.body.jdText.trim().length > 0
          ? req.body.jdText.slice(0, 10_000)
          : null;

      let job: JobAnalysis | null = null;
      let match: any = undefined;

      if (jdText) {
        job = analyseJobDescription(jdText);
        match = computeJobMatch(resume, job);
      }

      const targetRole =
        typeof req.body.targetRole === 'string' && req.body.targetRole.trim()
          ? req.body.targetRole.trim().slice(0, 120)
          : job?.title || '';

      const company =
        typeof req.body.company === 'string' && req.body.company.trim()
          ? req.body.company.trim().slice(0, 120)
          : job?.company || '';

      const prep = await generateInterviewPrep({
        master: resume,
        resume,
        job,
        jdText,
        match,
        targetRole,
        company,
      });

      res.json({
        ok: true,
        ...prep,
        targetRole: targetRole || undefined,
        company: company || undefined,
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 11. POST /api/public/interview/star-coach
// Interactive STAR answer evaluator with Truth Guard check
// ---------------------------------------------------------------------------
router.post(
  '/interview/star-coach',
  rateLimit({ windowMs: 15 * 60_000, max: 60 }),
  aiConcurrencyGuard,
  async (req: Request, res: Response) => {
    try {
      const question = typeof req.body.question === 'string' ? req.body.question.trim().slice(0, 600) : '';
      if (!question) {
        res.status(400).json({ error: { code: 'INVALID_QUESTION', message: 'Interview question is required.' } });
        return;
      }

      const starRaw = req.body.star || {};
      const star: StarAnswerInput = {
        situation: typeof starRaw.situation === 'string' ? starRaw.situation.trim().slice(0, 1500) : '',
        task: typeof starRaw.task === 'string' ? starRaw.task.trim().slice(0, 1500) : '',
        action: typeof starRaw.action === 'string' ? starRaw.action.trim().slice(0, 2500) : '',
        result: typeof starRaw.result === 'string' ? starRaw.result.trim().slice(0, 1500) : '',
      };

      if (!star.situation && !star.task && !star.action && !star.result) {
        res.status(400).json({
          error: { code: 'EMPTY_STAR_ANSWER', message: 'At least one STAR component must be provided.' },
        });
        return;
      }

      const resume = getSafeResume(req.body.resume);
      const jdText =
        typeof req.body.jobDescription === 'string' && req.body.jobDescription.trim().length > 0
          ? req.body.jobDescription.slice(0, 10_000)
          : null;

      let job: JobAnalysis | null = null;
      if (jdText) {
        job = analyseJobDescription(jdText);
      }

      const evaluation = await evaluateStarAnswer({
        master: resume,
        resume,
        job,
        jdText,
        question,
        star,
      });

      res.json({
        ok: true,
        ...evaluation,
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 12. POST /api/public/interview/mock-evaluate
// Single question evaluator for interactive mock interview simulations
// ---------------------------------------------------------------------------
router.post(
  '/interview/mock-evaluate',
  rateLimit({ windowMs: 15 * 60_000, max: 60 }),
  aiConcurrencyGuard,
  async (req: Request, res: Response) => {
    try {
      const question = typeof req.body.question === 'string' ? req.body.question.trim().slice(0, 600) : '';
      const answer = typeof req.body.answer === 'string' ? req.body.answer.trim().slice(0, 4000) : '';

      if (!question) {
        res.status(400).json({ error: { code: 'INVALID_QUESTION', message: 'Interview question is required.' } });
        return;
      }
      if (!answer) {
        res.status(400).json({ error: { code: 'EMPTY_ANSWER', message: 'Candidate answer is required.' } });
        return;
      }

      const difficulty =
        typeof req.body.difficulty === 'string' ? req.body.difficulty.trim().slice(0, 30) : undefined;
      const questionNumber = typeof req.body.questionNumber === 'number' ? req.body.questionNumber : undefined;
      const totalQuestions = typeof req.body.totalQuestions === 'number' ? req.body.totalQuestions : undefined;

      const resume = getSafeResume(req.body.resume);
      const jdText =
        typeof req.body.jobDescription === 'string' && req.body.jobDescription.trim().length > 0
          ? req.body.jobDescription.slice(0, 10_000)
          : null;

      let job: JobAnalysis | null = null;
      if (jdText) {
        job = analyseJobDescription(jdText);
      }

      const evaluation = await evaluateMockAnswer({
        master: resume,
        resume,
        job,
        jdText,
        question,
        answer,
        difficulty,
        questionNumber,
        totalQuestions,
      });

      res.json({
        ok: true,
        ...evaluation,
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 13. POST /api/public/interview/mock-final
// Comprehensive final performance report for completed mock interview sessions
// ---------------------------------------------------------------------------
router.post(
  '/interview/mock-final',
  rateLimit({ windowMs: 15 * 60_000, max: 60 }),
  aiConcurrencyGuard,
  async (req: Request, res: Response) => {
    try {
      const rawQa = req.body.questionsAndAnswers;
      if (!Array.isArray(rawQa) || rawQa.length === 0) {
        res.status(400).json({
          error: {
            code: 'INVALID_TRANSCRIPT',
            message: 'A non-empty array of questions and answers is required to generate the final report.',
          },
        });
        return;
      }

      const questionsAndAnswers = rawQa.map((item: any) => ({
        question: typeof item.question === 'string' ? item.question.slice(0, 600) : '',
        category: typeof item.category === 'string' ? item.category.slice(0, 50) : 'General',
        answer: typeof item.answer === 'string' ? item.answer.slice(0, 4000) : '',
        evaluation: item.evaluation,
      }));

      const difficulty =
        typeof req.body.difficulty === 'string' ? req.body.difficulty.trim().slice(0, 30) : undefined;

      const resume = getSafeResume(req.body.resume);
      const jdText =
        typeof req.body.jobDescription === 'string' && req.body.jobDescription.trim().length > 0
          ? req.body.jobDescription.slice(0, 10_000)
          : null;

      let job: JobAnalysis | null = null;
      if (jdText) {
        job = analyseJobDescription(jdText);
      }

      const report = await generateFinalMockReport({
        master: resume,
        resume,
        job,
        jdText,
        questionsAndAnswers,
        difficulty,
      });

      res.json({
        ok: true,
        ...report,
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 14. GET /api/public/linkedin/status
// Status of LinkedIn Optimization feature & AI availability
// ---------------------------------------------------------------------------
router.get('/linkedin/status', (_req: Request, res: Response) => {
  const ai = getAiStatus();
  res.json({
    ok: true,
    ai,
    supportedHeadlineStyles: [
      'Impact-Driven',
      'Skill-Focused',
      'Executive / Leadership',
      'Modern Specialist',
    ],
    supportedSections: ['Headline', 'About', 'Experience', 'Skills', 'Recruiter Keywords'],
  });
});

// ---------------------------------------------------------------------------
// 15. POST /api/public/linkedin/optimize
// 100% public, truth-grounded LinkedIn profile optimization & scoring
// ---------------------------------------------------------------------------
router.post(
  '/linkedin/optimize',
  rateLimit({ windowMs: 15 * 60_000, max: 60 }),
  aiConcurrencyGuard,
  async (req: Request, res: Response) => {
    try {
      const headline = typeof req.body.headline === 'string' ? req.body.headline.trim().slice(0, 300) : '';
      const about = typeof req.body.about === 'string' ? req.body.about.trim().slice(0, 4000) : '';
      const targetRole = typeof req.body.targetRole === 'string' ? req.body.targetRole.trim().slice(0, 150) : undefined;
      const industry = typeof req.body.industry === 'string' ? req.body.industry.trim().slice(0, 150) : undefined;
      const jobDescription = typeof req.body.jobDescription === 'string' ? req.body.jobDescription.trim().slice(0, 10_000) : undefined;

      let experience: Array<{ title: string; company: string; period?: string; bullets: string[] }> | undefined;
      if (Array.isArray(req.body.experience)) {
        experience = req.body.experience.map((e: any) => ({
          title: typeof e.title === 'string' ? e.title.slice(0, 100) : '',
          company: typeof e.company === 'string' ? e.company.slice(0, 100) : '',
          period: typeof e.period === 'string' ? e.period.slice(0, 50) : '',
          bullets: Array.isArray(e.bullets)
            ? e.bullets.map((b: any) => (typeof b === 'string' ? b.slice(0, 600) : '')).filter(Boolean)
            : [],
        }));
      }

      let skills: string[] | undefined;
      if (Array.isArray(req.body.skills)) {
        skills = req.body.skills.map((s: any) => (typeof s === 'string' ? s.trim().slice(0, 80) : '')).filter(Boolean);
      }

      const resume = getSafeResume(req.body.resume);

      const optimization = await optimizePublicLinkedin({
        headline,
        about,
        experience,
        skills,
        targetRole,
        industry,
        resume,
        jobDescription,
      });

      res.json({
        ok: true,
        ...optimization,
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 16. GET /api/public/company-research/status
// Status of company research web search provider & curated benchmark options
// ---------------------------------------------------------------------------
router.get('/company-research/status', (_req: Request, res: Response) => {
  const configured = isWebSearchConfigured();
  const provider = resolveSearchProvider();
  res.json({
    ok: true,
    configured,
    isConfigured: configured,
    provider: provider.id,
    curatedBenchmarkAvailable: true,
    curatedCompanies: ['Apex Cloud Systems', 'FinEdge Global'],
    message: configured
      ? 'Live web search provider active. Company research sourced from verified web results.'
      : 'Live web search provider not configured in environment. Displaying realistic curated benchmark company intelligence.',
  });
});

// ---------------------------------------------------------------------------
// 17. POST /api/public/company-research
// 100% public, source-grounded company intelligence
// ---------------------------------------------------------------------------
router.post(
  '/company-research',
  rateLimit({ windowMs: 15 * 60_000, max: 40 }),
  aiConcurrencyGuard,
  async (req: Request, res: Response) => {
    try {
      const company =
        typeof req.body.company === 'string' ? req.body.company.trim().slice(0, 200) : '';
      if (!company) {
        res.status(400).json({
          error: {
            code: 'INVALID_COMPANY',
            message: 'Company name is required for research.',
          },
        });
        return;
      }

      const jdText =
        typeof req.body.jobDescription === 'string' && req.body.jobDescription.trim().length > 0
          ? req.body.jobDescription.slice(0, 5000)
          : null;

      const research = await researchCompany({ company, jdText });

      res.json({
        ok: true,
        research,
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 18. GET /api/public/email/status
// Check email provider readiness (Phase 9K)
// ---------------------------------------------------------------------------
router.get('/email/status', (_req: Request, res: Response) => {
  const configured = isEmailConfigured();
  res.json({
    ok: true,
    configured,
    isConfigured: configured,
    provider: process.env.EMAIL_PROVIDER || 'console',
    message: configured
      ? 'Live email delivery is configured.'
      : 'Email service in preview mode (console output). No live email credentials configured.',
  });
});

// ---------------------------------------------------------------------------
// 19. POST /api/public/email/resume
// Explicit consent user-requested resume email dispatch (Phase 9K)
// ---------------------------------------------------------------------------
const emailResumeSchema = z.object({
  email: z.string().email('Please enter a valid email address.').max(254),
  candidateName: z.string().max(100).optional(),
  resumeSummary: z.string().max(3000),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'You must explicitly consent to receiving this email.' }),
  }),
});

router.post(
  '/email/resume',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  async (req: Request, res: Response) => {
    try {
      const parsed = emailResumeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_EMAIL_REQUEST',
            message: parsed.error.issues[0]?.message || 'Invalid email request.',
          },
        });
        return;
      }

      const { email, candidateName, resumeSummary } = parsed.data;
      const greeting = candidateName ? `Hi ${candidateName},` : 'Hello,';
      const text = `${greeting}

Here is a copy of your CV from Curevo AI:

${resumeSummary}

---
You requested this email from Curevo AI (https://enhancecv-orpin.vercel.app).
We respect your privacy: your email is never sold, shared, or retained for marketing.`;

      const result = await sendEmail({
        to: email,
        subject: `Your CV from Curevo AI${candidateName ? ` — ${candidateName}` : ''}`,
        text,
      });

      res.json({
        ok: true,
        delivered: result.delivered,
        provider: result.provider,
        message: result.delivered
          ? 'Resume successfully sent to your email.'
          : 'Email queued in preview mode (check server console for details).',
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 20. POST /api/public/email/interview-report
// Explicit consent user-requested interview report dispatch (Phase 9K)
// ---------------------------------------------------------------------------
const emailInterviewReportSchema = z.object({
  email: z.string().email('Please enter a valid email address.').max(254),
  role: z.string().max(100),
  overallScore: z.number().min(0).max(100).optional(),
  summary: z.string().max(4000),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'You must explicitly consent to receiving this email.' }),
  }),
});

router.post(
  '/email/interview-report',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  async (req: Request, res: Response) => {
    try {
      const parsed = emailInterviewReportSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'INVALID_REPORT_REQUEST',
            message: parsed.error.issues[0]?.message || 'Invalid interview report request.',
          },
        });
        return;
      }

      const { email, role, overallScore, summary } = parsed.data;
      const text = `Hello,

Here is your Interview Preparation & Mock Coaching Report for ${role} from Curevo AI:

${overallScore !== undefined ? `Overall Readiness Score: ${overallScore}/100\n\n` : ''}Key Findings & Recommendations:
${summary}

---
Generated by Curevo AI Interview Coach (https://enhancecv-orpin.vercel.app/interview).
Truth-grounded and privacy-first: your email is never shared or retained for marketing.`;

      const result = await sendEmail({
        to: email,
        subject: `Interview Coaching Report: ${role} — Curevo AI`,
        text,
      });

      res.json({
        ok: true,
        delivered: result.delivered,
        provider: result.provider,
        message: result.delivered
          ? 'Interview report successfully sent to your email.'
          : 'Report queued in preview mode (check server console for details).',
      });
    } catch (err) {
      handlePublicError(err, res);
    }
  }
);

// ---------------------------------------------------------------------------
// 21. GET /api/public/billing/status
// Reports public free tier guarantee and optional monetization readiness (Phase 9L)
// ---------------------------------------------------------------------------
router.get('/billing/status', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    freeForever: true,
    publicCoreGuarantee:
      'All core features (Resume Builder, ATS, Truth Guard, Job Discovery, Application Tracker, Interview Coach) are 100% free and open to everyone without login or credit card.',
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
  });
});

export default router;
