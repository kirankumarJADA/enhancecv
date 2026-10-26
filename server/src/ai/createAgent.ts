// Curevo AI — Create Resume Agent powered by NVIDIA Nemotron.
//
// Converts user-supplied career details into a complete, polished,
// ATS-optimized professional resume.
//
// Strictly enforces Ground Truth through the Truth Guard:
// - Uses ONLY employers, titles, dates, institutions, degrees, technologies,
//   and metrics supplied in the user's input.
// - Rejects any AI-fabricated claims, numbers, or ungrounded qualifications.
// - Deterministically scores the generated resume using the ATS engine.

import { z } from 'zod';
import { getAiProvider, isAiEnabled, AiUnavailableError } from './provider';
import { isBulletTruthful, validateTruth } from '../engine/tailor';
import { analyseATS } from '../engine/ats';
import { analyseJobDescription } from '../engine/jd';
import { computeJobMatch } from '../engine/match';
import { AppError } from '../middleware/errors';
import {
  ResumeData,
  ExperienceItem,
  ProjectItem,
  EducationItem,
  CertificationItem,
  LanguageItem,
  SkillsData,
  DEFAULT_SECTION_ORDER,
  ChangeLogEntry,
  TruthReport,
  ATSAnalysis,
  MatchAnalysis,
} from '../types';

export interface CreateResumeDetails {
  personal: {
    fullName: string;
    email: string;
    phone?: string;
    location?: string;
    headline?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  summary?: string;
  experience?: Array<{
    company: string;
    title: string;
    location?: string;
    startDate: string;
    endDate?: string;
    current?: boolean;
    description?: string;
    bullets?: string[];
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    field?: string;
    startDate?: string;
    endDate?: string;
    grade?: string;
  }>;
  skills?: {
    technical?: string[];
    soft?: string[];
  } | string[];
  projects?: Array<{
    name: string;
    description?: string;
    tech?: string[];
    link?: string;
    bullets?: string[];
  }>;
  certifications?: Array<{
    name: string;
    issuer?: string;
    year?: string;
  }>;
  languages?: Array<{
    name: string;
    proficiency?: string;
  }>;
  targetRole?: string;
}

export interface CreateResumeResult {
  resume: ResumeData;
  ats: ATSAnalysis;
  match: MatchAnalysis | null;
  changeLog: ChangeLogEntry[];
  truth: TruthReport;
  agent: {
    provider: string;
    model: string;
    usedAi: boolean;
  };
}

const createProposalSchema = z.object({
  summary: z.string().min(20).max(1500),
  headline: z.string().max(200).optional(),
  experience: z.array(
    z.object({
      itemId: z.string().min(1).max(64),
      bullets: z.array(z.string().min(5).max(600)).min(1).max(8),
    })
  ).optional(),
  projects: z.array(
    z.object({
      itemId: z.string().min(1).max(64),
      bullets: z.array(z.string().min(5).max(600)).min(1).max(8),
    })
  ).optional(),
  skillsOrder: z.array(z.string().max(80)).max(60).optional(),
});

type CreateProposal = z.infer<typeof createProposalSchema>;

const SYSTEM_PROMPT = `You are the Curevo AI Resume Builder powered by NVIDIA Nemotron.
Your task is to take the user's supplied career facts and craft a complete, highly polished, ATS-optimized professional resume.

ABSOLUTE GROUND TRUTH RULES (MANDATORY):
1. ONLY use facts, employers, degrees, institutions, job titles, dates, technologies, and metrics present in the supplied USER FACTS.
2. DO NOT INVENT or HALLUCINATE:
   - NEVER fabricate an employer, institution, job title, degree, or certification.
   - NEVER invent numbers, metrics, percentages, dollar amounts, or statistics that were not in the user's input.
   - NEVER invent technologies, tools or skills not mentioned or directly evidenced in the user's facts.
3. WRITING STYLE:
   - Craft achievement-oriented bullet points using the Google XYZ formula: "Accomplished [X] by doing [Y]".
   - Start each bullet with a strong action verb (Engineered, Architected, Spearheaded, Implemented, Designed, Streamlined).
   - Write a compelling 3-4 sentence professional summary tailored to the target role.
4. Return ONLY valid JSON matching the requested schema.`;

function buildGroundTruthResume(details: CreateResumeDetails): ResumeData {
  const fullName = details.personal?.fullName?.trim();
  const email = details.personal?.email?.trim();
  if (!fullName) {
    throw new AppError('VALIDATION_ERROR', 'Full name is required.', 400);
  }
  if (!email) {
    throw new AppError('VALIDATION_ERROR', 'Email is required.', 400);
  }

  // Normalize skills
  let technicalSkills: string[] = [];
  let softSkills: string[] = [];
  if (Array.isArray(details.skills)) {
    technicalSkills = details.skills.map((s) => String(s).trim()).filter(Boolean);
  } else if (details.skills && typeof details.skills === 'object') {
    technicalSkills = (details.skills.technical || []).map((s) => String(s).trim()).filter(Boolean);
    softSkills = (details.skills.soft || []).map((s) => String(s).trim()).filter(Boolean);
  }

  // Normalize experience
  const experience: ExperienceItem[] = (details.experience || []).map((e, idx) => {
    let bullets: string[] = [];
    if (Array.isArray(e.bullets) && e.bullets.length > 0) {
      bullets = e.bullets.map((b) => String(b).trim()).filter(Boolean);
    } else if (e.description && e.description.trim()) {
      bullets = e.description
        .split(/(?:\r?\n)+|(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 3);
    }
    if (bullets.length === 0) {
      bullets = [`Contributed as ${e.title} at ${e.company}.`];
    }
    return {
      id: `exp_${idx + 1}`,
      company: e.company.trim(),
      title: e.title.trim(),
      location: e.location?.trim() || '',
      startDate: e.startDate?.trim() || '',
      endDate: e.current ? 'Present' : (e.endDate?.trim() || ''),
      current: !!e.current || e.endDate?.toLowerCase() === 'present',
      bullets,
    };
  });

  // Normalize education
  const education: EducationItem[] = (details.education || []).map((ed, idx) => ({
    id: `edu_${idx + 1}`,
    institution: ed.institution.trim(),
    degree: ed.degree.trim(),
    field: ed.field?.trim() || '',
    startDate: ed.startDate?.trim() || '',
    endDate: ed.endDate?.trim() || '',
    grade: ed.grade?.trim() || '',
  }));

  // Normalize projects
  const projects: ProjectItem[] = (details.projects || []).map((p, idx) => {
    let bullets: string[] = [];
    if (Array.isArray(p.bullets) && p.bullets.length > 0) {
      bullets = p.bullets.map((b) => String(b).trim()).filter(Boolean);
    } else if (p.description && p.description.trim()) {
      bullets = [p.description.trim()];
    } else {
      bullets = [`Developed project: ${p.name}.`];
    }
    return {
      id: `proj_${idx + 1}`,
      name: p.name.trim(),
      link: p.link?.trim() || '',
      description: p.description?.trim() || '',
      tech: (p.tech || []).map((t) => String(t).trim()).filter(Boolean),
      bullets,
    };
  });

  // Normalize certifications
  const certifications: CertificationItem[] = (details.certifications || []).map((c, idx) => ({
    id: `cert_${idx + 1}`,
    name: c.name.trim(),
    issuer: c.issuer?.trim() || '',
    year: c.year?.trim() || '',
  }));

  // Normalize languages
  const languages: LanguageItem[] = (details.languages || []).map((l, idx) => ({
    id: `lang_${idx + 1}`,
    name: l.name.trim(),
    proficiency: l.proficiency?.trim() || '',
  }));

  const headline = details.personal.headline?.trim() || details.targetRole?.trim() || (experience[0]?.title ?? '');
  const summary = details.summary?.trim() || '';

  return {
    personal: {
      fullName,
      email,
      phone: details.personal.phone?.trim() || '',
      location: details.personal.location?.trim() || '',
      headline,
      linkedin: details.personal.linkedin?.trim() || '',
      github: details.personal.github?.trim() || '',
      portfolio: details.personal.portfolio?.trim() || '',
      otherLinks: [],
    },
    summary,
    experience,
    projects,
    education,
    skills: {
      technical: technicalSkills,
      soft: softSkills,
    },
    certifications,
    languages,
    achievements: [],
    customSections: [],
    sectionOrder: DEFAULT_SECTION_ORDER,
    hiddenSections: [],
  };
}

function buildUserPrompt(groundTruth: ResumeData, targetRole?: string, jobText?: string): string {
  const lines: string[] = [];
  lines.push('=== USER FACTS (SOLE SOURCE OF TRUTH — DO NOT FABRICATE BEYOND THESE FACTS) ===');
  lines.push(`Candidate: ${groundTruth.personal.fullName}`);
  lines.push(`Email: ${groundTruth.personal.email}`);
  if (targetRole) lines.push(`Target Role: ${targetRole}`);
  if (groundTruth.summary) lines.push(`User summary notes: ${groundTruth.summary}`);

  lines.push('\nEXPERIENCE:');
  groundTruth.experience.forEach((e) => {
    lines.push(`[${e.id}] ${e.title} at ${e.company} (${e.startDate} - ${e.endDate})`);
    e.bullets.forEach((b) => lines.push(`  - ${b}`));
  });

  if (groundTruth.projects.length > 0) {
    lines.push('\nPROJECTS:');
    groundTruth.projects.forEach((p) => {
      lines.push(`[${p.id}] ${p.name}${p.tech?.length ? ` (tech: ${p.tech.join(', ')})` : ''}`);
      p.bullets.forEach((b) => lines.push(`  - ${b}`));
    });
  }

  lines.push('\nSKILLS:');
  lines.push(`Technical: ${groundTruth.skills.technical.join(', ') || '(none)'}`);
  lines.push(`Soft: ${groundTruth.skills.soft.join(', ') || '(none)'}`);

  if (groundTruth.education.length > 0) {
    lines.push('\nEDUCATION:');
    groundTruth.education.forEach((ed) => {
      lines.push(`- ${ed.degree} ${ed.field || ''}, ${ed.institution} (${ed.startDate} - ${ed.endDate})`);
    });
  }

  if (jobText && jobText.trim()) {
    lines.push('\n=== TARGET JOB DESCRIPTION (ALIGN TONE AND RELEVANCE — DO NOT FABRICATE MISSING SKILLS) ===');
    lines.push(jobText.slice(0, 4000));
  }

  lines.push('\n=== TASK ===');
  lines.push('Generate polished resume content as JSON:');
  lines.push('- "summary": Compelling 3-4 sentence professional summary based only on user facts.');
  lines.push('- "headline": Professional headline for the candidate.');
  lines.push('- "experience": Array of { "itemId": string, "bullets": string[] } rewriting bullets into strong action-oriented statements.');
  lines.push('- "projects": Array of { "itemId": string, "bullets": string[] } polishing project bullets.');
  lines.push('- "skillsOrder": Reordered technical skills prioritizing the target role.');
  return lines.join('\n');
}

export async function createResumeFromDetails(
  details: CreateResumeDetails,
  jobText?: string
): Promise<CreateResumeResult> {
  const groundTruth = buildGroundTruthResume(details);

  if (!isAiEnabled()) {
    throw new AiUnavailableError(
      'AI_NOT_CONFIGURED',
      'AI resume creation is not configured. NVIDIA API key required.',
      false
    );
  }

  const provider = getAiProvider();
  const changeLog: ChangeLogEntry[] = [];

  const prompt = buildUserPrompt(groundTruth, details.targetRole, jobText);
  const proposal: CreateProposal = await provider.completeJson({
    system: SYSTEM_PROMPT,
    user: prompt,
    schema: createProposalSchema,
    maxTokens: 4000,
    temperature: 0.2,
  });

  const finalResume = JSON.parse(JSON.stringify(groundTruth)) as ResumeData;

  // 1. Headline
  if (proposal.headline && proposal.headline.trim()) {
    finalResume.personal.headline = proposal.headline.trim();
  }

  // 2. Summary with Truth Guard validation
  if (proposal.summary && proposal.summary.trim()) {
    const summaryCheck = isBulletTruthful(proposal.summary, groundTruth);
    if (summaryCheck.ok) {
      changeLog.push({
        type: 'summary',
        section: 'Summary',
        before: groundTruth.summary,
        after: proposal.summary.trim(),
        reason: 'Crafted professional summary aligned with candidate facts.',
        label: 'summary',
        evidence: 'User facts — verified by Truth Guard',
      });
      finalResume.summary = proposal.summary.trim();
    } else {
      // Truth Guard rejected hallucinated claims in the summary
      finalResume.summary = groundTruth.summary || `${finalResume.personal.headline} with demonstrated expertise in ${groundTruth.skills.technical.slice(0, 4).join(', ')}.`;
    }
  }

  // 3. Experience bullets with Truth Guard validation
  if (proposal.experience && proposal.experience.length > 0) {
    for (const propExp of proposal.experience) {
      const targetExp = finalResume.experience.find((e) => e.id === propExp.itemId);
      if (!targetExp) continue;

      const validBullets: string[] = [];
      for (const proposedBullet of propExp.bullets) {
        const check = isBulletTruthful(proposedBullet, groundTruth);
        if (check.ok) {
          validBullets.push(proposedBullet.trim());
        }
      }

      if (validBullets.length > 0) {
        changeLog.push({
          type: 'bullet',
          section: `Experience — ${targetExp.title}, ${targetExp.company}`,
          before: targetExp.bullets.join('; '),
          after: validBullets.join('; '),
          reason: 'Polished bullet points using Google XYZ format starting with action verbs.',
          label: 'bullet_rewrite',
          evidence: 'User experience facts — verified by Truth Guard',
        });
        targetExp.bullets = validBullets;
      }
    }
  }

  // 4. Project bullets with Truth Guard validation
  if (proposal.projects && proposal.projects.length > 0) {
    for (const propProj of proposal.projects) {
      const targetProj = finalResume.projects.find((p) => p.id === propProj.itemId);
      if (!targetProj) continue;

      const validBullets: string[] = [];
      for (const proposedBullet of propProj.bullets) {
        const check = isBulletTruthful(proposedBullet, groundTruth);
        if (check.ok) {
          validBullets.push(proposedBullet.trim());
        }
      }

      if (validBullets.length > 0) {
        targetProj.bullets = validBullets;
      }
    }
  }

  // 5. Skills Ordering (permutation of existing skills only)
  if (proposal.skillsOrder && proposal.skillsOrder.length > 0) {
    const existing = groundTruth.skills.technical;
    const existingLower = new Map(existing.map((s) => [s.toLowerCase(), s]));
    const proposed = proposal.skillsOrder
      .map((s) => existingLower.get(s.toLowerCase()))
      .filter((s): s is string => !!s);
    const proposedSet = new Set(proposed.map((s) => s.toLowerCase()));
    const rest = existing.filter((s) => !proposedSet.has(s.toLowerCase()));
    const merged = [...proposed, ...rest];
    if (merged.length === existing.length) {
      finalResume.skills.technical = merged;
    }
  }

  // Final Truth Guard validation
  const truth = validateTruth(finalResume, groundTruth);

  // Deterministic ATS score
  const ats = analyseATS(finalResume);

  // Optional job match
  let match: MatchAnalysis | null = null;
  if (jobText && jobText.trim()) {
    const job = analyseJobDescription(jobText);
    match = computeJobMatch(finalResume, job);
  }

  return {
    resume: finalResume,
    ats,
    match,
    changeLog,
    truth,
    agent: {
      provider: provider.name,
      model: provider.model,
      usedAi: true,
    },
  };
}
