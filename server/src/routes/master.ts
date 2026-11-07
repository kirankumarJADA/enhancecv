// Curevo AI — Master CV Routes
//
// Invariant: The Master CV is the user's permanent career source of truth.
// AI modifications and tailored versions are completely separate.

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getDb, type Queryable, TS_TEXT } from '../db/db';
import { MasterCvRepository } from '../db/masterCvRepository';
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

export function resumeRowToData(row: { content: string | ResumeData }): ResumeData {
  if (typeof row.content === 'object' && row.content !== null) {
    return row.content as ResumeData;
  }
  return JSON.parse(row.content as string) as ResumeData;
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
    `SELECT id, user_id, 'master' AS kind, title, content::text AS content, ats_score,
            ${TS_TEXT('created_at')} AS created_at,
            ${TS_TEXT('updated_at')} AS updated_at
     FROM master_cvs
     WHERE user_id = $1
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
      otherLinks: z.array(z.string().max(240)).max(10).optional().default([]),
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
      dateDisplay: z.string().max(40).optional().default(''),
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
      dateDisplay: z.string().max(40).optional().default(''),
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
  for (const s of ALL_SECTIONS) if (!parsed.sectionOrder.includes(s)) parsed.sectionOrder.push(s);
  const known = new Set([...ALL_SECTIONS, ...parsed.customSections.map((c) => c.id)]);
  parsed.sectionOrder = parsed.sectionOrder.filter((s) => known.has(s));
  parsed.hiddenSections = parsed.hiddenSections.filter((s) => known.has(s));
  return parsed as ResumeData;
}

export function computeCompleteness(resume: ResumeData): number {
  let score = 0;
  const checks: boolean[] = [
    !!resume.personal?.fullName,
    !!resume.personal?.email,
    !!resume.personal?.phone,
    !!resume.personal?.location,
    !!(resume.personal?.linkedin || resume.personal?.github || resume.personal?.portfolio),
    (resume.summary || '').trim().length > 60,
    resume.experience?.length > 0,
    resume.experience?.some((e) => e.bullets && e.bullets.length >= 2),
    resume.experience?.some((e) => e.bullets && e.bullets.some((b) => /\d/.test(b))),
    resume.education?.length > 0,
    (resume.skills?.technical || []).length >= 5,
    (resume.skills?.soft || []).length >= 3,
    (resume.certifications || []).length > 0,
    (resume.languages || []).length > 0,
    (resume.achievements || []).length > 0,
    (resume.projects || []).length > 0,
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

/** Get the user's Master CV (returns null if absent). */
router.get('/', requireAuth, async (req, res) => {
  const master = await MasterCvRepository.get(req.user!.uid);
  if (!master) {
    res.json({ master: null });
    return;
  }
  res.json({
    master: {
      id: master.id,
      title: master.title,
      targetRole: master.targetRole,
      content: master.content,
      revision: master.revision,
      atsScore: master.atsScore,
      atsBreakdown: master.atsBreakdown,
      completeness: computeCompleteness(master.content),
      createdAt: master.createdAt,
      updatedAt: master.updatedAt,
    },
  });
});

/** Create or update the Master CV with optimistic revision control. */
router.put('/', requireAuth, rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
  const body = z.object({
    resume: z.unknown(),
    title: z.string().max(120).optional(),
    targetRole: z.string().max(120).optional(),
    expectedRevision: z.number().int().positive().optional(),
    createSnapshot: z.boolean().optional(),
    versionLabel: z.string().max(120).optional(),
  }).parse(req.body);

  const resume = sanitizeResumeData(body.resume);
  const ats = analyseATS(resume);

  const { masterCv, version } = await MasterCvRepository.save(req.user!.uid, resume, {
    title: body.title,
    targetRole: body.targetRole,
    expectedRevision: body.expectedRevision,
    createSnapshot: body.createSnapshot,
    versionLabel: body.versionLabel,
    atsScore: ats.overallScore,
    atsBreakdown: ats,
    source: 'manual',
  });

  track(req.user!.uid, 'master_cv_saved', { revision: masterCv.revision, atsScore: ats.overallScore });

  res.status(masterCv.revision === 1 ? 201 : 200).json({
    id: masterCv.id,
    revision: masterCv.revision,
    atsScore: masterCv.atsScore,
    completeness: computeCompleteness(masterCv.content),
    version: version
      ? {
          id: version.id,
          versionNumber: version.versionNumber,
          versionLabel: version.versionLabel,
          createdAt: version.createdAt,
        }
      : undefined,
  });
});

/** Delete the Master CV and all its history. */
router.delete('/', requireAuth, async (req, res) => {
  const deleted = await MasterCvRepository.delete(req.user!.uid);
  if (!deleted) {
    throw new AppError('NO_MASTER_CV', 'No Master CV found to delete.', 404);
  }
  track(req.user!.uid, 'master_cv_deleted', {});
  res.json({ ok: true });
});

/** Import an anonymous / client draft into the authenticated account's Master CV. */
router.post('/import-draft', requireAuth, rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const body = z.object({
    draft: z.unknown(),
    overwrite: z.boolean().optional().default(false),
  }).parse(req.body);

  const existing = await MasterCvRepository.get(req.user!.uid);
  if (existing && !body.overwrite) {
    throw new AppError(
      'MASTER_CV_EXISTS',
      'A Master CV already exists on your account. Confirm overwrite to replace your existing profile with this draft.',
      409
    );
  }

  // Extract resume payload
  const rawResume =
    typeof body.draft === 'object' && body.draft !== null && 'resume' in body.draft
      ? (body.draft as { resume: unknown }).resume
      : body.draft;

  const resume = sanitizeResumeData(rawResume);
  const ats = analyseATS(resume);

  const { masterCv, version } = await MasterCvRepository.save(req.user!.uid, resume, {
    title: 'Master CV (Imported)',
    createSnapshot: true,
    versionLabel: 'Imported from browser draft',
    source: 'import',
    atsScore: ats.overallScore,
    atsBreakdown: ats,
  });

  track(req.user!.uid, 'master_cv_imported', { atsScore: ats.overallScore });

  res.json({
    ok: true,
    id: masterCv.id,
    revision: masterCv.revision,
    atsScore: masterCv.atsScore,
    completeness: computeCompleteness(masterCv.content),
    version: version
      ? {
          id: version.id,
          versionNumber: version.versionNumber,
          versionLabel: version.versionLabel,
          createdAt: version.createdAt,
        }
      : undefined,
  });
});

/** List all version snapshots for the current user's Master CV. */
router.get('/versions', requireAuth, async (req, res) => {
  const versions = await MasterCvRepository.listVersions(req.user!.uid);
  res.json({ versions });
});

/** Create a named snapshot of the current Master CV. */
router.post('/versions', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const body = z.object({
    label: z.string().max(120).optional(),
  }).parse(req.body || {});

  const version = await MasterCvRepository.createSnapshot(req.user!.uid, body.label || '');
  track(req.user!.uid, 'master_cv_version_created', { versionNumber: version.versionNumber });

  res.status(201).json({ version });
});

/** Get a specific version snapshot. */
router.get('/versions/:versionId', requireAuth, async (req, res) => {
  const version = await MasterCvRepository.getVersion(req.user!.uid, req.params.versionId);
  if (!version) {
    throw new AppError('NOT_FOUND', 'Version snapshot not found.', 404);
  }
  res.json({ version });
});

/** Restore a historical version snapshot as a new revision and snapshot. */
router.post('/versions/:versionId/restore', requireAuth, rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const { masterCv, restoredVersion } = await MasterCvRepository.restoreVersion(req.user!.uid, req.params.versionId);
  track(req.user!.uid, 'master_cv_version_restored', {
    newRevision: masterCv.revision,
    restoredFrom: req.params.versionId,
  });

  res.json({
    master: {
      id: masterCv.id,
      title: masterCv.title,
      targetRole: masterCv.targetRole,
      content: masterCv.content,
      revision: masterCv.revision,
      atsScore: masterCv.atsScore,
      completeness: computeCompleteness(masterCv.content),
      updatedAt: masterCv.updatedAt,
    },
    version: restoredVersion,
  });
});

/** Compute ATS analysis for current Master CV. */
router.get('/ats', requireAuth, async (req, res) => {
  const master = await MasterCvRepository.get(req.user!.uid);
  if (!master) {
    throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);
  }
  const analysis = analyseATS(master.content);
  // Update cached ats_score
  const db = getDb();
  await db.query('UPDATE master_cvs SET ats_score = $1, ats_breakdown = $2 WHERE id = $3', [
    analysis.overallScore,
    JSON.stringify(analysis),
    master.id,
  ]);
  res.json({ analysis, completeness: computeCompleteness(master.content) });
});

export default router;
