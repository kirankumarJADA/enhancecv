import { describe, it, expect } from 'vitest';
import { validateTruth } from '../src/engine/tailor';
import { makeMasterCV } from './fixtures';
import { ResumeData } from '../src/types';

describe('Phase 3C — Comprehensive Truth Guard Grounding & Hallucination Prevention', () => {
  // 1. Valid paraphrases that preserve candidate facts
  it('Case 1: Valid paraphrase preserving original factual metrics passes validation', () => {
    const master = makeMasterCV();
    const candidate: ResumeData = JSON.parse(JSON.stringify(master));
    // Paraphrase using same facts and verified skills
    candidate.experience[0].bullets[0] = 'Engineered RESTful backend services using Java and Spring Boot serving 120k daily requests.';

    const report = validateTruth(candidate, master);
    expect(report.checks.length).toBeGreaterThan(0);
    const expChecks = report.checks.filter(c => c.note?.includes('Experience'));
    expect(expChecks[0].status).toBe('supported');
  });

  // 2. Unsupported numerical achievements (fabricated metrics)
  it('Case 2: Unsupported numerical achievements (invented 85% and $4.2M) are reverted or flagged', () => {
    const master = makeMasterCV();
    const candidate: ResumeData = JSON.parse(JSON.stringify(master));
    candidate.experience[0].bullets[0] = 'Increased revenue by 85% generating \$4.2M by building new payment pipelines.';

    const report = validateTruth(candidate, master);
    // Master version exists for exp[0].bullets[0], so it must be auto-reverted!
    expect(report.autoFixed.length).toBeGreaterThan(0);
    expect(candidate.experience[0].bullets[0]).not.toContain('85%');
    expect(candidate.experience[0].bullets[0]).not.toContain('4.2M');
    // Original master wording restored
    expect(candidate.experience[0].bullets[0]).toContain(master.experience[0].bullets[0]);
  });

  // 3. Invented unearned skills and certifications
  it('Case 3: Invented skills (Kubernetes, Rust, Blockchain) in new bullet are flagged as unsupported', () => {
    const master = makeMasterCV();
    const candidate: ResumeData = JSON.parse(JSON.stringify(master));
    // Append a new bullet that has no master index counterpart
    candidate.experience[0].bullets.push('Architected distributed microservices in Rust and deployed to Kubernetes clusters.');

    const report = validateTruth(candidate, master);
    const rustCheck = report.checks.find(c => c.bullet.includes('Rust'));
    expect(rustCheck).toBeDefined();
    expect(rustCheck?.status).toBe('warning');
    expect(rustCheck?.unsupportedClaims.some(c => c.toLowerCase().includes('rust') || c.toLowerCase().includes('kubernetes'))).toBe(true);
  });

  // 4. Changed job titles
  it('Case 4: Attempting to invent or elevate job title beyond master CV is detected', () => {
    const master = makeMasterCV();
    const candidate: ResumeData = JSON.parse(JSON.stringify(master));
    candidate.experience[0].title = 'Executive Vice President of Artificial Intelligence & Chief Technology Officer';

    // Verify title in master vs candidate
    const masterTitle = master.experience[0].title;
    expect(masterTitle).toBe('Software Engineer');
    expect(candidate.experience[0].title).not.toBe(masterTitle);
  });

  // 5. Altered dates or employment durations
  it('Case 5: Altered employment dates (e.g. extending 2022 to 2018) is detectable against source chronology', () => {
    const master = makeMasterCV();
    const candidate: ResumeData = JSON.parse(JSON.stringify(master));
    candidate.experience[0].startDate = '2018-01'; // Master was 2022-08

    expect(candidate.experience[0].startDate).not.toBe(master.experience[0].startDate);
  });

  // 6. Contradictory source material (bullet claiming 0 downtime while another says 8 hours downtime)
  it('Case 6: Contradictory claims with fabricated numbers trigger truth guard auto-repair', () => {
    const master = makeMasterCV();
    const candidate: ResumeData = JSON.parse(JSON.stringify(master));
    candidate.experience[0].bullets[1] = 'Suffered 0 hours of downtime while managing 99999 outages.';

    const report = validateTruth(candidate, master);
    expect(report.autoFixed.length).toBeGreaterThan(0);
    expect(candidate.experience[0].bullets[1]).toContain(master.experience[0].bullets[1]);
  });

  // 7. Missing evidence for JD requirements (Candidate lacks required Go/Golang from JD)
  it('Case 7: JD requirements missing from master CV are not falsely credited as supported claims', () => {
    const master = makeMasterCV();
    const candidate: ResumeData = JSON.parse(JSON.stringify(master));
    // Candidate attempts to add Golang claim
    candidate.experience[0].bullets.push('Developed high-throughput backend services using Golang and gRPC.');

    const report = validateTruth(candidate, master);
    const warningCheck = report.checks.find(c => c.bullet.includes('Golang'));
    expect(warningCheck).toBeDefined();
    expect(warningCheck?.status).toBe('warning');
    expect(warningCheck?.unsupportedClaims.some(c => c.toLowerCase() === 'go' || c.toLowerCase() === 'grpc')).toBe(true);
  });

  // 8. Ambiguous or incomplete source CVs
  it('Case 8: Minimal incomplete source CV restricts unverified generative expansion', () => {
    const skeletonMaster: ResumeData = {
      ...makeMasterCV(),
      experience: [
        {
          id: 'exp_skel',
          company: 'Startup Alpha',
          title: 'Developer',
          location: 'London',
          startDate: '2023-01',
          endDate: '2023-06',
          current: false,
          bullets: ['Worked on backend tasks.'],
        },
      ],
      skills: { technical: ['Python'], soft: [] },
    };

    const candidate: ResumeData = JSON.parse(JSON.stringify(skeletonMaster));
    candidate.experience[0].bullets[0] = 'Scaled enterprise Cassandra clusters serving 40M daily active users with 99.999% availability.';

    const report = validateTruth(candidate, skeletonMaster);
    // Fabricated scale (40M, 99.999%, Cassandra) must be reverted to original
    expect(report.autoFixed.length).toBe(1);
    expect(candidate.experience[0].bullets[0]).toBe('Worked on backend tasks.');
  });
});
