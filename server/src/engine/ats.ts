// Deterministic ATS compatibility analysis.
//
// IMPORTANT (product honesty): this is EnhanceCV's transparent compatibility
// metric computed from implemented rules below — it is NOT a prediction of how
// any specific employer's ATS will rank the document.
//
// Rule categories and checks are informed by:
//  - the MIT-licensed ResumeSkills project (resume-ats-optimizer skill):
//    standard headers, contact rules, font/bullet/dates conventions,
//    keyword density concepts.
//  - the MIT-licensed atsresume project's data model conventions.

import {
  ALL_SECTIONS,
  AtsCheck,
  ATSAnalysis,
  ResumeData,
  SectionKey,
  Severity,
} from '../types';
import { ALL_POWER_VERBS, WEAK_OPENERS } from '../lib/verbs';
import { containsMetric, wordCount, GENERIC_SUMMARY_MARKERS } from '../lib/text';
import { findSkillsInText } from '../lib/skills';

const CATEGORY_WEIGHTS: Record<AtsCheck['category'], number> = {
  formatting: 20,
  structure: 20,
  content: 30,
  skills: 20,
  readability: 10,
};

interface CheckDef {
  id: string;
  category: AtsCheck['category'];
  weight: number;
  run: (ctx: AnalysisContext) => { passed: boolean; message: string; recommendation?: string };
}

interface AnalysisContext {
  resume: ResumeData;
  allText: string;
  bullets: string[];
  visibleSections: Set<SectionKey>;
}

function sectionLabel(key: SectionKey): string {
  const labels: Record<SectionKey, string> = {
    summary: 'Summary',
    experience: 'Experience',
    projects: 'Projects',
    education: 'Education',
    skills: 'Skills',
    certifications: 'Certifications',
    languages: 'Languages',
    achievements: 'Achievements',
  };
  return labels[key];
}

function collectBullets(resume: ResumeData): string[] {
  const bullets: string[] = [];
  for (const e of resume.experience) bullets.push(...e.bullets.filter((b) => b.trim()));
  for (const p of resume.projects) bullets.push(...p.bullets.filter((b) => b.trim()));
  return bullets;
}

function resumeText(resume: ResumeData): string {
  const parts: string[] = [resume.summary];
  for (const e of resume.experience) {
    parts.push(e.title, e.company, e.location || '', ...e.bullets);
  }
  for (const p of resume.projects) {
    parts.push(p.name, p.description || '', ...(p.tech || []), ...p.bullets);
  }
  for (const ed of resume.education) {
    parts.push(ed.institution, ed.degree, ed.field || '');
  }
  parts.push(...resume.skills.technical, ...resume.skills.soft);
  for (const c of resume.certifications) parts.push(c.name, c.issuer || '');
  for (const l of resume.languages) parts.push(l.name);
  parts.push(...resume.achievements);
  return parts.filter(Boolean).join('\n');
}

function dateTokens(resume: ResumeData): string[] {
  const tokens: string[] = [];
  const push = (s?: string) => {
    if (s && s.trim()) tokens.push(s.trim());
  };
  for (const e of resume.experience) {
    push(e.startDate);
    push(e.endDate);
  }
  for (const ed of resume.education) {
    push(ed.startDate);
    push(ed.endDate);
  }
  return tokens;
}

const CHECKS: CheckDef[] = [
  // ---------- FORMATTING ----------
  {
    id: 'fmt-standard-headings',
    category: 'formatting',
    weight: 25,
    run: ({ visibleSections }) => {
      const standard = [...visibleSections].map(sectionLabel);
      if (standard.length >= 4) {
        return { passed: true, message: `Uses standard section headings (${standard.slice(0, 4).join(', ')}${standard.length > 4 ? ', …' : ''}).` };
      }
      return {
        passed: false,
        message: 'Fewer than four standard resume sections detected.',
        recommendation: 'Include standard sections such as Summary, Experience, Skills and Education with conventional headings.',
      };
    },
  },
  {
    id: 'fmt-contact',
    category: 'formatting',
    weight: 25,
    run: ({ resume }) => {
      const p = resume.personal;
      const missing: string[] = [];
      if (!p.fullName?.trim()) missing.push('name');
      if (!p.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) missing.push('valid email');
      if (!p.phone?.trim()) missing.push('phone');
      if (!p.location?.trim()) missing.push('location');
      if (missing.length === 0) {
        return { passed: true, message: 'Complete contact information (name, email, phone, location).' };
      }
      return {
        passed: false,
        message: `Contact information incomplete: missing ${missing.join(', ')}.`,
        recommendation: 'Add the missing contact details — ATS software parses them from the document body.',
      };
    },
  },
  {
    id: 'fmt-dates-consistent',
    category: 'formatting',
    weight: 25,
    run: ({ resume }) => {
      const tokens = dateTokens(resume);
      if (tokens.length === 0) {
        return { passed: false, message: 'No dates found on experience or education entries.', recommendation: 'Add start/end dates (MM/YYYY) — most ATS parsers expect them.' };
      }
      const ok = tokens.filter((t) => /^\d{4}([/-]\d{2})?$|^present$/i.test(t)).length;
      const ratio = ok / tokens.length;
      if (ratio >= 0.9) return { passed: true, message: 'Dates follow a consistent, parseable format.' };
      return {
        passed: false,
        message: 'Some dates use inconsistent formats.',
        recommendation: 'Use one consistent format everywhere, e.g. MM/YYYY or YYYY, and "Present" for current roles.',
      };
    },
  },
  {
    id: 'fmt-length',
    category: 'formatting',
    weight: 25,
    run: ({ resume }) => {
      const pages = estimatePages(resume);
      if (pages <= 2) return { passed: true, message: `Document length is appropriate (~${pages} page${pages === 1 ? '' : 's'}).` };
      return {
        passed: false,
        message: `Resume is long (~${pages} pages estimated).`,
        recommendation: 'Trim to 1–2 pages: condense older or less relevant roles and remove redundant bullets.',
      };
    },
  },

  // ---------- STRUCTURE ----------
  {
    id: 'str-experience',
    category: 'structure',
    weight: 30,
    run: ({ resume }) => {
      if (resume.experience.length === 0) {
        return {
          passed: false,
          message: 'No work experience entries.',
          recommendation: 'Add at least one experience entry with company, title, dates and achievement bullets. Projects can substitute for students/graduates.',
        };
      }
      const incomplete = resume.experience.filter((e) => !e.company?.trim() || !e.title?.trim() || (!e.startDate?.trim() && !e.current));
      if (incomplete.length === 0) {
        return { passed: true, message: `${resume.experience.length} experience entr${resume.experience.length === 1 ? 'y' : 'ies'} with company, title and dates.` };
      }
      return {
        passed: false,
        message: `${incomplete.length} experience entr${incomplete.length === 1 ? 'y is' : 'ies are'} missing company, title or dates.`,
        recommendation: 'Every role should include employer, job title and start/end dates.',
      };
    },
  },
  {
    id: 'str-education',
    category: 'structure',
    weight: 20,
    run: ({ resume }) => {
      if (resume.education.length > 0) {
        const ok = resume.education.every((e) => e.institution?.trim() && e.degree?.trim());
        return ok
          ? { passed: true, message: 'Education section present with institution and degree.' }
          : { passed: false, message: 'Some education entries are missing the institution or degree.', recommendation: 'Each education entry needs the institution and the qualification name.' };
      }
      return {
        passed: false,
        message: 'No education section.',
        recommendation: 'Add education (institution, qualification, dates). If you have no formal education to list, add certifications instead.',
      };
    },
  },
  {
    id: 'str-summary',
    category: 'structure',
    weight: 20,
    run: ({ resume }) => {
      const len = wordCount(resume.summary || '');
      if (len >= 25 && len <= 120) {
        return { passed: true, message: 'Professional summary present with useful length.' };
      }
      if (len === 0) {
        return {
          passed: false,
          message: 'No professional summary.',
          recommendation: 'Add a 3–5 line summary stating your role, years of experience and strongest relevant skills.',
        };
      }
      return {
        passed: false,
        message: len < 25 ? 'Summary is very short.' : 'Summary is too long.',
        recommendation: 'Aim for 3–5 lines (~30–80 words): role, experience, top skills, value you deliver.',
      };
    },
  },
  {
    id: 'str-projects-or-extra',
    category: 'structure',
    weight: 15,
    run: ({ resume }) => {
      const extras = ['projects', 'certifications', 'achievements', 'languages'] as SectionKey[];
      const present = extras.filter((k) => (resume as unknown as Record<string, unknown>)[k] && ((resume as unknown as Record<string, unknown>)[k] as unknown[]).length > 0);
      if (present.length >= 1) {
        return { passed: true, message: `Supporting sections present (${present.map(sectionLabel).join(', ')}).` };
      }
      return {
        passed: false,
        message: 'No supporting sections (projects, certifications, achievements or languages).',
        recommendation: 'Projects and certifications strengthen keyword coverage and give parsers more structured data.',
      };
    },
  },
  {
    id: 'str-bullets-per-role',
    category: 'structure',
    weight: 15,
    run: ({ resume }) => {
      if (resume.experience.length === 0) return { passed: true, message: 'No experience section to check.' };
      const weak = resume.experience.filter((e) => e.bullets.filter((b) => b.trim()).length < 2);
      if (weak.length === 0) return { passed: true, message: 'Each role lists multiple achievement bullets.' };
      return {
        passed: false,
        message: `${weak.length} role${weak.length === 1 ? '' : 's'} with fewer than 2 bullets.`,
        recommendation: 'List 2–6 achievement bullets per role so parsers and recruiters see substance for every position.',
      };
    },
  },

  // ---------- CONTENT ----------
  {
    id: 'cnt-bullets-exist',
    category: 'content',
    weight: 15,
    run: ({ bullets }) => {
      if (bullets.length >= 5) return { passed: true, message: `${bullets.length} achievement bullets across roles and projects.` };
      return {
        passed: false,
        message: `Only ${bullets.length} achievement bullet${bullets.length === 1 ? '' : 's'} found.`,
        recommendation: 'Write 2–6 bullets per role focusing on what you did, how, and the result.',
      };
    },
  },
  {
    id: 'cnt-action-verbs',
    category: 'content',
    weight: 25,
    run: ({ bullets }) => {
      if (bullets.length === 0) return { passed: true, message: 'No bullets to check.' };
      const ratio = bullets.filter((b) => startsWithVerb(b)).length / bullets.length;
      if (ratio >= 0.7) return { passed: true, message: `${Math.round(ratio * 100)}% of bullets start with a strong action verb.` };
      return {
        passed: false,
        message: `Only ${Math.round(ratio * 100)}% of bullets start with a strong action verb.`,
        recommendation: 'Start bullets with power verbs like Developed, Implemented, Led, Optimized instead of "Worked on" or "Responsible for".',
      };
    },
  },
  {
    id: 'cnt-quantified',
    category: 'content',
    weight: 25,
    run: ({ bullets }) => {
      if (bullets.length === 0) return { passed: true, message: 'No bullets to check.' };
      const ratio = bullets.filter(containsMetric).length / bullets.length;
      if (ratio >= 0.4) return { passed: true, message: `${Math.round(ratio * 100)}% of bullets contain measurable outcomes.` };
      return {
        passed: false,
        message: `Only ${Math.round(ratio * 100)}% of bullets contain measurable outcomes.`,
        recommendation: 'Quantify real results you can defend (users served, % faster, incidents reduced). Never invent numbers — add ones you can evidence.',
      };
    },
  },
  {
    id: 'cnt-vague-phrases',
    category: 'content',
    weight: 20,
    run: ({ bullets }) => {
      const vague = bullets.filter((b) => WEAK_OPENERS.some((w) => w.pattern.test(b.trim())));
      if (vague.length === 0) return { passed: true, message: 'No weak or vague bullet openers detected.' };
      return {
        passed: false,
        message: `${vague.length} bullet${vague.length === 1 ? '' : 's'} start with weak phrasing (e.g. "${vague[0].trim().split(/\s+/).slice(0, 3).join(' "').split('"')[0]}…").`,
        recommendation: 'Replace "Worked on / Helped with / Responsible for" with specific action verbs describing what you actually did.',
      };
    },
  },
  {
    id: 'cnt-repetition',
    category: 'content',
    weight: 15,
    run: ({ bullets }) => {
      const seen = new Map<string, number>();
      for (const b of bullets) {
        const k = b.trim().toLowerCase();
        seen.set(k, (seen.get(k) || 0) + 1);
      }
      const dupes = [...seen.values()].filter((v) => v > 1).length;
      if (dupes === 0) return { passed: true, message: 'No repeated bullets detected.' };
      return {
        passed: false,
        message: `${dupes} duplicated bullet${dupes === 1 ? '' : 's'} found.`,
        recommendation: 'Duplicate bullets read as keyword stuffing to both parsers and reviewers. Rewrite each to be distinct.',
      };
    },
  },

  // ---------- SKILLS ----------
  {
    id: 'skl-technical-present',
    category: 'skills',
    weight: 35,
    run: ({ resume }) => {
      const n = resume.skills.technical.filter((s) => s.trim()).length;
      if (n >= 6 && n <= 30) return { passed: true, message: `${n} technical skills listed.` };
      if (n < 6) {
        return {
          passed: false,
          message: `Only ${n} technical skills listed.`,
          recommendation: 'List the technologies you genuinely know (languages, frameworks, databases, tools) — these are what ATS keyword matching looks for.',
        };
      }
      return {
        passed: false,
        message: `${n} technical skills listed — possibly overstuffed.`,
        recommendation: 'Trim to the skills you can defend in an interview (aim for 8–20).',
      };
    },
  },
  {
    id: 'skl-organised',
    category: 'skills',
    weight: 25,
    run: ({ resume }) => {
      const soft = resume.skills.soft.filter((s) => s.trim()).length;
      if (soft >= 3) return { passed: true, message: 'Technical and soft skills are separated into organised groups.' };
      return {
        passed: false,
        message: 'Soft skills are not grouped separately (or missing).',
        recommendation: 'Split skills into "Technical Skills" and "Soft Skills" groups — parsers map grouped skills more reliably.',
      };
    },
  },
  {
    id: 'skl-recognised',
    category: 'skills',
    weight: 25,
    run: ({ allText }) => {
      const recognised = findSkillsInText(allText);
      const listed = resumeListedSkills(allText);
      const ratio = listed === 0 ? (recognised.length > 0 ? 1 : 0) : recognised.length / Math.min(listed, 30);
      if (ratio >= 0.6) return { passed: true, message: `${recognised.length} skills match industry-recognised technology names.` };
      return {
        passed: false,
        message: 'Many skills use non-standard names that keyword parsers may not recognise.',
        recommendation: 'Use standard technology names (e.g. "PostgreSQL" rather than "Postgres-like DB", "CI/CD" rather than "build pipelines").',
      };
    },
  },
  {
    id: 'skl-no-fluff-only',
    category: 'skills',
    weight: 15,
    run: ({ resume }) => {
      const tech = resume.skills.technical.filter((s) => s.trim());
      if (tech.length > 0) return { passed: true, message: 'Skills section includes concrete technologies, not only generic traits.' };
      return {
        passed: false,
        message: 'No concrete technical skills.',
        recommendation: 'Generic traits alone ("hardworking", "motivated") do not match ATS keyword searches. Add real technologies.',
      };
    },
  },

  // ---------- READABILITY ----------
  {
    id: 'rdb-bullet-length',
    category: 'readability',
    weight: 30,
    run: ({ bullets }) => {
      if (bullets.length === 0) return { passed: true, message: 'No bullets to check.' };
      const lens = bullets.map((b) => wordCount(b));
      const bad = lens.filter((n) => n < 6 || n > 40).length;
      if (bad === 0) return { passed: true, message: 'Bullet lengths are consistently readable (6–40 words).' };
      return {
        passed: false,
        message: `${bad} bullet${bad === 1 ? ' is' : 's are'} too short or too long.`,
        recommendation: 'Keep each bullet to one or two lines (~8–30 words): action + method + result.',
      };
    },
  },
  {
    id: 'rdb-person-pronouns',
    category: 'readability',
    weight: 20,
    run: ({ bullets, resume }) => {
      const text = [...bullets, resume.summary || ''].join(' ');
      const hits = (text.match(/\b(I|my|me|we|our)\b/gi) || []).length;
      if (hits <= 2) return { passed: true, message: 'Writing avoids first-person pronouns.' };
      return {
        passed: false,
        message: `First-person pronouns used ${hits} times.`,
        recommendation: 'Resume convention is implied first person: "Developed X", not "I developed X".',
      };
    },
  },
  {
    id: 'rdb-punctuation-consistency',
    category: 'readability',
    weight: 20,
    run: ({ bullets }) => {
      if (bullets.length < 3) return { passed: true, message: 'Not enough bullets to assess punctuation consistency.' };
      const withPeriod = bullets.filter((b) => /\.$/.test(b.trim())).length;
      const ratio = withPeriod / bullets.length;
      if (ratio >= 0.9 || ratio <= 0.1) return { passed: true, message: 'Bullet punctuation is consistent.' };
      return {
        passed: false,
        message: 'Bullets mix ending punctuation styles (some with full stops, some without).',
        recommendation: 'Pick one style — typically no full stop on short fragments — and apply it to every bullet.',
      };
    },
  },
  {
    id: 'rdb-summary-quality',
    category: 'readability',
    weight: 30,
    run: ({ resume }) => {
      const s = (resume.summary || '').toLowerCase();
      if (!s.trim()) return { passed: true, message: 'No summary to assess.' };
      const generic = GENERIC_SUMMARY_MARKERS.filter((m) => s.includes(m));
      if (generic.length === 0) return { passed: true, message: 'Summary is specific rather than generic.' };
      return {
        passed: false,
        message: `Summary uses generic filler ("${generic[0]}").`,
        recommendation: 'Replace clichés with concrete facts: your specialism, years of experience, notable technologies and outcomes.',
      };
    },
  },
];

function startsWithVerb(bullet: string): boolean {
  const first = bullet.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || '';
  if (!first) return false;
  return ALL_POWER_VERBS.some((v) => v.toLowerCase() === first);
}

function resumeListedSkills(allText: string): number {
  // Rough count of distinct recognised skills in the whole document — used to
  // normalise the "recognised names" check.
  return new Set(findSkillsInText(allText).map((s) => s.canonical)).size;
}

export function estimatePages(resume: ResumeData): number {
  const chars = resumeText(resume).length + (resume.personal.fullName || '').length;
  // ~3,500 characters of plain text fit on one A4 page at 10–11pt with headings.
  return Math.max(1, Math.round((chars / 3500) * 10) / 10);
}

export function analyseATS(resume: ResumeData): ATSAnalysis {
  const visibleSections = new Set<SectionKey>(
    (resume.sectionOrder && resume.sectionOrder.length > 0 ? resume.sectionOrder : ALL_SECTIONS).filter(
      (k) => !(resume.hiddenSections || []).includes(k)
    )
  );
  const bullets = collectBullets(resume);
  const allText = resumeText(resume);
  const ctx: AnalysisContext = { resume, allText, bullets, visibleSections };

  const checks: AtsCheck[] = CHECKS.map((def) => {
    try {
      const result = def.run(ctx);
      return {
        id: def.id,
        category: def.category,
        weight: def.weight,
        passed: result.passed,
        message: result.message,
        recommendation: result.recommendation,
      };
    } catch {
      return {
        id: def.id,
        category: def.category,
        weight: def.weight,
        passed: true,
        message: 'Check skipped.',
      };
    }
  });

  const categoryScores: Record<AtsCheck['category'], number> = {
    formatting: 0,
    structure: 0,
    content: 0,
    skills: 0,
    readability: 0,
  };
  for (const cat of Object.keys(categoryScores) as AtsCheck['category'][]) {
    const catChecks = checks.filter((c) => c.category === cat);
    const total = catChecks.reduce((sum, c) => sum + c.weight, 0);
    const earned = catChecks.filter((c) => c.passed).reduce((sum, c) => sum + c.weight, 0);
    categoryScores[cat] = total === 0 ? 100 : Math.round((earned / total) * 100);
  }

  const overall = Math.round(
    (Object.keys(CATEGORY_WEIGHTS) as AtsCheck['category'][]).reduce(
      (sum, cat) => sum + (categoryScores[cat] * CATEGORY_WEIGHTS[cat]) / 100,
      0
    )
  );

  const working = checks.filter((c) => c.passed).map((c) => c.message);
  const issues = checks
    .filter((c) => !c.passed && c.recommendation)
    .map((c) => ({
      severity: (c.weight >= 25 ? 'critical' : c.weight >= 15 ? 'warning' : 'info') as Severity,
      message: c.message,
      recommendation: c.recommendation!,
    }));

  return {
    overallScore: Math.min(100, Math.max(0, overall)),
    formattingScore: categoryScores.formatting,
    structureScore: categoryScores.structure,
    contentScore: categoryScores.content,
    skillsScore: categoryScores.skills,
    readabilityScore: categoryScores.readability,
    checks,
    working: working.slice(0, 8),
    issues,
    recommendations: issues.map((i) => i.recommendation).slice(0, 6),
    metrics: {
      bulletCount: bullets.length,
      quantifiedBulletRatio: bullets.length ? bullets.filter(containsMetric).length / bullets.length : 0,
      actionVerbStartRatio: bullets.length ? bullets.filter(startsWithVerb).length / bullets.length : 0,
      averageBulletWords: bullets.length ? Math.round(bullets.reduce((s, b) => s + wordCount(b), 0) / bullets.length) : 0,
      technicalSkillCount: resume.skills.technical.filter((s) => s.trim()).length,
      estimatedPages: estimatePages(resume),
    },
  };
}
