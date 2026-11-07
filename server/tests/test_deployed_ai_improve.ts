import { makeMasterCV, JAVA_JD } from './fixtures';

async function testDeployedAi() {
  const master = makeMasterCV();
  console.log('Sending live tailoring request to https://curevo-ai.onrender.com/api/public/improve...');
  const started = Date.now();

  const res = await fetch('https://curevo-ai.onrender.com/api/public/improve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      resume: master,
      jobText: JAVA_JD,
      targetRole: 'Senior Java Backend Engineer',
    }),
  });

  const durationMs = Date.now() - started;
  console.log(`Response received in ${durationMs}ms with status: ${res.status} ${res.statusText}`);

  const data = (await res.json()) as any;
  if (!res.ok) {
    console.error('API Error Response:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('\n--- AGENT METADATA ---');
  console.log('usedAi:', data.agent?.usedAi);
  console.log('provider:', data.agent?.provider);
  console.log('model:', data.agent?.model);
  console.log('iterations:', data.agent?.iterations);
  console.log('repairCount:', data.agent?.repairCount);
  console.log('rejectedCount:', data.agent?.rejectedCount);

  console.log('\n--- TRUTH GUARD REPORT ---');
  console.log('passedAll:', data.truth?.passedAll);
  console.log('checks count:', data.truth?.checks?.length);
  console.log('autoFixed count:', data.truth?.autoFixed?.length);

  console.log('\n--- ATS COMPATIBILITY COMPARISON ---');
  console.log(`ATS Before: ${data.atsBefore?.overallScore}/100 (Content: ${data.atsBefore?.contentScore}, Skills: ${data.atsBefore?.skillsScore}, Readability: ${data.atsBefore?.readabilityScore})`);
  console.log(`ATS After:  ${data.atsAfter?.overallScore}/100 (Content: ${data.atsAfter?.contentScore}, Skills: ${data.atsAfter?.skillsScore}, Readability: ${data.atsAfter?.readabilityScore})`);

  console.log('\n--- JOB MATCH COMPARISON ---');
  console.log(`Match Score Before: ${data.matchBefore?.score}/100`);
  console.log(`Match Score After:  ${data.matchAfter?.score}/100`);

  console.log('\n--- CHANGELOG (AI PROPOSED REWRITES) ---');
  (data.changeLog || []).forEach((c: any, i: number) => {
    console.log(`[${i + 1}] Type: ${c.type} | Section: ${c.section}`);
    console.log(`    Before: ${c.before}`);
    console.log(`    After:  ${c.after}`);
    console.log(`    Reason: ${c.reason}`);
    console.log(`    Evidence: ${c.evidence}`);
  });

  console.log('\n--- TAILORED SUMMARY ---');
  console.log(data.resume?.summary);

  console.log('\n--- TAILORED EXPERIENCE BULLETS ---');
  data.resume?.experience?.forEach((e: any) => {
    console.log(`${e.title} @ ${e.company}:`);
    e.bullets?.forEach((b: string, idx: number) => {
      console.log(`  - [${idx}] ${b}`);
    });
  });

  console.log('\n--- TAILORED TECHNICAL SKILLS ---');
  console.log(data.resume?.skills?.technical?.join(', '));
}

testDeployedAi().catch(err => {
  console.error('Fatal request error:', err);
  process.exit(1);
});
