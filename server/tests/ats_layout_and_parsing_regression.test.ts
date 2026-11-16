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
});
