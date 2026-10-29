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

export default router;
