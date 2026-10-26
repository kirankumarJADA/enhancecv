import { describe, it, expect } from 'vitest';
import { runAdvancedAtsAudit, DIMENSION_WEIGHTS, DIMENSION_LABELS } from '../src/engine/audit';
import { analyseATS } from '../src/engine/ats';
import { makeMasterCV } from './fixtures';
import { ResumeData, AuditDimensionKey } from '../src/types';

describe('Advanced ATS Audit Engine', () => {
  it('weights across all 9 dimensions sum to exactly 100', () => {
    const keys = Object.keys(DIMENSION_WEIGHTS) as AuditDimensionKey[];
    expect(keys).toHaveLength(9);
    const sum = keys.reduce((acc, k) => acc + DIMENSION_WEIGHTS[k], 0);
    expect(sum).toBe(100);
  });

  it('runs audit on a solid CV and returns expected composite structure', () => {
    const resume = makeMasterCV();
    const audit = runAdvancedAtsAudit(resume);

    expect(audit).toBeDefined();
    expect(audit.overallScore).toBeGreaterThanOrEqual(0);
    expect(audit.overallScore).toBeLessThanOrEqual(100);
    expect(['exceptional', 'competitive', 'moderate', 'needs_work']).toContain(audit.rating);
    expect(audit.summary).toBeTruthy();

    const dimKeys = Object.keys(audit.dimensions) as AuditDimensionKey[];
    expect(dimKeys).toHaveLength(9);

    dimKeys.forEach((key) => {
      const dim = audit.dimensions[key];
      expect(dim.key).toBe(key);
      expect(dim.label).toBe(DIMENSION_LABELS[key]);
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(100);
      expect(dim.weight).toBe(DIMENSION_WEIGHTS[key]);
      expect(['exceptional', 'good', 'needs_improvement', 'critical']).toContain(dim.status);
      expect(Array.isArray(dim.findings)).toBe(true);
    });

    expect(Array.isArray(audit.allFindings)).toBe(true);
    expect(Array.isArray(audit.quickWins)).toBe(true);
    expect(Array.isArray(audit.strengths)).toBe(true);

    expect(audit.stats).toBeDefined();
    expect(audit.stats.totalBullets).toBeGreaterThan(0);
    expect(audit.stats.quantifiedPercentage).toBeGreaterThanOrEqual(0);
    expect(audit.stats.quantifiedPercentage).toBeLessThanOrEqual(100);
    expect(audit.stats.actionVerbPercentage).toBeGreaterThanOrEqual(0);
    expect(audit.stats.actionVerbPercentage).toBeLessThanOrEqual(100);
    expect(audit.stats.readingTimeSeconds).toBeGreaterThan(0);
  });

  describe('Dimension 1: ATS Parsing Readiness', () => {
    it('flags missing contact details and awards lower score', () => {
      const resume = makeMasterCV();
      resume.personal.email = '';
      resume.personal.phone = '';
      resume.personal.location = '';

      const audit = runAdvancedAtsAudit(resume);
      const parsing = audit.dimensions.parsing;

      expect(parsing.score).toBeLessThan(80);
      const contactFinding = parsing.findings.find((f) => f.id === 'parse-contact-missing');
      expect(contactFinding).toBeDefined();
      expect(contactFinding?.severity).toBe('critical');
      expect(contactFinding?.message).toContain('Email Address');
    });

    it('passes and rewards full contact details', () => {
      const resume = makeMasterCV();
      const audit = runAdvancedAtsAudit(resume);
      const parsing = audit.dimensions.parsing;

      expect(parsing.score).toBeGreaterThanOrEqual(85);
      const contactPassed = parsing.findings.some(
        (f) => f.severity === 'positive' && f.id === 'parse-contact-complete'
      );
      expect(contactPassed).toBe(true);
    });
  });

  describe('Dimension 2: Quantified Impact', () => {
    it('calculates metrics percentage and provides formula recommendations without fabrication', () => {
      const resume = makeMasterCV();
      resume.experience.forEach((e) => {
        e.bullets = [
          'Assisted with various tasks and routine administrative work for the team.',
          'Responsible for helping coworkers maintain existing computer software systems.',
        ];
      });
      resume.projects = [];

      const audit = runAdvancedAtsAudit(resume);
      const quant = audit.dimensions.quantification;

      expect(quant.score).toBeLessThan(70);
      const lowRatio = quant.findings.find((f) => f.id === 'quant-low-ratio');
      expect(lowRatio).toBeDefined();
      expect(lowRatio?.recommendation).toContain('Accomplished [X]');
    });

    it('rewards high metric density with exceptional score', () => {
      const resume = makeMasterCV();
      const audit = runAdvancedAtsAudit(resume);
      const quant = audit.dimensions.quantification;

      expect(quant.score).toBeGreaterThanOrEqual(75);
      expect(quant.metrics?.percentage).toBeDefined();
    });
  });

  describe('Dimension 3: Repetition & Wording Quality', () => {
    it('detects repeated opener verbs and clichés', () => {
      const resume = makeMasterCV();
      resume.experience = [
        {
          id: 'exp_rep',
          company: 'Acme Corp',
          title: 'Developer',
          startDate: '2022',
          endDate: '2023',
          current: false,
          bullets: [
            'Developed REST APIs using Node.js and TypeScript.',
            'Developed database schema migrations using PostgreSQL.',
            'Developed unit test suites with Vitest.',
            'Developed automated deployment scripts for CI/CD.',
            'Synergy oriented go-getter acting as a 10x rockstar.',
          ],
        },
      ];

      const audit = runAdvancedAtsAudit(resume);
      const rep = audit.dimensions.repetition;

      expect(rep.score).toBeLessThanOrEqual(80);
      const repeatedVerb = rep.findings.find((f) => f.id.startsWith('rep-opener-'));
      expect(repeatedVerb).toBeDefined();
      expect(repeatedVerb?.title).toContain('Developed');

      const cliches = rep.findings.filter((f) => f.id.startsWith('rep-cliche-'));
      expect(cliches.length).toBeGreaterThan(0);
    });

    it('detects identical duplicate bullets', () => {
      const resume = makeMasterCV();
      resume.experience[0].bullets = [
        'Built a Spring Boot service reconciling 50k transactions nightly.',
        'Built a Spring Boot service reconciling 50k transactions nightly.',
      ];

      const audit = runAdvancedAtsAudit(resume);
      const rep = audit.dimensions.repetition;

      const dupFinding = rep.findings.find((f) => f.id === 'rep-duplicates-found');
      expect(dupFinding).toBeDefined();
      expect(dupFinding?.severity).toBe('critical');
    });
  });

  describe('Dimension 4: Spelling & Grammar', () => {
    it('detects common resume typos and duplicate words', () => {
      const resume = makeMasterCV();
      resume.summary = 'Senior project manger with experiance leading the the engineering teams.';

      const audit = runAdvancedAtsAudit(resume);
      const spelling = audit.dimensions.spelling;

      expect(spelling.score).toBeLessThan(90);
      const typoManger = spelling.findings.find((f) => f.evidence?.toLowerCase().includes('manger'));
      expect(typoManger).toBeDefined();
      expect(typoManger?.suggestion).toContain('manager');

      const doubleWord = spelling.findings.find((f) => f.id.startsWith('spell-dup-word-'));
      expect(doubleWord).toBeDefined();
      expect(doubleWord?.evidence).toContain('the the');
    });

    it('detects bracket mismatch in bullets', () => {
      const resume = makeMasterCV();
      resume.experience[0].bullets[0] = 'Implemented microservices (using Spring Boot and Docker for deployment.';

      const audit = runAdvancedAtsAudit(resume);
      const spelling = audit.dimensions.spelling;

      const bracketFinding = spelling.findings.find((f) => f.id.startsWith('spell-unmatched-paren-'));
      expect(bracketFinding).toBeDefined();
    });
  });

  describe('Dimension 5: Bullet Consistency & Flow', () => {
    it('flags bullets that are too short or overly long run-on sentences', () => {
      const resume = makeMasterCV();
      resume.experience[0].bullets = [
        'Fixed bugs.', // Too short (< 6 words)
        'Architected, designed, engineered, and successfully implemented a high performance distributed fault tolerant enterprise payment processing transaction routing system across multiple geographic cloud regions and availability zones that utilized hybrid caching strategies and resilient message brokering patterns while consistently maintaining five nines of availability across global peak seasonal customer transaction volumes.', // Over 45 words (> 38 words)
      ];

      const audit = runAdvancedAtsAudit(resume);
      const consistency = audit.dimensions.consistency;

      const shortFinding = consistency.findings.find((f) => f.id === 'cons-too-short');
      expect(shortFinding).toBeDefined();

      const longFinding = consistency.findings.find((f) => f.id === 'cons-too-long');
      expect(longFinding).toBeDefined();
    });

    it('evaluates punctuation consistency', () => {
      const resume = makeMasterCV();
      resume.experience[0].bullets = [
        'Developed backend services with Java and Spring Boot.',
        'Optimised database queries for high throughput',
        'Built automated integration pipelines with Jenkins.',
        'Maintained monitoring dashboards with Grafana',
      ];

      const audit = runAdvancedAtsAudit(resume);
      const consistency = audit.dimensions.consistency;

      const punctFinding = consistency.findings.find((f) => f.id === 'cons-punctuation-mixed');
      expect(punctFinding).toBeDefined();
      expect(punctFinding?.recommendation).toBeTruthy();
    });
  });

  describe('Dimension 6: Essential Resume Sections', () => {
    it('adapts to early career candidates with projects and education', () => {
      const studentResume: ResumeData = {
        personal: {
          fullName: 'Priya Patel',
          email: 'priya@example.com',
          phone: '+44 7700 900456',
          location: 'London, UK',
          linkedin: 'linkedin.com/in/priyapatel',
          headline: 'Computer Science Graduate',
        },
        summary: 'Recent Computer Science graduate with strong skills in Python and machine learning.',
        experience: [],
        education: [
          {
            id: 'edu_1',
            institution: 'Imperial College London',
            degree: 'BSc Computer Science',
            startDate: '2021',
            endDate: '2024',
          },
        ],
        projects: [
          {
            id: 'prj_1',
            name: 'VisionAI',
            bullets: ['Trained a ResNet-50 computer vision model achieving 94% test accuracy.'],
            tech: ['Python', 'PyTorch', 'OpenCV'],
          },
        ],
        skills: {
          technical: ['Python', 'PyTorch', 'SQL', 'Git'],
          soft: ['Problem Solving', 'Teamwork'],
        },
      };

      const audit = runAdvancedAtsAudit(studentResume);
      const sections = audit.dimensions.sections;

      expect(sections.score).toBeGreaterThanOrEqual(70);
      const earlyCareerFinding = sections.findings.find((f) => f.id === 'sec-exp-early-career');
      expect(earlyCareerFinding).toBeDefined();
    });
  });

  describe('Dimension 7: Core ATS Essentials', () => {
    it('flags experience entries with missing role title or company', () => {
      const resume = makeMasterCV();
      resume.experience[0].company = '';
      resume.experience[0].title = '';

      const audit = runAdvancedAtsAudit(resume);
      const essentials = audit.dimensions.essentials;

      const missingCompany = essentials.findings.find((f) => f.id === 'ess-missing-role-metadata');
      expect(missingCompany).toBeDefined();
      expect(missingCompany?.severity).toBe('critical');
    });

    it('verifies parseable date formatting', () => {
      const resume = makeMasterCV();
      resume.experience[0].startDate = 'Summer time';
      resume.experience[0].endDate = 'Later on';

      const audit = runAdvancedAtsAudit(resume);
      const essentials = audit.dimensions.essentials;

      const dateFinding = essentials.findings.find((f) => f.id === 'ess-dates-inconsistent');
      expect(dateFinding).toBeDefined();
    });
  });

  describe('Dimension 8: Recruiter Review Flags', () => {
    it('detects inverted chronological date order', () => {
      const resume = makeMasterCV();
      resume.experience = [
        {
          id: 'exp_inverted',
          company: 'First Corp',
          title: 'Senior Developer',
          startDate: '2024',
          endDate: '2020',
          current: false,
          bullets: ['Led engineering.'],
        },
      ];

      const audit = runAdvancedAtsAudit(resume);
      const recruiter = audit.dimensions.recruiter;

      const inverted = recruiter.findings.find((f) => f.id.startsWith('rec-inverted-dates-'));
      expect(inverted).toBeDefined();
      expect(inverted?.severity).toBe('critical');
    });

    it('never penalizes employment gaps or sensitive personal attributes', () => {
      const resume = makeMasterCV();
      resume.experience = [
        {
          id: 'exp_recent',
          company: 'Modern Co',
          title: 'Lead Architect',
          startDate: '01/2023',
          endDate: 'Present',
          current: true,
          bullets: ['Engineered scalable cloud architecture with Kubernetes.'],
        },
        {
          id: 'exp_past',
          company: 'Past Co',
          title: 'Senior Engineer',
          startDate: '01/2019',
          endDate: '12/2020',
          current: false,
          bullets: ['Managed database migrations.'],
        },
      ];

      const audit = runAdvancedAtsAudit(resume);
      const recruiter = audit.dimensions.recruiter;

      // Ensure no penalty findings flag gaps
      const gapPenalties = recruiter.findings.filter(
        (f) => f.severity !== 'positive' && (f.message.toLowerCase().includes('gap') || f.title.toLowerCase().includes('gap'))
      );
      expect(gapPenalties).toHaveLength(0);

      // Verify explicit non-discriminatory positive policy confirmation
      const ethicalPolicy = recruiter.findings.find((f) => f.id === 'rec-ethical-non-discriminatory');
      expect(ethicalPolicy).toBeDefined();
    });
  });

  describe('Dimension 9: Inclusive & Modern Language', () => {
    it('flags non-inclusive language like "man hours" or "rockstar" and suggests alternatives', () => {
      const resume = makeMasterCV();
      resume.experience[0].bullets[0] = 'Reduced 500 man hours of manual data entry by building automated scrapers.';

      const audit = runAdvancedAtsAudit(resume);
      const inc = audit.dimensions.inclusivity;

      expect(inc.score).toBeLessThan(90);
      const genderedFinding = inc.findings.find((f) => f.id.startsWith('inc-rule-'));
      expect(genderedFinding).toBeDefined();
      expect(genderedFinding?.suggestion).toContain('staff hours');
    });

    it('awards full marks when professional modern terminology is used', () => {
      const resume = makeMasterCV();
      const audit = runAdvancedAtsAudit(resume);
      const inc = audit.dimensions.inclusivity;

      expect(inc.score).toBe(100);
      expect(inc.status).toBe('exceptional');
    });
  });

  describe('Integration with analyseATS', () => {
    it('analyseATS automatically includes comprehensive audit property', () => {
      const resume = makeMasterCV();
      const ats = analyseATS(resume);

      expect(ats.audit).toBeDefined();
      expect(ats.audit?.overallScore).toBeGreaterThanOrEqual(0);
      expect(ats.audit?.dimensions.parsing).toBeDefined();
      expect(ats.audit?.dimensions.recruiter).toBeDefined();
      expect(ats.audit?.quickWins).toBeDefined();
      expect(ats.audit?.strengths).toBeDefined();
    });
  });
});
