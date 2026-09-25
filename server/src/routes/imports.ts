// Import flows: pasted LinkedIn profile → Master CV preview/apply, and the
// document import alias. LinkedIn import is DETERMINISTIC parsing of
// user-pasted structured text — no scraping, no authenticated fetching.
// The parse result is a PREVIEW; nothing touches the Master CV until the
// user explicitly confirms via /apply.

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getDb, TS_TEXT } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { extractFile } from '../engine/extract';
import { getMasterRow, resumeRowToData } from './master';
import { track } from '../lib/analytics';
import { splitSkillList } from '../lib/skills';
import { stripBulletPrefix } from '../lib/text';
import type { ResumeData } from '../types';

const router = Router();

// --- document import (PDF/DOCX/TXT) — deterministic extraction, user review ---

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(pdf|docx|doc|txt)$/i.test(file.originalname);
    cb(null, ok);
  },
});

router.post('/resume', requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError('UNSUPPORTED_FILE_TYPE', 'Unsupported file type. Please upload a PDF, DOCX or TXT file.', 400);
  const result = await extractFile(req.file);
  track(req.user!.uid, 'resume_imported', { hasExperience: result.resume.experience.length > 0 });
  res.json({
    resume: result.resume,
    confidence: result.confidence,
    notes: result.notes,
    detected: {
      sections: Object.keys(result.confidence),
      contact: {
        name: !!result.resume.personal.fullName,
        email: !!result.resume.personal.email,
        phone: !!result.resume.personal.phone,
        location: !!result.resume.personal.location,
      },
      counts: {
        experience: result.resume.experience.length,
        education: result.resume.education.length,
        projects: result.resume.projects.length,
        skills: result.resume.skills.technical.length,
        certifications: result.resume.certifications.length,
      },
    },
  });
});

// --- LinkedIn profile import (pasted structured text) ---------------------------

interface ParsedProfile {
  name: string;
  headline: string;
  about: string;
  experience: { title: string; company: string; period: string; bullets: string[] }[];
  education: { degree: string; institution: string; period: string }[];
  skills: string[];
  certifications: string[];
  links: { linkedin?: string; github?: string; portfolio?: string };
}

const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(in|profile)\/[a-z0-9\-_%]+/i;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-z0-9\-_]+/i;
const PERIOD_RE = /((?:0?[1-9]|1[0-2])\/)?\s*((19|20)\d{2})\s*(?:-|–|—|to)\s*((?:0?[1-9]|1[0-2])\/)?\s*((19|20)\d{2}|present|current)/i;

function sectionBodies(text: string, headings: RegExp[]): Map<string, string[]> {
  const lines = text.split('\n');
  const bodies = new Map<string, string[]>();
  let current = '';
  for (const line of lines) {
    const clean = line.trim();
    const heading = headings.findIndex((re) => re.test(clean) && clean.length < 50);
    if (heading >= 0) {
      current = clean.toLowerCase();
      if (!bodies.has(current)) bodies.set(current, []);
      continue;
    }
    if (current) {
      const arr = bodies.get(current) || [];
      arr.push(line);
      bodies.set(current, arr);
    }
  }
  return bodies;
}

/** Parse a pasted LinkedIn profile (copied text) into structured preview data. */
export function parseLinkedInProfile(text: string): ParsedProfile {
  const profile: ParsedProfile = { name: '', headline: '', about: '', experience: [], education: [], skills: [], certifications: [], links: {} };
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Links anywhere in the text
  profile.links.linkedin = text.match(LINKEDIN_RE)?.[0];
  profile.links.github = text.match(GITHUB_RE)?.[0];
  if (!profile.links.github) {
    const portfolio = text.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,})(\/\S*)?/i);
    if (portfolio && !/linkedin|github/i.test(portfolio[0])) profile.links.portfolio = portfolio[0];
  }

  // Name + headline: the first 1-2 short lines that are not a section heading.
  const HEADING = /experience|education|skills|certifications?|about|projects?/i;
  const firstLines = lines.filter((l) => !HEADING.test(l.slice(0, 20)) && l.length < 80).slice(0, 2);
  if (firstLines[0]) profile.name = firstLines[0];
  if (firstLines[1]) profile.headline = firstLines[1];

  const bodies = sectionBodies(text, [/^experience$/i, /^education$/i, /^skills?$/i, /^certifications?$/i, /^about$/i]);

  // About
  const about = bodies.get('about') || [];
  profile.about = about.join(' ').replace(/\s+/g, ' ').trim().slice(0, 2600);

  // Experience: blocks separated by lines containing a date range
  const exp = bodies.get('experience') || [];
  let current: { title: string; company: string; period: string; bullets: string[] } | null = null;
  for (const raw of exp) {
    const line = stripBulletPrefix(raw);
    if (!line) continue;
    const period = line.match(PERIOD_RE)?.[0];
    if (period) {
      const rest = line.replace(period, '').replace(/[·•|,-]\s*$/, '').trim();
      const parts = rest.split(/\s+(?:at|@|·|\||,-)\s+/i).map((s) => s.trim()).filter(Boolean);
      if (current) profile.experience.push(current);
      current = {
        title: parts[0] || '',
        company: parts[1] || '',
        period,
        bullets: [],
      };
      continue;
    }
    if (current) {
      if (current.bullets.length === 0 && !current.company && line.length < 80 && !/^[•\-*>]/.test(raw)) {
        current.company = line;
      } else {
        current.bullets.push(line);
      }
    } else if (line.length < 100) {
      // role line before the date line
      current = { title: line, company: '', period: '', bullets: [] };
    }
  }
  if (current) profile.experience.push(current);

  // Education
  for (const raw of bodies.get('education') || []) {
    const line = stripBulletPrefix(raw);
    if (!line) continue;
    const period = line.match(PERIOD_RE)?.[0] || '';
    const rest = line.replace(period, '').replace(/[·•|,-]\s*$/, '').trim();
    const parts = rest.split(/\s*(?:,|·|\||\bat\b)\s*/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      profile.education.push({ degree: parts[0], institution: parts[1], period });
    } else if (rest) {
      profile.education.push({ degree: rest, institution: '', period });
    }
  }

  // Skills
  const skillText = (bodies.get('skills') || []).join(', ');
  for (const s of splitSkillList(skillText)) {
    const clean = s.trim();
    if (clean && !profile.skills.some((x) => x.toLowerCase() === clean.toLowerCase())) profile.skills.push(clean.slice(0, 60));
  }
  profile.skills = profile.skills.slice(0, 40);

  // Certifications
  for (const raw of bodies.get('certifications') || []) {
    const line = stripBulletPrefix(raw);
    if (line && line.length > 3) profile.certifications.push(line.slice(0, 160));
  }

  return profile;
}

const previewSchema = z.object({ text: z.string().min(50).max(40000) });

router.post('/linkedin', requireAuth, rateLimit({ windowMs: 60_000, max: 6 }), async (req, res) => {
  const body = previewSchema.parse(req.body);
  const parsed = parseLinkedInProfile(body.text);
  if (!parsed.name && parsed.experience.length === 0 && parsed.skills.length === 0) {
    throw new AppError('IMPORT_FAILED', 'Could not detect LinkedIn profile content. Paste the profile text (Experience, Education, Skills sections).', 422);
  }
  track(req.user!.uid, 'linkedin_imported', { experience: parsed.experience.length, skills: parsed.skills.length });
  res.json({
    preview: parsed,
    warning: 'Review every field below. Nothing is written to your Master CV until you confirm.',
  });
});

const applySchema = z.object({
  profile: z.object({
    name: z.string().max(120).optional(),
    headline: z.string().max(160).optional(),
    about: z.string().max(3000).optional(),
    experience: z.array(z.object({
      title: z.string().max(160),
      company: z.string().max(160),
      period: z.string().max(40).optional(),
      bullets: z.array(z.string().max(500)).max(12),
    })).max(20),
    education: z.array(z.object({
      degree: z.string().max(160),
      institution: z.string().max(160),
      period: z.string().max(40).optional(),
    })).max(10),
    skills: z.array(z.string().max(80)).max(40),
    certifications: z.array(z.string().max(160)).max(15),
    links: z.object({
      linkedin: z.string().max(240).optional(),
      github: z.string().max(240).optional(),
      portfolio: z.string().max(240).optional(),
    }).optional(),
  }),
});

function datesFromPeriod(period?: string): { startDate: string; endDate: string; current: boolean } {
  if (!period) return { startDate: '', endDate: '', current: false };
  const parts = period.split(/(?:-|–|—|to)/i).map((s) => s.trim());
  const norm = (s: string) => (/present|current/i.test(s) ? 'Present' : (/((\d{1,2})\/)?((19|20)\d{2})/.exec(s)?.[3] ? (/(\d{1,2}\/)/.test(s) ? (/(\d{1,2})\/((19|20)\d{2})/.exec(s) ? `${/(\d{1,2})\//.exec(s)![1].padStart(2, '0')}/${/(\d{1,2})\/((19|20)\d{2})/.exec(s)![2]}` : s) : s) : s));
  return {
    startDate: parts[0] ? norm(parts[0]) : '',
    endDate: parts[1] ? norm(parts[1]) : '',
    current: /present|current/i.test(period),
  };
}

/** Apply a CONFIRMED LinkedIn import: merge into the Master CV (never overwrite existing facts). */
router.post('/linkedin/apply', requireAuth, rateLimit({ windowMs: 60_000, max: 5 }), async (req, res) => {
  const body = applySchema.parse(req.body);
  const db = getDb();
  const masterRow = await getMasterRow(db, req.user!.uid);
  if (!masterRow) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);
  const master = resumeRowToData(masterRow);
  const imported: ResumeData = JSON.parse(JSON.stringify(master));
  const changes: string[] = [];

  const p = body.profile;

  if (p.name && !imported.personal.fullName) {
    imported.personal.fullName = p.name;
    changes.push('name');
  }
  if (p.headline && !imported.personal.headline) {
    imported.personal.headline = p.headline;
    changes.push('headline');
  }
  if (p.about && !imported.summary) {
    imported.summary = p.about;
    changes.push('summary (from About)');
  }
  for (const e of p.experience) {
    if (!e.title && !e.company) continue;
    if (imported.experience.some((x) => x.company.toLowerCase() === e.company.toLowerCase() && x.title.toLowerCase() === e.title.toLowerCase())) continue;
    const d = datesFromPeriod(e.period);
    imported.experience.push({
      id: `exp_imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title: e.title,
      company: e.company,
      location: '',
      startDate: d.startDate,
      endDate: d.current ? 'Present' : d.endDate,
      current: d.current,
      bullets: e.bullets,
    });
    changes.push(`experience: ${e.title} @ ${e.company}`);
  }
  for (const ed of p.education) {
    if (imported.education.some((x) => x.degree.toLowerCase() === ed.degree.toLowerCase() && x.institution.toLowerCase() === ed.institution.toLowerCase())) continue;
    const d = datesFromPeriod(ed.period);
    imported.education.push({
      id: `edu_imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      degree: ed.degree,
      field: '',
      institution: ed.institution,
      startDate: d.startDate,
      endDate: d.endDate,
      grade: '',
    });
    changes.push(`education: ${ed.degree}`);
  }
  for (const s of p.skills) {
    if (imported.skills.technical.some((x) => x.toLowerCase() === s.toLowerCase())) continue;
    imported.skills.technical.push(s);
    changes.push(`skill: ${s}`);
  }
  for (const c of p.certifications) {
    if (imported.certifications.some((x) => x.name.toLowerCase() === c.toLowerCase())) continue;
    imported.certifications.push({ id: `cert_imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, name: c, issuer: '', year: '' });
    changes.push(`certification: ${c}`);
  }
  if (p.links?.linkedin && !imported.personal.linkedin) {
    imported.personal.linkedin = p.links.linkedin;
    changes.push('LinkedIn link');
  }
  if (p.links?.github && !imported.personal.github) {
    imported.personal.github = p.links.github;
    changes.push('GitHub link');
  }

  if (changes.length === 0) {
    return res.json({ merged: false, message: 'Nothing new to merge — every imported field already exists on your Master CV.' });
  }

  const { analyseATS } = await import('../engine/ats');
  const ats = analyseATS(imported);
  await db.query(
    "UPDATE resumes SET content = $1, ats_score = $2, updated_at = NOW() WHERE id = $3",
    [JSON.stringify(imported), ats.overallScore, masterRow.id],
  );
  track(req.user!.uid, 'linkedin_imported', { applied: true, changes: changes.length });

  res.json({ merged: true, changes, master: imported, atsScore: ats.overallScore });
});

/** List the user's Master CV for the import merge preview context. */
router.get('/master-summary', requireAuth, async (req, res) => {
  const row = (await getDb().query(
    `SELECT content, ${TS_TEXT('updated_at')} AS updated_at FROM resumes WHERE user_id = $1 AND kind = 'master' LIMIT 1`,
    [req.user!.uid],
  )).rows[0] as { content: string; updated_at: string } | undefined;
  if (!row) throw new AppError('NO_MASTER_CV', 'Create your Master CV first.', 400);
  const master = JSON.parse(row.content) as ResumeData;
  res.json({
    existing: {
      experience: master.experience.map((e) => `${e.title} @ ${e.company}`),
      education: master.education.map((e) => `${e.degree} — ${e.institution}`),
      skills: master.skills.technical,
      certifications: master.certifications.map((c) => c.name),
    },
    updatedAt: row.updated_at,
  });
});

export default router;
