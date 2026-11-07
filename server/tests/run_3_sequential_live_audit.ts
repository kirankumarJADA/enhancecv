import { makeMasterCV, makeFrontendCV, JAVA_JD, REACT_JD } from './fixtures';
import type { ResumeData } from '../src/types';

// Synthetic DevOps CV
function makeDevOpsCV(): ResumeData {
  const cv = makeMasterCV();
  cv.personal.fullName = 'Alex Vance';
  cv.personal.headline = 'DevOps & Cloud Infrastructure Engineer';
  cv.summary =
    'DevOps engineer with 4+ years of experience designing and managing cloud infrastructure on AWS and Kubernetes. Automated CI/CD pipelines and improved system reliability.';
  cv.experience = [
    {
      id: 'exp_1',
      company: 'Nexus Cloud Solutions',
      title: 'Cloud Platform Engineer',
      location: 'London',
      startDate: '08/2022',
      endDate: 'Present',
      current: true,
      bullets: [
        'Architected and managed multi-region Kubernetes clusters on AWS EKS using Terraform and Helm for 40+ microservices.',
        'Built automated CI/CD deployment pipelines using GitHub Actions and Docker, reducing release cycle time by 45%.',
        'Configured Prometheus and Grafana observability stack, maintaining 99.95% system uptime.',
        'Implemented Karpenter auto-scaling and spot instance policies, cutting monthly cloud infrastructure costs by 22%.',
      ],
    },
    {
      id: 'exp_2',
      company: 'DataFlow Networks',
      title: 'Systems Administrator',
      location: 'Reading',
      startDate: '06/2020',
      endDate: '07/2022',
      current: false,
      bullets: [
        'Managed production Linux infrastructure across 150+ virtual servers with Ansible automation.',
        'Automated database backups and disaster recovery verification using Python and Bash scripts.',
      ],
    },
  ];
  cv.projects = [
    {
      id: 'prj_1',
      name: 'KubeGitOps',
      link: 'github.com/alexvance/kubegitops',
      description: 'GitOps deployment controller with ArgoCD and Helm.',
      bullets: ['Built automated GitOps deployment pipelines with ArgoCD and Helm.'],
      tech: ['Kubernetes', 'Helm', 'ArgoCD', 'Terraform', 'AWS'],
    },
  ];
  cv.skills = {
    technical: [
      'AWS',
      'Kubernetes',
      'Docker',
      'Terraform',
      'Helm',
      'GitHub Actions',
      'Prometheus',
      'Grafana',
      'Linux',
      'Python',
      'Bash',
      'Ansible',
    ],
    soft: ['Incident Management', 'Cross-functional Collaboration', 'Problem Solving'],
  };
  cv.certifications = [
    { id: 'cert_1', name: 'AWS Certified Solutions Architect – Associate', issuer: 'Amazon Web Services', year: '2023' },
    { id: 'cert_2', name: 'Certified Kubernetes Administrator (CKA)', issuer: 'CNCF', year: '2024' },
  ];
  return cv;
}

const DEVOPS_JD = `Senior DevOps Engineer (AWS & Kubernetes)

CloudScale Systems is looking for a Senior DevOps Engineer to lead our cloud platform infrastructure and CI/CD automation.

Requirements:
- 4+ years of hands-on experience in DevOps and cloud infrastructure
- Strong experience with AWS (EKS, RDS, S3, IAM, VPC)
- Production Kubernetes cluster administration and Helm templating
- Infrastructure as Code using Terraform
- Automated CI/CD pipeline design (GitHub Actions or GitLab CI)
- Observability and alerting with Prometheus and Grafana
- Strong scripting skills in Bash and Python`;

interface Scenario {
  name: string;
  targetRole: string;
  resume: ResumeData;
  jdText: string;
}

const scenarios: Scenario[] = [
  {
    name: 'Scenario 1: Java Backend Engineer',
    targetRole: 'Senior Java Backend Engineer',
    resume: makeMasterCV(),
    jdText: JAVA_JD,
  },
  {
    name: 'Scenario 2: Frontend Engineer — React and TypeScript',
    targetRole: 'Frontend Engineer (React)',
    resume: makeFrontendCV(),
    jdText: REACT_JD,
  },
  {
    name: 'Scenario 3: DevOps Engineer — AWS and Kubernetes',
    targetRole: 'Senior DevOps Engineer',
    resume: makeDevOpsCV(),
    jdText: DEVOPS_JD,
  },
];

async function runLiveAudit() {
  console.log('========================================================================');
  console.log('CUREVO AI — CONTROLLED LIVE PRODUCTION VERIFICATION (3 SEQUENTIAL TESTS)');
  console.log('Target: https://curevo-ai.onrender.com/api/public/improve');
  console.log(`Started At: ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  const results: any[] = [];
  const OVERALL_START = Date.now();

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    console.log(`------------------------------------------------------------------------`);
    console.log(`[REQUEST ${i + 1}/3] ${s.name}`);
    console.log(`Role: ${s.targetRole}`);
    console.log(`Candidate: ${s.resume.personal.fullName} (${s.resume.experience.length} roles, ${s.resume.skills.technical.length} skills)`);
    console.log(`Timestamp: ${new Date().toISOString()}`);

    const reqStart = Date.now();
    try {
      const res = await fetch('https://curevo-ai.onrender.com/api/public/improve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          resume: s.resume,
          jobText: s.jdText,
          targetRole: s.targetRole,
        }),
        signal: AbortSignal.timeout(75000), // Enforced 75s per-request timeout
      });

      const latencyMs = Date.now() - reqStart;
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      console.log(`Result: HTTP ${res.status} ${res.statusText} (${latencyMs}ms)`);

      if (!res.ok) {
        console.error(`Status: FAILED (HTTP ${res.status})`);
        console.error('Diagnostic error response:', JSON.stringify(data, null, 2));
        results.push({
          scenario: s.name,
          role: s.targetRole,
          ok: false,
          status: res.status,
          latencyMs,
          error: data.error || data,
        });
      } else {
        console.log(`Status: SUCCESS (HTTP 200 OK)`);
        console.log(`  Model: ${data.agent?.model} (usedAi: ${data.agent?.usedAi}, iterations: ${data.agent?.iterations})`);
        console.log(`  Truth Guard: passedAll=${data.truth?.passedAll}, checks=${data.truth?.checks?.length}, rejected=${data.agent?.rejectedCount}`);
        console.log(`  ATS Score: ${data.atsBefore?.overallScore} -> ${data.atsAfter?.overallScore}`);
        console.log(`  Applied Changes: ${data.changeLog?.length}`);
        console.log(`  Advisory Recommendations: ${data.agent?.advisory?.recommendations?.length ?? 0}`);

        results.push({
          scenario: s.name,
          role: s.targetRole,
          ok: true,
          status: res.status,
          latencyMs,
          model: data.agent?.model,
          usedAi: data.agent?.usedAi,
          iterations: data.agent?.iterations,
          rejectedCount: data.agent?.rejectedCount,
          passedAll: data.truth?.passedAll,
          checksCount: data.truth?.checks?.length,
          atsBefore: data.atsBefore?.overallScore,
          atsAfter: data.atsAfter?.overallScore,
          changesCount: data.changeLog?.length,
          recommendationsCount: data.agent?.advisory?.recommendations?.length ?? 0,
        });
      }
    } catch (err: any) {
      const latencyMs = Date.now() - reqStart;
      console.error(`Request exception: ${err.message} (${latencyMs}ms)`);
      results.push({
        scenario: s.name,
        role: s.targetRole,
        ok: false,
        status: 'NETWORK_OR_TIMEOUT',
        latencyMs,
        error: { message: err.message },
      });
    }

    if (i < scenarios.length - 1) {
      console.log(`\nPausing 5 seconds before next request...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  const totalDuration = Date.now() - OVERALL_START;
  console.log('\n========================================================================');
  console.log(`EXECUTION SUMMARY (Total Duration: ${(totalDuration / 1000).toFixed(1)}s)`);
  console.log('========================================================================');
  console.table(
    results.map((r) => ({
      Scenario: r.scenario,
      Status: r.status,
      Latency: `${r.latencyMs}ms`,
      UsedAI: r.usedAi ?? 'N/A',
      Iterations: r.iterations ?? 'N/A',
      TruthGuard: r.passedAll ? 'PASS' : (r.ok ? 'FAIL' : 'N/A'),
      ATS: r.atsBefore !== undefined ? `${r.atsBefore} -> ${r.atsAfter}` : 'N/A',
      Success: r.ok ? 'YES' : 'NO',
    }))
  );

  console.log('\nFULL RECORDED JSON RESULTS:');
  console.log(JSON.stringify(results, null, 2));

  const allPassed = results.length === 3 && results.every((r) => r.ok && r.status === 200);
  if (!allPassed) {
    console.error('\nOVERALL RESULT: FAILED (Not all 3 consecutive requests succeeded)');
    process.exit(1);
  } else {
    console.log('\nOVERALL RESULT: 3/3 CONSECUTIVE SUCCESSFUL REQUESTS VERIFIED');
    process.exit(0);
  }
}

runLiveAudit().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
