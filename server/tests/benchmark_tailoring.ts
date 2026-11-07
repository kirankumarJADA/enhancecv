import {
  JAVA_JD,
  REACT_JD,
  CLOUD_PLATFORM_JD,
  makeMasterCV,
  makeCloudMasterCV,
  makeReactMasterCV,
} from './benchmark_fixtures';
import { analyseJobDescription } from '../src/engine/jd';
import { computeJobMatch } from '../src/engine/match';
import { analyseATS } from '../src/engine/ats';
import { runResumeAgent } from '../src/ai/resumeAgent';
import { tailorResume } from '../src/engine/tailor';
import { ResumeData } from '../src/types';

export interface BenchmarkCaseResult {
  caseName: string;
  candidateName: string;
  targetTitle: string;
  mandatorySkills: string[];
  preferredSkills: string[];
  sampleTimingsMs: number[];
  timingMinMs: number;
  timingMaxMs: number;
  timingAvgMs: number;
  atsBefore: number;
  atsAfter: number;
  matchBefore: number;
  matchAfter: number;
  matchedSkillsCountBefore: number;
  matchedSkillsCountAfter: number;
  changeCount: number;
  truthPassed: boolean;
  rejectedCount: number;
  repairCount: number;
  usedAi: boolean;
  iterations: number;
  sampleSummary: string;
  sampleBullet: string;
}

export async function runBenchmark(useLiveAi: boolean = false, runsPerCase: number = 3): Promise<BenchmarkCaseResult[]> {
  const cases = [
    {
      name: 'Case 1: Java/Spring Boot Backend',
      cv: makeMasterCV(),
      jdText: JAVA_JD,
      targetRole: 'Senior Java Backend Engineer',
    },
    {
      name: 'Case 2: Cloud / DevOps / Platform',
      cv: makeCloudMasterCV(),
      jdText: CLOUD_PLATFORM_JD,
      targetRole: 'Senior Cloud Platform Engineer',
    },
    {
      name: 'Case 3: React / TypeScript Frontend',
      cv: makeReactMasterCV(),
      jdText: REACT_JD,
      targetRole: 'Frontend Engineer (React)',
    },
  ];

  const results: BenchmarkCaseResult[] = [];

  for (const c of cases) {
    console.log(`\n======================================================`);
    console.log(`RUNNING BENCHMARK: ${c.name} (${runsPerCase} repeated runs)`);
    console.log(`Candidate: ${c.cv.personal.fullName} | Target Role: ${c.targetRole}`);
    console.log(`Factual Master Headline: "${c.cv.personal.headline}"`);
    console.log(`======================================================`);

    const jd = analyseJobDescription(c.jdText);
    const atsBefore = analyseATS(c.cv);
    const matchBefore = computeJobMatch(c.cv, jd);

    console.log(`Baseline ATS Score:       ${atsBefore.overallScore}/100`);
    console.log(`Baseline Job Match Score: ${matchBefore.score}/100`);
    console.log(`Required skills in JD:    ${jd.requiredSkills.join(', ')}`);
    console.log(`Matched skills baseline:  ${matchBefore.matchedSkills.join(', ')}`);
    console.log(`Missing skills baseline:  ${matchBefore.missingSkills.join(', ')}`);

    const sampleTimings: number[] = [];
    let lastTailoredResume: ResumeData = c.cv;
    let lastAtsAfter = atsBefore.overallScore;
    let lastMatchAfter = matchBefore;
    let lastTruthPassed = true;
    let lastChangeCount = 0;
    let lastRejectedCount = 0;
    let lastRepairCount = 0;
    let lastUsedAi = false;
    let lastIterations = 0;

    for (let run = 1; run <= runsPerCase; run++) {
      const tStart = Date.now();
      let tailoredResume: ResumeData;
      let atsAfterScore: number;
      let matchAfterResult: ReturnType<typeof computeJobMatch>;
      let truthPassed: boolean;
      let changeCount: number;
      let rejectedCount: number = 0;
      let repairCount: number = 0;
      let usedAi: boolean = false;
      let iterations: number = 0;

      if (useLiveAi) {
        console.log(`  [Run ${run}/${runsPerCase}] POST https://curevo-ai.onrender.com/api/public/improve...`);
        const res = await fetch('https://curevo-ai.onrender.com/api/public/improve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resume: c.cv,
            jobText: c.jdText,
            targetRole: c.targetRole,
          }),
        });
        const data = (await res.json()) as any;
        if (!res.ok) {
          throw new Error(`API failed with status ${res.status}: ${JSON.stringify(data)}`);
        }
        tailoredResume = data.resume;
        atsAfterScore = data.atsAfter.overallScore;
        matchAfterResult = data.matchAfter;
        truthPassed = data.truth.passedAll;
        changeCount = (data.changeLog || []).length;
        rejectedCount = data.agent?.rejectedCount || 0;
        repairCount = data.agent?.repairCount || 0;
        usedAi = data.agent?.usedAi || false;
        iterations = data.agent?.iterations || 0;
      } else {
        // Deterministic / Local Agent execution
        const agentRes = await runResumeAgent(c.cv, jd, c.jdText, matchBefore, atsBefore, { requireAi: false });
        tailoredResume = agentRes.resume;
        atsAfterScore = agentRes.atsAfter.overallScore;
        matchAfterResult = agentRes.matchAfter;
        truthPassed = agentRes.truth.passedAll;
        changeCount = agentRes.changeLog.length;
        rejectedCount = agentRes.agent.rejectedCount;
        repairCount = agentRes.agent.repairCount;
        usedAi = agentRes.agent.usedAi;
        iterations = agentRes.agent.iterations;
      }

      const dur = Date.now() - tStart;
      sampleTimings.push(dur);
      lastTailoredResume = tailoredResume;
      lastAtsAfter = atsAfterScore;
      lastMatchAfter = matchAfterResult;
      lastTruthPassed = truthPassed;
      lastChangeCount = changeCount;
      lastRejectedCount = rejectedCount;
      lastRepairCount = repairCount;
      lastUsedAi = usedAi;
      lastIterations = iterations;
      console.log(`  Run ${run}/${runsPerCase} completed in ${dur}ms (ATS: ${atsAfterScore}, Match: ${matchAfterResult.score})`);
    }

    const minTiming = Math.min(...sampleTimings);
    const maxTiming = Math.max(...sampleTimings);
    const avgTiming = Math.round(sampleTimings.reduce((a, b) => a + b, 0) / sampleTimings.length);

    console.log(`Timing summary for ${c.name}: min=${minTiming}ms, max=${maxTiming}ms, avg=${avgTiming}ms`);
    console.log(`Post-Tailoring ATS:       ${lastAtsAfter}/100 (delta: ${lastAtsAfter - atsBefore.overallScore >= 0 ? '+' : ''}${lastAtsAfter - atsBefore.overallScore})`);
    console.log(`Post-Tailoring Job Match: ${lastMatchAfter.score}/100 (delta: ${lastMatchAfter.score - matchBefore.score >= 0 ? '+' : ''}${lastMatchAfter.score - matchBefore.score})`);
    console.log(`Headline Grounding:       "${lastTailoredResume.personal.headline}" (is grounded: ${lastTailoredResume.personal.headline === c.cv.personal.headline})`);
    console.log(`Truth Guard Passed:       ${lastTruthPassed} (Rejections: ${lastRejectedCount}, Repairs: ${lastRepairCount})`);
    console.log(`Summary:                  ${lastTailoredResume.summary?.slice(0, 160)}...`);

    results.push({
      caseName: c.name,
      candidateName: c.cv.personal.fullName,
      targetTitle: c.targetRole,
      mandatorySkills: jd.requiredSkills,
      preferredSkills: jd.preferredSkills,
      sampleTimingsMs: sampleTimings,
      timingMinMs: minTiming,
      timingMaxMs: maxTiming,
      timingAvgMs: avgTiming,
      atsBefore: atsBefore.overallScore,
      atsAfter: lastAtsAfter,
      matchBefore: matchBefore.score,
      matchAfter: lastMatchAfter.score,
      matchedSkillsCountBefore: matchBefore.matchedSkills.length,
      matchedSkillsCountAfter: lastMatchAfter.matchedSkills.length,
      changeCount: lastChangeCount,
      truthPassed: lastTruthPassed,
      rejectedCount: lastRejectedCount,
      repairCount: lastRepairCount,
      usedAi: lastUsedAi,
      iterations: lastIterations,
      sampleSummary: lastTailoredResume.summary || '',
      sampleBullet: lastTailoredResume.experience[0]?.bullets[0] || '',
    });
  }

  return results;
}

if (require.main === module) {
  const useLive = process.argv.includes('--live');
  const repeat = 3;
  runBenchmark(useLive, repeat)
    .then((res) => {
      console.log('\n======================================================');
      console.log(`BENCHMARK COMPLETED (${useLive ? 'LIVE RENDER AI' : 'DETERMINISTIC / LOCAL'} — ${repeat} SAMPLES/CASE)`);
      console.log('======================================================');
      console.table(
        res.map((r) => ({
          Case: r.caseName,
          Candidate: r.candidateName,
          ATS: `${r.atsBefore} -> ${r.atsAfter} (${r.atsAfter - r.atsBefore >= 0 ? '+' : ''}${r.atsAfter - r.atsBefore})`,
          Match: `${r.matchBefore} -> ${r.matchAfter} (${r.matchAfter - r.matchBefore >= 0 ? '+' : ''}${r.matchAfter - r.matchBefore})`,
          Skills: `${r.matchedSkillsCountBefore} -> ${r.matchedSkillsCountAfter}`,
          Timing: `min ${r.timingMinMs}ms | max ${r.timingMaxMs}ms | avg ${r.timingAvgMs}ms`,
          Truth: r.truthPassed ? 'PASS' : 'FAIL',
          Rejections: r.rejectedCount,
          UsedAI: r.usedAi,
        }))
      );
    })
    .catch((err) => {
      console.error('Benchmark fatal error:', err);
      process.exit(1);
    });
}
