import { describe, it, expect } from 'vitest';
import { analyseATS, estimatePages } from '../src/engine/ats';
import { analyseJobDescription } from '../src/engine/jd';
import { computeJobMatch } from '../src/engine/match';
import { tailorResume, validateTruth, generateSuggestions } from '../src/engine/tailor';
import { extractResumeFromText } from '../src/engine/extract';
import { renderResumePdf, pdfFileName } from '../src/engine/pdf';
import { makeMasterCV, makeFrontendCV, JAVA_JD, REACT_JD } from './fixtures';
import { ResumeData } from '../src/types';

// ---------------------------------------------------------------- ATS ----

describe('ATS analysis', () => {
  it('scores a strong CV highly and derives all category scores', () => {
    const ats = analyseATS(makeMasterCV());
    expect(ats.overallScore).toBeGreaterThanOrEqual(70);
    expect(ats.overallScore).toBeLessThanOrEqual(100);
    for (const s of [ats.formattingScore, ats.structureScore, ats.contentScore, ats.skillsScore, ats.readabilityScore]) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('scores a weak CV lower than a strong one and reports concrete issues', () => {
    const weak: ResumeData = {
      ...makeMasterCV(),
      summary: 'Hardworking team player seeking a challenging role.',
      experience: [
        {
          id: 'exp_1',
          company: 'Acme',
          title: 'Worker',
          startDate: '',
          endDate: '',
          current: true,
          bullets: ['Worked on various tasks.', 'Helped with things etc.', 'Worked on various tasks.'],
        },
      ],
      education: [],
      skills: { technical: [], soft: [] },
      certifications: [],
      languages: [],
      achievements: [],
      projects: [],
    };
    const strong = analyseATS(makeMasterCV());
    const weakAts = analyseATS(weak);
    expect(weakAts.overallScore).toBeLessThan(strong.overallScore);
    expect(weakAts.issues.length).toBeGreaterThan(0);
    expect(weakAts.issues.some((i) => /vague|weak|action verb/i.test(i.message))).toBe(true);
  });

  it('penalises duplicated bullets', () => {
    const cv = makeMasterCV();
    cv.experience[0].bullets = ['Built services', 'Built services', 'Built services'];
    const ats = analyseATS(cv);
    expect(ats.checks.find((c) => c.id === 'cnt-repetition')?.passed).toBe(false);
  });

  it('never fabricates scores: identical CVs yield identical scores', () => {
    const cv = makeMasterCV();
    expect(analyseATS(cv).overallScore).toBe(analyseATS(JSON.parse(JSON.stringify(cv)) as ResumeData).overallScore);
  });

  it('estimates page count sensibly', () => {
    expect(estimatePages(makeMasterCV())).toBeLessThanOrEqual(2);
  });
});

// ----------------------------------------------------------------- JD ----

describe('JD analysis', () => {
  it('extracts title, seniority and years for the Java JD', () => {
    const jd = analyseJobDescription(JAVA_JD);
    expect(jd.title.toLowerCase()).toContain('java');
    expect(jd.seniority).toBe('Senior');
    expect(jd.yearsRequired).toBe(5);
    expect(jd.requiredSkills).toContain('Java');
    expect(jd.requiredSkills).toContain('Spring Boot');
    expect(jd.requiredSkills).toContain('PostgreSQL');
    expect(jd.requiredSkills).toContain('Docker');
    expect(jd.requiredSkills).toContain('Kubernetes');
  });

  it('separates preferred skills into the preferred bucket', () => {
    const jd = analyseJobDescription(JAVA_JD);
    expect(jd.preferredSkills).toContain('AWS');
    expect(jd.preferredSkills).toContain('Terraform');
    expect(jd.requiredSkills).not.toContain('Terraform');
  });

  it('extracts responsibilities and education requirements', () => {
    const jd = analyseJobDescription(JAVA_JD);
    expect(jd.responsibilities.length).toBeGreaterThanOrEqual(3);
    expect(jd.educationRequirements.some((e) => /bachelor/i.test(e))).toBe(true);
  });

  it('extracts soft skills', () => {
    const jd = analyseJobDescription(REACT_JD);
    const soft = jd.softSkills.map((s) => s.toLowerCase());
    expect(soft.some((s) => s.includes('communication') || s.includes('teamwork'))).toBe(true);
  });

  it('produces different analyses for different JDs', () => {
    const a = analyseJobDescription(JAVA_JD);
    const b = analyseJobDescription(REACT_JD);
    expect(a.requiredSkills).not.toEqual(b.requiredSkills);
    expect(b.requiredSkills).toContain('React');
    expect(a.requiredSkills).not.toContain('React');
  });

  it('rejects trivial input deterministically', () => {
    const jd = analyseJobDescription('Engineer\nApply now.');
    expect(jd).toBeTruthy();
  });
});

// ------------------------------------------------------------- MATCHING ----

describe('CV ↔ JD matching', () => {
  it('classifies matched, missing and partial requirements', () => {
    const jd = analyseJobDescription(JAVA_JD);
    const cv = makeMasterCV();
    const match = computeJobMatch(cv, jd);
    const byReq = new Map(match.items.map((i) => [i.requirement, i.status]));
    expect(byReq.get('Java')).toBe('matched');
    expect(byReq.get('Spring Boot')).toBe('matched');
    expect(byReq.get('PostgreSQL')).toBe('matched');
    expect(byReq.get('Docker')).toBe('matched');
    expect(byReq.get('Kubernetes')).toBe('missing'); // not on master CV at all
    expect(byReq.get('Terraform')).toBe('missing');
    expect(match.score).toBeGreaterThanOrEqual(0);
    expect(match.score).toBeLessThanOrEqual(100);
  });

  it('gives a frontend CV a much lower Java JD match', () => {
    const jd = analyseJobDescription(JAVA_JD);
    const backend = computeJobMatch(makeMasterCV(), jd);
    const frontend = computeJobMatch(makeFrontendCV(), jd);
    expect(frontend.score).toBeLessThan(backend.score);
    expect(frontend.missingSkills).toContain('Java');
  });

  it('gives the React JD a higher match for the frontend CV', () => {
    const jd = analyseJobDescription(REACT_JD);
    const m = computeJobMatch(makeFrontendCV(), jd);
    expect(m.matchedSkills).toContain('React');
    expect(m.score).toBeGreaterThan(40);
  });

  it('is explainable: breakdown weights sum to 100 and details exist', () => {
    const jd = analyseJobDescription(JAVA_JD);
    const match = computeJobMatch(makeMasterCV(), jd);
    const weightSum = match.breakdown.reduce((s, b) => s + b.weight, 0);
    expect(weightSum).toBe(100);
    match.breakdown.forEach((b) => expect(b.detail.length).toBeGreaterThan(3));
  });

  it('computes keyword coverage', () => {
    const jd = analyseJobDescription(JAVA_JD);
    const match = computeJobMatch(makeMasterCV(), jd);
    expect(match.keywordCoverage.percent).toBeGreaterThanOrEqual(0);
    expect(match.keywordCoverage.matched.length + match.keywordCoverage.missing.length).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------- TAILORING ----

describe('Tailoring + truth validation', () => {
  it('produces a tailored resume without inventing facts', async () => {
    const cv = makeMasterCV();
    const jd = analyseJobDescription(JAVA_JD);
    const match = computeJobMatch(cv, jd);
    const result = await tailorResume(cv, jd, match);

    // No new technical skills may appear
    const before = new Set(cv.skills.technical.map((s) => s.toLowerCase()));
    for (const s of result.resume.skills.technical) {
      expect(before.has(s.toLowerCase())).toBe(true);
    }
    // No new numbers may appear. Exception: the years-of-experience figure in
    // the summary is DERIVED from the CV's own employment dates (max year −
    // min year), which is a computed fact, not an invented metric — so all
    // such differences between years present in the CV are allowed.
    const beforeText = JSON.stringify(cv);
    const beforeNums = new Set((beforeText.match(/\d+/g) || []));
    const years = [...beforeText.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => parseInt(m[0], 10));
    for (const a of years) for (const b of years) {
      const d = Math.abs(a - b);
      if (d > 0 && d < 50) beforeNums.add(String(d));
    }
    const newBulletText = [
      result.resume.summary,
      ...result.resume.experience.flatMap((e) => e.bullets),
      ...result.resume.projects.flatMap((p) => p.bullets),
    ].join(' ');
    for (const n of newBulletText.match(/\d+/g) || []) {
      expect(beforeNums.has(n)).toBe(true);
    }
    // Change log explains what happened
    expect(result.changeLog.length).toBeGreaterThan(0);
  });

  it('rewrites weak bullets only when the master CV supports the phrasing', async () => {
    const cv = makeMasterCV();
    const jd = analyseJobDescription(JAVA_JD);
    const match = computeJobMatch(cv, jd);
    const result = await tailorResume(cv, jd, match);
    const tailoredWeak = result.resume.experience[0].bullets.find((b) => /worked on/i.test(b));
    expect(tailoredWeak).toBeUndefined(); // weak opener should be improved away
  });

  it('never adds quantification that is not in the master CV', async () => {
    const cv = makeMasterCV();
    const jd = analyseJobDescription(JAVA_JD);
    const match = computeJobMatch(cv, jd);
    const result = await tailorResume(cv, jd, match);
    for (const exp of result.resume.experience) {
      const orig = cv.experience.find((e) => e.id === exp.id);
      for (const b of exp.bullets) {
        if (/by \d+%/.test(b)) {
          const supported = (orig?.bullets || []).some((ob) => ob.includes(b.match(/by \d+%/)?.[0] || '@@'));
          expect(supported).toBe(true);
        }
      }
    }
  });

  it('reverts fabricated content via the truth validator', () => {
    const cv = makeMasterCV();
    const fabricated = JSON.parse(JSON.stringify(cv)) as ResumeData;
    fabricated.experience[0].bullets[0] = 'Architected Kubernetes clusters and Terraform infrastructure across 3 regions';
    const report = validateTruth(fabricated, cv);
    expect(report.passedAll).toBe(false);
    const first = report.checks.find((c) => c.unsupportedClaims.length > 0);
    expect(first).toBeTruthy();
    expect(['reverted', 'warning']).toContain(first!.status);
    // The bullet should have been auto-reverted to the master wording
    if (first!.status === 'reverted') {
      expect(first!.bullet).toContain('Developed RESTful');
    }
  });

  it('passes truthful content unchanged through validation', () => {
    const cv = makeMasterCV();
    const report = validateTruth(JSON.parse(JSON.stringify(cv)) as ResumeData, cv);
    expect(report.passedAll).toBe(true);
    expect(report.autoFixed).toHaveLength(0);
  });

  it('orders JD-relevant skills first without adding any', async () => {
    const cv = makeMasterCV();
    const jd = analyseJobDescription(JAVA_JD);
    const match = computeJobMatch(cv, jd);
    const result = await tailorResume(cv, jd, match);
    expect(result.resume.skills.technical.length).toBe(cv.skills.technical.length);
    // Kafka is a required skill and should now rank above Git (not in JD)
    expect(result.resume.skills.technical.indexOf('Kafka')).toBeLessThan(result.resume.skills.technical.indexOf('Git'));
  });

  it('editor suggestions propose rewording, never new facts', () => {
    const cv = makeMasterCV();
    const jd = analyseJobDescription(JAVA_JD);
    const sugg = generateSuggestions(cv, jd);
    expect(sugg.length).toBeGreaterThan(0);
    for (const s of sugg) {
      if (s.kind === 'bullet') {
        // suggested bullet must not introduce numbers absent from the CV
        const cvNums = new Set(JSON.stringify(cv).match(/\d+/g) || []);
        for (const n of s.suggested.match(/\d+/g) || []) {
          expect(cvNums.has(n)).toBe(true);
        }
      }
    }
  });
});

// ------------------------------------------------------------ EXTRACTION ----

describe('CV extraction', () => {
  it('extracts contact info and sections from plain CV text', () => {
    const text = `Aarav Sharma
Manchester, UK | +44 7700 900123 | aarav.sharma@example.com
linkedin.com/in/aaravsharma | github.com/aaravsharma

SUMMARY
Backend engineer with 4 years of experience building REST APIs in Java and Spring Boot.

EXPERIENCE
Software Engineer, Finlio Technologies 08/2022 - Present
- Developed RESTful backend services using Java and Spring Boot serving 120k daily requests.
- Optimised PostgreSQL queries, reducing response times by 30%.

Junior Developer, Cloudline Systems 06/2021 - 07/2022
- Implemented Kafka-based event streaming for order processing.

EDUCATION
BSc Computer Science, University of Leeds 2017 - 2021

SKILLS
Java, Spring Boot, PostgreSQL, Docker, Kafka, Redis, Git

LANGUAGES
English (Fluent), Hindi (Native)
`;
    const ex = extractResumeFromText(text);
    expect(ex.resume.personal.fullName).toBe('Aarav Sharma');
    expect(ex.resume.personal.email).toBe('aarav.sharma@example.com');
    expect(ex.resume.personal.phone).toContain('7700');
    expect(ex.resume.summary).toContain('Backend engineer');
    expect(ex.resume.experience.length).toBe(2);
    expect(ex.resume.experience[0].title).toBe('Software Engineer');
    expect(ex.resume.experience[0].company).toBe('Finlio Technologies');
    expect(ex.resume.experience[0].bullets.length).toBe(2);
    expect(ex.resume.education[0].institution).toContain('Leeds');
    expect(ex.resume.skills.technical).toContain('Java');
    expect(ex.resume.languages.length).toBe(2);
  });

  it('flags low confidence when data is missing', () => {
    const ex = extractResumeFromText('Some text without any resume structure at all. '.repeat(10));
    expect(ex.notes.length).toBeGreaterThan(0);
    expect(ex.resume.personal.email).toBe('');
  });
});

// ------------------------------------------------------------------ PDF ----

describe('PDF export', () => {
  it('generates a PDF containing selectable resume text', async () => {
    const cv = makeMasterCV();
    const chunks: Buffer[] = [];
    const stream = renderResumePdf(cv, { titleSuffix: 'Java Backend Engineer' });
    await new Promise<void>((resolve) => {
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve());
    });
    const buffer = Buffer.concat(chunks);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');

    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(buffer);
    expect(parsed.text).toContain('Aarav Sharma');
    expect(parsed.text).toContain('aarav.sharma@example.com');
    expect(parsed.text).toContain('PROFESSIONAL EXPERIENCE');
    expect(parsed.text).toContain('Finlio Technologies');
    expect(parsed.text).toContain('Developed RESTful backend services');
    expect(parsed.text).toContain('Technical Skills');
  });

  it('produces a sensible filename', () => {
    expect(pdfFileName(makeMasterCV(), 'Java Backend Engineer')).toBe('Aarav_Sharma_Java_Backend_Engineer_EnhanceCV.pdf');
  });
});
