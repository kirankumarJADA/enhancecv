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
  const mBefore = computeJobMatch(c.cv, jd);
  console.log(`\n=== ${c.name} ===`);
  console.log(`Baseline Match Score: ${mBefore.score}/100`);
  console.log(`Headline: "${c.cv.personal.headline}"`);
  console.log('Breakdown:', mBefore.breakdown.map(b => `${b.key}: ${b.score} (weight ${b.weight})`));
}











