import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { getDb, newId, withTransaction, type Queryable, TS_TEXT } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { analyseATS } from '../engine/ats';
import { extractFile } from '../engine/extract';
import { track } from '../lib/analytics';
import { ResumeData, CustomSection, DEFAULT_SECTION_ORDER, ALL_SECTIONS } from '../types';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(pdf|docx|doc|txt)$/i.test(file.originalname);
    cb(null, ok);
  },
});

// ---------- helpers ----------

export function resumeRowToData(row: { content: string }): ResumeData {
  return JSON.parse(row.content) as ResumeData;
}

export interface MasterRow {
  id: string;
  user_id: string;
  kind: 'master';
  title: string;
  content: string;
  ats_score: number | null;
  created_at: string;
  updated_at: string;
}

export async function getMasterRow(db: Queryable, userId: string): Promise<MasterRow | undefined> {
  const result = await db.query(
    `SELECT id, user_id, kind, title, content, ats_score,
            ${TS_TEXT('created_at')} AS created_at,
            ${TS_TEXT('updated_at')} AS updated_at
     FROM resumes
     WHERE user_id = $1 AND kind = 'master'
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] as MasterRow | undefined;
}

export function sanitizeResumeData(input: unknown): ResumeData {
  const schema = z.object({
    personal: z.object({
      fullName: z.string().max(120).default(''),
      email: z.string().max(160).default(''),
      phone: z.string().max(60).default(''),
      location: z.string().max(120).default(''),
      linkedin: z.string().max(240).optional().default(''),
      github: z.string().max(240).optional().default(''),
      portfolio: z.string().max(240).optional().default(''),
      headline: z.string().max(120).optional().default(''),
    }),
    summary: z.string().max(3000).default(''),
    experience: z.array(z.object({
      id: z.string().max(64).default(''),
      company: z.string().max(160).default(''),
      title: z.string().max(160).default(''),
      location: z.string().max(120).optional().default(''),
      startDate: z.string().max(20).default(''),
      endDate: z.string().max(20).default(''),
      current: z.boolean().default(false),
      bullets: z.array(z.string().max(2000)).default([]),
    })).max(20).default([]),
    projects: z.array(z.object({
      id: z.string().max(64).default(''),
      name: z.string().max(160).default(''),
      link: z.string().max(240).optional().default(''),
      description: z.string().max(2000).optional().default(''),
      bullets: z.array(z.string().max(2000)).default([]),
      tech: z.array(z.string().max(80)).optional().default([]),
    })).max(20).default([]),
    education: z.array(z.object({
      id: z.string().max(64).default(''),
      institution: z.string().max(160).default(''),
      degree: z.string().max(160).default(''),
      field: z.string().max(120).optional().default(''),
      startDate: z.string().max(20).default(''),
      endDate: z.string().max(20).default(''),
      grade: z.string().max(40).optional().default(''),
    })).max(10).default([]),
    skills: z.object({
      technical: z.array(z.string().max(80)).max(60).default([]),
      soft: z.array(z.string().max(80)).max(40).default([]),
    }).default({ technical: [], soft: [] }),
    certifications: z.array(z.object({
      id: z.string().max(64).default(''),
      name: z.string().max(160).default(''),
      issuer: z.string().max(160).optional().default(''),
      year: z.string().max(10).optional().default(''),
    })).max(20).default([]),
    languages: z.array(z.object({
      id: z.string().max(64).default(''),
      name: z.string().max(60).default(''),
      proficiency: z.string().max(40).optional().default(''),
    })).max(15).default([]),
    achievements: z.array(z.string().max(500)).max(20).default([]),
    customSections: z.array(z.object({
      id: z.string().max(64),
      title: z.string().min(1).max(80),
      bullets: z.array(z.string().max(500)).max(20).default([]),
    })).max(10).default([]),
    // sectionOrder may contain core keys and 'custom_*' ids.
    sectionOrder: z.array(z.string().max(48)).default([...DEFAULT_SECTION_ORDER]),
    hiddenSections: z.array(z.string().max(48)).default([]),
  });
  const parsed = schema.parse(input);
  // ensure ids
  const ensureId = (x: { id?: string }, prefix: string, i: number) => {
    if (!x.id) x.id = `${prefix}_${i + 1}_${Math.random().toString(36).slice(2, 8)}`;
    return x;
  };
  parsed.experience.forEach((e, i) => ensureId(e, 'exp', i));
  parsed.projects.forEach((p, i) => ensureId(p, 'prj', i));
  parsed.education.forEach((e, i) => ensureId(e, 'edu', i));
  parsed.certifications.forEach((c, i) => ensureId(c, 'cert', i));
  parsed.languages.forEach((l, i) => ensureId(l, 'lang', i));
  parsed.customSections.forEach((c: CustomSection, i: number) => {
    if (!c.id || !c.id.startsWith('custom_')) c.id = `custom_${i + 1}_${Math.random().toString(36).slice(2, 8)}`;
    if (!parsed.sectionOrder.includes(c.id)) parsed.sectionOrder.push(c.id);
  });
  // validate section order covers core sections and only references known ids
  for (const s of ALL_SECTIONS) if (!parsed.sectionOrder.includes(s)) parsed.sectionOrder.push(s);
  const known = new Set([...ALL_SECTIONS, ...parsed.customSections.map((c) => c.id)]);
  parsed.sectionOrder = parsed.sectionOrder.filter((s) => known.has(s));
  parsed.hiddenSections = parsed.hiddenSections.filter((s) => known.has(s));
  return parsed as ResumeData;
}

export function computeCompleteness(resume: ResumeData): number {
  let score = 0;
  const checks: boolean[] = [
    !!resume.personal.fullName,
    !!resume.personal.email,
    !!resume.personal.phone,
    !!resume.personal.location,
    !!(resume.personal.linkedin || resume.personal.github || resume.personal.portfolio),
    resume.summary.trim().length > 60,
    resume.experience.length > 0,
    resume.experience.some((e) => e.bullets.length >= 2),
    resume.experience.some((e) => e.bullets.some((b) => /\d/.test(b))),
    resume.education.length > 0,
    resume.skills.technical.length >= 5,
    resume.skills.soft.length >= 3,
    resume.certifications.length > 0,
    resume.languages.length > 0,
    resume.achievements.length > 0,
    resume.projects.length > 0,
  ];
  score = checks.filter(Boolean).length;
  return Math.round((score / checks.length) * 100);
}

// ---------- routes ----------

/** Upload a CV file, parse it, and return the extracted data for review. */
router.post('/parse-upload', requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError('UNSUPPORTED_FILE_TYPE', 'Unsupported file type. Please upload a PDF or DOCX file.', 400);
  const result = await extractFile(req.file);
  res.json({
    resume: result.resume,
    confidence: result.confidence,
    notes: result.notes,
  });
});

/** Get the user's Master CV (creates nothing — returns null if absent). */
router.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  const row = await getMasterRow(db, req.user!.uid);
  if (!row) {
    res.json({ master: null });
    return;
  }
  const resume = resumeRowToData(row);
  res.json({
    master: {
      id: row.id,
      title: row.title,
      content: resume,
      atsScore: row.ats_score,
      completeness: computeCompleteness(resume),
      updatedAt: row.updated_at,
    },
  });
});

/** Create or update the Master CV. */
router.put('/', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const body = z.object({ resume: z.unknown(), title: z.string().max(120).optional() }).parse(req.body);
  const resume = sanitizeResumeData(body.resume);
  const db = getDb();
  const content = JSON.stringify(resume);
  const ats = analyseATS(resume);
  const existing = await getMasterRow(db, req.user!.uid);

  let id: string;
  if (existing) {
    id = existing.id;
    await db.query(
      `UPDATE resumes
       SET content = $1, title = $2, ats_score = $3, updated_at = NOW()
       WHERE id = $4`,
      [content, body.title || 'Master CV', ats.overallScore, existing.id],
    );
    track(req.user!.uid, 'master_cv_updated', { atsScore: ats.overallScore });
  } else {
    id = newId('res');
    // Creating the Master CV also marks onboarding complete — one transaction.
    await withTransaction(async (client: PoolClient) => {
      await client.query(
        `INSERT INTO resumes (id, user_id, kind, title, content, ats_score)
         VALUES ($1, $2, 'master', $3, $4, $5)`,
        [id, req.user!.uid, body.title || 'Master CV', content, ats.overallScore],
      );
      await client.query('UPDATE users SET onboarded = TRUE WHERE id = $1', [req.user!.uid]);
    });
    track(req.user!.uid, 'master_cv_created', { atsScore: ats.overallScore });
    track(req.user!.uid, 'onboarding_completed', {});
  }

  res.status(existing ? 200 : 201).json({ id, atsScore: ats.overallScore, completeness: computeCompleteness(resume) });
});

/** Compute (and cache) the ATS analysis for the Master CV. */
router.get('/ats', requireAuth, async (req, res) => {
  const db = getDb();
  const row = await getMasterRow(db, req.user!.uid);
  if (!row) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);
  const resume = resumeRowToData(row);
  const analysis = analyseATS(resume);
  await db.query('UPDATE resumes SET ats_score = $1 WHERE id = $2', [analysis.overallScore, row.id]);
  res.json({ analysis, completeness: computeCompleteness(resume) });
});

export default router;
