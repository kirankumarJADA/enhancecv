import { JAVA_JD, REACT_JD, CLOUD_PLATFORM_JD, makeMasterCV, makeCloudMasterCV, makeReactMasterCV } from './benchmark_fixtures';
import { analyseJobDescription } from '../src/engine/jd';
import { computeJobMatch } from '../src/engine/match';
import { tailorResume } from '../src/engine/tailor';

async function main() {
  const cases = [
    { name: 'Case 1: Java Backend', cv: makeMasterCV(), jdText: JAVA_JD },
    { name: 'Case 2: Cloud / DevOps', cv: makeCloudMasterCV(), jdText: CLOUD_PLATFORM_JD },
    { name: 'Case 3: React Frontend', cv: makeReactMasterCV(), jdText: REACT_JD },
  ];
  for (const c of cases) {
    const jd = analyseJobDescription(c.jdText);
    const m = computeJobMatch(c.cv, jd);
    const res = await tailorResume(c.cv, jd, m);
    console.log(`\n========================================`);
    console.log(`=== ${c.name} ===`);
    console.log(`========================================`);
    console.log(`--- Summary Before:\n${c.cv.summary}`);
    console.log(`--- Summary After:\n${res.resume.summary}`);
    console.log(`--- ChangeLog Entries (${res.changeLog.length}):`);
    res.changeLog.forEach((ch, idx) => console.log(`  [${idx}] ${ch.type} (${ch.section}): ${ch.reason}`));
    console.log(`--- Experience Bullets (Role 0):`);
    res.resume.experience[0].bullets.forEach((b, i) => console.log(`  [${i}]: ${b}`));
    console.log(`--- Technical Skills (Before -> After):`);
    console.log(`  Before: ${c.cv.skills.technical.join(', ')}`);
    console.log(`  After:  ${res.resume.skills.technical.join(', ')}`);
  }
}

main().catch(console.error);
