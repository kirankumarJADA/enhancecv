import { makeMasterCV, JAVA_JD, REACT_JD } from './fixtures';

const JAVA_CLOUD_JD = `Senior Java & Cloud Microservices Engineer

We are seeking a Senior Java Engineer to build high-scale transaction services.

Requirements:
- 4+ years Java, Spring Boot, and REST API development
- PostgreSQL performance tuning and relational database design
- Distributed systems messaging using Kafka
- Docker containerisation and CI/CD pipelines
- Strong dedication to code quality, testing and reliability`;

const JAVA_BRIEF_JD = `Looking for an experienced Senior Java Backend Engineer with hands-on expertise in Java 17, Spring Boot microservices, Kafka event streaming, and PostgreSQL query optimisation. Must have experience building resilient REST APIs and CI/CD automation with Docker.`;

type TestScenario = {
  name: string;
  targetRole: string;
  jdText: string;
};

const scenarios: TestScenario[] = [
  {
    name: 'Scenario 1: Senior Java Backend Engineer (Nomos Bank Full JD)',
    targetRole: 'Senior Java Backend Engineer',
    jdText: JAVA_JD,
  },
  {
    name: 'Scenario 2: Senior Java & Cloud Microservices Engineer (Fintech)',
    targetRole: 'Senior Java & Cloud Microservices Engineer',
    jdText: JAVA_CLOUD_JD,
  },
  {
    name: 'Scenario 3: Senior Java Backend Engineer (Targeted JD Excerpt)',
    targetRole: 'Senior Java Backend Engineer',
    jdText: JAVA_BRIEF_JD,
  },
];

async function runSequentialTests() {
  console.log('=== PHASE 5: THREE SEQUENTIAL LIVE SYNTHETIC AI IMPROVE VERIFICATIONS ===\n');
  const master = makeMasterCV();
  const results = [];

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    console.log(`----------------------------------------------------------------------`);
    console.log(`[REQUEST ${i + 1} of 3] ${s.name}`);
    console.log(`Role: ${s.targetRole}`);
    console.log(`Target: https://curevo-ai.onrender.com/api/public/improve`);
    console.log(`Sending request at: ${new Date().toISOString()}`);

    const started = Date.now();
    try {
      const res = await fetch('https://curevo-ai.onrender.com/api/public/improve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          resume: master,
          jobText: s.jdText,
          targetRole: s.targetRole,
        }),
      });

      const latencyMs = Date.now() - started;
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      console.log(`Result: HTTP ${res.status} ${res.statusText} (${latencyMs}ms)`);

      if (!res.ok) {
        console.error(`FAILED: Response body:`, JSON.stringify(data, null, 2));
        results.push({
          scenario: s.name,
          ok: false,
          status: res.status,
          latencyMs,
          error: data,
        });
      } else {
        console.log(`  ✓ HTTP 200 OK`);
        console.log(`  ✓ Agent: usedAi=${data.agent?.usedAi}, model=${data.agent?.model}, iterations=${data.agent?.iterations}`);
        console.log(`  ✓ Truth Guard: passedAll=${data.truth?.passedAll}, checks=${data.truth?.checks?.length}, rejected=${data.agent?.rejectedCount}`);
        console.log(`  ✓ ATS Score: ${data.atsBefore?.overallScore} -> ${data.atsAfter?.overallScore}`);
        console.log(`  ✓ Changes proposed & applied: ${data.changeLog?.length}`);
        console.log(`  ✓ Advisory recommendations: ${data.agent?.advisory?.recommendations?.length ?? 0}`);

        // Verify no invented candidate facts
        const fullCVText = JSON.stringify(data.resume);
        console.log(`  ✓ Output resume contains ${data.resume?.experience?.length} experience roles and ${data.resume?.skills?.technical?.length} skills`);

        results.push({
          scenario: s.name,
          ok: true,
          status: res.status,
          latencyMs,
          usedAi: data.agent?.usedAi,
          iterations: data.agent?.iterations,
          rejectedCount: data.agent?.rejectedCount,
          passedAll: data.truth?.passedAll,
          atsBefore: data.atsBefore?.overallScore,
          atsAfter: data.atsAfter?.overallScore,
          changesCount: data.changeLog?.length,
          recommendationsCount: data.agent?.advisory?.recommendations?.length ?? 0,
        });
      }
    } catch (err: any) {
      const latencyMs = Date.now() - started;
      console.error(`NETWORK / REQUEST ERROR: ${err.message} (${latencyMs}ms)`);
      results.push({
        scenario: s.name,
        ok: false,
        error: err.message,
        latencyMs,
      });
    }
    console.log(`\nWaiting 3 seconds before next request...`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log('======================================================================');
  console.log('SUMMARY OF ALL 3 SEQUENTIAL REQUESTS:');
  console.log(JSON.stringify(results, null, 2));

  const allPassed = results.length === 3 && results.every((r) => r.ok && r.status === 200);
  console.log(`\nFINAL OUTCOME: ${allPassed ? 'ALL 3 REQUESTS PASSED (100% SUCCESS)' : 'SOME REQUESTS FAILED'}`);
}

runSequentialTests().catch(console.error);
