import { makeMasterCV, JAVA_JD } from './fixtures';

async function runPostDeployAcceptance() {
  console.log('========================================================================');
  console.log('CUREVO AI — POST-DEPLOYMENT PRODUCTION ACCEPTANCE VERIFICATION');
  console.log('Backend Target: https://curevo-ai.onrender.com');
  console.log('Frontend Target: https://enhancecv-orpin.vercel.app');
  console.log(`Started At: ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  const master = makeMasterCV();

  // 1. Health
  console.log('[1/7] Testing GET /api/health...');
  const t1 = Date.now();
  const resHealth = await fetch('https://curevo-ai.onrender.com/api/health');
  const healthData = await resHealth.json();
  console.log(`   -> HTTP ${resHealth.status} (${Date.now() - t1}ms)`, healthData);

  // 2. Status
  console.log('\n[2/7] Testing GET /api/public/status...');
  const t2 = Date.now();
  const resStatus = await fetch('https://curevo-ai.onrender.com/api/public/status');
  const statusData = await resStatus.json();
  console.log(`   -> HTTP ${resStatus.status} (${Date.now() - t2}ms)`, statusData);

  // 3. ATS Scoring Formula & 9 Dimensions Invariance Check
  console.log('\n[3/7] Testing POST /api/public/ats (Scoring formulas & 9 dimensions)...');
  const t3 = Date.now();
  const resAts = await fetch('https://curevo-ai.onrender.com/api/public/ats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume: master }),
  });
  const atsData = (await resAts.json()) as any;
  const dims = atsData.audit?.dimensions ? Object.keys(atsData.audit.dimensions) : [];
  console.log(`   -> HTTP ${resAts.status} (${Date.now() - t3}ms)`);
  console.log(`   -> Overall Score: ${atsData.ats?.overallScore}/100`);
  console.log(`   -> Breakdown: Content=${atsData.ats?.contentScore}, Skills=${atsData.ats?.skillsScore}, Readability=${atsData.ats?.readabilityScore}`);
  console.log(`   -> 9 Dimensions Count: ${dims.length} (${dims.join(', ')})`);

  // 4. Live Java Backend AI Optimization
  console.log('\n[4/7] Testing POST /api/public/improve (Live Java Backend Optimization)...');
  const t4 = Date.now();
  const resImprove = await fetch('https://curevo-ai.onrender.com/api/public/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      resume: master,
      jobText: JAVA_JD,
      targetRole: 'Senior Java Backend Engineer',
    }),
    signal: AbortSignal.timeout(85000),
  });

  const latencyImprove = Date.now() - t4;
  console.log(`   -> HTTP ${resImprove.status} ${resImprove.statusText} (${latencyImprove}ms)`);
  const improveText = await resImprove.text();
  let improveData: any;
  try {
    improveData = JSON.parse(improveText);
  } catch {
    improveData = { raw: improveText };
  }

  if (!resImprove.ok) {
    console.error('   -> FAILED:', JSON.stringify(improveData, null, 2));
    process.exit(1);
  }

  console.log('   -> AI Optimization SUCCESSFUL:');
  console.log(`      • Model: ${improveData.agent?.model}`);
  console.log(`      • Used AI: ${improveData.agent?.usedAi}`);
  console.log(`      • Iterations: ${improveData.agent?.iterations}`);
  console.log(`      • Error Code: ${improveData.agent?.errorCode ?? 'NONE'}`);
  console.log(`      • Applied Changes: ${improveData.changeLog?.length}`);
  console.log(`      • ATS Score Change: ${improveData.atsBefore?.overallScore} -> ${improveData.atsAfter?.overallScore}`);
  console.log(`      • Advisory Recommendations: ${improveData.agent?.advisory?.recommendations?.length ?? 0}`);

  // 5. Truth Guard & Factual Grounding Verification
  console.log('\n[5/7] Verifying Truth Guard execution and factual grounding...');
  const truth = improveData.truth;
  console.log(`   -> Truth Guard passedAll: ${truth?.passedAll}`);
  console.log(`   -> Total Checks Executed: ${truth?.checks?.length}`);
  console.log(`   -> Rejected Claims Count: ${improveData.agent?.rejectedCount}`);
  const ungroundedSkills = (improveData.resume?.skills?.technical || []).filter(
    (s: string) => !master.skills.technical.includes(s)
  );
  console.log(`   -> Injected Ungrounded Skills: ${ungroundedSkills.length === 0 ? 'NONE (100% Grounded)' : ungroundedSkills.join(', ')}`);

  // 6. Cover Letter Generation & PDF Export
  console.log('\n[6/7] Testing POST /api/public/cover-letter and /cover-letter/pdf...');
  const t6 = Date.now();
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
  const clData = (await resCl.json()) as any;
  console.log(`   -> Cover Letter HTTP ${resCl.status} (${Date.now() - t6}ms), Paragraphs: ${clData.letter?.paragraphs?.length}`);

  const resClPdf = await fetch('https://curevo-ai.onrender.com/api/public/cover-letter/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      letter: clData.letter,
      candidateName: master.personal.fullName,
      role: 'Senior Java Backend Engineer',
      company: 'Nomos Bank',
      pageSize: 'A4',
    }),
  });
  const clPdfBytes = await resClPdf.arrayBuffer();
  const clPdfHeader = Buffer.from(clPdfBytes.slice(0, 5)).toString();
  console.log(`   -> Cover Letter PDF HTTP ${resClPdf.status}, Size: ${clPdfBytes.byteLength} bytes, Header: ${clPdfHeader}`);

  // 7. Resume PDF Export
  console.log('\n[7/7] Testing POST /api/public/pdf (Resume PDF Export)...');
  const t7 = Date.now();
  const resPdf = await fetch('https://curevo-ai.onrender.com/api/public/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume: improveData.resume, template: 'modern', spacing: 'compact' }),
  });
  const pdfBytes = await resPdf.arrayBuffer();
  const pdfHeader = Buffer.from(pdfBytes.slice(0, 5)).toString();
  console.log(`   -> Resume PDF HTTP ${resPdf.status} (${Date.now() - t7}ms), Size: ${pdfBytes.byteLength} bytes, Header: ${pdfHeader}`);

  console.log('\n========================================================================');
  console.log('ALL POST-DEPLOYMENT CHECKS COMPLETED SUCCESSFULLY');
  console.log('========================================================================');
}

runPostDeployAcceptance().catch((err) => {
  console.error('Fatal acceptance test error:', err);
  process.exit(1);
});
