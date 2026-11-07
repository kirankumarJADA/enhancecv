import { JAVA_JD, REACT_JD, CLOUD_PLATFORM_JD, makeMasterCV, makeCloudMasterCV, makeReactMasterCV } from './benchmark_fixtures';
import { analyseJobDescription } from '../src/engine/jd';
import { computeJobMatch } from '../src/engine/match';

const cases = [
  { name: 'Case 1: Java Backend', cv: makeMasterCV(), jdText: JAVA_JD },
  { name: 'Case 2: Cloud / DevOps', cv: makeCloudMasterCV(), jdText: CLOUD_PLATFORM_JD },
  { name: 'Case 3: React Frontend', cv: makeReactMasterCV(), jdText: REACT_JD },
];

for (const c of cases) {
  const jd = analyseJobDescription(c.jdText);
  const m = computeJobMatch(c.cv, jd);
  console.log(`\n========================================`);
  console.log(`=== ${c.name} ===`);
  console.log(`Score: ${m.score}/100`);
  console.log(`Matched Items with Sections:`);
  m.items.filter(i => i.status === 'matched').slice(0, 4).forEach(i => {
    console.log(`  [${i.type}] ${i.requirement} -> Section: "${i.section}" | Advice: "${i.actionableAdvice}"`);
  });
  console.log(`Missing Items with Advice:`);
  m.items.filter(i => i.status === 'missing').slice(0, 4).forEach(i => {
    console.log(`  [${i.type}] ${i.requirement} -> Section: "${i.section}" | Advice: "${i.actionableAdvice}"`);
  });
}
