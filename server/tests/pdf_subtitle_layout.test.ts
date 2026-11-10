// Regression Suite: PDF Subtitle Positioning & Margin Integrity
//
// Asserts:
// 1. Subsequent subtitles (experience company/location, project tech, education institution) start at the correct left margin.
// 2. Long subtitle text wraps cleanly and does not exceed the right content boundary.
// 3. Two-column rows render correctly with left title at margin and right date/link ending at right margin.

import { describe, it, expect } from 'vitest';
import pdfParse from 'pdf-parse';
import { pathToFileURL } from 'url';
import { renderResumePdf, PageSize } from '../src/engine/pdf';
import type { ResumeData } from '../src/types';

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

const TEST_RESUME_LONG_SUBTITLES: ResumeData = {
  personal: {
    fullName: 'Alexander Hamilton',
    email: 'alexander.hamilton@treasury.gov',
    phone: '+1 212 555 1789',
    location: 'New York, NY',
    linkedin: 'linkedin.com/in/alexanderhamilton',
    github: 'github.com/alexanderhamilton',
    headline: 'Founding Financial Systems Architect & Chief Economist',
  },
  summary: 'Architect of national financial infrastructure, high-throughput credit ledgers, and centralized banking systems.',
  experience: [
    {
      id: 'exp-1',
      title: 'First Secretary of the Treasury & Distributed Financial Architect',
      company: 'United States Department of the Treasury & Central Financial Directorate',
      location: 'Philadelphia, PA & New York, NY, United States of America',
      startDate: '09/1789',
      endDate: '01/1795',
      current: false,
      bullets: [
        'Established the First Bank of the United States and standardized national debt assumption pipelines.',
        'Architected national revenue tariff collection system processing customs duties with 100% accounting fidelity.',
      ],
    },
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'Bank of New York Financial Ledger System',
      link: 'bony.financial/ledger-system',
      tech: ['Double-Entry Ledger Architecture', 'Multi-Currency Clearing', 'High-Frequency Bond Auction Settlement'],
      description: 'Foundational private financial institution processing commercial notes and currency exchange.',
      bullets: [
        'Structured credit emission protocols serving merchants and international traders across transatlantic trade routes.',
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      degree: 'Master of Arts in Political Economy and Jurisprudence',
      field: 'Institutional Economics, International Finance & Commercial Law',
      institution: 'Columbia University in the City of New York (formerly King\'s College) & Faculty of Law',
      startDate: '1774',
      endDate: '1776',
      grade: 'Summa Cum Laude with Distinguished Honors in Fiscal Jurisprudence',
    },
  ],
  skills: {
    technical: ['Monetary Policy', 'Debt Securitization', 'Tariff Schedules', 'Central Banking', 'Legal Drafting'],
    soft: ['Strategic Vision', 'Constitutional Negotiation', 'Persuasive Rhetoric'],
  },
  certifications: [],
  languages: [],
  achievements: [],
  customSections: [],
  sectionOrder: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'languages', 'achievements'],
  hiddenSections: [],
};

describe('PDF Subtitle Positioning & Margin Integrity Regression Suite', () => {
  it('renders a valid PDF with correct %PDF- header and non-empty buffer', async () => {
    const stream = renderResumePdf(TEST_RESUME_LONG_SUBTITLES, { pageSize: 'A4', marginDensity: 'normal' });
    const buf = await streamToBuffer(stream);

    expect(buf.length).toBeGreaterThan(1500);
    expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');

    const parsed = await pdfParse(buf);
    expect(parsed.numpages).toBeGreaterThanOrEqual(1);
    expect(parsed.text).toContain('Alexander Hamilton');
    expect(parsed.text).toContain('United States Department of the Treasury');
    expect(parsed.text).toContain('Columbia University');
  });

  it('guarantees subtitles start at left margin and do not overflow right boundary', async () => {
    const margin = 54; // normal margin density
    const pageWidth = 595.28; // A4 width
    const contentWidth = pageWidth - margin * 2; // 487.28
    const rightBoundary = margin + contentWidth; // 541.28

    const stream = renderResumePdf(TEST_RESUME_LONG_SUBTITLES, { pageSize: 'A4', marginDensity: 'normal' });
    const buf = await streamToBuffer(stream);

    const pdfjsUrl = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;
    const pdfjs = await import(pdfjsUrl);

    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();

    // Find the company/location subtitle item
    const companyItems = textContent.items.filter((item: any) =>
      item.str.includes('Department of the Treasury')
    );
    expect(companyItems.length).toBeGreaterThan(0);
    const companyItem = companyItems[0];

    // Verify company subtitle starts at left margin (54.0pt), NOT column 2 (404.8pt)
    expect(companyItem.transform[4]).toBeCloseTo(margin, 0.5);

    // Find education institution/grade subtitle item
    const eduItems = textContent.items.filter((item: any) =>
      item.str.includes('Columbia University')
    );
    expect(eduItems.length).toBeGreaterThan(0);
    const eduItem = eduItems[0];

    // Verify education subtitle starts at left margin (54.0pt), NOT column 2 (404.8pt)
    expect(eduItem.transform[4]).toBeCloseTo(margin, 0.5);

    // Verify no text item on the page exceeds the right boundary (541.28pt + 1pt tolerance)
    let maxRight = 0;
    for (const item of textContent.items) {
      const x = item.transform[4];
      const right = x + item.width;
      if (right > maxRight) maxRight = right;
    }

    // Right margin must be positive and within boundary
    expect(maxRight).toBeLessThanOrEqual(rightBoundary + 1.0);
  });

  it('preserves correct two-column row alignment for titles and dates', async () => {
    const margin = 54;
    const pageWidth = 595.28;
    const contentWidth = pageWidth - margin * 2;
    const col2Start = margin + contentWidth * 0.72; // 404.84

    const stream = renderResumePdf(TEST_RESUME_LONG_SUBTITLES, { pageSize: 'A4', marginDensity: 'normal' });
    const buf = await streamToBuffer(stream);

    const pdfjsUrl = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;
    const pdfjs = await import(pdfjsUrl);

    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();

    // Verify left column title starts at margin
    const titleItem = textContent.items.find((item: any) =>
      item.str.includes('First Secretary of the Treasury')
    );
    expect(titleItem).toBeDefined();
    expect(titleItem.transform[4]).toBeCloseTo(margin, 0.5);

    // Verify right column date is positioned in second column zone
    const dateItem = textContent.items.find((item: any) =>
      item.str.includes('09/1789') || item.str.includes('01/1795')
    );
    expect(dateItem).toBeDefined();
    expect(dateItem.transform[4]).toBeGreaterThanOrEqual(col2Start - 1.0);
    expect(dateItem.transform[4] + dateItem.width).toBeLessThanOrEqual(margin + contentWidth + 1.0);
  });
});
