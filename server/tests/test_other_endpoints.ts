import { makeMasterCV, JAVA_JD } from './fixtures';

async function testOtherEndpoints() {
  console.log('=== VERIFYING COVER-LETTER AND PDF PRODUCTION ENDPOINTS ===\n');
  const master = makeMasterCV();

  // 1. POST /api/public/pdf (Resume PDF)
  console.log('1. Testing POST /api/public/pdf...');
  const resPdf = await fetch('https://curevo-ai.onrender.com/api/public/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume: master,
      template: 'modern',
      spacing: 'compact',
    }),
  });
  console.log(`   -> Status: ${resPdf.status} ${resPdf.statusText}`);
  const pdfBytes = await resPdf.arrayBuffer();
  const pdfHeader = Buffer.from(pdfBytes.slice(0, 5)).toString();
  console.log(`   -> Size: ${pdfBytes.byteLength} bytes, Header: ${pdfHeader}`);
  const pdfOk = resPdf.ok && pdfHeader === '%PDF-';
  console.log(`   -> Verified: ${pdfOk ? 'PASS' : 'FAIL'}\n`);

  // 2. POST /api/public/cover-letter
  console.log('2. Testing POST /api/public/cover-letter...');
  const resCl = await fetch('https://curevo-ai.onrender.com/api/public/cover-letter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume: master,
      jobDescription: JAVA_JD,
      company: 'Nomos Bank',
      targetRole: 'Senior Java Backend Engineer',
    }),
  });
  console.log(`   -> Status: ${resCl.status} ${resCl.statusText}`);
  const clJson = (await resCl.json()) as any;
  const letter = clJson.letter;
  console.log(`   -> Cover letter returned:`, Boolean(letter), 'Keys:', Object.keys(letter || {}));
  const clOk = resCl.ok && Boolean(letter);
  console.log(`   -> Verified: ${clOk ? 'PASS' : 'FAIL'}\n`);

  // 3. POST /api/public/cover-letter/pdf
  console.log('3. Testing POST /api/public/cover-letter/pdf...');
  const resClPdf = await fetch('https://curevo-ai.onrender.com/api/public/cover-letter/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      letter: letter,
      candidateName: master.personal.fullName,
      role: 'Senior Java Backend Engineer',
      company: 'Nomos Bank',
      pageSize: 'A4',
    }),
  });
  console.log(`   -> Status: ${resClPdf.status} ${resClPdf.statusText}`);
  const clPdfBytes = await resClPdf.arrayBuffer();
  const clPdfHeader = Buffer.from(clPdfBytes.slice(0, 5)).toString();
  console.log(`   -> Size: ${clPdfBytes.byteLength} bytes, Header: ${clPdfHeader}`);
  const clPdfOk = resClPdf.ok && clPdfHeader === '%PDF-';
  console.log(`   -> Verified: ${clPdfOk ? 'PASS' : 'FAIL'}\n`);

  console.log(`ALL 3 AUXILIARY ENDPOINTS OPERATIONAL: ${pdfOk && clOk && clPdfOk ? 'YES' : 'NO'}`);
}

testOtherEndpoints().catch(console.error);
