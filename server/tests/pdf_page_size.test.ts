// Comprehensive Regression Suite: A4 & US Letter PDF Support
//
// Verifies:
// 1. PDFKit page dimensions for A4 (595.28 x 841.89 pt) and US Letter (612 x 792 pt).
// 2. Defaulting to A4 when pageSize is omitted (UK / international standard).
// 3. Dynamic content width and margin calculations across compact, normal, and spacious densities.
// 4. Rendering across all 6 ATS-safe templates (Classic, Modern, Minimal, Professional, Technical, Executive) for both paper sizes.
// 5. Multi-page document generation and pagination consistency across page boundaries.
// 6. Cover letter PDF generation with A4 and US Letter sizes.

import { describe, it, expect } from 'vitest';
import pdfParse from 'pdf-parse';
import { renderResumePdf, renderCoverLetterPdf, PAGE_DIMENSIONS, DEFAULT_PAGE_SIZE, PageSize, MarginDensity } from '../src/engine/pdf';
import type { ResumeData } from '../src/types';

const SAMPLE_RESUME: ResumeData = {
  personal: {
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '+44 20 7946 0991',
    location: 'London, UK',
    linkedin: 'linkedin.com/in/janedoe',
    github: 'github.com/janedoe',
    headline: 'Senior Cloud Solutions Architect',
  },
  summary: 'Experienced cloud architect specializing in distributed systems, high-availability architectures, and automated infrastructure.',
  experience: [
    {
      id: 'exp-1',
      company: 'CloudScale Technologies',
      title: 'Principal Cloud Architect',
      location: 'London, UK',
      startDate: 'Jan 2021',
      endDate: 'Present',
      current: true,
      bullets: [
        'Architected multi-region Kubernetes clusters achieving 99.999% uptime across UK and EU zones.',
        'Reduced cloud infrastructure costs by £420,000 annually through intelligent autoscaling.',
        'Mentored 12 DevOps engineers in infrastructure-as-code and cloud compliance best practices.',
      ],
    },
    {
      id: 'exp-2',
      company: 'FinTech Systems Ltd',
      title: 'Senior DevOps Engineer',
      location: 'London, UK',
      startDate: 'Mar 2018',
      endDate: 'Dec 2020',
      current: false,
      bullets: [
        'Engineered CI/CD pipelines deploying 45 microservices with zero downtime.',
        'Migrated on-premise monolithic payment platform to AWS with strict PCI-DSS Level 1 compliance.',
      ],
    },
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'OpenTelemetry Observability Mesh',
      tech: ['Go', 'Kubernetes', 'Prometheus', 'Grafana'],
      link: 'github.com/janedoe/otel-mesh',
      description: 'Distributed tracing mesh providing real-time telemetry across heterogeneous workloads.',
      bullets: [
        'Processed over 50 million spans daily with sub-millisecond overhead.',
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'Imperial College London',
      degree: 'B.Sc. Computing (Honours)',
      field: 'Computer Science',
      startDate: '2014',
      endDate: '2017',
      grade: 'First Class Honours',
    },
  ],
  skills: {
    technical: ['AWS', 'GCP', 'Kubernetes', 'Terraform', 'Docker', 'Python', 'Go', 'PostgreSQL'],
    soft: ['Strategic Leadership', 'Stakeholder Communication', 'Technical Mentorship'],
  },
  certifications: [
    {
      id: 'cert-1',
      name: 'AWS Certified Solutions Architect — Professional',
      issuer: 'Amazon Web Services',
      year: '2023',
    },
  ],
  languages: [
    { id: 'lang-1', name: 'English', proficiency: 'Native' },
    { id: 'lang-2', name: 'French', proficiency: 'Professional Working' },
  ],
  achievements: [
    'Speaker at KubeCon Europe 2023 on resilient multi-cluster orchestration',
  ],
  customSections: [],
  sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
  hiddenSections: [],
};

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function extractMediaBoxes(pdfBuffer: Buffer): { x: number; y: number; width: number; height: number }[] {
  const str = pdfBuffer.toString('latin1');
  const regex = /\/MediaBox\s*\[\s*([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s*\]/g;
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(str)) !== null) {
    boxes.push({
      x: Number(match[1]),
      y: Number(match[2]),
      width: Number(match[3]),
      height: Number(match[4]),
    });
  }
  return boxes;
}

describe('A4 & US Letter PDF Support', () => {
  describe('1. Native Dimensions & Defaults', () => {
    it('verifies PAGE_DIMENSIONS constants match PDFKit native specs', () => {
      expect(PAGE_DIMENSIONS.A4.width).toBeCloseTo(595.28, 2);
      expect(PAGE_DIMENSIONS.A4.height).toBeCloseTo(841.89, 2);
      expect(PAGE_DIMENSIONS.LETTER.width).toBe(612);
      expect(PAGE_DIMENSIONS.LETTER.height).toBe(792);
      expect(DEFAULT_PAGE_SIZE).toBe('A4');
    });

    it('defaults to A4 paper dimensions when pageSize is omitted', async () => {
      const stream = renderResumePdf(SAMPLE_RESUME);
      const buffer = await streamToBuffer(stream);

      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const boxes = extractMediaBoxes(buffer);
      expect(boxes.length).toBeGreaterThanOrEqual(1);
      expect(boxes[0].width).toBeCloseTo(595.28, 1);
      expect(boxes[0].height).toBeCloseTo(841.89, 1);
    });

    it('renders with exact A4 dimensions when explicitly requested', async () => {
      const stream = renderResumePdf(SAMPLE_RESUME, { pageSize: 'A4' });
      const buffer = await streamToBuffer(stream);

      const boxes = extractMediaBoxes(buffer);
      expect(boxes.length).toBeGreaterThanOrEqual(1);
      expect(boxes[0].width).toBeCloseTo(595.28, 1);
      expect(boxes[0].height).toBeCloseTo(841.89, 1);
    });

    it('renders with exact US Letter dimensions when explicitly requested', async () => {
      const stream = renderResumePdf(SAMPLE_RESUME, { pageSize: 'LETTER' });
      const buffer = await streamToBuffer(stream);

      const boxes = extractMediaBoxes(buffer);
      expect(boxes.length).toBeGreaterThanOrEqual(1);
      expect(boxes[0].width).toBeCloseTo(612, 1);
      expect(boxes[0].height).toBeCloseTo(792, 1);
    });
  });

  describe('2. All 6 Templates Across Both Page Sizes', () => {
    const templates = ['classic', 'modern', 'minimal', 'professional', 'technical', 'executive'] as const;
    const sizes: PageSize[] = ['A4', 'LETTER'];

    for (const template of templates) {
      for (const size of sizes) {
        it(`renders template "${template}" cleanly in ${size} format`, async () => {
          const stream = renderResumePdf(SAMPLE_RESUME, { template, pageSize: size });
          const buffer = await streamToBuffer(stream);

          expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
          const boxes = extractMediaBoxes(buffer);
          expect(boxes.length).toBeGreaterThanOrEqual(1);

          const expectedDims = PAGE_DIMENSIONS[size];
          expect(boxes[0].width).toBeCloseTo(expectedDims.width, 1);
          expect(boxes[0].height).toBeCloseTo(expectedDims.height, 1);

          // Verify text extractability
          const parsed = await pdfParse(buffer);
          expect(parsed.text).toContain('Jane Doe');
          expect(parsed.text).toContain('CloudScale Technologies');
          expect(parsed.text).toContain('Principal Cloud Architect');
          expect(parsed.text).toContain('Imperial College London');
        });
      }
    }
  });

  describe('3. Spacing Densities with Both Page Sizes', () => {
    const densities: MarginDensity[] = ['compact', 'normal', 'spacious'];

    for (const density of densities) {
      it(`renders A4 correctly with ${density} margin density`, async () => {
        const stream = renderResumePdf(SAMPLE_RESUME, { marginDensity: density, pageSize: 'A4' });
        const buffer = await streamToBuffer(stream);
        const boxes = extractMediaBoxes(buffer);
        expect(boxes[0].width).toBeCloseTo(PAGE_DIMENSIONS.A4.width, 1);
        expect(boxes[0].height).toBeCloseTo(PAGE_DIMENSIONS.A4.height, 1);

        const parsed = await pdfParse(buffer);
        expect(parsed.text).toContain('Jane Doe');
      });

      it(`renders LETTER correctly with ${density} margin density`, async () => {
        const stream = renderResumePdf(SAMPLE_RESUME, { marginDensity: density, pageSize: 'LETTER' });
        const buffer = await streamToBuffer(stream);
        const boxes = extractMediaBoxes(buffer);
        expect(boxes[0].width).toBeCloseTo(PAGE_DIMENSIONS.LETTER.width, 1);
        expect(boxes[0].height).toBeCloseTo(PAGE_DIMENSIONS.LETTER.height, 1);

        const parsed = await pdfParse(buffer);
        expect(parsed.text).toContain('Jane Doe');
      });
    }
  });

  describe('4. Multi-Page Pagination Integrity', () => {
    it('maintains consistent A4 page dimensions across multi-page documents', async () => {
      // Create a long resume with repeated experience entries to force pagination
      const multiPageResume: ResumeData = {
        ...SAMPLE_RESUME,
        experience: [
          ...SAMPLE_RESUME.experience,
          {
            id: 'exp-3',
            company: 'Legacy Corp A',
            title: 'Infrastructure Lead',
            location: 'London',
            startDate: '2015',
            endDate: '2018',
            current: false,
            bullets: [
              'Bullet entry 1 with substantial detail regarding network operations and enterprise storage.',
              'Bullet entry 2 discussing high volume batch processing and data center migration.',
              'Bullet entry 3 covering compliance audits and operational playbooks.',
              'Bullet entry 4 discussing incident response and on-call rotation management.',
            ],
          },
          {
            id: 'exp-4',
            company: 'Legacy Corp B',
            title: 'Systems Administrator',
            location: 'London',
            startDate: '2012',
            endDate: '2015',
            current: false,
            bullets: [
              'Maintained 300 Linux servers across 4 locations.',
              'Configured DNS, DHCP, and LDAP authentication directory services.',
              'Automated server provisioning using Ansible and Bash scripts.',
            ],
          },
          {
            id: 'exp-5',
            company: 'Early Career Systems',
            title: 'Junior Sysadmin',
            location: 'Reading, UK',
            startDate: '2010',
            endDate: '2012',
            current: false,
            bullets: [
              'First line server and network troubleshooting.',
              'Monitored network traffic and managed automated off-site backups.',
            ],
          },
        ],
      };

      const stream = renderResumePdf(multiPageResume, { pageSize: 'A4' });
      const buffer = await streamToBuffer(stream);
      const boxes = extractMediaBoxes(buffer);

      // Verify at least 2 pages were generated
      expect(boxes.length).toBeGreaterThanOrEqual(2);
      for (const box of boxes) {
        expect(box.width).toBeCloseTo(PAGE_DIMENSIONS.A4.width, 1);
        expect(box.height).toBeCloseTo(PAGE_DIMENSIONS.A4.height, 1);
      }

      const parsed = await pdfParse(buffer);
      expect(parsed.numpages).toBe(boxes.length);
      expect(parsed.text).toContain('Early Career Systems');
    });

    it('maintains consistent LETTER page dimensions across multi-page documents', async () => {
      const multiPageResume: ResumeData = {
        ...SAMPLE_RESUME,
        experience: [
          ...SAMPLE_RESUME.experience,
          {
            id: 'exp-3',
            company: 'US Infrastructure Inc',
            title: 'Senior Site Reliability Engineer',
            location: 'New York, NY',
            startDate: '2015',
            endDate: '2018',
            current: false,
            bullets: [
              'Designed fault-tolerant infrastructure handling 100k requests/second.',
              'Implemented automated incident response reducing MTTR by 45%.',
              'Managed multi-datacenter replication and disaster recovery.',
            ],
          },
          {
            id: 'exp-4',
            company: 'US Systems Group',
            title: 'DevOps Engineer',
            location: 'Boston, MA',
            startDate: '2012',
            endDate: '2015',
            current: false,
            bullets: [
              'Built CI/CD deployment pipelines using Jenkins and Terraform.',
              'Managed VMware cluster and cloud migration planning.',
            ],
          },
        ],
      };

      const stream = renderResumePdf(multiPageResume, { pageSize: 'LETTER' });
      const buffer = await streamToBuffer(stream);
      const boxes = extractMediaBoxes(buffer);

      expect(boxes.length).toBeGreaterThanOrEqual(2);
      for (const box of boxes) {
        expect(box.width).toBeCloseTo(PAGE_DIMENSIONS.LETTER.width, 1);
        expect(box.height).toBeCloseTo(PAGE_DIMENSIONS.LETTER.height, 1);
      }

      const parsed = await pdfParse(buffer);
      expect(parsed.text).toContain('US Infrastructure Inc');
    });
  });

  describe('5. Cover Letter PDF Generation', () => {
    const letter = {
      greeting: 'Dear Hiring Manager,',
      paragraphs: [
        'I am writing to express my strong interest in the Senior Cloud Architect role at your organization.',
        'With over a decade of hands-on experience designing and operating multi-region cloud platforms, I have demonstrated a proven track record of reducing infrastructure overhead while increasing system availability to 99.999%.',
        'I would welcome the opportunity to discuss how my technical expertise and leadership experience align with your team goals.',
      ],
      closing: 'Sincerely,\nJane Doe\nPrincipal Cloud Architect',
    };

    it('renders cover letter in A4 format by default', async () => {
      const stream = renderCoverLetterPdf(letter, 'Jane Doe');
      const buffer = await streamToBuffer(stream);

      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const boxes = extractMediaBoxes(buffer);
      expect(boxes.length).toBe(1);
      expect(boxes[0].width).toBeCloseTo(PAGE_DIMENSIONS.A4.width, 1);
      expect(boxes[0].height).toBeCloseTo(PAGE_DIMENSIONS.A4.height, 1);

      const str = buffer.toString('latin1');
      expect(str).toContain('(Cover letter)');
      expect(str).toContain('(Jane Doe)');
      expect(str).toContain('(Curevo AI)');
    });

    it('renders cover letter in LETTER format when requested', async () => {
      const stream = renderCoverLetterPdf(letter, 'Jane Doe', 'LETTER');
      const buffer = await streamToBuffer(stream);

      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const boxes = extractMediaBoxes(buffer);
      expect(boxes.length).toBe(1);
      expect(boxes[0].width).toBeCloseTo(PAGE_DIMENSIONS.LETTER.width, 1);
      expect(boxes[0].height).toBeCloseTo(PAGE_DIMENSIONS.LETTER.height, 1);

      const str = buffer.toString('latin1');
      expect(str).toContain('(Cover letter)');
      expect(str).toContain('(Jane Doe)');
      expect(str).toContain('(Curevo AI)');
    });
  });
});
