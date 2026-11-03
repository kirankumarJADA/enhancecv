// Curevo AI — AI Response Reliability & Structured Output Hardening Test Suite
//
// Tests the 12 critical requirements for robust, truth-safe AI processing:
// 1. Valid NVIDIA structured response.
// 2. JSON wrapped in Markdown code fences (```json ... ``` and ``` ... ```).
// 3. Harmless text surrounding JSON (including curly braces in commentary).
// 4. Missing required fields (graceful rejection or safe fallback).
// 5. Incorrect field types (safe coercion for stringified numbers, booleans, and nullish fields).
// 6. Truncated and malformed JSON.
// 7. Empty responses.
// 8. Provider errors and timeouts (504 AI_TIMEOUT, 502 AI_MALFORMED, 429 AI_RATE_LIMITED).
// 9. Retry exhaustion with bounded retries.
// 10. Safe fallback to the original extracted CV.
// 11. Truth Guard rejection of fabricated information (hallucinated skills or metrics).
// 12. Successful AI resume optimisation after recovery.

import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import {
  parseStructured,
  OpenAiCompatibleProvider,
  AiUnavailableError,
  setAiProviderForTests,
  normalizeAiPayload,
} from '../src/ai/provider';
import { proposalSchema, critiqueSchema, runResumeAgent } from '../src/ai/resumeAgent';
import { buildApp } from '../src/app';
import { analyseJobDescription } from '../src/engine/jd';
import { computeJobMatch } from '../src/engine/match';
import { analyseATS } from '../src/engine/ats';
import type { ResumeData } from '../src/types';

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
        'Responsible for helping with engineering tasks and team mentorship.',
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
`;

describe('Curevo AI — AI Response Reliability & Structured Output Hardening', () => {
  afterEach(() => {
    setAiProviderForTests(null);
  });

  // ---------------------------------------------------------------------------
  // 1. Valid NVIDIA Structured Response
  // ---------------------------------------------------------------------------
  it('1. parses a valid raw JSON response matching proposalSchema', () => {
    const rawJson = JSON.stringify({
      summary:
        'Senior Cloud Solutions Architect with 6+ years designing distributed systems and Kubernetes platforms on AWS.',
      bullets: [
        {
          itemId: 'exp-1',
          index: 0,
          text: 'Architected multi-region Kubernetes clusters on AWS achieving 99.999% uptime for 2.4 million active users.',
        },
      ],
      skillsOrder: ['Kubernetes', 'AWS', 'Terraform', 'Kafka', 'Docker'],
      advisory: {
        summary: 'Excellent alignment with the Lead Cloud Platform Architect role.',
        keyStrengths: ['Kubernetes cluster automation', 'AWS cloud infrastructure'],
        criticalGaps: [],
        recommendations: [
          {
            id: 'rec_1',
            category: 'bullet_impact',
            title: 'Highlight cloud cost savings',
            section: 'Experience',
            issue: 'Under-emphasized ROI in recent role',
            whyItMatters: 'Demonstrates financial stewardship',
            actionableStep: 'Emphasize the £420,000 annual savings prominently.',
            requiresCandidateInput: false,
          },
        ],
      },
    });

    const parsed = parseStructured(rawJson, proposalSchema);
    expect(parsed.summary).toContain('Senior Cloud Solutions Architect');
    expect(parsed.bullets?.[0]?.text).toContain('99.999% uptime');
    expect(parsed.advisory?.recommendations?.[0]?.category).toBe('bullet_impact');
  });

  // ---------------------------------------------------------------------------
  // 2. JSON Wrapped in Markdown Code Fences
  // ---------------------------------------------------------------------------
  it('2. extracts and parses JSON enclosed in markdown code fences', () => {
    const fencedJson = [
      '```json',
      '{',
      '  "summary": "Cloud Architect with deep Kubernetes and Terraform experience.",',
      '  "bullets": [',
      '    {',
      '      "itemId": "exp-1",',
      '      "index": 1,',
      '      "text": "Reduced annual cloud infrastructure expenditure by £420,000 through automated Spot instance orchestration."',
      '    }',
      '  ],',
      '  "removeBullets": null,',
      '  "skillsOrder": null',
      '}',
      '```',
    ].join('\n');

    const parsed = parseStructured(fencedJson, proposalSchema);
    expect(parsed.summary).toBe('Cloud Architect with deep Kubernetes and Terraform experience.');
    expect(parsed.bullets?.[0]?.itemId).toBe('exp-1');
  });

  // ---------------------------------------------------------------------------
  // 3. Harmless Text Surrounding JSON
  // ---------------------------------------------------------------------------
  it('3. safely extracts JSON when surrounded by conversational text and curly braces in prose', () => {
    const conversationalResponse = [
      "Certainly! Here is my detailed review of Aarav's resume {matching against NexaCloud JD}:",
      '```json',
      '{',
      '  "summary": "Targeted Cloud Architect profile for NexaCloud Global Ltd.",',
      '  "bullets": [',
      '    {',
      '      "itemId": "exp-2",',
      '      "index": 0,',
      '      "text": "Engineered high-throughput payment REST APIs in Java and Spring Boot processing over 150,000 daily transactions."',
      '    }',
      '  ]',
      '}',
      '```',
      'I hope this provides clear alignment. Let me know if you would like further refinements!',
    ].join('\n');

    const parsed = parseStructured(conversationalResponse, proposalSchema);
    expect(parsed.summary).toBe('Targeted Cloud Architect profile for NexaCloud Global Ltd.');
    expect(parsed.bullets?.[0]?.text).toContain('150,000 daily transactions');
  });

  // ---------------------------------------------------------------------------
  // 4. Missing Required Fields in Schemas
  // ---------------------------------------------------------------------------
  it('4. rejects responses missing mandatory fields in schemas requiring them', () => {
    const schemaWithRequiredField = z.object({
      mandatoryToken: z.string().min(1),
      optionalFlag: z.boolean().optional(),
    });

    const missingRequiredJson = JSON.stringify({
      optionalFlag: true,
    });

    expect(() => parseStructured(missingRequiredJson, schemaWithRequiredField)).toThrow();
  });

  // ---------------------------------------------------------------------------
  // 5. Incorrect Field Types & Safe Normalisation
  // ---------------------------------------------------------------------------
  it('5. safely normalises stringified numbers, stringified booleans, nulls, and category variants', () => {
    const rawVariantJson = JSON.stringify({
      summary: 'Senior Cloud Platform Engineer.',
      bullets: [
        {
          itemId: 101, // number instead of string
          index: '0', // string instead of number
          text: 'Scaled distributed Kubernetes clusters.',
        },
      ],
      removeBullets: null, // null instead of undefined
      advisory: {
        summary: 'Solid profile.',
        recommendations: [
          {
            // missing id -> auto-generated
            category: 'skills_gap', // synonym mapped to keyword_gap
            title: 'Promote Kafka experience',
            section: 'Technical Skills',
            issue: 'Kafka is not listed in top skills',
            whyItMatters: 'NexaCloud requires Kafka',
            actionableStep: 'Add Kafka projects if available',
            requiresCandidateInput: 'true', // string boolean
          },
        ],
      },
    });

    const parsed = parseStructured(rawVariantJson, proposalSchema);
    expect(parsed.bullets?.[0]?.itemId).toBe('101');
    expect(parsed.bullets?.[0]?.index).toBe(0);
    expect(parsed.advisory?.recommendations?.[0]?.id).toBeDefined();
    expect(parsed.advisory?.recommendations?.[0]?.category).toBe('keyword_gap');
    expect(parsed.advisory?.recommendations?.[0]?.requiresCandidateInput).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 6. Truncated and Malformed JSON
  // ---------------------------------------------------------------------------
  it('6. rejects truncated and unparseable JSON with AI_MALFORMED', () => {
    const truncatedPayload = `{"summary": "Aarav Sharma", "bullets": [{"itemId": "exp-1", "index": 0, "text": "Built mult`;

    expect(() => parseStructured(truncatedPayload, proposalSchema)).toThrowError(
      expect.objectContaining({ code: 'AI_MALFORMED' })
    );
  });

  // ---------------------------------------------------------------------------
  // 7. Empty Responses
  // ---------------------------------------------------------------------------
  it('7. rejects empty or whitespace-only response with AI_MALFORMED', () => {
    expect(() => parseStructured('', proposalSchema)).toThrowError(
      expect.objectContaining({ code: 'AI_MALFORMED', message: 'AI returned an empty response.' })
    );

    expect(() => parseStructured('   \n\t  ', proposalSchema)).toThrowError(
      expect.objectContaining({ code: 'AI_MALFORMED', message: 'AI returned an empty response.' })
    );
  });

  // ---------------------------------------------------------------------------
  // 8. Provider Errors and Timeouts (HTTP status mapping)
  // ---------------------------------------------------------------------------
  it('8. maps AI provider errors and timeouts to appropriate HTTP status codes via public endpoint', async () => {
    const app = await buildApp();

    // 8a. Timeout -> 504
    setAiProviderForTests({
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_TIMEOUT', 'Gateway timeout', true)),
    });

    const timeoutRes = await request(app).post('/api/public/improve').send({ resume: sampleCandidate });
    expect(timeoutRes.status).toBe(504);
    expect(timeoutRes.body.error?.code).toBe('AI_TIMEOUT');

    // 8b. Rate limit -> 429
    setAiProviderForTests({
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_RATE_LIMITED', 'Rate limited', true)),
    });

    const rateRes = await request(app).post('/api/public/improve').send({ resume: sampleCandidate });
    expect(rateRes.status).toBe(429);
    expect(rateRes.body.error?.code).toBe('AI_RATE_LIMITED');

    // 8c. Malformed -> 502
    setAiProviderForTests({
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_MALFORMED', 'AI returned an invalid structure.', true)),
    });

    const malformedRes = await request(app).post('/api/public/improve').send({ resume: sampleCandidate });
    expect(malformedRes.status).toBe(502);
    expect(malformedRes.body.error?.code).toBe('AI_MALFORMED');
  });

  // ---------------------------------------------------------------------------
  // 9. Retry Exhaustion with Bounded Retries
  // ---------------------------------------------------------------------------
  it('9. bounds retries and throws the final error when retry attempts are exhausted', async () => {
    const provider = new OpenAiCompatibleProvider({
      providerId: 'nvidia',
      apiKey: 'test-key',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      timeoutMs: 5000,
      maxRetries: 1, // 1 retry = 2 attempts total
      maxIterations: 2,
    });

    let attemptCount = 0;
    vi.spyOn(provider as any, 'attempt').mockImplementation(async () => {
      attemptCount++;
      return 'invalid non-json output that cannot be parsed';
    });

    await expect(
      provider.completeJson({
        system: 'System prompt',
        user: 'User prompt',
        schema: proposalSchema,
      })
    ).rejects.toMatchObject({
      code: 'AI_MALFORMED',
      message: 'AI output was not valid JSON.',
    });

    expect(attemptCount).toBe(2); // exactly 1 initial + 1 retry
  });

  // ---------------------------------------------------------------------------
  // 10. Safe Fallback to the Original Extracted CV
  // ---------------------------------------------------------------------------
  it('10. falls back safely to original extracted CV when requireAi is false', async () => {
    setAiProviderForTests({
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: vi.fn().mockRejectedValue(new AiUnavailableError('AI_TIMEOUT', 'Timed out', true)),
    });

    const job = analyseJobDescription(sampleJd);
    const matchBefore = computeJobMatch(sampleCandidate, job);
    const atsBefore = analyseATS(sampleCandidate);

    const result = await runResumeAgent(sampleCandidate, job, sampleJd, matchBefore, atsBefore, { requireAi: false });

    expect(result.agent.usedAi).toBe(false);
    expect(result.agent.errorCode).toBe('AI_TIMEOUT');
    expect(result.resume.personal.fullName).toBe('Aarav Sharma');
    expect(result.resume.experience.length).toBe(sampleCandidate.experience.length);
    expect(result.truth.passedAll).toBe(true);
    expect(result.agent.advisory).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 11. Truth Guard Rejection of Fabricated Information
  // ---------------------------------------------------------------------------
  it('11. Truth Guard rejects AI-fabricated technologies and unevidenced metrics', async () => {
    setAiProviderForTests({
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: vi.fn().mockResolvedValue({
        summary: 'Cloud Architect with deep Rust and Elixir expertise.', // Rust & Elixir never in Aarav's CV
        bullets: [
          {
            itemId: 'exp-1',
            index: 0,
            text: 'Automated deployments across 500 Kubernetes clusters generating £90,000,000 in revenue.', // £90M is fabricated
          },
        ],
      }),
    });

    const job = analyseJobDescription(sampleJd);
    const matchBefore = computeJobMatch(sampleCandidate, job);
    const atsBefore = analyseATS(sampleCandidate);

    const result = await runResumeAgent(sampleCandidate, job, sampleJd, matchBefore, atsBefore, { requireAi: true });

    // The fabricated summary should be rejected
    expect(result.resume.summary).not.toContain('Elixir');
    // The fabricated £90M bullet should be rejected, preserving original
    expect(result.resume.experience[0].bullets[0]).not.toContain('£90,000,000');
    expect(result.resume.experience[0].bullets[0]).toContain('99.999%');
    expect(result.agent.rejectedCount).toBeGreaterThan(0);
    expect(result.truth.passedAll).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 12. Successful AI Resume Optimisation after Recovery
  // ---------------------------------------------------------------------------
  it('12. successfully optimises resume with valid evidenced improvements and recalculates ATS', async () => {
    setAiProviderForTests({
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      completeJson: vi.fn().mockResolvedValue({
        bullets: [
          {
            itemId: 'exp-1',
            index: 2, // Replaces weak bullet "Responsible for helping with engineering tasks and team mentorship."
            text: 'Directed cross-functional cloud engineering operations across AWS and Kubernetes environments.',
          },
        ],
        skillsOrder: ['Kubernetes', 'AWS', 'Terraform', 'Kafka', 'Docker', 'Java', 'Spring Boot', 'Go', 'PostgreSQL'],
      }),
    });

    const job = analyseJobDescription(sampleJd);
    const matchBefore = computeJobMatch(sampleCandidate, job);
    const atsBefore = analyseATS(sampleCandidate);

    const result = await runResumeAgent(sampleCandidate, job, sampleJd, matchBefore, atsBefore, { requireAi: true });

    expect(result.agent.usedAi).toBe(true);
    expect(result.agent.rejectedCount).toBe(0);
    expect(result.resume.experience[0].bullets[2]).toContain('Directed cross-functional cloud engineering');
    expect(result.truth.passedAll).toBe(true);
    expect(result.atsAfter.overallScore).toBeGreaterThanOrEqual(atsBefore.overallScore);
    expect(result.changeLog.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 13. Normalisation Safety: Multi-candidate preamble selection
  // ---------------------------------------------------------------------------
  it('13. prefers genuine schema-matching proposal candidate over unrelated preamble JSON object', () => {
    const rawWithPreamble = [
      'Preliminary response: {"status": "ok", "ready": true}',
      'Here is the actual tailoring plan:',
      '{"summary": "Staff Cloud Platform Engineer specializing in high-throughput distributed systems.", "bullets": [{"itemId": "exp-1", "index": 0, "text": "Architected AWS microservices infrastructure."}]}',
    ].join('\n');

    const result = parseStructured(rawWithPreamble, proposalSchema);
    expect(result.summary).toContain('Staff Cloud Platform Engineer');
    expect(result.bullets).toHaveLength(1);
    expect(result.bullets?.[0]?.itemId).toBe('exp-1');
  });

  // ---------------------------------------------------------------------------
  // 14. Normalisation Safety: Filters empty recommendation objects
  // ---------------------------------------------------------------------------
  it('14. filters out empty recommendation objects {} rather than generating ghost recommendations', () => {
    const payloadWithEmptyRec = {
      summary: 'Senior Cloud Platform Engineer.',
      advisory: {
        summary: 'Solid alignment.',
        recommendations: [
          {}, // empty object should be discarded
          { issue: 'Needs more metrics', actionableStep: 'Add latency percentiles', category: 'metrics' },
        ],
      },
    };

    const normalized = normalizeAiPayload(payloadWithEmptyRec) as any;
    expect(normalized.advisory.recommendations).toHaveLength(1);
    expect(normalized.advisory.recommendations[0].issue).toBe('Needs more metrics');
    expect(normalized.advisory.recommendations[0].category).toBe('quantification');
  });

  // ---------------------------------------------------------------------------
  // 15. Normalisation Safety: Filters whitespace-only bullet rewrites
  // ---------------------------------------------------------------------------
  it('15. filters out whitespace-only bullet rewrites', () => {
    const payloadWithWhitespaceBullet = {
      summary: 'Senior Cloud Platform Engineer.',
      bullets: [
        { itemId: 'exp-1', index: 0, text: '   ' }, // whitespace only
        { itemId: 'exp-1', index: 1, text: 'Architected robust Kubernetes deployment pipelines.' },
      ],
    };

    const normalized = normalizeAiPayload(payloadWithWhitespaceBullet) as any;
    expect(normalized.bullets).toHaveLength(1);
    expect(normalized.bullets[0].index).toBe(1);
    expect(normalized.bullets[0].text).toContain('Architected robust Kubernetes');
  });

  // ---------------------------------------------------------------------------
  // 16. Problematic Production Structure: Advisory clamping & object flattening
  // ---------------------------------------------------------------------------
  it('16. safely normalises oversized advisory strings (>500 chars), >12 recommendations, and object arrays', () => {
    const rawPayload = {
      summary: 'S'.repeat(2500), // > 2000 chars
      bullets: [
        { itemId: 'exp-1', index: 0, text: 'Architected Kubernetes clusters across AWS regions.' },
      ],
      skillsOrder: [{ skill: 'AWS' }, { skill: 'Kubernetes' }, { skill: 'Terraform' }], // array of objects
      advisory: {
        summary: 'A'.repeat(1200), // > 1000 chars
        keyStrengths: [{ strength: 'Deep AWS knowledge' }, 'K'.repeat(500)], // object + string > 400
        criticalGaps: [{ gap: 'Kafka event streaming' }], // object
        candidateQuestions: [{ question: 'What was your average query latency?' }], // object
        recommendations: Array.from({ length: 15 }, (_, i) => ({
          id: `rec_${i + 1}`,
          category: 'bullet_impact_metrics',
          title: `Recommendation ${i + 1} with long title: ${'T'.repeat(200)}`,
          section: 'Experience',
          issue: `Identified issue: ${'I'.repeat(600)}`,
          whyItMatters: `Why it matters: ${'W'.repeat(600)}`,
          actionableStep: `Actionable step: ${'A'.repeat(600)}`,
          candidateQuestion: `Question: ${'Q'.repeat(500)}`,
          metricPlaceholder: `[${'M'.repeat(150)}]`,
          requiresCandidateInput: 'true', // stringified boolean
        })),
      },
    };

    const parsed = parseStructured(JSON.stringify(rawPayload), proposalSchema);
    expect(parsed.summary?.length).toBeLessThanOrEqual(2000);
    expect(parsed.bullets).toHaveLength(1);
    expect(parsed.skillsOrder).toEqual(['AWS', 'Kubernetes', 'Terraform']);
    expect(parsed.advisory?.summary?.length).toBeLessThanOrEqual(1000);
    expect(parsed.advisory?.keyStrengths?.[0]).toBe('Deep AWS knowledge');
    expect(parsed.advisory?.keyStrengths?.[1]?.length).toBeLessThanOrEqual(400);
    expect(parsed.advisory?.criticalGaps?.[0]).toBe('Kafka event streaming');
    expect(parsed.advisory?.candidateQuestions?.[0]).toBe('What was your average query latency?');
    expect(parsed.advisory?.recommendations?.length).toBeLessThanOrEqual(12);
    expect(parsed.advisory?.recommendations?.[0]?.category).toBe('bullet_impact');
    expect(parsed.advisory?.recommendations?.[0]?.issue.length).toBeLessThanOrEqual(500);
    expect(parsed.advisory?.recommendations?.[0]?.whyItMatters.length).toBeLessThanOrEqual(500);
    expect(parsed.advisory?.recommendations?.[0]?.actionableStep.length).toBeLessThanOrEqual(500);
    expect(parsed.advisory?.recommendations?.[0]?.requiresCandidateInput).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 17. Problematic Production Structure: Critique clamping
  // ---------------------------------------------------------------------------
  it('17. safely normalises oversized critique summaries, notes (>8), and suggestions (>8)', () => {
    const rawCritique = {
      summary: 'C'.repeat(1500), // > 1000
      notes: Array.from({ length: 12 }, (_, i) => `Note ${i + 1}: ${'N'.repeat(600)}`),
      suggestions: Array.from({ length: 10 }, (_, i) => ({
        section: 'Experience',
        itemId: 'exp-1',
        index: i,
        current: 'Old text',
        suggested: `Suggested rewrite: ${'S'.repeat(900)}`,
        reason: `Reason: ${'R'.repeat(600)}`,
      })),
    };

    const parsed = parseStructured(JSON.stringify(rawCritique), critiqueSchema);
    expect(parsed.summary.length).toBeLessThanOrEqual(1000);
    expect(parsed.notes.length).toBeLessThanOrEqual(8);
    expect(parsed.notes[0].length).toBeLessThanOrEqual(500);
    expect(parsed.suggestions.length).toBeLessThanOrEqual(8);
    expect(parsed.suggestions[0].suggested.length).toBeLessThanOrEqual(800);
    expect(parsed.suggestions[0].reason.length).toBeLessThanOrEqual(500);
  });

  // ---------------------------------------------------------------------------
  // 18. Candidate Selection: Prefers rich proposal over empty inner fragment
  // ---------------------------------------------------------------------------
  it('18. selects real proposal when response contains inner closed fragments in preamble', () => {
    const rawText = `
Here is my preliminary thought:
[{"itemId": "exp-1", "index": 0, "text": "Draft bullet rewrite"}]

And here is the final structured response:
{
  "summary": "Senior Cloud Solutions Architect specializing in AWS and Kubernetes.",
  "bullets": [
    {"itemId": "exp-1", "index": 0, "text": "Architected multi-region AWS Kubernetes clusters."}
  ],
  "skillsOrder": ["AWS", "Kubernetes", "Terraform"]
}
`;

    const parsed = parseStructured(rawText, proposalSchema);
    expect(parsed.summary).toBe('Senior Cloud Solutions Architect specializing in AWS and Kubernetes.');
    expect(parsed.bullets?.[0]?.text).toBe('Architected multi-region AWS Kubernetes clusters.');
    expect(parsed.skillsOrder).toEqual(['AWS', 'Kubernetes', 'Terraform']);
  });

  // ---------------------------------------------------------------------------
  // 19. Wrapped Proposal: Unwraps nested { "proposal": { ... } }
  // ---------------------------------------------------------------------------
  it('19. unwraps nested proposal wrapper object', () => {
    const wrappedRaw = JSON.stringify({
      proposal: {
        summary: 'Tailored Senior Backend Engineer summary.',
        bullets: [{ itemId: 'exp_1', index: 0, text: 'Engineered high-throughput payment services in Java.' }],
      },
    });
    const parsed = parseStructured(wrappedRaw, proposalSchema);
    expect(parsed.summary).toBe('Tailored Senior Backend Engineer summary.');
    expect(parsed.bullets).toHaveLength(1);
    expect(parsed.bullets?.[0]?.text).toBe('Engineered high-throughput payment services in Java.');
  });

  // ---------------------------------------------------------------------------
  // 20. Wrapped Critique: Unwraps nested { "critique": { ... } }
  // ---------------------------------------------------------------------------
  it('20. unwraps nested critique wrapper object', () => {
    const wrappedRaw = JSON.stringify({
      critique: {
        summary: 'Strong resume alignment with JD.',
        suggestions: [
          {
            section: 'Experience',
            itemId: 'exp_1',
            index: 0,
            current: 'Built services',
            suggested: 'Engineered microservices in Java',
            reason: 'Uses stronger action verb',
          },
        ],
      },
    });
    const parsed = parseStructured(wrappedRaw, critiqueSchema);
    expect(parsed.summary).toBe('Strong resume alignment with JD.');
    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.notes).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 21. Critique Schema Robustness: Defaults missing notes and suggestions
  // ---------------------------------------------------------------------------
  it('21. safely normalizes critique when notes or suggestions array is omitted by model', () => {
    const rawNoNotes = JSON.stringify({
      summary: 'Critique without explicit notes.',
      suggestions: [
        {
          section: 'Summary',
          current: 'Old summary',
          suggested: 'New summary',
          reason: 'Better keyword coverage',
        },
      ],
    });
    const parsed = parseStructured(rawNoNotes, critiqueSchema);
    expect(parsed.summary).toBe('Critique without explicit notes.');
    expect(parsed.notes).toEqual([]);
    expect(parsed.suggestions).toHaveLength(1);
  });
});
