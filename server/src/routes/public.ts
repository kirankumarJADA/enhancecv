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
import type {
  ResumeData,
  JobAnalysis,
  PageSize,
  PersonalInfo,
  ExperienceItem,
  EducationItem,
  ProjectItem,
  CertificationItem,
  LanguageItem,
  CustomSection,
  SectionKey,
} from '../types';
import { DEFAULT_SECTION_ORDER } from '../types';

const router = Router();

// Public status endpoint reporting provider, model and timeout (no secrets)
router.get('/status', (_req: Request, res: Response) => {
  res.json(getAiStatus());
});

// ---------------------------------------------------------------------------
// Upload Configuration: Memory storage only, 8MB max, PDF/DOCX/TXT only
// ---------------------------------------------------------------------------
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'application/octet-stream',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isSupportedExt = /\.(pdf|docx|txt)$/i.test(file.originalname);
    const mime = (file.mimetype || '').toLowerCase();
    const isSupportedMime = ALLOWED_MIME_TYPES.has(mime);
    if (!isSupportedExt || !isSupportedMime) {
      cb(new AppError('UNSUPPORTED_FILE_TYPE', 'Unsupported file type or MIME format. Please upload a valid PDF, DOCX or TXT file.', 400));
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

export const RESUME_LIMITS = {
  // Structural collection limits
  MAX_EXPERIENCE_ITEMS: 30,
  MAX_BULLETS_PER_EXPERIENCE: 25,
  MAX_BULLET_LENGTH: 1500,
  MAX_EDUCATION_ITEMS: 15,
  MAX_PROJECT_ITEMS: 20,
  MAX_BULLETS_PER_PROJECT: 25,
  MAX_TECHNICAL_SKILLS: 100,
  MAX_SOFT_SKILLS: 50,
  MAX_CERTIFICATIONS: 30,
  MAX_LANGUAGES: 25,
  MAX_ACHIEVEMENTS: 30,
  MAX_CUSTOM_SECTIONS: 10,
  MAX_BULLETS_PER_CUSTOM_SECTION: 25,
  MAX_SECTION_ORDER_ITEMS: 30,
  MAX_OTHER_LINKS: 15,

  // String field length limits
  MAX_FULL_NAME_LENGTH: 150,
  MAX_EMAIL_LENGTH: 150,
  MAX_PHONE_LENGTH: 50,
  MAX_LOCATION_LENGTH: 150,
  MAX_HEADLINE_LENGTH: 200,
  MAX_URL_LENGTH: 250,
  MAX_SUMMARY_LENGTH: 4000,
  MAX_COMPANY_LENGTH: 150,
  MAX_TITLE_LENGTH: 150,
  MAX_DATE_LENGTH: 50,
  MAX_INSTITUTION_LENGTH: 150,
  MAX_DEGREE_LENGTH: 150,
  MAX_FIELD_LENGTH: 150,
  MAX_GRADE_LENGTH: 50,
  MAX_PROJECT_NAME_LENGTH: 150,
  MAX_PROJECT_DESC_LENGTH: 1500,
  MAX_SKILL_NAME_LENGTH: 100,
  MAX_CERT_NAME_LENGTH: 200,
  MAX_CERT_ISSUER_LENGTH: 200,
  MAX_LANGUAGE_NAME_LENGTH: 100,
  MAX_LANGUAGE_PROFICIENCY_LENGTH: 100,
  MAX_ACHIEVEMENT_LENGTH: 1000,
  MAX_CUSTOM_TITLE_LENGTH: 100,
  MAX_JOB_TEXT_LENGTH: 25000,
} as const;

function checkStringField(val: unknown, fieldName: string, maxLen: number): string {
  if (val === undefined || val === null) return '';
  if (typeof val !== 'string') {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a string.`, 400);
  }
  if (val.length > maxLen) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} exceeds maximum length of ${maxLen.toLocaleString()} characters.`, 400);
  }
  return val;
}

function checkOptionalField(val: unknown, fieldName: string, maxLen: number): string | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val !== 'string') {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a string.`, 400);
  }
  if (val.length > maxLen) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} exceeds maximum length of ${maxLen.toLocaleString()} characters.`, 400);
  }
  return val;
}

export function validateJobText(val: unknown, fieldName: string = 'Job description', required: boolean = false): string {
  if (val === undefined || val === null || val === '') {
    if (required) {
      throw new AppError('VALIDATION_ERROR', `${fieldName} is required.`, 400);
    }
    return '';
  }
  if (typeof val !== 'string') {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a string.`, 400);
  }
  if (val.length > RESUME_LIMITS.MAX_JOB_TEXT_LENGTH) {
    throw new AppError(
      'VALIDATION_ERROR',
      `${fieldName} exceeds maximum allowed length of ${RESUME_LIMITS.MAX_JOB_TEXT_LENGTH.toLocaleString()} characters (received ${val.length.toLocaleString()}).`,
      400
    );
  }
  return val.trim();
}

export function validateResume(data: unknown): ResumeData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AppError('VALIDATION_ERROR', 'A valid resume object is required.', 400);
  }
  const raw = data as Record<string, any>;

  // Personal
  if (!raw.personal || typeof raw.personal !== 'object' || Array.isArray(raw.personal)) {
    throw new AppError('VALIDATION_ERROR', 'Resume must contain personal details.', 400);
  }
  if (!raw.personal.fullName || typeof raw.personal.fullName !== 'string' || raw.personal.fullName.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Resume must contain personal.fullName.', 400);
  }
  if (raw.personal.fullName.length > RESUME_LIMITS.MAX_FULL_NAME_LENGTH) {
    throw new AppError('VALIDATION_ERROR', `Personal fullName exceeds maximum length of ${RESUME_LIMITS.MAX_FULL_NAME_LENGTH} characters.`, 400);
  }

  const personal: PersonalInfo = {
    fullName: raw.personal.fullName.trim(),
    email: checkStringField(raw.personal.email, 'Personal email', RESUME_LIMITS.MAX_EMAIL_LENGTH),
    phone: checkStringField(raw.personal.phone, 'Personal phone', RESUME_LIMITS.MAX_PHONE_LENGTH),
    location: checkStringField(raw.personal.location, 'Personal location', RESUME_LIMITS.MAX_LOCATION_LENGTH),
    headline: checkOptionalField(raw.personal.headline, 'Personal headline', RESUME_LIMITS.MAX_HEADLINE_LENGTH),
    linkedin: checkOptionalField(raw.personal.linkedin, 'Personal linkedin', RESUME_LIMITS.MAX_URL_LENGTH),
    github: checkOptionalField(raw.personal.github, 'Personal github', RESUME_LIMITS.MAX_URL_LENGTH),
    portfolio: checkOptionalField(raw.personal.portfolio, 'Personal portfolio', RESUME_LIMITS.MAX_URL_LENGTH),
  };

  if (raw.personal.otherLinks !== undefined && raw.personal.otherLinks !== null) {
    if (!Array.isArray(raw.personal.otherLinks)) {
      throw new AppError('VALIDATION_ERROR', 'Personal otherLinks must be an array.', 400);
    }
    if (raw.personal.otherLinks.length > RESUME_LIMITS.MAX_OTHER_LINKS) {
      throw new AppError('VALIDATION_ERROR', `Personal otherLinks exceed maximum allowed limit of ${RESUME_LIMITS.MAX_OTHER_LINKS}.`, 400);
    }
    personal.otherLinks = raw.personal.otherLinks.map((link: unknown, idx: number) => {
      if (typeof link !== 'string') {
        throw new AppError('VALIDATION_ERROR', `Other link at index ${idx} must be a string.`, 400);
      }
      if (link.length > RESUME_LIMITS.MAX_URL_LENGTH) {
        throw new AppError('VALIDATION_ERROR', `Other link at index ${idx} exceeds maximum length of ${RESUME_LIMITS.MAX_URL_LENGTH} characters.`, 400);
      }
      return link;
    });
  }

  // Summary
  const summary = checkStringField(raw.summary, 'Summary', RESUME_LIMITS.MAX_SUMMARY_LENGTH);

  // Experience
  let experience: ExperienceItem[] = [];
  if (raw.experience !== undefined && raw.experience !== null) {
    if (!Array.isArray(raw.experience)) {
      throw new AppError('VALIDATION_ERROR', 'Experience must be an array.', 400);
    }
    if (raw.experience.length > RESUME_LIMITS.MAX_EXPERIENCE_ITEMS) {
      throw new AppError('VALIDATION_ERROR', 'Experience entries exceed maximum allowed limit of 30.', 400);
    }
    experience = raw.experience.map((item: unknown, i: number) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new AppError('VALIDATION_ERROR', `Experience entry at index ${i} must be an object.`, 400);
      }
      const exp = item as Record<string, any>;
      const company = checkStringField(exp.company, `Experience[${i}].company`, RESUME_LIMITS.MAX_COMPANY_LENGTH);
      const title = checkStringField(exp.title, `Experience[${i}].title`, RESUME_LIMITS.MAX_TITLE_LENGTH);
      const location = checkOptionalField(exp.location, `Experience[${i}].location`, RESUME_LIMITS.MAX_LOCATION_LENGTH);
      const startDate = checkStringField(exp.startDate, `Experience[${i}].startDate`, RESUME_LIMITS.MAX_DATE_LENGTH);
      const endDate = checkStringField(exp.endDate, `Experience[${i}].endDate`, RESUME_LIMITS.MAX_DATE_LENGTH);
      const dateDisplay = checkOptionalField(exp.dateDisplay, `Experience[${i}].dateDisplay`, RESUME_LIMITS.MAX_DATE_LENGTH * 2);
      const id = typeof exp.id === 'string' && exp.id.length <= 50 ? exp.id : `exp_${i + 1}`;

      let bullets: string[] = [];
      if (exp.bullets !== undefined && exp.bullets !== null) {
        if (!Array.isArray(exp.bullets)) {
          throw new AppError('VALIDATION_ERROR', `Experience[${i}].bullets must be an array.`, 400);
        }
        if (exp.bullets.length > RESUME_LIMITS.MAX_BULLETS_PER_EXPERIENCE) {
          throw new AppError('VALIDATION_ERROR', 'Bullet points for experience entry exceed maximum allowed limit of 25.', 400);
        }
        bullets = exp.bullets.map((b: unknown, bIdx: number) => {
          if (typeof b !== 'string') {
            throw new AppError('VALIDATION_ERROR', `Bullet point at index ${bIdx} in experience[${i}] must be a string.`, 400);
          }
          if (b.length > RESUME_LIMITS.MAX_BULLET_LENGTH) {
            throw new AppError('VALIDATION_ERROR', 'Bullet point text exceeds maximum length of 1,500 characters.', 400);
          }
          return b;
        });
      }

      return {
        id,
        company,
        title,
        location,
        startDate,
        endDate,
        current: Boolean(exp.current),
        bullets,
        dateDisplay,
      };
    });
  }

  // Education
  let education: EducationItem[] = [];
  if (raw.education !== undefined && raw.education !== null) {
    if (!Array.isArray(raw.education)) {
      throw new AppError('VALIDATION_ERROR', 'Education must be an array.', 400);
    }
    if (raw.education.length > RESUME_LIMITS.MAX_EDUCATION_ITEMS) {
      throw new AppError('VALIDATION_ERROR', 'Education entries exceed maximum allowed limit of 15.', 400);
    }
    education = raw.education.map((item: unknown, i: number) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new AppError('VALIDATION_ERROR', `Education entry at index ${i} must be an object.`, 400);
      }
      const edu = item as Record<string, any>;
      const institution = checkStringField(edu.institution, `Education[${i}].institution`, RESUME_LIMITS.MAX_INSTITUTION_LENGTH);
      const degree = checkStringField(edu.degree, `Education[${i}].degree`, RESUME_LIMITS.MAX_DEGREE_LENGTH);
      const field = checkOptionalField(edu.field, `Education[${i}].field`, RESUME_LIMITS.MAX_FIELD_LENGTH);
      const startDate = checkStringField(edu.startDate, `Education[${i}].startDate`, RESUME_LIMITS.MAX_DATE_LENGTH);
      const endDate = checkStringField(edu.endDate, `Education[${i}].endDate`, RESUME_LIMITS.MAX_DATE_LENGTH);
      const grade = checkOptionalField(edu.grade, `Education[${i}].grade`, RESUME_LIMITS.MAX_GRADE_LENGTH);
      const dateDisplay = checkOptionalField(edu.dateDisplay, `Education[${i}].dateDisplay`, RESUME_LIMITS.MAX_DATE_LENGTH * 2);
      const id = typeof edu.id === 'string' && edu.id.length <= 50 ? edu.id : `edu_${i + 1}`;

      return {
        id,
        institution,
        degree,
        field,
        startDate,
        endDate,
        grade,
        dateDisplay,
      };
    });
  }

  // Projects
  let projects: ProjectItem[] = [];
  if (raw.projects !== undefined && raw.projects !== null) {
    if (!Array.isArray(raw.projects)) {
      throw new AppError('VALIDATION_ERROR', 'Projects must be an array.', 400);
    }
    if (raw.projects.length > RESUME_LIMITS.MAX_PROJECT_ITEMS) {
      throw new AppError('VALIDATION_ERROR', 'Project entries exceed maximum allowed limit of 20.', 400);
    }
    projects = raw.projects.map((item: unknown, i: number) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new AppError('VALIDATION_ERROR', `Project entry at index ${i} must be an object.`, 400);
      }
      const prj = item as Record<string, any>;
      const name = checkStringField(prj.name, `Project[${i}].name`, RESUME_LIMITS.MAX_PROJECT_NAME_LENGTH);
      const link = checkOptionalField(prj.link, `Project[${i}].link`, RESUME_LIMITS.MAX_URL_LENGTH);
      const description = checkOptionalField(prj.description, `Project[${i}].description`, RESUME_LIMITS.MAX_PROJECT_DESC_LENGTH);
      const id = typeof prj.id === 'string' && prj.id.length <= 50 ? prj.id : `prj_${i + 1}`;

      let bullets: string[] = [];
      if (prj.bullets !== undefined && prj.bullets !== null) {
        if (!Array.isArray(prj.bullets)) {
          throw new AppError('VALIDATION_ERROR', `Project[${i}].bullets must be an array.`, 400);
        }
        if (prj.bullets.length > RESUME_LIMITS.MAX_BULLETS_PER_PROJECT) {
          throw new AppError('VALIDATION_ERROR', `Bullet points for project exceed maximum allowed limit of ${RESUME_LIMITS.MAX_BULLETS_PER_PROJECT}.`, 400);
        }
        bullets = prj.bullets.map((b: unknown, bIdx: number) => {
          if (typeof b !== 'string') {
            throw new AppError('VALIDATION_ERROR', `Bullet point at index ${bIdx} in project[${i}] must be a string.`, 400);
          }
          if (b.length > RESUME_LIMITS.MAX_BULLET_LENGTH) {
            throw new AppError('VALIDATION_ERROR', `Project bullet point exceeds maximum length of ${RESUME_LIMITS.MAX_BULLET_LENGTH.toLocaleString()} characters.`, 400);
          }
          return b;
        });
      }

      let tech: string[] | undefined = undefined;
      if (prj.tech !== undefined && prj.tech !== null) {
        if (!Array.isArray(prj.tech)) {
          throw new AppError('VALIDATION_ERROR', `Project[${i}].tech must be an array.`, 400);
        }
        tech = prj.tech.map((t: unknown, tIdx: number) => {
          if (typeof t !== 'string') {
            throw new AppError('VALIDATION_ERROR', `Tech item at index ${tIdx} in project[${i}] must be a string.`, 400);
          }
          if (t.length > RESUME_LIMITS.MAX_SKILL_NAME_LENGTH) {
            throw new AppError('VALIDATION_ERROR', `Tech item exceeds maximum length of ${RESUME_LIMITS.MAX_SKILL_NAME_LENGTH} characters.`, 400);
          }
          return t;
        });
      }

      return {
        id,
        name,
        link,
        description,
        bullets,
        tech,
      };
    });
  }

  // Skills
  let technical: string[] = [];
  let soft: string[] = [];
  if (raw.skills !== undefined && raw.skills !== null) {
    if (typeof raw.skills !== 'object' || Array.isArray(raw.skills)) {
      throw new AppError('VALIDATION_ERROR', 'Skills must be an object.', 400);
    }
    if (raw.skills.technical !== undefined && raw.skills.technical !== null) {
      if (!Array.isArray(raw.skills.technical)) {
        throw new AppError('VALIDATION_ERROR', 'Technical skills must be an array.', 400);
      }
      if (raw.skills.technical.length > RESUME_LIMITS.MAX_TECHNICAL_SKILLS) {
        throw new AppError('VALIDATION_ERROR', `Technical skills exceed maximum allowed limit of ${RESUME_LIMITS.MAX_TECHNICAL_SKILLS}.`, 400);
      }
      technical = raw.skills.technical.map((s: unknown, idx: number) => {
        if (typeof s !== 'string') {
          throw new AppError('VALIDATION_ERROR', `Technical skill at index ${idx} must be a string.`, 400);
        }
        if (s.length > RESUME_LIMITS.MAX_SKILL_NAME_LENGTH) {
          throw new AppError('VALIDATION_ERROR', `Technical skill at index ${idx} exceeds maximum length of ${RESUME_LIMITS.MAX_SKILL_NAME_LENGTH} characters.`, 400);
        }
        return s;
      });
    }
    if (raw.skills.soft !== undefined && raw.skills.soft !== null) {
      if (!Array.isArray(raw.skills.soft)) {
        throw new AppError('VALIDATION_ERROR', 'Soft skills must be an array.', 400);
      }
      if (raw.skills.soft.length > RESUME_LIMITS.MAX_SOFT_SKILLS) {
        throw new AppError('VALIDATION_ERROR', `Soft skills exceed maximum allowed limit of ${RESUME_LIMITS.MAX_SOFT_SKILLS}.`, 400);
      }
      soft = raw.skills.soft.map((s: unknown, idx: number) => {
        if (typeof s !== 'string') {
          throw new AppError('VALIDATION_ERROR', `Soft skill at index ${idx} must be a string.`, 400);
        }
        if (s.length > RESUME_LIMITS.MAX_SKILL_NAME_LENGTH) {
          throw new AppError('VALIDATION_ERROR', `Soft skill at index ${idx} exceeds maximum length of ${RESUME_LIMITS.MAX_SKILL_NAME_LENGTH} characters.`, 400);
        }
        return s;
      });
    }
  }

  // Certifications
  let certifications: CertificationItem[] = [];
  if (raw.certifications !== undefined && raw.certifications !== null) {
    if (!Array.isArray(raw.certifications)) {
      throw new AppError('VALIDATION_ERROR', 'Certifications must be an array.', 400);
    }
    if (raw.certifications.length > RESUME_LIMITS.MAX_CERTIFICATIONS) {
      throw new AppError('VALIDATION_ERROR', `Certifications exceed maximum allowed limit of ${RESUME_LIMITS.MAX_CERTIFICATIONS}.`, 400);
    }
    certifications = raw.certifications.map((item: unknown, i: number) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new AppError('VALIDATION_ERROR', `Certification entry at index ${i} must be an object.`, 400);
      }
      const cert = item as Record<string, any>;
      const name = checkStringField(cert.name, `Certification[${i}].name`, RESUME_LIMITS.MAX_CERT_NAME_LENGTH);
      const issuer = checkOptionalField(cert.issuer, `Certification[${i}].issuer`, RESUME_LIMITS.MAX_CERT_ISSUER_LENGTH);
      const year = checkOptionalField(cert.year, `Certification[${i}].year`, RESUME_LIMITS.MAX_DATE_LENGTH);
      const id = typeof cert.id === 'string' && cert.id.length <= 50 ? cert.id : `cert_${i + 1}`;
      return { id, name, issuer, year };
    });
  }

  // Languages
  let languages: LanguageItem[] = [];
  if (raw.languages !== undefined && raw.languages !== null) {
    if (!Array.isArray(raw.languages)) {
      throw new AppError('VALIDATION_ERROR', 'Languages must be an array.', 400);
    }
    if (raw.languages.length > RESUME_LIMITS.MAX_LANGUAGES) {
      throw new AppError('VALIDATION_ERROR', `Languages exceed maximum allowed limit of ${RESUME_LIMITS.MAX_LANGUAGES}.`, 400);
    }
    languages = raw.languages.map((item: unknown, i: number) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new AppError('VALIDATION_ERROR', `Language entry at index ${i} must be an object.`, 400);
      }
      const lang = item as Record<string, any>;
      const name = checkStringField(lang.name, `Language[${i}].name`, RESUME_LIMITS.MAX_LANGUAGE_NAME_LENGTH);
      const proficiency = checkOptionalField(lang.proficiency, `Language[${i}].proficiency`, RESUME_LIMITS.MAX_LANGUAGE_PROFICIENCY_LENGTH);
      const id = typeof lang.id === 'string' && lang.id.length <= 50 ? lang.id : `lang_${i + 1}`;
      return { id, name, proficiency };
    });
  }

  // Achievements
  let achievements: string[] = [];
  if (raw.achievements !== undefined && raw.achievements !== null) {
    if (!Array.isArray(raw.achievements)) {
      throw new AppError('VALIDATION_ERROR', 'Achievements must be an array.', 400);
    }
    if (raw.achievements.length > RESUME_LIMITS.MAX_ACHIEVEMENTS) {
      throw new AppError('VALIDATION_ERROR', `Achievements exceed maximum allowed limit of ${RESUME_LIMITS.MAX_ACHIEVEMENTS}.`, 400);
    }
    achievements = raw.achievements.map((ach: unknown, idx: number) => {
      if (typeof ach !== 'string') {
        throw new AppError('VALIDATION_ERROR', `Achievement at index ${idx} must be a string.`, 400);
      }
      if (ach.length > RESUME_LIMITS.MAX_ACHIEVEMENT_LENGTH) {
        throw new AppError('VALIDATION_ERROR', `Achievement at index ${idx} exceeds maximum length of ${RESUME_LIMITS.MAX_ACHIEVEMENT_LENGTH} characters.`, 400);
      }
      return ach;
    });
  }

  // Custom Sections
  let customSections: CustomSection[] = [];
  if (raw.customSections !== undefined && raw.customSections !== null) {
    if (!Array.isArray(raw.customSections)) {
      throw new AppError('VALIDATION_ERROR', 'Custom sections must be an array.', 400);
    }
    if (raw.customSections.length > RESUME_LIMITS.MAX_CUSTOM_SECTIONS) {
      throw new AppError('VALIDATION_ERROR', `Custom sections exceed maximum allowed limit of ${RESUME_LIMITS.MAX_CUSTOM_SECTIONS}.`, 400);
    }
    customSections = raw.customSections.map((item: unknown, i: number) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new AppError('VALIDATION_ERROR', `Custom section entry at index ${i} must be an object.`, 400);
      }
      const cs = item as Record<string, any>;
      const title = checkStringField(cs.title, `CustomSection[${i}].title`, RESUME_LIMITS.MAX_CUSTOM_TITLE_LENGTH);
      const id = typeof cs.id === 'string' && cs.id.length <= 50 ? cs.id : `custom_${i + 1}`;
      let bullets: string[] = [];
      if (cs.bullets !== undefined && cs.bullets !== null) {
        if (!Array.isArray(cs.bullets)) {
          throw new AppError('VALIDATION_ERROR', `CustomSection[${i}].bullets must be an array.`, 400);
        }
        if (cs.bullets.length > RESUME_LIMITS.MAX_BULLETS_PER_CUSTOM_SECTION) {
          throw new AppError('VALIDATION_ERROR', `Custom section bullets exceed maximum allowed limit of ${RESUME_LIMITS.MAX_BULLETS_PER_CUSTOM_SECTION}.`, 400);
        }
        bullets = cs.bullets.map((b: unknown, bIdx: number) => {
          if (typeof b !== 'string') {
            throw new AppError('VALIDATION_ERROR', `Bullet point at index ${bIdx} in custom section[${i}] must be a string.`, 400);
          }
          if (b.length > RESUME_LIMITS.MAX_BULLET_LENGTH) {
            throw new AppError('VALIDATION_ERROR', `Custom section bullet exceeds maximum length of ${RESUME_LIMITS.MAX_BULLET_LENGTH.toLocaleString()} characters.`, 400);
          }
          return b;
        });
      }
      return { id, title, bullets };
    });
  }

  // Section Order
  let sectionOrder: SectionKey[] = [
    'summary',
    'experience',
    'projects',
    'skills',
    'education',
    'certifications',
    'languages',
    'achievements',
  ];
  if (raw.sectionOrder !== undefined && raw.sectionOrder !== null) {
    if (!Array.isArray(raw.sectionOrder)) {
      throw new AppError('VALIDATION_ERROR', 'Section order must be an array.', 400);
    }
    if (raw.sectionOrder.length > RESUME_LIMITS.MAX_SECTION_ORDER_ITEMS) {
      throw new AppError('VALIDATION_ERROR', `Section order exceeds maximum allowed limit of ${RESUME_LIMITS.MAX_SECTION_ORDER_ITEMS}.`, 400);
    }
    sectionOrder = raw.sectionOrder.map((s: unknown, idx: number) => {
      if (typeof s !== 'string') {
        throw new AppError('VALIDATION_ERROR', `Section order item at index ${idx} must be a string.`, 400);
      }
      if (s.length > 50) {
        throw new AppError('VALIDATION_ERROR', `Section order item at index ${idx} exceeds maximum length of 50 characters.`, 400);
      }
      return s as SectionKey;
    });
  }

  // Hidden Sections
  let hiddenSections: SectionKey[] = [];
  if (raw.hiddenSections !== undefined && raw.hiddenSections !== null) {
    if (!Array.isArray(raw.hiddenSections)) {
      throw new AppError('VALIDATION_ERROR', 'Hidden sections must be an array.', 400);
    }
    if (raw.hiddenSections.length > RESUME_LIMITS.MAX_SECTION_ORDER_ITEMS) {
      throw new AppError('VALIDATION_ERROR', `Hidden sections exceed maximum allowed limit of ${RESUME_LIMITS.MAX_SECTION_ORDER_ITEMS}.`, 400);
    }
    hiddenSections = raw.hiddenSections.map((s: unknown, idx: number) => {
      if (typeof s !== 'string') {
        throw new AppError('VALIDATION_ERROR', `Hidden section item at index ${idx} must be a string.`, 400);
      }
      if (s.length > 50) {
        throw new AppError('VALIDATION_ERROR', `Hidden section item at index ${idx} exceeds maximum length of 50 characters.`, 400);
      }
      return s as SectionKey;
    });
  }

  return {
    personal,
    summary,
    experience,
    education,
    projects,
    skills: { technical, soft },
    certifications,
    languages,
    achievements,
    customSections,
    sectionOrder,
    hiddenSections,
  };
}

export function validateCoverLetter(data: unknown): CoverLetter {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AppError('VALIDATION_ERROR', 'A valid cover letter object is required.', 400);
  }
  const l = data as Record<string, unknown>;
  if (!l.greeting || typeof l.greeting !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Cover letter must contain a greeting string.', 400);
  }
  if (l.greeting.length > 200) {
    throw new AppError('VALIDATION_ERROR', 'Greeting exceeds maximum length of 200 characters.', 400);
  }
  if (!Array.isArray(l.paragraphs) || l.paragraphs.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Cover letter must contain an array of paragraphs.', 400);
  }
  if (l.paragraphs.length > 15) {
    throw new AppError('VALIDATION_ERROR', 'Cover letter paragraphs exceed maximum allowed limit of 15.', 400);
  }
  for (let i = 0; i < l.paragraphs.length; i++) {
    const p = l.paragraphs[i];
    if (typeof p !== 'string' || p.trim().length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Each paragraph in the cover letter must be a non-empty string.', 400);
    }
    if (p.length > 3000) {
      throw new AppError('VALIDATION_ERROR', `Paragraph at index ${i} exceeds maximum length of 3,000 characters.`, 400);
    }
  }
  if (!l.closing || typeof l.closing !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Cover letter must contain a closing string.', 400);
  }
  if (l.closing.length > 200) {
    throw new AppError('VALIDATION_ERROR', 'Closing exceeds maximum length of 200 characters.', 400);
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
      const jobText = validateJobText(req.body.jobText, 'Job description', false);

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
      const jobText = validateJobText(req.body.jobText, 'Job description', false);
      const explicitRole = checkOptionalField(req.body.targetRole, 'Target role', RESUME_LIMITS.MAX_TITLE_LENGTH) || '';

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
      if (!details || typeof details !== 'object' || Array.isArray(details)) {
        throw new AppError('VALIDATION_ERROR', 'Details object is required.', 400);
      }
      if (details.experience && Array.isArray(details.experience) && details.experience.length > RESUME_LIMITS.MAX_EXPERIENCE_ITEMS) {
        throw new AppError('VALIDATION_ERROR', 'Experience entries exceed maximum allowed limit of 30.', 400);
      }
      if (details.education && Array.isArray(details.education) && details.education.length > RESUME_LIMITS.MAX_EDUCATION_ITEMS) {
        throw new AppError('VALIDATION_ERROR', 'Education entries exceed maximum allowed limit of 15.', 400);
      }
      if (details.projects && Array.isArray(details.projects) && details.projects.length > RESUME_LIMITS.MAX_PROJECT_ITEMS) {
        throw new AppError('VALIDATION_ERROR', 'Project entries exceed maximum allowed limit of 20.', 400);
      }

      const jobText = req.body.jobText !== undefined ? validateJobText(req.body.jobText, 'Job description', false) : undefined;
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
        req.body.jobDescription !== undefined && req.body.jobDescription !== null && req.body.jobDescription !== ''
          ? validateJobText(req.body.jobDescription, 'Job description', false)
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
        checkOptionalField(req.body.targetRole, 'Target role', RESUME_LIMITS.MAX_TITLE_LENGTH) || job?.title || '';

      const company =
        checkOptionalField(req.body.company, 'Company', RESUME_LIMITS.MAX_COMPANY_LENGTH) || job?.company || '';

      const tone =
        checkOptionalField(req.body.tone, 'Tone', 50) || 'professional';

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
        provider: result.isFallback ? 'deterministic' : 'AI Engine',
        model: result.isFallback ? 'rules-v1' : 'AI Engine',
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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      personal: { fullName: '', email: '', phone: '', location: '', headline: '' },
      summary: '',
      experience: [],
      education: [],
      skills: { technical: [], soft: [] },
      projects: [],
      certifications: [],
      languages: [],
      achievements: [],
      customSections: [],
      sectionOrder: [...DEFAULT_SECTION_ORDER],
      hiddenSections: [],
    };
  }

  // If personal details with fullName is provided, validate with strict bounds
  if (raw.personal && typeof raw.personal === 'object' && !Array.isArray(raw.personal) && raw.personal.fullName && typeof raw.personal.fullName === 'string' && raw.personal.fullName.trim()) {
    return validateResume(raw);
  }

  // If fullName is missing, supply dummy placeholder so structural bounds are still rigorously validated
  return validateResume({
    ...raw,
    personal: {
      fullName: 'Anonymous Candidate',
      ...(typeof raw.personal === 'object' && !Array.isArray(raw.personal) ? raw.personal : {}),
    },
  });
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
      const rawJd = req.body.jobDescription !== undefined ? req.body.jobDescription : req.body.jdText;
      const jdText =
        rawJd !== undefined && rawJd !== null && rawJd !== ''
          ? validateJobText(rawJd, 'Job description', false)
          : null;

      let job: JobAnalysis | null = null;
      let match: any = undefined;

      if (jdText) {
        job = analyseJobDescription(jdText);
        match = computeJobMatch(resume, job);
      }

      const targetRole =
        checkOptionalField(req.body.targetRole, 'Target role', RESUME_LIMITS.MAX_TITLE_LENGTH) || job?.title || '';

      const company =
        checkOptionalField(req.body.company, 'Company', RESUME_LIMITS.MAX_COMPANY_LENGTH) || job?.company || '';

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
      const question = checkStringField(req.body.question, 'Interview question', 600);
      if (!question.trim()) {
        res.status(400).json({ error: { code: 'INVALID_QUESTION', message: 'Interview question is required.' } });
        return;
      }

      const starRaw = req.body.star || {};
      const star: StarAnswerInput = {
        situation: checkOptionalField(starRaw.situation, 'Situation', 1500) || '',
        task: checkOptionalField(starRaw.task, 'Task', 1500) || '',
        action: checkOptionalField(starRaw.action, 'Action', 2500) || '',
        result: checkOptionalField(starRaw.result, 'Result', 1500) || '',
      };

      if (!star.situation && !star.task && !star.action && !star.result) {
        res.status(400).json({
          error: { code: 'EMPTY_STAR_ANSWER', message: 'At least one STAR component must be provided.' },
        });
        return;
      }

      const resume = getSafeResume(req.body.resume);
      const jdText =
        req.body.jobDescription !== undefined && req.body.jobDescription !== null && req.body.jobDescription !== ''
          ? validateJobText(req.body.jobDescription, 'Job description', false)
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
      const question = checkStringField(req.body.question, 'Interview question', 600);
      const answer = checkStringField(req.body.answer, 'Candidate answer', 4000);

      if (!question.trim()) {
        res.status(400).json({ error: { code: 'INVALID_QUESTION', message: 'Interview question is required.' } });
        return;
      }
      if (!answer.trim()) {
        res.status(400).json({ error: { code: 'EMPTY_ANSWER', message: 'Candidate answer is required.' } });
        return;
      }

      const difficulty =
        checkOptionalField(req.body.difficulty, 'Difficulty', 30);
      const questionNumber = typeof req.body.questionNumber === 'number' ? req.body.questionNumber : undefined;
      const totalQuestions = typeof req.body.totalQuestions === 'number' ? req.body.totalQuestions : undefined;

      const resume = getSafeResume(req.body.resume);
      const jdText =
        req.body.jobDescription !== undefined && req.body.jobDescription !== null && req.body.jobDescription !== ''
          ? validateJobText(req.body.jobDescription, 'Job description', false)
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

      if (rawQa.length > 25) {
        throw new AppError('VALIDATION_ERROR', 'Questions and answers transcript exceeds maximum allowed limit of 25 items.', 400);
      }

      const questionsAndAnswers = rawQa.map((item: any, idx: number) => ({
        question: checkStringField(item?.question, `Question[${idx}]`, 600),
        category: checkOptionalField(item?.category, `Category[${idx}]`, 50) || 'General',
        answer: checkStringField(item?.answer, `Answer[${idx}]`, 4000),
        evaluation: item?.evaluation,
      }));

      const difficulty =
        checkOptionalField(req.body.difficulty, 'Difficulty', 30);

      const resume = getSafeResume(req.body.resume);
      const jdText =
        req.body.jobDescription !== undefined && req.body.jobDescription !== null && req.body.jobDescription !== ''
          ? validateJobText(req.body.jobDescription, 'Job description', false)
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
      const headline = checkOptionalField(req.body.headline, 'Headline', 300) || '';
      const about = checkOptionalField(req.body.about, 'About summary', 4000) || '';
      const targetRole = checkOptionalField(req.body.targetRole, 'Target role', RESUME_LIMITS.MAX_TITLE_LENGTH);
      const industry = checkOptionalField(req.body.industry, 'Industry', 150);
      const jobDescription =
        req.body.jobDescription !== undefined && req.body.jobDescription !== null && req.body.jobDescription !== ''
          ? validateJobText(req.body.jobDescription, 'Job description', false)
          : undefined;

      let experience: Array<{ title: string; company: string; period?: string; bullets: string[] }> | undefined;
      if (req.body.experience !== undefined) {
        if (!Array.isArray(req.body.experience)) {
          throw new AppError('VALIDATION_ERROR', 'Experience must be an array.', 400);
        }
        if (req.body.experience.length > RESUME_LIMITS.MAX_EXPERIENCE_ITEMS) {
          throw new AppError('VALIDATION_ERROR', `Experience entries exceed maximum allowed limit of ${RESUME_LIMITS.MAX_EXPERIENCE_ITEMS}.`, 400);
        }
        experience = req.body.experience.map((e: any, idx: number) => {
          if (!e || typeof e !== 'object' || Array.isArray(e)) {
            throw new AppError('VALIDATION_ERROR', `Experience entry at index ${idx} must be an object.`, 400);
          }
          const rawBullets = Array.isArray(e.bullets) ? e.bullets : [];
          if (rawBullets.length > RESUME_LIMITS.MAX_BULLETS_PER_EXPERIENCE) {
            throw new AppError('VALIDATION_ERROR', `Experience[${idx}] bullets exceed maximum allowed limit of ${RESUME_LIMITS.MAX_BULLETS_PER_EXPERIENCE}.`, 400);
          }
          const bullets = rawBullets
            .map((b: any, bIdx: number) => checkStringField(b, `Experience[${idx}].bullets[${bIdx}]`, RESUME_LIMITS.MAX_BULLET_LENGTH))
            .filter(Boolean);

          return {
            title: checkStringField(e.title, `Experience[${idx}].title`, RESUME_LIMITS.MAX_TITLE_LENGTH),
            company: checkStringField(e.company, `Experience[${idx}].company`, RESUME_LIMITS.MAX_COMPANY_LENGTH),
            period: checkOptionalField(e.period, `Experience[${idx}].period`, RESUME_LIMITS.MAX_DATE_LENGTH),
            bullets,
          };
        });
      }

      let skills: string[] | undefined;
      if (req.body.skills !== undefined) {
        if (!Array.isArray(req.body.skills)) {
          throw new AppError('VALIDATION_ERROR', 'Skills must be an array.', 400);
        }
        if (req.body.skills.length > RESUME_LIMITS.MAX_TECHNICAL_SKILLS) {
          throw new AppError('VALIDATION_ERROR', `Skills exceed maximum allowed limit of ${RESUME_LIMITS.MAX_TECHNICAL_SKILLS}.`, 400);
        }
        skills = req.body.skills.map((s: any, idx: number) => checkStringField(s, `Skill[${idx}]`, RESUME_LIMITS.MAX_SKILL_NAME_LENGTH)).filter(Boolean);
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
      const company = checkStringField(req.body.company, 'Company', RESUME_LIMITS.MAX_COMPANY_LENGTH);
      if (!company.trim()) {
        res.status(400).json({
          error: {
            code: 'INVALID_COMPANY',
            message: 'Company name is required for research.',
          },
        });
        return;
      }

      const jdText =
        req.body.jobDescription !== undefined && req.body.jobDescription !== null && req.body.jobDescription !== ''
          ? validateJobText(req.body.jobDescription, 'Job description', false)
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
    message: 'You must explicitly consent to receiving this email.',
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
    message: 'You must explicitly consent to receiving this email.',
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
