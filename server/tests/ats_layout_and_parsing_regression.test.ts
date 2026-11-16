// Regression Suite: ATS-Grade Resume Parsing & Single-Page Layout Engine
//
// Asserts:
// 1. Full Contact Metadata extraction (Location, Email, Phone, LinkedIn, GitHub with no trailing slashes).
// 2. Project Title and Description splitting (e.g. "• Title: Description" or "• Title. Description").
// 3. Skill Categorization without flattening category labels into raw skills.
// 4. Pipe artifact cleaning (stripping stray "|" from dates, companies, locations, institutions).
// 5. PDF ATS layout: Single-column Helvetica, categorized skills rows, standard ATS section order,
//    section deduplication (no duplicate SKILLS/LANGUAGES), zero stray pipes, and smart single-page fit (numPages === 1).

import { describe, it, expect } from 'vitest';
import pdfParse from 'pdf-parse';
import { extractResumeFromText } from '../src/engine/extract';
import { renderResumePdf, ATS_STANDARD_ORDER } from '../src/engine/pdf';
import type { ResumeData } from '../src/types';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

const STRUCTURED_MULTI_CATEGORY_RESUME_TEXT = `
Alex Morgan
Austin, TX | alex.morgan@cloudtech.io | +1 (512) 555-0199 | https://linkedin.com/in/alexmorgan/ | https://github.com/alexmorgan/

PROFESSIONAL SUMMARY
Senior backend and cloud engineer with 5+ years of experience architecting distributed microservices, event-driven pipelines, and high-availability cloud platforms.

EDUCATION
Bachelor of Science | Computer Science | 08/2016 | | 05/2020
University of Texas at Austin | | Austin, TX | GPA: 3.85 / 4.0

TECHNICAL SKILLS
Languages | Java 21, Python 3.12, TypeScript, Go, SQL
Frameworks: Spring Boot 3, FastAPI, Node.js, React, Next.js
Cloud & DevOps | AWS, Docker, Kubernetes, Terraform, GitHub Actions
Databases: PostgreSQL, Redis, MongoDB, DynamoDB

PROFESSIONAL EXPERIENCE
Senior Software Engineer | CloudScale Systems | Austin, TX | | 06/2022 - Present
• Architected event-driven microservices processing 120k events/sec using Kafka and Spring Boot 3.
• Optimized PostgreSQL query execution plans and caching strategies, reducing p99 latency by 42%.
• Mentored 6 software engineers in test-driven development and domain-driven architectural patterns.

Software Engineer | Finlio Technologies | | 07/2020 - 05/2022
• Developed REST and gRPC services supporting 2M active mobile banking users with 99.99% uptime.
• Automated CI/CD deployment pipelines using Docker, Kubernetes, and Terraform on AWS EKS.

PROJECTS
• SmartRoute AI: Intelligent logistics routing engine optimizing delivery paths and cutting fuel costs by 18%.
• CloudMesh. Distributed service mesh sidecar proxy handling telemetry, mutual TLS, and traffic shaping.
• Implemented distributed tracing with OpenTelemetry and Jaeger collecting 50M spans daily.

CERTIFICATIONS
• AWS Certified Solutions Architect — Associate | AWS | 2023
• Certified Kubernetes Administrator (CKA) | Linux Foundation | 2022
`;

describe('ATS-Grade Resume Parsing & Single-Page Layout Regression Suite', () => {
  it('extracts full contact metadata including location, email, phone, and clean profile URLs', () => {
    const { resume } = extractResumeFromText(STRUCTURED_MULTI_CATEGORY_RESUME_TEXT);

    expect(resume.personal.fullName).toBe('Alex Morgan');
    expect(resume.personal.location).toBe('Austin, TX');
    expect(resume.personal.email).toBe('alex.morgan@cloudtech.io');
    expect(resume.personal.phone).toContain('512');
    expect(resume.personal.linkedin).toBe('linkedin.com/in/alexmorgan');
    expect(resume.personal.github).toBe('github.com/alexmorgan');
  });

  it('preserves skill categories as distinct groups without dumping category headers into raw tokens', () => {
    const { resume } = extractResumeFromText(STRUCTURED_MULTI_CATEGORY_RESUME_TEXT);

    expect(resume.skills.categories).toBeDefined();
    expect(resume.skills.categories!.length).toBeGreaterThanOrEqual(4);

    const categories = resume.skills.categories!.map((c) => c.category);
    expect(categories).toContain('Languages');
    expect(categories).toContain('Frameworks');
    expect(categories).toContain('Cloud & DevOps');
    expect(categories).toContain('Databases');

    // Verify category names were not dumped as raw skills in technical list
    const technicalLower = resume.skills.technical.map((t) => t.toLowerCase());
    expect(technicalLower).not.toContain('frameworks');
    expect(technicalLower).not.toContain('cloud & devops');
    expect(technicalLower).not.toContain('databases');

    // Verify skills are present
    expect(technicalLower).toContain('java 21');
    expect(technicalLower).toContain('spring boot 3');
    expect(technicalLower).toContain('docker');
    expect(technicalLower).toContain('postgresql');
  });

  it('splits project titles and descriptions cleanly without dropping titles', () => {
    const { resume } = extractResumeFromText(STRUCTURED_MULTI_CATEGORY_RESUME_TEXT);

    expect(resume.projects.length).toBeGreaterThanOrEqual(2);

    const projectNames = resume.projects.map((p) => p.name);
    expect(projectNames).toContain('SmartRoute AI');
    expect(projectNames).toContain('CloudMesh');

    const smartRoute = resume.projects.find((p) => p.name === 'SmartRoute AI');
    expect(smartRoute?.description).toContain('Intelligent logistics routing engine');

    const cloudMesh = resume.projects.find((p) => p.name === 'CloudMesh');
    expect(cloudMesh?.description).toContain('Distributed service mesh sidecar proxy');
    expect(cloudMesh?.bullets.length).toBeGreaterThanOrEqual(1);
    expect(cloudMesh?.bullets[0]).toContain('OpenTelemetry');
  });

  it('cleans stray pipe artifacts from experience and education fields during extraction', () => {
    const { resume } = extractResumeFromText(STRUCTURED_MULTI_CATEGORY_RESUME_TEXT);

    for (const exp of resume.experience) {
      expect(exp.title).not.toContain('|');
      expect(exp.company).not.toContain('|');
      expect(exp.location).not.toContain('|');
      expect(exp.dateDisplay).not.toContain('|');
      for (const bullet of exp.bullets) {
        expect(bullet).not.toMatch(/(?:^|\s)\|+(?:\s*\|*)*(?=$|\s)/);
      }
    }

    for (const edu of resume.education) {
      expect(edu.degree).not.toContain('|');
      expect(edu.field).not.toContain('|');
      expect(edu.institution).not.toContain('|');
      expect(edu.dateDisplay).not.toContain('|');
    }
  });

  it('renders a standard 1-page candidate profile onto exactly 1 page (numPages === 1)', async () => {
    const { resume } = extractResumeFromText(STRUCTURED_MULTI_CATEGORY_RESUME_TEXT);

    const stream = renderResumePdf(resume, { pageSize: 'A4' });
    const buffer = await streamToBuffer(stream);
    const parsed = await pdfParse(buffer);

    // Asserts Smart Single-Page Fit collapses standard 1-page profile to exactly 1 page
    expect(parsed.numpages).toBe(1);
    expect(parsed.text).toContain('Alex Morgan');
    expect(parsed.text).toContain('CloudScale Systems');
  });

  it('renders categorized skill rows distinctly and guarantees zero duplicate SKILLS or LANGUAGES sections', async () => {
    const { resume } = extractResumeFromText(STRUCTURED_MULTI_CATEGORY_RESUME_TEXT);

    const stream = renderResumePdf(resume, { pageSize: 'A4' });
    const buffer = await streamToBuffer(stream);
    const parsed = await pdfParse(buffer);

    // Verify distinct categorized skill rows in rendered PDF text
    expect(parsed.text).toMatch(/Languages:\s*Java 21/i);
    expect(parsed.text).toMatch(/Frameworks:\s*Spring Boot 3/i);
    expect(parsed.text).toMatch(/Cloud & DevOps:\s*AWS/i);
    expect(parsed.text).toMatch(/Databases:\s*PostgreSQL/i);

    // Verify SKILLS is not rendered twice
    const skillsHeadingMatches = parsed.text.match(/\b(?:TECHNICAL SKILLS|SKILLS)\b/gi) || [];
    expect(skillsHeadingMatches.length).toBe(1);

    // Verify no stray | artifacts in rendered text (deliberate contact delimiters '  |  ' are allowed, but no ' | | ' or ' | 202')
    expect(parsed.text).not.toContain(' | | ');
    expect(parsed.text).not.toMatch(/\s\|\s+\|\s/);
    expect(parsed.text).not.toMatch(/\|\s*202\d/);
  });

  it('renders sections in standard ATS order (Summary -> Education -> Skills -> Experience -> Projects -> Certifications)', async () => {
    const { resume } = extractResumeFromText(STRUCTURED_MULTI_CATEGORY_RESUME_TEXT);

    const stream = renderResumePdf(resume, { pageSize: 'A4' });
    const buffer = await streamToBuffer(stream);
    const parsed = await pdfParse(buffer);

    const summaryIdx = parsed.text.indexOf('PROFESSIONAL SUMMARY');
    const educationIdx = parsed.text.indexOf('EDUCATION');
    const skillsIdx = parsed.text.indexOf('TECHNICAL SKILLS');
    const experienceIdx = parsed.text.indexOf('PROFESSIONAL EXPERIENCE');
    const projectsIdx = parsed.text.indexOf('PROJECTS');
    const certsIdx = parsed.text.indexOf('CERTIFICATIONS');

    expect(summaryIdx).toBeGreaterThan(-1);
    expect(educationIdx).toBeGreaterThan(summaryIdx);
    expect(skillsIdx).toBeGreaterThan(educationIdx);
    expect(experienceIdx).toBeGreaterThan(skillsIdx);
    expect(projectsIdx).toBeGreaterThan(experienceIdx);
    expect(certsIdx).toBeGreaterThan(projectsIdx);
  });

  it('omits role headline from contact line and keeps Name on line 1 with contact on line 2', async () => {
    const { resume } = extractResumeFromText(STRUCTURED_MULTI_CATEGORY_RESUME_TEXT);
    resume.personal.headline = 'Data Science Virtual Intern';

    const stream = renderResumePdf(resume, { pageSize: 'A4' });
    const buffer = await streamToBuffer(stream);
    const parsed = await pdfParse(buffer);

    // Headline / current role must NOT appear in the contact line
    expect(parsed.text).not.toContain('Data Science Virtual Intern');
    // Name appears first
    expect(parsed.text.indexOf('Alex Morgan')).toBeLessThan(parsed.text.indexOf('Austin, TX'));
    // Contact information contains coordinates without headline
    expect(parsed.text).toContain('Austin, TX');
    expect(parsed.text).toContain('+1 (512) 555-0199');
    expect(parsed.text).toContain('alex.morgan@cloudtech.io');
    expect(parsed.text).toContain('linkedin.com/in/alexmorgan');
    expect(parsed.text).toContain('alexmorgan');
  });

  it('joins multi-line project descriptions into continuous strings without dropping wrapped lines', () => {
    const projectText = `
Alex Morgan
Austin, TX | alex@example.com

PROJECTS
• Distributed File Processing System. 4-service Java/Spring Boot microservices architecture
processing 50GB logs daily using Apache Kafka, MinIO S3 object storage, and PostgreSQL.
• Implemented distributed tracing with OpenTelemetry and Jaeger collecting 50M spans daily.
`;
    const { resume } = extractResumeFromText(projectText);
    expect(resume.projects.length).toBe(1);
    const proj = resume.projects[0];
    expect(proj.name).toBe('Distributed File Processing System');
    // Ensure wrapped line "processing 50GB logs daily..." was joined into the description!
    expect(proj.description).toContain('4-service Java/Spring Boot microservices architecture');
    expect(proj.description).toContain('processing 50GB logs daily using Apache Kafka');
    expect(proj.bullets.length).toBe(1);
    expect(proj.bullets[0]).toContain('OpenTelemetry');
  });

  it('strictly restricts LANGUAGES to human spoken languages and filters out technical tokens', () => {
    const mixedLanguagesText = `
Alex Morgan
Austin, TX | alex@example.com

LANGUAGES
English (Native), Telugu (Fluent), Hindi, Shell, YAML, Frameworks, JPA, Ingress, DLQ, Micrometer, Practices, Scrum
`;
    const { resume } = extractResumeFromText(mixedLanguagesText);
    const langNames = resume.languages.map((l) => l.name.toLowerCase());

    // Spoken human languages must be kept
    expect(langNames).toContain('english');
    expect(langNames).toContain('telugu');
    expect(langNames).toContain('hindi');

    // Technical tokens must be strictly rejected
    expect(langNames).not.toContain('shell');
    expect(langNames).not.toContain('yaml');
    expect(langNames).not.toContain('frameworks');
    expect(langNames).not.toContain('jpa');
    expect(langNames).not.toContain('ingress');
    expect(langNames).not.toContain('dlq');
    expect(langNames).not.toContain('micrometer');
    expect(langNames).not.toContain('practices');
    expect(langNames).not.toContain('scrum');
  });

  it('renders education without stray pipes or leading | 2025', async () => {
    const { resume } = extractResumeFromText(STRUCTURED_MULTI_CATEGORY_RESUME_TEXT);
    resume.education = [
      {
        id: 'edu_1',
        degree: 'Bachelor of Technology',
        field: 'Computer Science',
        institution: 'Vardhaman College of Engineering | | ',
        startDate: '',
        endDate: '2025',
        grade: 'GPA: 3.8 / 4.0',
        dateDisplay: ' | 2025',
      },
    ];

    const stream = renderResumePdf(resume, { pageSize: 'A4' });
    const buffer = await streamToBuffer(stream);
    const parsed = await pdfParse(buffer);

    expect(parsed.text).not.toContain(' |  | ');
    expect(parsed.text).not.toContain(' | | ');
    expect(parsed.text).not.toMatch(/\|\s*2025/);
    expect(parsed.text).toContain('Bachelor of Technology, Computer Science');
    expect(parsed.text).toContain('Vardhaman College of Engineering  |  GPA: 3.8 / 4.0');
  });
});
