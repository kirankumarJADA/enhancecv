// Job application tracker — CRUD with strict per-user ownership.

import { Router } from 'express';
import { z } from 'zod';
import { getDb, newId, TS_TEXT } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { isValidTemplate, getTemplate, recommendTemplate } from '../lib/templates';
import { track } from '../lib/analytics';
import { yearsOfExperienceHint } from './templatesUtil';

const router = Router();

const STATUS_VALUES = ['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'] as const;
type ApplicationStatus = (typeof STATUS_VALUES)[number];

const createSchema = z.object({
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  jobUrl: z.string().trim().max(400).optional().default(''),
  location: z.string().trim().max(120).optional().default(''),
  salary: z.string().trim().max(80).optional().default(''),
  jobId: z.string().max(64).optional(),
  resumeId: z.string().max(64).optional(),
  coverLetterId: z.string().max(64).optional(),
  templateId: z.string().max(40).optional(),
  appliedDate: z.string().max(20).optional().default(''),
  notes: z.string().max(3000).optional().default(''),
  status: z.enum(STATUS_VALUES).optional().default('SAVED'),
});

const patchSchema = z.object({
  company: z.string().trim().min(1).max(120).optional(),
  role: z.string().trim().min(1).max(120).optional(),
  jobUrl: z.string().trim().max(400).optional(),
  location: z.string().trim().max(120).optional(),
  salary: z.string().trim().max(80).optional(),
  jobId: z.string().max(64).nullable().optional(),
  resumeId: z.string().max(64).nullable().optional(),
  coverLetterId: z.string().max(64).nullable().optional(),
  templateId: z.string().max(40).optional(),
  appliedDate: z.string().max(20).optional(),
  notes: z.string().max(3000).optional(),
  status: z.enum(STATUS_VALUES).optional(),
});

async function findOwned(id: string, userId: string) {
  const row = (await getDb().query(
    `SELECT id, user_id, company, role, job_url, location, salary, job_id, resume_id, cover_letter_id,
            template_id, applied_date, notes, status,
            ${TS_TEXT('created_at')} AS created_at, ${TS_TEXT('updated_at')} AS updated_at
     FROM applications WHERE id = $1`,
    [id],
  )).rows[0] as
    | {
        id: string; user_id: string; company: string; role: string; job_url: string; location: string; salary: string;
        job_id: string | null; resume_id: string | null; cover_letter_id: string | null; template_id: string;
        applied_date: string; notes: string; status: ApplicationStatus; created_at: string; updated_at: string;
      }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Application not found.', 404);
  if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this item.', 403);
  return row;
}

router.get('/', requireAuth, async (req, res) => {
  const rows = (await getDb().query(
    `SELECT a.id, a.company, a.role, a.job_url, a.location, a.salary, a.job_id, a.resume_id, a.cover_letter_id,
            a.template_id, a.applied_date, a.notes, a.status,
            ${TS_TEXT('a.created_at')} AS created_at, ${TS_TEXT('a.updated_at')} AS updated_at,
            j.title AS job_title
     FROM applications a
     LEFT JOIN job_descriptions j ON j.id = a.job_id
     WHERE a.user_id = $1
     ORDER BY a.updated_at DESC
     LIMIT 200`,
    [req.user!.uid],
  )).rows as unknown as ({
    id: string; company: string; role: string; job_url: string; location: string; salary: string;
    job_id: string | null; resume_id: string | null; cover_letter_id: string | null; template_id: string;
    applied_date: string; notes: string; status: ApplicationStatus; created_at: string; updated_at: string;
    job_title: string | null;
  })[];

  const counts = Object.fromEntries(STATUS_VALUES.map((s) => [s, rows.filter((r) => r.status === s).length]));

  res.json({
    applications: rows,
    summary: { total: rows.length, byStatus: counts },
  });
});

router.post('/', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const body = createSchema.parse(req.body);
  if (body.templateId && !isValidTemplate(body.templateId)) {
    throw new AppError('VALIDATION', 'Unknown template.', 400);
  }
  const db = getDb();
  const uid = req.user!.uid;

  // Referenced resources must belong to the same user (no IDOR via ids).
  if (body.jobId) {
    const j = (await db.query('SELECT user_id FROM job_descriptions WHERE id = $1', [body.jobId])).rows[0] as { user_id: string } | undefined;
    if (!j || j.user_id !== uid) throw new AppError('FORBIDDEN', 'You do not have access to that job description.', 403);
  }
  if (body.resumeId) {
    const r = (await db.query('SELECT user_id FROM resumes WHERE id = $1', [body.resumeId])).rows[0] as { user_id: string } | undefined;
    if (!r || r.user_id !== uid) throw new AppError('FORBIDDEN', 'You do not have access to that resume.', 403);
  }
  if (body.coverLetterId) {
    const c = (await db.query('SELECT user_id FROM cover_letters WHERE id = $1', [body.coverLetterId])).rows[0] as { user_id: string } | undefined;
    if (!c || c.user_id !== uid) throw new AppError('FORBIDDEN', 'You do not have access to that cover letter.', 403);
  }

  const id = newId('app');
  await db.query(
    `INSERT INTO applications (id, user_id, company, role, job_url, location, salary, job_id, resume_id, cover_letter_id, template_id, applied_date, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, uid, body.company, body.role, body.jobUrl || '', body.location || '', body.salary || '', body.jobId || null, body.resumeId || null, body.coverLetterId || null, body.templateId || 'classic', body.appliedDate || '', body.notes || '', body.status],
  );
  track(uid, 'application_created', { status: body.status });
  res.status(201).json({ id });
});

router.get('/:id', requireAuth, async (req, res) => {
  const row = await findOwned(req.params.id, req.user!.uid);
  res.json({ application: row });
});

router.patch('/:id', requireAuth, rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
  const body = patchSchema.parse(req.body);
  const row = await findOwned(req.params.id, req.user!.uid);
  if (body.templateId && !isValidTemplate(body.templateId)) {
    throw new AppError('VALIDATION', 'Unknown template.', 400);
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  let n = 1;
  const map: Record<string, unknown> = {
    company: body.company, role: body.role, job_url: body.jobUrl, location: body.location,
    salary: body.salary, job_id: body.jobId === undefined ? undefined : body.jobId || null,
    resume_id: body.resumeId === undefined ? undefined : body.resumeId || null,
    cover_letter_id: body.coverLetterId === undefined ? undefined : body.coverLetterId || null,
    template_id: body.templateId, applied_date: body.appliedDate, notes: body.notes, status: body.status,
  };
  for (const [col, value] of Object.entries(map)) {
    if (value === undefined) continue;
    sets.push(`${col} = $${n++}`);
    values.push(value);
  }
  sets.push(`updated_at = NOW()`);
  values.push(row.id);
  await getDb().query(`UPDATE applications SET ${sets.join(', ')} WHERE id = $${n}`, values);

  if (body.status && body.status !== row.status) {
    await getDb().query(
      'INSERT INTO application_events (id, application_id, user_id, from_status, to_status) VALUES ($1,$2,$3,$4,$5)',
      [`ape_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, row.id, req.user!.uid, row.status, body.status],
    );
    track(req.user!.uid, 'application_status_changed', { from: row.status, to: body.status });
  }
  res.json({ ok: true });
});

/** Timeline of status changes for one application. */
router.get('/:id/events', requireAuth, async (req, res) => {
  const row = await findOwned(req.params.id, req.user!.uid);
  const events = (await getDb().query(
    `SELECT id, from_status, to_status, note, ${TS_TEXT('created_at')} AS created_at
     FROM application_events WHERE application_id = $1 ORDER BY created_at ASC`,
    [row.id],
  )).rows;
  res.json({
    application: { id: row.id, company: row.company, role: row.role, status: row.status },
    timeline: [
      { id: 'created', from_status: '', to_status: row.status === 'SAVED' ? 'SAVED' : 'SAVED', created_at: row.created_at },
      ...events,
    ],
    currentStatus: row.status,
  });
});

/**
 * Smart application workflow: create an application directly from a saved or
 * analysed job. Optionally links a tailored resume + template and returns the
 * recommended next steps (tailor → cover letter → interview prep).
 */
router.post('/from-job', requireAuth, rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const body = z.object({
    jobId: z.string().max(64).optional(),        // job_descriptions id
    savedJobId: z.string().max(64).optional(),   // saved_jobs id
    resumeId: z.string().max(64).optional(),
    templateId: z.string().max(40).optional(),
  }).parse(req.body);
  const db = getDb();
  const uid = req.user!.uid;

  let company = '';
  let role = '';
  let jobId: string | null = null;
  let jobUrl = '';

  if (body.savedJobId) {
    const row = (await db.query('SELECT id, user_id, company, title, url FROM saved_jobs WHERE id = $1', [body.savedJobId])).rows[0] as
      | { id: string; user_id: string; company: string; title: string; url: string }
      | undefined;
    if (!row) throw new AppError('NOT_FOUND', 'Saved job not found.', 404);
    if (row.user_id !== uid) throw new AppError('FORBIDDEN', 'You do not have access to this job.', 403);
    company = row.company;
    role = row.title;
    jobUrl = row.url;
  } else if (body.jobId) {
    const row = (await db.query('SELECT id, user_id, company, title FROM job_descriptions WHERE id = $1', [body.jobId])).rows[0] as
      | { id: string; user_id: string; company: string; title: string }
      | undefined;
    if (!row) throw new AppError('NOT_FOUND', 'Job description not found.', 404);
    if (row.user_id !== uid) throw new AppError('FORBIDDEN', 'You do not have access to this job.', 403);
    company = row.company;
    role = row.title;
    jobId = row.id;
  } else {
    throw new AppError('VALIDATION', 'Provide jobId or savedJobId.', 400);
  }

  if (body.resumeId) {
    const r = (await db.query('SELECT user_id FROM resumes WHERE id = $1', [body.resumeId])).rows[0] as { user_id: string } | undefined;
    if (!r || r.user_id !== uid) throw new AppError('FORBIDDEN', 'You do not have access to that resume.', 403);
  }

  const id = newId('app');
  await db.query(
    `INSERT INTO applications (id, user_id, company, role, job_url, job_id, resume_id, template_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SAVED')`,
    [id, uid, company || 'Unknown company', role || 'Unknown role', jobUrl, jobId, body.resumeId || null, body.templateId || 'classic'],
  );
  await db.query(
    'INSERT INTO application_events (id, application_id, user_id, from_status, to_status) VALUES ($1,$2,$3,$4,$5)',
    [`ape_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, id, uid, '', 'SAVED'],
  );
  track(uid, 'application_created', { fromJob: true });

  res.status(201).json({
    id,
    application: { id, company, role, status: 'SAVED' },
    nextSteps: [
      { action: 'tailor', label: 'Tailor your CV to this job', href: body.jobId ? `/tailor?jobId=${jobId}` : '/tailor' },
      { action: 'cover-letter', label: 'Generate a cover letter', href: '/app/ai-tools' },
      { action: 'interview-prep', label: 'Prepare for interviews', href: '/app/interview' },
    ],
  });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const row = await findOwned(req.params.id, req.user!.uid);
  await getDb().query('DELETE FROM applications WHERE id = $1', [row.id]);
  res.json({ ok: true });
});

export default router;
