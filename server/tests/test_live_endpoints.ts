import { makeMasterCV, JAVA_JD } from './fixtures';
import { renderResumePdf } from '../src/engine/pdf';

async function testAllLiveEndpoints() {
  const master = makeMasterCV();
  console.log('=== TESTING LIVE PRODUCTION BACKEND (https://curevo-ai.onrender.com) ===\n');

  // 1. GET /api/health
  console.log('[1/6] GET /api/health');
  const tHealth = Date.now();
  const resHealth = await fetch('https://curevo-ai.onrender.com/api/health');
  const dataHealth = await resHealth.json();
  console.log(`  Status: ${resHealth.status} (${Date.now() - tHealth}ms)`);
  console.log('  Response:', JSON.stringify(dataHealth));

  // 2. GET /api/public/status
  console.log('\n[2/6] GET /api/public/status');
  const tStatus = Date.now();
  const resStatus = await fetch('https://curevo-ai.onrender.com/api/public/status');
  const dataStatus = await resStatus.json();
  console.log(`  Status: ${resStatus.status} (${Date.now() - tStatus}ms)`);
  console.log('  Response:', JSON.stringify(dataStatus));

  // 3. POST /api/public/ats
  console.log('\n[3/6] POST /api/public/ats');
  const tAts = Date.now();
  const resAts = await fetch('https://curevo-ai.onrender.com/api/public/ats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume: master }),
  });
  const dataAts = (await resAts.json()) as any;
  console.log(`  Status: ${resAts.status} (${Date.now() - tAts}ms)`);
  console.log(`  Overall Score: ${dataAts.audit?.overallScore ?? dataAts.overallScore}/100`);
  const dims = dataAts.audit?.dimensions ? Object.keys(dataAts.audit.dimensions) : [];
  console.log(`  Dimensions count: ${dims.length} (${dims.join(', ')})`);
  if (dataAts.audit?.dimensions) {
    for (const [key, dim] of Object.entries(dataAts.audit.dimensions) as any) {
      console.log(`    - ${dim.name} (${key}): ${dim.score}/100 (weight: ${dim.weight}%)`);
    }
  }

  // 4. POST /api/public/pdf
  console.log('\n[4/6] POST /api/public/pdf');
  const tPdf = Date.now();
  const resPdf = await fetch('https://curevo-ai.onrender.com/api/public/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume: master, template: 'classic', marginDensity: 'normal' }),
  });
  const pdfBuffer = Buffer.from(await resPdf.arrayBuffer());
  const isPdf = pdfBuffer.slice(0, 5).toString() === '%PDF-';
  console.log(`  Status: ${resPdf.status} (${Date.now() - tPdf}ms)`);
  console.log(`  Bytes: ${pdfBuffer.length}, Valid %PDF header: ${isPdf}`);

  // 5. POST /api/public/cover-letter
  console.log('\n[5/6] POST /api/public/cover-letter (NVIDIA Nemotron)');
  const tCover = Date.now();
  const resCover = await fetch('https://curevo-ai.onrender.com/api/public/cover-letter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume: master,
      jobText: 'Senior Backend Engineer with Java, Spring Boot, and PostgreSQL experience.',
      targetRole: 'Senior Java Backend Engineer',
    }),
  });
  const dataCover = (await resCover.json()) as any;
  console.log(`  Status: ${resCover.status} (${Date.now() - tCover}ms)`);
  if (dataCover.letter) {
    console.log(`  Recipient: ${dataCover.letter.recipientTitle}`);
    console.log(`  Paragraphs: ${dataCover.letter.paragraphs?.length}`);
    console.log(`  Paragraph 1 preview: ${dataCover.letter.paragraphs?.[0]?.slice(0, 120)}...`);
  } else {
    console.log('  Error/Response:', JSON.stringify(dataCover));
  }

  // 6. POST /api/public/cover-letter/pdf
  if (dataCover.letter) {
    console.log('\n[6/6] POST /api/public/cover-letter/pdf');
    const tCoverPdf = Date.now();
    const resCoverPdf = await fetch('https://curevo-ai.onrender.com/api/public/cover-letter/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ letter: dataCover.letter }),
    });
    const coverPdfBuffer = Buffer.from(await resCoverPdf.arrayBuffer());
    const isCoverPdf = coverPdfBuffer.slice(0, 5).toString() === '%PDF-';
    console.log(`  Status: ${resCoverPdf.status} (${Date.now() - tCoverPdf}ms)`);
    console.log(`  Bytes: ${coverPdfBuffer.length}, Valid %PDF header: ${isCoverPdf}`);
  }

  // 7. POST /api/public/improve (NVIDIA Nemotron Tailoring + Truth Guard)
  console.log('\n[7/7] POST /api/public/improve (NVIDIA Nemotron Resume Rebuild)');
  const tImprove = Date.now();
  const resImprove = await fetch('https://curevo-ai.onrender.com/api/public/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume: {
        personal: {
          fullName: 'Aarav Sharma',
          email: 'aarav.sharma@example.com',
          phone: '+44 7700 900123',
          location: 'Manchester, UK',
          headline: 'Software Engineer',
        },
        summary: 'Backend engineer with 4 years of experience building REST APIs in Java.',
        experience: [
          {
            id: 'exp_1',
            company: 'Finlio Technologies',
            title: 'Software Engineer',
            location: 'Manchester, UK',
            startDate: '08/2022',
            endDate: 'Present',
            current: true,
            bullets: [
              'Developed RESTful backend services using Java and Spring Boot.',
              'Optimised PostgreSQL queries, reducing average API response time.',
            ],
          },
        ],
        education: [
          {
            id: 'edu_1',
            school: 'University of Manchester',
            degree: 'BSc Computer Science',
            fieldOfStudy: 'Computer Science',
            graduationYear: '2022',
          },
        ],
        skills: {
          technical: ['Java', 'Spring Boot', 'PostgreSQL', 'Docker', 'Kafka'],
          tools: ['Git', 'IntelliJ IDEA'],
          soft: ['Problem Solving', 'Team Collaboration'],
        },
        certifications: [],
        languages: [],
        projects: [],
      },
      jobText: 'Looking for a Senior Java Backend Engineer with experience in microservices, Spring Boot, PostgreSQL, and high availability systems.',
      targetRole: 'Senior Java Backend Engineer',
    }),
  });
  const dataImprove = (await resImprove.json()) as any;
  console.log(`  Status: ${resImprove.status} (${Date.now() - tImprove}ms)`);
  if (resImprove.ok) {
    console.log(`  ATS Before: ${dataImprove.atsBefore?.overallScore} -> After: ${dataImprove.atsAfter?.overallScore}`);
    console.log(`  Truth Guard Passed: ${dataImprove.truth?.passedAll}`);
    console.log(`  Agent usedAi: ${dataImprove.agent?.usedAi}, model: ${dataImprove.agent?.model}`);
    console.log(`  Changelog count: ${dataImprove.changeLog?.length}`);
    console.log(`  Rewritten summary: ${dataImprove.resume?.summary?.slice(0, 100)}...`);
  } else {
    console.log('  Error response:', JSON.stringify(dataImprove, null, 2));
  }

  console.log('\n=== LIVE ENDPOINTS VERIFICATION COMPLETE ===');
}

testAllLiveEndpoints().catch(console.error);
