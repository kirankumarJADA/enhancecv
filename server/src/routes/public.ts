// Curevo AI — Public Stateless Resume API powered by NVIDIA Nemotron.
//
// 100% in-memory, zero-database, zero-disk, no-login resume architecture.
// Implements:
//   - POST /api/public/parse   (PDF/DOCX/TXT upload -> hardened parser -> ATS score)
//   - POST /api/public/ats     (Deterministic ATS analysis)
//   - POST /api/public/match   (Deterministic Job Match analysis)
//   - POST /api/public/improve (NVIDIA Nemotron resume rebuild + Truth Guard + ATS)
//   - POST /api/public/create  (NVIDIA Nemotron resume creation from user facts)
//   - POST /api/public/pdf     (Stream PDF download across all 6 ATS-safe templates)

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { extractFile } from '../engine/extract';
import { analyseATS } from '../engine/ats';
import { analyseJobDescription } from '../engine/jd';
import { computeJobMatch } from '../engine/match';
import { runResumeAgent } from '../ai/resumeAgent';
import { createResumeFromDetails, CreateResumeDetails } from '../ai/createAgent';
import { renderResumePdf, pdfFileName } from '../engine/pdf';
import { rateLimit } from '../middleware/rateLimit';
import { AppError } from '../middleware/errors';
import { AiUnavailableError, getAiStatus } from '../ai/provider';
import type { ResumeData, JobAnalysis } from '../types';

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

      let job: JobAnalysis;
      if (jobText) {
        job = analyseJobDescription(jobText);
      } else {
        job = {
          title: resume.personal.headline || 'General applications',
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

      const stream = renderResumePdf(resume, { template });
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

export default router;
