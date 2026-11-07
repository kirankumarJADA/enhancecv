import { JAVA_JD, REACT_JD, CLOUD_PLATFORM_JD, makeMasterCV, makeCloudMasterCV, makeReactMasterCV } from './benchmark_fixtures';
import { analyseJobDescription } from '../src/engine/jd';
import { computeJobMatch } from '../src/engine/match';

const cases = [
  { name: 'Java/Spring Boot', cv: makeMasterCV(), jd: JAVA_JD },
  { name: 'Cloud/DevOps', cv: makeCloudMasterCV(), jd: CLOUD_PLATFORM_JD },
  { name: 'React/TS', cv: makeReactMasterCV(), jd: REACT_JD },
];

for (const c of cases) {
  const jdParsed = analyseJobDescription(c.jd);
  const match = computeJobMatch(c.cv, jdParsed);
  console.log(`\n======================================================`);
  console.log(`CASE: ${c.name} — Total Requirements Evaluated: ${match.items.length}`);
  console.log(`Score: ${match.score}% | Matched: ${match.matchedSkills.length} | Missing: ${match.missingSkills.length}`);
  console.log(`======================================================`);

  const matched = match.items.filter((i) => i.status === 'matched');
  console.log(`Matched Items Sample (first 3):`);
  for (const m of matched.slice(0, 3)) {
    console.log(`  - [${m.type.toUpperCase()}] "${m.requirement}"`);
    console.log(`    Section: ${m.section}`);
    console.log(`    Evidence: ${m.evidence}`);
    console.log(`    Advice: ${m.actionableAdvice}`);
  }

  const missing = match.items.filter((i) => i.status === 'missing');
  console.log(`Missing Items Sample (first 3):`);
  for (const m of missing.slice(0, 3)) {
    console.log(`  - [${m.type.toUpperCase()}] "${m.requirement}"`);
    console.log(`    Section: ${m.section}`);
    console.log(`    Evidence: ${m.evidence}`);
    console.log(`    Advice: ${m.actionableAdvice}`);
  }

  // Verify preferred vs required separation
  const requiredMissing = missing.filter((i) => i.type === 'required');
  const preferredMissing = missing.filter((i) => i.type === 'preferred');
  console.log(`Breakdown: ${requiredMissing.length} required missing vs ${preferredMissing.length} preferred missing.`);
}
