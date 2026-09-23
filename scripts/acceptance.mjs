// End-to-end acceptance test against a running EnhanceCV server (PORT env or 4000).
const BASE = `http://localhost:${process.env.PORT || 4000}/api`;
let cookie = '';

async function call(method, path, body) {
  const headers = { cookie };
  let payload;
  if (body) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data };
}

const log = (ok, name, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
let failures = 0;
const check = (ok, name, extra) => {
  if (!ok) failures++;
  log(ok, name, extra);
};

// 1. health
const h = await call('GET', '/health');
check(h.status === 200, 'health check');

// 2. signup
const email = `acceptance_${Date.now()}@test.dev`;
const s = await call('POST', '/auth/signup', { name: 'Acceptance Tester', email, password: 'password123' });
check(s.status === 201, 'signup', `user ${s.data.user.id}`);

// 3. session persistence
const me = await call('GET', '/auth/me');
check(me.status === 200 && me.data.user.email === email, 'session persistence');

// 4. web app served
const page = await fetch(BASE.replace('/api', '/'));
const html = await page.text();
check(page.status === 200 && html.includes('Build a better CV for every job'), 'web app served from server');

// 5. save master CV
const cv = {
  personal: { fullName: 'Aarav Sharma', email: 'aarav.sharma@example.com', phone: '+44 7700 900123', location: 'Manchester, UK', linkedin: 'linkedin.com/in/aaravsharma', github: 'github.com/aaravsharma', portfolio: '', headline: 'Backend Engineer' },
  summary: 'Backend engineer with 4 years of experience building REST APIs and distributed services in Java and Spring Boot. Delivered payment integrations handling thousands of transactions per day and improved API latency by 30%.',
  experience: [
    { id: 'exp_1', company: 'Finlio Technologies', title: 'Software Engineer', location: 'Manchester', startDate: '08/2022', endDate: 'Present', current: true, bullets: [
      'Developed RESTful backend services using Java and Spring Boot serving 120k daily requests.',
      'Optimised PostgreSQL queries and indexes, reducing average API response time by 30%.',
      'Built CI/CD pipelines with Jenkins and Docker, cutting deployment time from 40 minutes to 8 minutes.',
      'Worked on backend development tasks across the payments team.',
    ] },
    { id: 'exp_2', company: 'Cloudline Systems', title: 'Junior Developer', location: 'Leeds', startDate: '06/2021', endDate: '07/2022', current: false, bullets: [
      'Implemented microservices in Java with Kafka-based event streaming for order processing.',
      'Wrote JUnit and Mockito unit tests raising coverage from 45% to 82%.',
    ] },
  ],
  projects: [{ id: 'prj_1', name: 'LedgerSync', link: 'github.com/aaravsharma/ledgersync', description: 'Open-source ledger reconciliation tool.', bullets: ['Built a Spring Boot service reconciling 50k transactions nightly with PostgreSQL and Redis caching.'], tech: ['Java', 'Spring Boot', 'PostgreSQL', 'Redis'] }],
  education: [{ id: 'edu_1', institution: 'University of Leeds', degree: 'BSc', field: 'Computer Science', startDate: '2017', endDate: '2021', grade: '2:1' }],
  skills: { technical: ['Java', 'Spring Boot', 'PostgreSQL', 'Docker', 'Kafka', 'Redis', 'Jenkins', 'REST APIs', 'Microservices', 'Git'], soft: ['Collaboration', 'Mentoring', 'Problem solving', 'Communication'] },
  certifications: [{ id: 'cert_1', name: 'Oracle Certified Professional: Java SE 17', issuer: 'Oracle', year: '2023' }],
  languages: [{ id: 'lang_1', name: 'English', proficiency: 'Fluent' }, { id: 'lang_2', name: 'Hindi', proficiency: 'Native' }],
  achievements: ['Won internal hackathon 2023 with an automated reconciliation prototype.'],
  sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
  hiddenSections: [],
};
const sv = await call('PUT', '/master', { resume: cv, title: 'Master CV' });
check(sv.status === 201 && sv.data.atsScore > 0, 'save Master CV', `ATS ${sv.data.atsScore}, completeness ${sv.data.completeness}%`);

// 6. ATS analysis
const ats = await call('GET', '/master/ats');
check(ats.status === 200 && ats.data.analysis.working.length > 0, 'ATS analysis', `score ${ats.data.analysis.overallScore}`);

// 7. JD analysis
const jdText = `Senior Java Backend Engineer

Nomos Bank is building the next generation of its digital banking platform and looking for a Senior Java Backend Engineer to join our Payments team in Manchester (hybrid).

What you'll do
- Design, build and operate REST APIs and microservices in Java 17 and Spring Boot
- Improve reliability and observability of payment flows (Kafka, Prometheus, Grafana)
- Optimise PostgreSQL data models and queries for scale
- Champion CI/CD, automated testing and code review culture
- Mentor mid-level engineers and lead design reviews

What we're looking for
- 5+ years of backend engineering experience with Java and Spring Boot
- Strong REST API design and microservices experience
- Solid PostgreSQL and query optimisation skills
- Experience with Docker and Kubernetes in production
- Experience with Kafka or similar message queues
- Bachelor's degree in Computer Science or equivalent practical experience

Nice to have
- AWS (EKS, RDS) and Terraform experience
- Experience in fintech or payments
- Kubernetes certification (CKA) is a plus`;

const ja = await call('POST', '/jobs/analyse', { text: jdText });
const jobId = ja.data.jobId;
check(ja.status === 201 && ja.data.match.score > 0, 'JD analysis + match', `title "${ja.data.analysis.title}", match ${ja.data.match.score}, missing: ${ja.data.match.missingSkills.slice(0, 3).join('/')}`);

// 8. zero fabrication: AWS reported missing
check(ja.data.match.missingSkills.includes('AWS'), 'zero-fabrication: AWS reported missing (not added)');

// 9. tailoring
const tail = await call('POST', `/jobs/${jobId}/tailor`, {});
check(tail.status === 201, 'tailoring pipeline', `ATS ${tail.data.before.ats}->${tail.data.after.ats}, match ${tail.data.before.match}->${tail.data.after.match}, ${tail.data.changeLog.length} changes, truth passed=${tail.data.truth.passedAll}`);
const versionId = tail.data.versionId;

// 10. no fabricated tech in tailored resume
const tailoredText = JSON.stringify(tail.data.resume);
check(!/\bTerraform\b/.test(tailoredText), 'tailored CV contains no Terraform fabrication');

// 11. edit tailored resume
const got = await call('GET', `/resumes/${versionId}`);
const edited = got.data.resume.content;
edited.summary += ' Passionate about payment systems.';
const put = await call('PUT', `/resumes/${versionId}`, { resume: edited, title: 'Java Developer — Nomos Bank' });
check(put.status === 200, 'edit + save tailored version', `new ATS ${put.data.atsScore}`);

// 12. suggestions
const sug = await call('GET', `/resumes/${versionId}/suggestions`);
check(sug.status === 200 && Array.isArray(sug.data.suggestions), 'editor suggestions', `${sug.data.suggestions.length} suggestions`);

// 13. PDF
const pdfRes = await fetch(`${BASE}/resumes/${versionId}/pdf`, { headers: { cookie } });
const buf = Buffer.from(await pdfRes.arrayBuffer());
check(pdfRes.status === 200 && buf.subarray(0, 4).toString() === '%PDF' && buf.length > 1000, 'PDF download', `${buf.length} bytes, ${pdfRes.headers.get('content-disposition')}`);

// 14. master unchanged
const masterAfter = await call('GET', '/master');
check(masterAfter.data.master.content.summary.startsWith('Backend engineer with 4 years'), 'Master CV unchanged after tailoring');

// 15. versions list
const versions = await call('GET', '/resumes');
check(versions.data.resumes.filter((r) => r.kind === 'tailored').length >= 1, 'resume versions', `${versions.data.resumes.length} total`);

// 16. isolation
const cookieA = cookie;
cookie = '';
const emailB = `isolation_${Date.now()}@test.dev`;
await call('POST', '/auth/signup', { name: 'B', email: emailB, password: 'password123' });
const cross = await fetch(`${BASE}/resumes/${versionId}`, { headers: { cookie } });
check([403, 404].includes(cross.status), 'cross-user access blocked', `status ${cross.status}`);
cookie = cookieA;

// 17. logout
const out = await call('POST', '/auth/logout');
const meAfter = await call('GET', '/auth/me');
check(out.status === 200 && meAfter.status === 401, 'logout invalidates session');

console.log(`\n${failures === 0 ? 'ALL ACCEPTANCE CHECKS PASSED' : failures + ' CHECKS FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
