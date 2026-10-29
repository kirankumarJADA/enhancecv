import { describe, it, expect } from 'vitest';
import { makeMasterCV, JAVA_JD } from './fixtures';
import { makeCloudMasterCV, CLOUD_PLATFORM_JD, makeReactMasterCV, REACT_JD } from './benchmark_fixtures';
import { analyseJobDescription } from '../src/engine/jd';
import { computeJobMatch } from '../src/engine/match';
import { tailorResume } from '../src/engine/tailor';
import { runResumeAgent } from '../src/ai/resumeAgent';
import { ResumeData } from '../src/types';

describe('Headline & Identity Factual Grounding Regressions', () => {
  it('a candidate does not become a senior engineer merely because the target job is senior', async () => {
    const cv = makeMasterCV(); // Aarav Sharma: headline='Backend Engineer', titles='Software Engineer', 'Junior Developer'
    expect(cv.personal.headline).toBe('Backend Engineer');
    expect(cv.experience.some((e) => e.title.toLowerCase().includes('senior'))).toBe(false);

    const jd = analyseJobDescription(JAVA_JD); // 'Senior Java Backend Engineer'
    expect(jd.title).toContain('Senior');

    const matchBefore = computeJobMatch(cv, jd);
    const tailored = await tailorResume(cv, jd, matchBefore);

    // Headline must remain truthful to the candidate's actual identity
    expect(tailored.resume.personal.headline).toBe('Backend Engineer');
    expect(tailored.resume.personal.headline).not.toContain('Senior');

    // Summary must not falsely introduce unearned "Senior" seniority
    expect(tailored.resume.summary).toMatch(/^Backend Engineer/i);
    expect(tailored.resume.summary).not.toMatch(/^Senior\s+Java\s+Backend\s+Engineer/i);

    // Target role is stored and surfaced separately in result metadata
    expect(tailored.targetRole).toBe('Senior Java Backend Engineer');
  });

  it('unsupported employer titles, qualifications and certifications are never introduced', async () => {
    const cv = makeMasterCV();
    const maliciousJd = `Senior Staff Principal Architect at Global Fintech Corp
Requirements:
- PhD in Quantum Computing from MIT
- AWS Certified Solutions Architect Professional and CKA
- Previous employment as Distinguished Engineer at Google or Stripe`;

    const jd = analyseJobDescription(maliciousJd);
    const matchBefore = computeJobMatch(cv, jd);
    const tailored = await tailorResume(cv, jd, matchBefore);

    // Employer companies must remain original
    expect(tailored.resume.experience.map((e) => e.company)).toEqual(cv.experience.map((e) => e.company));
    expect(JSON.stringify(tailored.resume)).not.toContain('Google');
    expect(JSON.stringify(tailored.resume)).not.toContain('Stripe');
    expect(JSON.stringify(tailored.resume)).not.toContain('Global Fintech Corp');

    // Qualifications must remain original degree (BSc)
    expect(tailored.resume.education[0].degree).toBe('BSc');
    expect(JSON.stringify(tailored.resume)).not.toContain('PhD');
    expect(JSON.stringify(tailored.resume)).not.toContain('MIT');

    // Certifications must not introduce unevidenced AWS / CKA certifications
    expect(tailored.resume.certifications).toEqual(cv.certifications);
    expect(JSON.stringify(tailored.resume)).not.toContain('Solutions Architect Professional');
  });

  it('a genuinely supported headline improvement remains possible when headline is missing', async () => {
    const cv = makeMasterCV();
    cv.personal.headline = ''; // Missing headline

    const jd = analyseJobDescription(JAVA_JD);
    const matchBefore = computeJobMatch(cv, jd);
    const tailored = await tailorResume(cv, jd, matchBefore);

    // Headline is populated using the candidate's most recent evidenced role ('Software Engineer')
    expect(tailored.resume.personal.headline).toBe('Software Engineer');
    const headlineLog = tailored.changeLog.find((c) => c.section === 'Personal Details — Headline');
    expect(headlineLog).toBeDefined();
    expect(headlineLog?.label).toBe('headline_grounded');
    expect(headlineLog?.evidence).toContain('Master CV');
  });

  it('match analysis is not improved by replacing factual profile information solely to increase title overlap', async () => {
    const cv = makeReactMasterCV(); // Marcus Chen: headline='Full Stack Frontend Developer'
    expect(cv.personal.headline).toBe('Full Stack Frontend Developer');

    const jd = analyseJobDescription(REACT_JD); // 'Frontend Engineer (React)'
    const mBefore = computeJobMatch(cv, jd);

    const tailored = await tailorResume(cv, jd, mBefore);

    // Factual headline must be preserved, not overwritten with 'Frontend Engineer (React)'
    expect(tailored.resume.personal.headline).toBe('Full Stack Frontend Developer');

    const mAfter = computeJobMatch(tailored.resume, jd);

    // Title overlap in experience breakdown must be evaluated using Marcus's factual titles,
    // not artificially elevated to 100% via profile headline replacement.
    const expBefore = mBefore.breakdown.find((b) => b.key === 'experience')!;
    const expAfter = mAfter.breakdown.find((b) => b.key === 'experience')!;

    // Experience score should not experience an ungrounded 16-point artificial jump from headline replacement
    expect(tailored.resume.personal.headline).not.toBe('Frontend Engineer (React)');
    expect(expAfter.score).toBe(expBefore.score);
  });
});
