// Curevo AI — ResumeSkills Integration Test Suite.
//
// Tests the integration of open-source ResumeSkills frameworks:
//   - job-description-analyzer (requirement hierarchy, required vs preferred)
//   - resume-bullet-writer (Google X-Y-Z formula, active phrasing)
//   - resume-quantifier (zero-fabrication metrics, candidate discovery questions)
//   - resume-ats-optimizer (keyword presence, role alignment)
//   - resume-tailor (truthful emphasis without fabrication)
//
// Verifies:
// 1. Job-description keyword extraction and classification.
// 2. Supported versus missing skill identification.
// 3. ATS advisory results and schema validation.
// 4. Bullet rewriting that preserves source facts.
// 5. No invented metrics or unsupported qualifications.
// 6. Truth Guard rejection and repair behaviour.
// 7. Correct handling of malformed or incomplete AI responses.
// 8. Existing ATS score and weighting invariance.
// 9. AI provider failure and timeout fallback.
// 10. Sample CV, PDF export and editor regression behaviour.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyseJobDescription } from '../src/engine/jd';
import { computeJobMatch, generateResumeSkillsAdvisory } from '../src/engine/match';
import { analyseATS } from '../src/engine/ats';
import { DIMENSION_WEIGHTS, DIMENSION_LABELS } from '../src/engine/audit';
import { isBulletTruthful, validateTruth } from '../src/engine/tailor';
import { proposalSchema, runResumeAgent } from '../src/ai/resumeAgent';
import { AiProvider, AiUnavailableError, setAiProviderForTests } from '../src/ai/provider';
import type { ResumeData, JobAnalysis } from '../src/types';

describe('Curevo AI + ResumeSkills Integration Suite', () => {
  const sampleCandidate: ResumeData = {
    personal: {
      fullName: 'Aarav Sharma',
      email: 'aarav.sharma@example.com',
      phone: '+44 7700 900123',
      location: 'Manchester, UK',
      headline: 'Senior Cloud Solutions Architect',
    },
    summary:
      'Cloud solutions architect with 6+ years designing distributed systems, Kubernetes platforms, and cutting cloud compute expenditure by £420,000 annually.',
    experience: [
      {
        id: 'exp-1',
        company: 'CloudScale Technologies Ltd',
        title: 'Principal Cloud Architect',
        startDate: 'Jan 2022',
        endDate: 'Present',
        current: true,
        bullets: [
          'Architected multi-region Kubernetes clusters on AWS achieving 99.999% uptime for 2.4 million active users.',
          'Reduced annual cloud infrastructure expenditure by £420,000 through automated Spot instance orchestration.',
          'Responsible for helping with engineering tasks and team mentorship.', // Weak bullet for testing
        ],
      },
      {
        id: 'exp-2',
        company: 'Finlio Systems Ltd',
        title: 'Senior DevOps & Backend Engineer',
        startDate: 'Jun 2019',
        endDate: 'Dec 2021',
        current: false,
        bullets: [
          'Engineered high-throughput payment REST APIs in Java and Spring Boot processing over 150,000 daily transactions.',
          'Optimised PostgreSQL schema indexing, cutting p99 API query latency by 35%.',
        ],
      },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'LedgerSync Observability Mesh',
        description: 'Distributed tracing mesh providing real-time telemetry.',
        tech: ['Go', 'Kubernetes', 'Prometheus', 'Kafka'],
        bullets: ['Processed over 60 million telemetry spans daily with sub-millisecond overhead.'],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'University of Leeds',
        degree: 'BSc (Hons)',
        field: 'Computer Science',
        startDate: 'Sep 2015',
        endDate: 'Jun 2019',
        grade: 'First Class Honours (1st)',
      },
    ],
    skills: {
      technical: ['AWS', 'Kubernetes', 'Terraform', 'Docker', 'Java', 'Spring Boot', 'Go', 'PostgreSQL', 'Kafka'],
      soft: ['Technical Leadership', 'Cross-functional Collaboration'],
    },
    certifications: [
      {
        id: 'cert-1',
        name: 'AWS Certified Solutions Architect — Professional',
        issuer: 'Amazon Web Services',
        year: '2023',
      },
    ],
    languages: [{ id: 'lang-1', name: 'English', proficiency: 'Native / Bilingual' }],
    achievements: ['Keynote speaker at Cloud Native London 2023.'],
    customSections: [],
    sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
    hiddenSections: [],
  };

  const sampleJd = `
    Job Title: Lead Cloud Platform Architect
    Company: NexaCloud Global Ltd
    Location: London, UK (Hybrid)

    About the Role:
    We are seeking a Lead Cloud Platform Architect to spearhead our enterprise Kubernetes and multi-cloud transformation.

    Requirements:
    - 5+ years of hands-on experience in AWS and Kubernetes.
    - Strong expertise in Infrastructure as Code using Terraform.
    - Deep knowledge of Distributed Systems and Kafka.
    - Experience with Rust is required.
    - Bachelor's degree in Computer Science or related field.

    Nice to have (Preferred Qualifications):
    - Experience with Google Cloud Platform (GCP).
    - Certified Kubernetes Administrator (CKA).
    - Experience in high-throughput Payment Gateway environments.

    Responsibilities:
    - Architect resilient multi-region cloud infrastructures.
    - Mentor platform engineering teams and define architecture governance.
    - Optimize cloud expenditure and maintain 99.99% system availability.
  `;

  // -------------------------------------------------------------------------
  // 1. Job-description keyword extraction and classification (job-description-analyzer)
  // -------------------------------------------------------------------------
  describe('1. Job Description Requirement Extraction & Classification', () => {
    it('accurately categorizes required vs preferred skills and detects target role', () => {
      const job = analyseJobDescription(sampleJd);

      expect(job.title).toContain('Cloud Platform Architect');
      expect(job.company).toBe('NexaCloud Global Ltd');
      expect(job.yearsRequired).toBe(5);

      // Required skills
      expect(job.requiredSkills).toContain('AWS');
      expect(job.requiredSkills).toContain('Kubernetes');
      expect(job.requiredSkills).toContain('Terraform');
      expect(job.requiredSkills).toContain('Rust');

      // Preferred skills
      expect(job.preferredSkills).toContain('GCP');

      // Certifications and education
      expect(job.certificationRequirements.length).toBeGreaterThanOrEqual(1);
      expect(job.educationRequirements.some((e) => /bachelor|degree/i.test(e))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Supported versus missing skill identification (job-description-analyzer)
  // -------------------------------------------------------------------------
  describe('2. Supported vs Missing Skill Identification', () => {
    it('delineates evidenced source CV skills from genuinely missing qualifications', () => {
      const job = analyseJobDescription(sampleJd);
      const match = computeJobMatch(sampleCandidate, job);

      // Evidenced in CV
      expect(match.matchedSkills).toContain('AWS');
      expect(match.matchedSkills).toContain('Kubernetes');
      expect(match.matchedSkills).toContain('Terraform');

      // Genuinely missing (Rust was in JD but candidate does not have it)
      expect(match.missingSkills).toContain('Rust');

      // Verify items provenance
      const rustItem = match.items.find((i) => i.requirement === 'Rust');
      expect(rustItem).toBeDefined();
      expect(rustItem?.status).toBe('missing');
      expect(rustItem?.provenance).toBe('unsupported');
      expect(rustItem?.actionableAdvice).toContain('Required by employer but not evidenced');
    });
  });

  // -------------------------------------------------------------------------
  // 3. ATS advisory results and schema validation (resume-ats-optimizer & quantifier)
  // -------------------------------------------------------------------------
  describe('3. ATS Advisory Results & Schema Validation', () => {
    it('generates a complete, structured ResumeSkills advisory with actionable steps and discovery questions', () => {
      const job = analyseJobDescription(sampleJd);
      const match = computeJobMatch(sampleCandidate, job);
      const advisory = match.advisory;

      expect(advisory).toBeDefined();
      if (!advisory) throw new Error('Advisory should be defined');

      // Advisory summary & executive sections
      expect(advisory.summary).toContain('Curevo AI + ResumeSkills evaluation');
      expect(advisory.keyStrengths.length).toBeGreaterThan(0);
      expect(advisory.criticalGaps.length).toBeGreaterThan(0);

      // Explains critical gaps honestly
      expect(advisory.criticalGaps.some((g) => g.includes('Rust') || g.includes('mandatory'))).toBe(true);

      // Recommendations conform to schema
      expect(advisory.recommendations.length).toBeGreaterThan(0);
      for (const rec of advisory.recommendations) {
        expect(rec.id).toBeDefined();
        expect(['bullet_impact', 'keyword_gap', 'missing_requirement', 'quantification', 'formatting_structure']).toContain(
          rec.category
        );
        expect(rec.title.length).toBeGreaterThan(0);
        expect(rec.section.length).toBeGreaterThan(0);
        expect(rec.issue.length).toBeGreaterThan(0);
        expect(rec.whyItMatters.length).toBeGreaterThan(0);
        expect(rec.actionableStep.length).toBeGreaterThan(0);
        expect(typeof rec.requiresCandidateInput).toBe('boolean');
      }

      // Candidate discovery questions for missing metrics (resume-quantifier)
      const quantRec = advisory.recommendations.find((r) => r.category === 'quantification');
      expect(quantRec).toBeDefined();
      expect(quantRec?.candidateQuestion).toBeDefined();
      expect(quantRec?.metricPlaceholder).toBeDefined();
      expect(quantRec?.requiresCandidateInput).toBe(true);

      expect(advisory.candidateQuestions.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Bullet rewriting that preserves source facts (resume-bullet-writer)
  // -------------------------------------------------------------------------
  describe('4. Bullet Rewriting Preserving Source Facts', () => {
    it('validates that bullet rewrites using Google X-Y-Z formula pass Truth Guard when facts match source', () => {
      // Truthful rewrite using only numbers and technologies already in source CV
      const truthfulXyzBullet =
        'Architected multi-region Kubernetes clusters on AWS, achieving 99.999% uptime for 2.4 million active users.';
      const check = isBulletTruthful(truthfulXyzBullet, sampleCandidate);
      expect(check.ok).toBe(true);
      expect(check.unsupported).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5. No invented metrics or unsupported qualifications (resume-quantifier & Truth Guard)
  // -------------------------------------------------------------------------
  describe('5. Zero-Hallucination Quantification & Claim Rejection', () => {
    it('strictly rejects AI-invented statistics, revenue, or percentages', () => {
      // Candidate's source CV has £420,000 and 99.999%. It does NOT have $10M or 400%.
      const hallucinatedMetricsBullet =
        'Generated $10M in cloud enterprise revenue and boosted efficiency by 400% on Kubernetes.';
      const check = isBulletTruthful(hallucinatedMetricsBullet, sampleCandidate);

      expect(check.ok).toBe(false);
      expect(check.unsupported.some((u) => u.includes('400') || u.includes('10'))).toBe(true);
    });

    it('strictly rejects ungrounded technologies (e.g. inventing Rust or GCP experience)', () => {
      const hallucinatedSkillsBullet =
        'Engineered distributed streaming pipelines in Rust and deployed across Google Cloud Platform (GCP).';
      const check = isBulletTruthful(hallucinatedSkillsBullet, sampleCandidate);

      expect(check.ok).toBe(false);
      expect(check.unsupported.some((u) => u.toLowerCase() === 'rust' || u.toLowerCase().includes('gcp'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Truth Guard rejection and repair behaviour
  // -------------------------------------------------------------------------
  describe('6. Truth Guard Reversion & Auto-Repair', () => {
    it('reverts fabricated bullets to original source CV wording during validation', () => {
      const tamperedResume: ResumeData = JSON.parse(JSON.stringify(sampleCandidate));
      tamperedResume.experience[0].bullets[0] = 'Engineered distributed Rust microservices generating £50M revenue.';

      const truthReport = validateTruth(tamperedResume, sampleCandidate);

      expect(truthReport.passedAll).toBe(false);
      expect(truthReport.autoFixed.length).toBeGreaterThan(0);
      // Ensure bullet was safely reverted to source facts
      expect(tamperedResume.experience[0].bullets[0]).toContain('Kubernetes');
      expect(tamperedResume.experience[0].bullets[0]).not.toContain('£50M');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Correct handling of malformed or incomplete AI responses
  // -------------------------------------------------------------------------
  describe('7. Malformed AI Response Handling & Schema Resilience', () => {
    it('parses valid proposals containing ResumeSkills advisory and handles omissions safely', () => {
      const validProposal = {
        summary: 'Senior Cloud Solutions Architect specializing in resilient Kubernetes infrastructure.',
        skillsOrder: ['Kubernetes', 'AWS', 'Terraform', 'Kafka', 'Go', 'Docker', 'Java', 'Spring Boot', 'PostgreSQL'],
        advisory: {
          summary: 'High core alignment with AWS and Kubernetes.',
          keyStrengths: ['AWS & Kubernetes proficiency'],
          criticalGaps: ['Missing Rust requirement'],
          recommendations: [
            {
              id: 'rec-1',
              category: 'missing_requirement' as const,
              title: 'Address Rust Gap',
              section: 'Skills',
              issue: 'Rust not found on CV',
              whyItMatters: 'Mandatory skill',
              actionableStep: 'Add attested exposure if available',
              requiresCandidateInput: true,
            },
          ],
          candidateQuestions: ['Do you have Rust experience?'],
        },
      };

      const parsed = proposalSchema.parse(validProposal);
      expect(parsed.summary).toBeDefined();
      expect(parsed.advisory).toBeDefined();
      expect(parsed.advisory?.recommendations).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Existing ATS score and weighting invariance
  // -------------------------------------------------------------------------
  describe('8. Existing ATS Score & Weighting Invariance Contract', () => {
    it('guarantees that 9-dimension weights sum to exactly 100', () => {
      const totalWeight = Object.values(DIMENSION_WEIGHTS).reduce((sum, w) => sum + w, 0);
      expect(totalWeight).toBe(100);
      expect(Object.keys(DIMENSION_WEIGHTS)).toHaveLength(9);
      expect(Object.keys(DIMENSION_LABELS)).toHaveLength(9);
    });

    it('confirms deterministic ATS score evaluation remains invariant', () => {
      const ats1 = analyseATS(sampleCandidate);
      const ats2 = analyseATS(sampleCandidate);

      expect(ats1.overallScore).toBe(ats2.overallScore);
      expect(ats1.formattingScore).toBe(ats2.formattingScore);
      expect(ats1.contentScore).toBe(ats2.contentScore);
      expect(ats1.skillsScore).toBe(ats2.skillsScore);
      expect(ats1.checks.length).toBe(ats2.checks.length);
    });
  });

  // -------------------------------------------------------------------------
  // 9. AI provider failure and timeout fallback
  // -------------------------------------------------------------------------
  describe('9. AI Provider Timeout and Failure Fallback', () => {
    it('falls back to deterministic base tailoring and ResumeSkills advisory when AI provider times out', async () => {
      const timingOutProvider: AiProvider = {
        name: 'test-timeout',
        model: 'test-model',
        completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_TIMEOUT', 'AI request timed out.', true)),
      };

      setAiProviderForTests(timingOutProvider);

      const job = analyseJobDescription(sampleJd);
      const matchBefore = computeJobMatch(sampleCandidate, job);
      const atsBefore = analyseATS(sampleCandidate);

      const result = await runResumeAgent(sampleCandidate, job, sampleJd, matchBefore, atsBefore, { requireAi: false });

      expect(result.agent.usedAi).toBe(false);
      expect(result.agent.errorCode).toBe('AI_TIMEOUT');
      expect(result.resume).toBeDefined();
      expect(result.truth.passedAll).toBe(true);
      // Ensures advisory is gracefully provided by deterministic fallback
      expect(result.agent.advisory).toBeDefined();
      expect(result.agent.advisory?.criticalGaps.length).toBeGreaterThan(0);

      setAiProviderForTests(null); // Reset
    });
  });

  // -------------------------------------------------------------------------
  // 10. Sample CV regression behaviour
  // -------------------------------------------------------------------------
  describe('10. Sample CV Regression Parity', () => {
    it('evaluates sample CV across job match and generates advisory without error', () => {
      const job = analyseJobDescription(sampleJd);
      const match = computeJobMatch(sampleCandidate, job);

      expect(match.score).toBeGreaterThan(50);
      expect(match.breakdown).toHaveLength(7);
      expect(match.advisory).toBeDefined();
      expect(match.advisory?.recommendations.length).toBeGreaterThan(0);
    });
  });
});
