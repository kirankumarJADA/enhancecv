import { describe, it, expect } from 'vitest';
import { isBulletTruthful, validateTruth, getSupportedExperienceYears } from '../src/engine/tailor';
import { sanitiseCoverLetter, CoverLetter } from '../src/ai/coverLetterAgent';
import { ResumeData } from '../src/types';

const TEST_ALEX_MERCER: ResumeData = {
  personal: {
    fullName: 'Alex Mercer',
    email: 'alex.mercer@example.com',
    phone: '+1-555-0199',
    location: 'San Francisco, CA',
  },
  summary: 'Full stack software engineer with 5 years experience building scalable web applications.',
  skills: {
    technical: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'REST APIs', 'Java', 'Python'],
    soft: ['Problem Solving', 'Collaboration'],
  },
  experience: [
    {
      id: 'exp_1',
      title: 'Senior Software Engineer',
      company: 'Acme Cloud',
      dates: '2021 - Present',
      startDate: '2021-01',
      endDate: 'Present',
      current: true,
      bullets: [
        'Architected distributed microservices handling 10M daily requests.',
        'Led a team of 4 engineers delivering key features.',
      ],
    },
  ],
  education: [
    {
      id: 'edu_1',
      institution: 'State University',
      degree: 'B.S.',
      field: 'Computer Science',
      startDate: '2017',
      endDate: '2021',
      dateDisplay: '2017 - 2021',
    },
  ],
  projects: [],
  certifications: [],
  languages: [],
  achievements: [],
  customSections: [],
  sectionOrder: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'languages', 'achievements'],
  hiddenSections: [],
};

describe('Phase 5D — Truth Guard Hardening & Adversarial Regression Suite', () => {
  // 1. Duration validation: Source says 5 years, generated text says 12 years -> REJECT
  it('1. Rejects fabricated 12 years of experience when source supports 5 years', () => {
    const check = isBulletTruthful(
      'Delivered 12 years of executive engineering leadership building enterprise platforms.',
      TEST_ALEX_MERCER
    );
    expect(check.ok).toBe(false);
    expect(check.unsupported.some((u) => u.includes('12 years'))).toBe(true);
  });

  // 2. Duration validation: Source says 5 years, generated text says 5 years -> ACCEPT
  it('2. Accepts truthful 5 years of experience when source explicitly supports 5 years', () => {
    const check = isBulletTruthful(
      'Full stack engineer with 5 years experience building scalable web applications.',
      TEST_ALEX_MERCER
    );
    expect(check.ok).toBe(true);
    expect(check.unsupported).toHaveLength(0);
  });

  // 3. Duration validation: Source supports 5 years, generated text says 3 years -> ACCEPT
  it('3. Accepts conservative 3 years claim when source supports up to 5 years', () => {
    const check = isBulletTruthful(
      'Demonstrated 3+ years of React and TypeScript microservices development.',
      TEST_ALEX_MERCER
    );
    expect(check.ok).toBe(true);
    expect(check.unsupported).toHaveLength(0);
  });

  // 4. Derived duration from chronology
  it('4. Correctly derives accepted duration from chronological employment dates', () => {
    const datedResume: ResumeData = {
      ...TEST_ALEX_MERCER,
      summary: 'Experienced backend software developer.', // No stated years in summary
      experience: [
        {
          id: 'exp_past',
          company: 'Legacy Corp',
          title: 'Software Developer',
          dates: '2018 - 2022',
          startDate: '2018-01',
          endDate: '2022-12',
          bullets: ['Built APIs.'],
        },
      ],
    };
    const sup = getSupportedExperienceYears(datedResume);
    expect(sup.hasEvidence).toBe(true);
    expect(sup.maxYears).toBeGreaterThanOrEqual(4);

    // 4 years is supported by 2018 - 2022 dates
    const check4 = isBulletTruthful('Over 4 years of TypeScript development experience.', datedResume);
    expect(check4.ok).toBe(true);

    // 10 years exceeds derived dates and must be rejected
    const check10 = isBulletTruthful('10 years of senior engineering leadership.', datedResume);
    expect(check10.ok).toBe(false);
    expect(check10.unsupported.some((u) => u.includes('10 years'))).toBe(true);
  });

  // 5. Insufficient dates: Rejects unsupported duration
  it('5. Rejects unsupported duration when source has no dates and no stated years', () => {
    const undatedResume: ResumeData = {
      ...TEST_ALEX_MERCER,
      summary: 'Full stack developer building web apps.',
      experience: [
        {
          id: 'exp_nodate',
          company: 'Undated Co',
          title: 'Developer',
          dates: '',
          startDate: '',
          endDate: '',
          bullets: ['Built features.'],
        },
      ],
    };
    const sup = getSupportedExperienceYears(undatedResume);
    expect(sup.hasEvidence).toBe(false);

    const check = isBulletTruthful('5 years of web application development.', undatedResume);
    expect(check.ok).toBe(false);
    expect(check.unsupported.some((u) => u.includes('5 years'))).toBe(true);
  });

  // 6. Inflated financial metrics: REJECT
  it('6. Rejects inflated financial metrics ($5.8M and $12M revenue)', () => {
    const check = isBulletTruthful(
      'Generated $5.8M annual recurring revenue by expanding payment pipelines.',
      TEST_ALEX_MERCER
    );
    expect(check.ok).toBe(false);
    expect(check.unsupported.some((u) => u.includes('5.8') || u.includes('$5.8M'))).toBe(true);
  });

  // 7. Inflated performance metrics: REJECT
  it('7. Rejects inflated performance metrics (99.999% SLA uptime and 999M requests)', () => {
    const check = isBulletTruthful(
      'Maintained 99.999% SLA uptime across 999M daily distributed requests.',
      TEST_ALEX_MERCER
    );
    expect(check.ok).toBe(false);
    expect(check.unsupported.some((u) => u.includes('99.999%') || u.includes('999M'))).toBe(true);
  });

  // 8. Invented leadership responsibilities: REJECT
  it('8. Rejects invented leadership headcount (department of 45 engineers when candidate led 4)', () => {
    const check = isBulletTruthful(
      'Directed a department of 45 engineers and engineering managers across 3 regions.',
      TEST_ALEX_MERCER
    );
    expect(check.ok).toBe(false);
    expect(check.unsupported.some((u) => u.includes('45'))).toBe(true);
  });

  // 9. Unsupported qualifications: REJECT
  it('9. Rejects unearned certifications and degrees (AWS Solutions Architect, Ph.D.)', () => {
    const check = isBulletTruthful(
      'Earned AWS Certified Solutions Architect Professional and Ph.D. in Computer Science from MIT.',
      TEST_ALEX_MERCER
    );
    expect(check.ok).toBe(false);
    expect(check.unsupported.some((u) => u.toLowerCase().includes('aws certified'))).toBe(true);
  });

  // 10. Unsupported technologies: REJECT
  it('10. Rejects unsupported technologies (Kubernetes, Rust, GraphQL)', () => {
    const check = isBulletTruthful(
      'Deployed high-throughput GraphQL APIs to Kubernetes clusters written in Rust.',
      TEST_ALEX_MERCER
    );
    expect(check.ok).toBe(false);
    expect(check.unsupported.some((u) => u.includes('Rust') || u.includes('Kubernetes') || u.includes('GraphQL'))).toBe(true);
  });

  // 11. Truthful technical numbers and versions: ACCEPT where grounded
  it('11. Accepts truthful technical versions and attested metrics', () => {
    // 10M requests is explicitly in Master CV
    const checkMetric = isBulletTruthful(
      'Architected distributed microservices handling 10M daily requests using TypeScript and Docker.',
      TEST_ALEX_MERCER
    );
    expect(checkMetric.ok).toBe(true);

    // Python 3 and Java 17 technical versions where Python/Java are attested
    const checkVersions = isBulletTruthful(
      'Developed backend services with Java 17 and Python 3.',
      TEST_ALEX_MERCER
    );
    expect(checkVersions.ok).toBe(true);
  });

  // 12. Resume improvement path regression test: Auto-reverts fabricated bullets to Master CV baseline
  it('12. Resume improvement path automatically reverts fabricated 12-year bullet to Master CV version', () => {
    const candidate: ResumeData = JSON.parse(JSON.stringify(TEST_ALEX_MERCER));
    candidate.experience[0].bullets[0] = 'Delivered 12 years of executive engineering leadership with $5.8M profit.';

    const report = validateTruth(candidate, TEST_ALEX_MERCER);
    expect(report.passedAll).toBe(false);
    expect(report.autoFixed.length).toBeGreaterThan(0);
    // Verified Master CV wording restored
    expect(candidate.experience[0].bullets[0]).toBe(TEST_ALEX_MERCER.experience[0].bullets[0]);
    expect(candidate.experience[0].bullets[0]).not.toContain('12 years');
    expect(candidate.experience[0].bullets[0]).not.toContain('5.8M');
  });

  // 13. Cover letter path regression test: Prunes unsupported duration sentence
  it('13. Cover letter generation path automatically prunes sentences containing fabricated duration or metrics', () => {
    const adversarialLetter: CoverLetter = {
      greeting: 'Dear Acme Cloud Hiring Team,',
      paragraphs: [
        'As a full stack software engineer with 5 years experience, I am excited to apply for the position.',
        'At Acme Cloud, I delivered 12 years of executive leadership and scaled Kubernetes clusters in Rust.',
        'At Acme Cloud, I architected distributed microservices handling 10M daily requests and led a team of 4 engineers.',
      ],
      closing: 'Sincerely,\nAlex Mercer',
    };

    const sanitised = sanitiseCoverLetter(adversarialLetter, TEST_ALEX_MERCER);
    expect(sanitised.rejectedCount).toBeGreaterThanOrEqual(1);
    // Offending paragraph/sentence containing 12 years / Kubernetes is stripped
    const fullText = sanitised.letter.paragraphs.join(' ');
    expect(fullText).not.toContain('12 years');
    expect(fullText).not.toContain('Kubernetes');
    expect(fullText).not.toContain('Rust');
    // Grounded paragraphs remain
    expect(fullText).toContain('5 years experience');
    expect(fullText).toContain('10M daily requests');
    expect(fullText).toContain('team of 4 engineers');
  });
});
