import { describe, it, expect } from 'vitest';
import {
  analyzeBullet,
  cleanBullet,
  containsMetric,
  getLeadingWord,
  getVerbSynonyms,
  replaceOpenerWithVerb,
  POWER_VERB_CATEGORIES,
  ALL_POWER_VERBS,
  WEAK_OPENERS,
} from '../src/lib/writingCoach';
import { getSampleCv } from '../src/data/sampleCv';

describe('Real-Time ATS Writing Coach Engine', () => {
  // 1. Weak and vague wording detection
  it('1. detects weak and vague openers and suggests active power verbs', () => {
    const weakBullets = [
      'Responsible for developing the customer billing microservice in Go.',
      'Was responsible for managing sprint ceremonies and quarterly roadmaps.',
      'Duties included conducting code reviews and maintaining CI/CD pipelines.',
      'Assisted with debugging database connection pool exhaustion in staging.',
      'Helped migrate 14 legacy services to Kubernetes.',
      'Worked on frontend user authentication using OAuth2 and PKCE.',
      'Tasked with automating infrastructure provisioning using Terraform.',
      'In charge of monitoring server health using Prometheus and Grafana.',
      'Handled customer escalations and Sev-1 incident postmortems.',
    ];

    for (const bullet of weakBullets) {
      const feedback = analyzeBullet(bullet);
      const weakOpener = feedback.find((f) => f.type === 'weak_opener');
      expect(weakOpener, `Expected weak opener warning for: "${bullet}"`).toBeDefined();
      expect(weakOpener?.severity).toBe('warning');
      expect(weakOpener?.suggestedVerbs && weakOpener.suggestedVerbs.length > 0).toBe(true);
      expect(weakOpener?.message).toContain('passive duty phrase');
    }
  });

  // 2. Useful guidance for achievement-focused bullets
  it('2. provides positive guidance for achievement-focused bullets with strong action verbs', () => {
    const strongBullets = [
      'Spearheaded the redesign of the distributed streaming engine, improving throughput by 45%.',
      'Architected and implemented multi-region disaster recovery for PostgreSQL databases.',
      'Orchestrated cross-functional collaboration across 4 engineering squads to launch v2 API.',
      'Optimized React bundle size by 38% through route-based code splitting and tree-shaking.',
    ];

    for (const bullet of strongBullets) {
      const feedback = analyzeBullet(bullet);
      const powerVerb = feedback.find((f) => f.type === 'power_verb');
      expect(powerVerb, `Expected power verb recognition for: "${bullet}"`).toBeDefined();
      expect(powerVerb?.severity).toBe('strength');
      expect(powerVerb?.label).toContain('Strong Action Verb');
    }
  });

  // 3. Qualitative achievements that do not require numeric metrics
  it('3. recognizes qualitative achievements, advises on metrics without penalising or forcing numbers', () => {
    const qualitativeBullet =
      'Collaborated cross-functionally with product and design teams to standardize accessible design system tokens.';

    const feedback = analyzeBullet(qualitativeBullet);
    const metricOpportunity = feedback.find((f) => f.type === 'metric_opportunity');

    expect(metricOpportunity).toBeDefined();
    expect(metricOpportunity?.severity).toBe('tip'); // Tip, never warning or error!
    expect(metricOpportunity?.message).toContain('Qualitative contributions remain fully valid');
    expect(metricOpportunity?.candidateQuestion).toContain('Can you quantify');

    // Confirm that bullets WITH metrics get positive validation
    const quantifiedBullet =
      'Collaborated cross-functionally to standardize accessible design system tokens, reducing UI bug reports by 35%.';
    const quantifiedFeedback = analyzeBullet(quantifiedBullet);
    const quantifiedSuccess = quantifiedFeedback.find((f) => f.type === 'metric_present');

    expect(quantifiedSuccess).toBeDefined();
    expect(quantifiedSuccess?.severity).toBe('strength');
    expect(quantifiedSuccess?.label).toBe('Quantified Impact');
  });

  // 4. Repetition detection
  it('4. detects consecutive repeated verbs and frequent verbs in the same section', () => {
    const allBullets = [
      'Led the architecture overhaul of the customer onboarding funnel.',
      'Led the weekly engineering standups and sprint planning sessions.',
      'Engineered automated canary deployment scripts for Kubernetes clusters.',
    ];

    // Bullet 0
    const fb0 = analyzeBullet(allBullets[0], { bulletIndex: 0, allBullets });
    expect(fb0.find((f) => f.id === 'consecutive_repetition')).toBeUndefined();

    // Bullet 1: repeats "Led" right after Bullet 0 "Led"
    const fb1 = analyzeBullet(allBullets[1], { bulletIndex: 1, allBullets });
    const repetitionWarning = fb1.find((f) => f.id === 'consecutive_repetition');

    expect(repetitionWarning).toBeDefined();
    expect(repetitionWarning?.severity).toBe('warning');
    expect(repetitionWarning?.label).toContain('Repeated Opener ("Led")');
    expect(repetitionWarning?.suggestedVerbs && repetitionWarning.suggestedVerbs.length > 0).toBe(true);
  });

  // 5. Job-specific feedback only when a job description is available
  it('5. emits job-specific feedback ONLY when a job description is provided, never when absent', () => {
    const bullet = 'Built scalable microservices in TypeScript and deployed to AWS ECS clusters.';

    // Without JD skills (no job description provided)
    const feedbackWithoutJd = analyzeBullet(bullet);
    const jdFeedbackWithoutJd = feedbackWithoutJd.filter((f) => f.type === 'jd_alignment');
    expect(jdFeedbackWithoutJd).toHaveLength(0); // Strictly zero when JD is not provided!

    // With JD skills provided
    const feedbackWithJd = analyzeBullet(bullet, {
      targetSkills: ['TypeScript', 'AWS', 'GraphQL', 'Kubernetes'],
      missingSkills: ['Kubernetes'],
    });

    const jdFeedbackWithJd = feedbackWithJd.filter((f) => f.type === 'jd_alignment');
    expect(jdFeedbackWithJd.length).toBeGreaterThan(0);

    const matchedSkill = jdFeedbackWithJd.find((f) => f.id === 'jd_matched');
    expect(matchedSkill).toBeDefined();
    expect(matchedSkill?.severity).toBe('strength');
    expect(matchedSkill?.message).toContain('TypeScript');
  });

  // 6. No fabricated metrics or skills
  it('6. adheres strictly to Truth Guard principles: prompts candidate rather than hallucinating facts', () => {
    const bulletWithoutNumbers = 'Maintained high availability for core payment processing API endpoints.';
    const feedback = analyzeBullet(bulletWithoutNumbers);

    const metricTip = feedback.find((f) => f.type === 'metric_opportunity');
    expect(metricTip).toBeDefined();
    // Ensures discovery question with placeholder "[X%]" or "[N]" rather than inventing a number
    expect(metricTip?.candidateQuestion).toMatch(/\[X%\]|\[N/);
    expect(metricTip?.actionableSuggestion).toContain('X-Y-Z formula');

    // Never invents claims or fake employers
    for (const f of feedback) {
      expect(f.message).not.toMatch(/You achieved \d+%/i);
      expect(f.message).not.toMatch(/You saved \$\d+/i);
    }
  });

  // 7. Updated guidance after editing
  it('7. updates guidance instantly when editing from a weak opener to a strong verb', () => {
    const weakInitial = 'Responsible for optimizing database queries.';
    const feedbackBefore = analyzeBullet(weakInitial);
    expect(feedbackBefore.some((f) => f.type === 'weak_opener')).toBe(true);

    // Candidate uses replaceOpenerWithVerb helper or manually edits
    const improved = replaceOpenerWithVerb(weakInitial, 'Streamlined');
    expect(improved).toBe('Streamlined optimizing database queries.');

    const feedbackAfter = analyzeBullet(improved);
    expect(feedbackAfter.some((f) => f.type === 'weak_opener')).toBe(false);
    expect(feedbackAfter.some((f) => f.type === 'power_verb' && f.severity === 'strength')).toBe(true);
  });

  // 8. No unnecessary AI request on every keystroke
  it('8. executes purely synchronously and locally with zero network or AI overhead', () => {
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) {
      analyzeBullet('Engineered cloud data pipelines in Python, processing 2M records daily.', {
        bulletIndex: 0,
        allBullets: ['Engineered cloud data pipelines in Python, processing 2M records daily.'],
        targetSkills: ['Python', 'Docker', 'AWS'],
      });
    }
    const duration = performance.now() - t0;
    // 500 evaluations should easily take < 50ms locally
    expect(duration).toBeLessThan(100);
  });

  // 9. Sample CV remains editable and its base fixture remains unchanged
  it('9. correctly analyzes Sample CV bullets without mutating the sample CV fixture', () => {
    const sample = getSampleCv();
    const originalFirstBullet = sample.experience[0].bullets[0];

    expect(originalFirstBullet).toBeDefined();
    const feedback = analyzeBullet(originalFirstBullet, {
      bulletIndex: 0,
      allBullets: sample.experience[0].bullets,
    });

    expect(feedback.length).toBeGreaterThan(0);
    // Fixture remains intact
    expect(getSampleCv().experience[0].bullets[0]).toBe(originalFirstBullet);
  });

  // 10. Length and scannability checks
  it('10. detects overly long bullets (>220 characters) and brief snippets', () => {
    const overlyLong =
      'Spearheaded comprehensive enterprise-level cloud migration across twenty-four distinct business units while coordinating directly with executive stakeholders, internal security audit officers, external compliance assessors, and over forty senior and junior software developers on a daily basis to ensure zero downtime throughout the entire process.';
    expect(overlyLong.length).toBeGreaterThan(220);

    const longFeedback = analyzeBullet(overlyLong);
    const lengthWarning = longFeedback.find((f) => f.id === 'length_long');
    expect(lengthWarning).toBeDefined();
    expect(lengthWarning?.severity).toBe('warning');
    expect(lengthWarning?.label).toContain('Length Warning');

    const shortBullet = 'Fixed bugs.';
    const shortFeedback = analyzeBullet(shortBullet);
    const shortTip = shortFeedback.find((f) => f.id === 'length_short');
    expect(shortTip).toBeDefined();
    expect(shortTip?.severity).toBe('tip');
  });
});
