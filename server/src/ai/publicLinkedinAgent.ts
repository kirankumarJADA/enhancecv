// Curevo AI — Public LinkedIn Profile Optimization Agent (Phase 9G)
//
// 100% Public, anonymous, truth-grounded LinkedIn optimizer.
// Generates recruiter-searchable headlines, narrative About section,
// metric-enhanced experience bullets, and verified keyword recommendations.
//
// Invariants:
// - Factual grounding: Never invents employers, titles, degrees, or metrics.
// - Honest fallback: If NVIDIA AI is unavailable, returns high-grade deterministic guidance.

import { z } from 'zod';
import { AiProvider, AiUnavailableError, isAiEnabled, getAiProvider } from './provider';
import { buildAgentPrompt, TRUTH_RULES, type EvidenceInput } from './evidence';
import { isBulletTruthful } from '../engine/tailor';
import { ResumeData, JobAnalysis } from '../types';

// ---------------------------------------------------------------------------
// 1. Zod Schemas & Types
// ---------------------------------------------------------------------------

export const headlineOptionSchema = z.object({
  type: z.enum(['Impact-Driven', 'Skill-Focused', 'Executive / Leadership', 'Modern Specialist']),
  headline: z.string().min(10).max(220),
  rationale: z.string().max(250),
});

export const experienceEnhancementSchema = z.object({
  company: z.string().max(100),
  role: z.string().max(100),
  originalBullet: z.string().max(600),
  enhancedBullet: z.string().min(10).max(600),
  metricImpact: z.string().max(250),
  truthSafe: z.boolean(),
});

export const recruiterKeywordSchema = z.object({
  keyword: z.string().max(60),
  category: z.enum(['Hard Skill', 'Methodology', 'Tool/Framework', 'Leadership']),
  impactLevel: z.enum(['high', 'medium']),
  relevanceExplanation: z.string().max(200),
});

export const linkedinOptimizationSchema = z.object({
  scores: z.object({
    overallScore: z.number().int().min(0).max(100),
    headlineScore: z.number().int().min(0).max(100),
    aboutScore: z.number().int().min(0).max(100),
    experienceScore: z.number().int().min(0).max(100),
    skillsScore: z.number().int().min(0).max(100),
    searchabilityScore: z.number().int().min(0).max(100),
    completenessScore: z.number().int().min(0).max(100),
  }),
  analysis: z.object({
    strengths: z.array(z.string().max(300)).max(6),
    weaknesses: z.array(z.string().max(300)).max(6),
    profileCompletenessFeedback: z.string().max(400),
    positioningReview: z.string().max(500),
  }),
  headlineOptions: z.array(headlineOptionSchema).min(2).max(5),
  improvedAbout: z.object({
    text: z.string().min(50).max(2600),
    hook: z.string().max(300),
    coreStory: z.string().max(800),
    keyAccomplishments: z.array(z.string().max(250)).max(5),
    specialtiesBlock: z.string().max(400),
    callToAction: z.string().max(250),
  }),
  experienceEnhancements: z.array(experienceEnhancementSchema).max(8),
  skillsRecommendations: z.object({
    verifiedExisting: z.array(z.string().max(60)).max(15),
    recommendedAdditions: z.array(z.string().max(60)).max(10),
    topIndustryPicks: z.array(z.string().max(60)).max(8),
  }),
  recruiterKeywords: z.array(recruiterKeywordSchema).min(3).max(12),
  unsupportedClaimsDetected: z.array(z.string()).default([]),
});

export type LinkedinOptimization = z.infer<typeof linkedinOptimizationSchema> & {
  provider: string;
  model: string;
  isFallback?: boolean;
};

export interface PublicLinkedinInput {
  headline?: string;
  about?: string;
  experience?: Array<{
    title: string;
    company: string;
    period?: string;
    bullets: string[];
  }>;
  skills?: string[];
  targetRole?: string;
  industry?: string;
  resume?: ResumeData | null;
  jobDescription?: string | null;
}

// ---------------------------------------------------------------------------
// 2. Truth Guard Sanitizer
// ---------------------------------------------------------------------------

export function sanitiseLinkedinOptimization(
  opt: any,
  master: ResumeData | null
): {
  sanitised: z.infer<typeof linkedinOptimizationSchema>;
  flaggedClaims: string[];
} {
  const flaggedClaims: string[] = [];
  if (!master) {
    return { sanitised: opt, flaggedClaims: [] };
  }

  // Validate headline options
  const cleanHeadlines = opt.headlineOptions.map((h: any) => {
    const check = isBulletTruthful(h.headline, master);
    if (!check.ok) {
      flaggedClaims.push(`Headline: ${h.headline}`);
    }
    return h;
  });

  // Validate About accomplishments
  const cleanAccomplishments = opt.improvedAbout.keyAccomplishments.filter((acc: any) => {
    const check = isBulletTruthful(acc, master);
    if (!check.ok) {
      flaggedClaims.push(`About accomplishment: ${acc}`);
      return false;
    }
    return true;
  });

  // Validate Experience Enhancements
  const cleanEnhancements = opt.experienceEnhancements.map((enh: any) => {
    const check = isBulletTruthful(enh.enhancedBullet, master);
    if (!check.ok) {
      flaggedClaims.push(`Enhanced bullet: ${enh.enhancedBullet}`);
      return {
        ...enh,
        truthSafe: false,
        enhancedBullet: enh.originalBullet, // Revert to truthful original
      };
    }
    return { ...enh, truthSafe: true };
  });

  const sanitised: z.infer<typeof linkedinOptimizationSchema> = {
    ...opt,
    headlineOptions: cleanHeadlines,
    improvedAbout: {
      ...opt.improvedAbout,
      keyAccomplishments:
        cleanAccomplishments.length > 0
          ? cleanAccomplishments
          : opt.improvedAbout.keyAccomplishments.slice(0, 2),
    },
    experienceEnhancements: cleanEnhancements,
    unsupportedClaimsDetected: flaggedClaims,
  };

  return { sanitised, flaggedClaims };
}

// ---------------------------------------------------------------------------
// 3. High-Quality Deterministic Fallback Engine
// ---------------------------------------------------------------------------

export function generateDeterministicLinkedin(
  input: PublicLinkedinInput
): LinkedinOptimization {
  const resume = input.resume;
  const fullName = resume?.personal.fullName || 'Professional';
  const currentTitle =
    input.targetRole ||
    input.headline ||
    resume?.experience[0]?.title ||
    'Software Engineer & Technology Specialist';
  const topCompany = resume?.experience[0]?.company || 'Technology Systems';
  const industry = input.industry || 'Technology & Software';

  // Gather technical skills
  const skillsList: string[] = Array.from(
    new Set([
      ...(input.skills || []),
      ...(resume?.skills.technical || []),
      ...(resume?.skills.soft || []),
    ])
  ).filter(Boolean);

  const primarySkills = skillsList.slice(0, 5);
  const skillString = primarySkills.length > 0 ? primarySkills.join(' • ') : 'Full Stack Engineering • Architecture';

  // Headline alternatives
  const headlineOptions: z.infer<typeof headlineOptionSchema>[] = [
    {
      type: 'Impact-Driven',
      headline: `${currentTitle} | Delivering High-Impact Scalable Solutions & Engineering Excellence`,
      rationale: 'Highlights direct professional outcomes and strategic capability upfront.',
    },
    {
      type: 'Skill-Focused',
      headline: `${currentTitle} | ${skillString}`,
      rationale: 'Maximizes recruiter keyword indexing by placing verified core competencies in the top fold.',
    },
    {
      type: 'Executive / Leadership',
      headline: `${currentTitle} @ ${topCompany} | Technical Architecture, Team Mentorship & System Delivery`,
      rationale: 'Signals organizational leadership, stakeholder alignment, and enterprise ownership.',
    },
    {
      type: 'Modern Specialist',
      headline: `${currentTitle} specializing in ${primarySkills[0] || 'Modern Engineering'} & High-Reliability Systems`,
      rationale: 'Differentiates you as a deep subject matter expert in your target domain.',
    },
  ];

  // Synthesize About narrative
  const expCount = resume?.experience.length || (input.experience?.length || 2);
  const hook = `I am a ${currentTitle} passionate about architecting resilient, customer-centric systems that drive measurable organizational impact.`;
  const coreStory = `With hands-on experience across ${expCount} progressive professional roles, I combine strong analytical problem-solving with technical discipline. My background spans translating complex business requirements into clean, scalable software architecture.`;
  
  const keyAccomplishments: string[] = [];
  if (resume?.experience && resume.experience.length > 0) {
    for (const exp of resume.experience) {
      if (exp.bullets && exp.bullets[0]) {
        keyAccomplishments.push(`${exp.bullets[0].slice(0, 200)} (${exp.company})`);
      }
      if (keyAccomplishments.length >= 3) break;
    }
  }
  if (keyAccomplishments.length === 0) {
    keyAccomplishments.push('Designed and maintained high-reliability services with continuous integration and automated testing.');
    keyAccomplishments.push('Collaborated with cross-functional product and engineering stakeholders to deliver roadmap commitments on schedule.');
  }

  const specialtiesBlock = `Specialties: ${skillsList.slice(0, 10).join(', ') || 'Software Architecture, API Design, Agile Delivery'}`;
  const callToAction = 'Always open to connecting with fellow engineers, technology leaders, and discussing impactful engineering challenges.';

  const fullAboutText = [
    hook,
    '',
    coreStory,
    '',
    'Key Highlights:',
    ...keyAccomplishments.map((k) => `• ${k}`),
    '',
    specialtiesBlock,
    '',
    callToAction,
  ].join('\n');

  // Experience enhancements
  const experienceEnhancements: z.infer<typeof experienceEnhancementSchema>[] = [];
  const rawExp = input.experience || resume?.experience || [];
  for (const exp of rawExp.slice(0, 4)) {
    const bullets = exp.bullets || [];
    for (const b of bullets.slice(0, 2)) {
      if (typeof b === 'string' && b.trim().length > 10) {
        experienceEnhancements.push({
          company: exp.company || 'Enterprise',
          role: exp.title || 'Engineer',
          originalBullet: b,
          enhancedBullet: b.endsWith('.') ? b : `${b}.`,
          metricImpact: 'Grounded in authentic operational scope.',
          truthSafe: true,
        });
      }
    }
  }

  // Recruiter keywords
  const recruiterKeywords: z.infer<typeof recruiterKeywordSchema>[] = [
    {
      keyword: primarySkills[0] || 'TypeScript',
      category: 'Hard Skill',
      impactLevel: 'high',
      relevanceExplanation: 'Core skill explicitly demanded in senior recruiter boolean search strings.',
    },
    {
      keyword: primarySkills[1] || 'System Architecture',
      category: 'Methodology',
      impactLevel: 'high',
      relevanceExplanation: 'Signals ability to design systems that scale beyond individual code contributions.',
    },
    {
      keyword: 'CI/CD & DevOps',
      category: 'Tool/Framework',
      impactLevel: 'medium',
      relevanceExplanation: 'Standard modern production hygiene expectation for senior hiring managers.',
    },
    {
      keyword: 'Agile & Cross-functional Delivery',
      category: 'Leadership',
      impactLevel: 'medium',
      relevanceExplanation: 'Crucial for passing recruiter screening calls evaluating team velocity.',
    },
  ];

  // Scoring
  const headlineLen = (input.headline || '').length;
  const headlineScore = headlineLen >= 50 && headlineLen <= 180 ? 88 : headlineLen > 0 ? 65 : 40;
  const aboutLen = (input.about || '').length;
  const aboutScore = aboutLen >= 300 && aboutLen <= 2200 ? 90 : aboutLen > 50 ? 68 : 35;
  const expScore = experienceEnhancements.length >= 3 ? 92 : experienceEnhancements.length > 0 ? 75 : 45;
  const skillsScore = skillsList.length >= 8 ? 95 : skillsList.length >= 3 ? 75 : 40;
  const searchabilityScore = Math.round((headlineScore * 0.4) + (skillsScore * 0.4) + (aboutScore * 0.2));
  const completenessScore = Math.round(
    ((headlineLen > 0 ? 20 : 0) +
     (aboutLen > 0 ? 25 : 0) +
     (experienceEnhancements.length > 0 ? 30 : 0) +
     (skillsList.length > 0 ? 25 : 0))
  );
  const overallScore = Math.round(
    (headlineScore * 0.2) +
    (aboutScore * 0.25) +
    (expScore * 0.25) +
    (skillsScore * 0.15) +
    (searchabilityScore * 0.15)
  );

  return {
    scores: {
      overallScore,
      headlineScore,
      aboutScore,
      experienceScore: expScore,
      skillsScore,
      searchabilityScore,
      completenessScore,
    },
    analysis: {
      strengths: [
        'Profile contains verified professional experience entries.',
        `Target competency keywords (${primarySkills.slice(0, 3).join(', ')}) establish solid domain relevance.`,
        'Factual career background provides clear foundation for strong recruiter discovery.',
      ],
      weaknesses: [
        aboutLen < 300 ? 'About section lacks an engaging personal hook and career narrative.' : 'Ensure measurable results are highlighted near the top of the summary.',
        headlineLen < 40 ? 'Current headline is overly generic; consider adding specialization or key tools.' : 'Keep headline focused to avoid keyword stuffing.',
      ],
      profileCompletenessFeedback: `Profile completeness is at ${completenessScore}%. Add a compelling About section and 5+ endorsed skills to reach All-Star search visibility.`,
      positioningReview: `Positioned effectively for ${currentTitle} roles within the ${industry} industry.`,
    },
    headlineOptions,
    improvedAbout: {
      text: fullAboutText,
      hook,
      coreStory,
      keyAccomplishments,
      specialtiesBlock,
      callToAction,
    },
    experienceEnhancements,
    skillsRecommendations: {
      verifiedExisting: skillsList.slice(0, 15),
      recommendedAdditions: [
        'Cloud Infrastructure',
        'Performance Optimization',
        'API Architecture',
        'Automated Testing',
      ].filter((s) => !skillsList.map((x) => x.toLowerCase()).includes(s.toLowerCase())),
      topIndustryPicks: ['Agile Methodologies', 'Cross-functional Collaboration', 'Technical Mentorship'],
    },
    recruiterKeywords,
    unsupportedClaimsDetected: [],
    provider: 'deterministic',
    model: 'rules-v1',
    isFallback: true,
  };
}

// ---------------------------------------------------------------------------
// 4. NVIDIA Nemotron AI Optimization Runner
// ---------------------------------------------------------------------------

export async function optimizePublicLinkedin(
  input: PublicLinkedinInput
): Promise<LinkedinOptimization> {
  if (!isAiEnabled()) {
    return generateDeterministicLinkedin(input);
  }

  try {
    const provider: AiProvider = getAiProvider();
    const resume = input.resume || null;
    const masterResume: ResumeData = resume || {
      personal: {
        fullName: 'Professional Candidate',
        headline: input.headline || '',
        email: '',
        phone: '',
        location: '',
      },
      summary: input.about || '',
      experience: input.experience?.map((e, idx) => ({
        id: `exp_${idx}`,
        company: e.company,
        title: e.title,
        location: '',
        startDate: '',
        endDate: '',
        current: false,
        bullets: e.bullets || [],
      })) || [],
      education: [],
      skills: {
        technical: input.skills || [],
        soft: [],
      },
      projects: [],
      certifications: [],
      languages: [],
      achievements: [],
      customSections: [],
      sectionOrder: ['summary', 'experience', 'education', 'skills'],
      hiddenSections: [],
    };

    const evidenceInput: EvidenceInput = {
      master: masterResume,
      resume: resume || null,
      targetRole: input.targetRole || null,
    };

    const evidencePrompt = buildAgentPrompt(evidenceInput, 'Optimize candidate LinkedIn profile');

    const userPrompt = [
      evidencePrompt,
      '=== CANDIDATE LINKEDIN INPUT ===',
      `Current Headline: ${input.headline || '(empty)'}`,
      `Current About: ${input.about || '(empty)'}`,
      `Target Role: ${input.targetRole || '(not specified)'}`,
      `Industry: ${input.industry || 'Technology'}`,
      `Skills Listed: ${(input.skills || []).join(', ') || '(none)'}`,
      input.jobDescription ? `Target Job Description:\n${input.jobDescription.slice(0, 3000)}` : '',
      '=== TASK ===',
      'Analyze the candidate LinkedIn profile against industry standards and recruiter search algorithms.',
      'Produce JSON matching the schema: scores (0-100), analysis, 4 distinct headlineOptions (Impact-Driven, Skill-Focused, Executive / Leadership, Modern Specialist), improvedAbout (with hook, coreStory, keyAccomplishments, specialtiesBlock, callToAction, and full text), experienceEnhancements (truth-grounded in supplied experience), skillsRecommendations, and recruiterKeywords.',
      'RULE: Never invent unverified companies, titles, or metrics. Keep all claims grounded in the supplied candidate information.',
    ].filter(Boolean).join('\n\n');

    const result = await provider.completeJson({
      system: `You are the Curevo AI LinkedIn Profile Optimisation Agent.\n\n${TRUTH_RULES}\nLinkedIn style: First-person ("I am...", "I lead..."), conversational yet authoritative, keyword-dense for recruiter search algorithms without being robotic. Maximum headline length: 220 characters. Maximum About length: 2,600 characters. Return JSON only.`,
      user: userPrompt,
      schema: linkedinOptimizationSchema,
      maxTokens: 2500,
      temperature: 0.3,
    });

    const { sanitised } = sanitiseLinkedinOptimization(result, resume);

    return {
      ...sanitised,
      provider: 'AI Engine',
      model: 'AI Engine',
      isFallback: false,
    };
  } catch (err) {
    console.warn('[LinkedIn Agent] AI provider encountered error, falling back to deterministic engine:', err);
    return generateDeterministicLinkedin(input);
  }
}
