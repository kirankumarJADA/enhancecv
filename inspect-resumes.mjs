// Detailed content inspection of tailored resumes
const http = require('http');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, data: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('=== REAL-WORLD RESUME QUALITY AUDIT ===\n');
  
  // Test 1: Java Backend Developer
  console.log('--- Test 1: Java Backend Developer ---');
  const signup1 = await fetch('http://localhost:4000/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Java Dev', email: 'java1@test.dev', password: 'password123' })
  });
  
  // Save master CV with Java profile
  const masterSave1 = await fetch('http://localhost:4000/api/master', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie: signup1.headers['set-cookie'][0].split(';')[0]
    },
    body: JSON.stringify({ 
      resume: {
        personal: { fullName: 'Priya Patel', email: 'priya.patel@email.com', phone: '+1 555 0101', location: 'San Francisco, CA', linkedin: 'linkedin.com/in/priyapatel', github: 'github.com/priyapatel', headline: 'Java Backend Developer' },
        summary: 'Backend engineer with 5 years of experience building RESTful services and microarchitectures in Java and Spring Boot. Designed payment systems handling 500k+ daily transactions. Optimized PostgreSQL and MySQL databases for high throughput. Built CI/CD pipelines with Docker and Jenkins.',
        experience: [
          { id: 'exp_1', company: 'TechCorp Industries', title: 'Senior Java Developer', location: 'San Francisco, CA', startDate: '06/2020', endDate: 'Present', current: true, bullets: [
            'Designed and implemented REST APIs with Spring Boot serving 750k daily requests',
            'Optimized PostgreSQL queries reducing average response time by 45%',
            'Built event-driven architectures using Kafka and Redis for real-time data processing',
            'Designed microservices architecture using Docker and Kubernetes, reducing deployment time from 30 minutes to 3 minutes',
            'Led code reviews and mentored junior developers on Spring best practices'
          ]},
          { id: 'exp_2', company: 'DataFlow Systems', title: 'Java Developer', location: 'Austin, TX', startDate: '01/2019', endDate: '05/2020', current: false, bullets: [
            'Developed Java microservices using Spring Boot and Cloud Stream',
            'Implemented Redis caching reducing database load by 60%',
            'Wrote unit and integration tests achieving 85% code coverage',
            'Participated in Agile ceremonies and sprint planning'
          ]}
        ],
        projects: [
          { id: 'prj_1', name: 'Transaction Service', link: 'github.com/priyapatel/transactionsvc', description: 'High-throughput transaction processing service', bullets: ['Processed 2M transactions daily with 99.99% success rate'], tech: ['Java', 'Spring Boot', 'PostgreSQL', 'Redis', 'Kafka'] },
          { id: 'prj_2', name: 'Cache Service', link: 'github.com/priyapatel/cachesvc', description: 'Distributed caching layer', bullets: ['Built Redis-based cache reducing DB calls by 70%'], tech: ['Java', 'Spring', 'Redis', 'Lettuce'] }
        ],
        education: [
          { id: 'edu_1', institution: 'Stanford University', degree: 'MSc', field: 'Computer Science', startDate: '2017', endDate: '2019', grade: '3.8/4.0' },
          { id: 'edu_2', institution: 'University of California', degree: 'BSc', field: 'Mathematics', startDate: '2014', endDate: '2017', grade: '3.9/4.0' }
        ],
        skills: { technical: ['Java', 'Spring Boot', 'Spring', 'PostgreSQL', 'MySQL', 'Redis', 'Kafka', 'Docker', 'Kubernetes', 'Maven', 'Gradle', 'Git', 'JUnit', 'Mockito'], soft: ['Leadership', 'Mentoring', 'Problem Solving', 'Communication', 'Agile Methodologies'] },
        certifications: [{ id: 'cert_1', name: 'Oracle Certified Professional: Java SE 11', issuer: 'Oracle', year: '2021' }],
        languages: [{ id: 'lang_1', name: 'English', proficiency: 'Native' }, { id: 'lang_2', name: 'Hindi', proficiency: 'Conversational' }],
        achievements: ['Won internal hackathon 2023 with automated reconciliation prototype'],
        sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
        hiddenSections: []
      }, title: 'Master CV' })
    }
  });
  console.log('Master CV saved:', masterSave1.data.atsScore);
  
  // JD analysis
  const jdText1 = 'Senior Java Backend Engineer\n\nNomos Bank is building the next generation of its digital banking platform and looking for a Senior Java Backend Engineer to join our Payments team in Manchester (hybrid).\n\nAbout the role\nYou will design and build high-throughput payment services used by over 2 million customers, working closely with product and platform teams.\n\nWhat you\'ll do\n- Design, build and operate REST APIs and microservices in Java 17 and Spring Boot\n- Improve reliability and observability of payment flows (Kafka, Prometheus, Grafana)\n- Optimise PostgreSQL data models and queries for scale\n- Champion CI/CD, automated testing and code review culture\n- Mentor mid-level engineers and lead design reviews\n\nWhat we\'re looking for\n- 5+ years of backend engineering experience with Java and Spring Boot\n- Strong REST API design and microservices experience\n- Solid PostgreSQL and query optimisation skills\n- Experience with Docker and Kubernetes in production\n- Experience with Kafka or similar message queues\n- Bachelor\'s degree in Computer Science or equivalent practical experience\n\nNice to have\n- AWS (EKS, RDS) and Terraform experience\n- Experience in fintech or payments\n- Kubernetes certification (CKA) is a plus\n\nWe offer competitive salary, hybrid working, and a genuine commitment to engineering culture.';
  
  const jd1 = await fetch('http://localhost:4000/api/jobs/analyse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: signup1.headers['set-cookie'][0].split(';')[0] },
    body: JSON.stringify({ text: jdText1 })
  });
  console.log('JD analysis title:', jd1.data.analysis.title);
  console.log('Required skills:', jd1.data.analysis.requiredSkills);
  console.log('Preferred skills:', jd1.data.analysis.preferredSkills);
  console.log('Soft skills:', jd1.data.analysis.softSkills);
  
  // Match
  const match1 = await fetch('http://localhost:4000/api/jobs/' + jd1.data.jobId + '/match', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: signup1.headers['set-cookie'][0].split(';')[0] }
  });
  console.log('Match score:', match1.data.match.score);
  console.log('Matched skills count:', match1.data.match.matchedSkills.length);
  console.log('Partial skills count:', match1.data.match.partialSkills.length);
  console.log('Missing skills count:', match1.data.match.missingSkills.length);
  console.log('Matched:', match1.data.match.matchedSkills);
  console.log('Missing:', match1.data.match.missingSkills);
  
  // Tailor
  const tailor1 = await fetch('http://localhost:4000/api/jobs/' + jd1.data.jobId + '/tailor', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: signup1.headers['set-cookie'][0].split(';')[0] }
  });
  console.log('Tailor - ATS before:', tailor1.data.before.ats, 'after:', tailor1.data.after.ats);
  console.log('Truth passed:', tailor1.data.truth.passedAll);
  console.log('Auto fixed:', tailor1.data.truth.autoFixed.length);
  console.log('Change log length:', tailor1.data.changeLog.length);
  
  // Inspect tailored resume content
  const tailoredResume1 = tailor1.data.resume;
  console.log('\\n=== Tailored Resume Content (Java) ===');
  console.log('Summary:', tailoredResume1.summary ? tailoredResume1.summary.substring(0, 200) + '...' : 'empty');
  console.log('Experience count:', tailoredResume1.experience.length);
  for (const exp of tailoredResume1.experience) {
    console.log('  Role:', exp.title, 'at', exp.company);
    console.log('  Bullets:');
    for (const b of exp.bullets) {
      console.log('    -', b);
    }
  }
  console.log('Skills:', tailoredResume1.skills.technical.join(', '));
  console.log('Projects:', tailoredResume1.projects.length);
  for (const p of tailoredResume1.projects) {
    console.log('  -', p.name, ':', p.bullets[0] || 'no bullets');
  }
  
  // Check for fabrication
  const allText = JSON.stringify(tailoredResume1);
  const forbidden = ['Terraform', 'Azure', 'GCP', 'Kubernetes'];
  const found = forbidden.filter(f => allText.includes(f));
  console.log('Fabrication check (no Terraform/Azure/GCP/Kubernetes):', found.length === 0 ? 'PASS' : 'FAIL - ' + found);
  
  // Check years consistency
  const yearRegex = /\b(19|20)\d{2}\/present|\b(19|20)\d{2}\s*-\s*(19|20)\d{2}/gi;
  const yearsFound = allText.match(yearRegex);
  console.log('Years in resume:', yearsFound);
  
  console.log('\\n--- Test 2: React Frontend Developer ---');
  // ... similar for other profiles
  
  console.log('\\n=== AUDIT COMPLETE ===');
}

main().catch(e => console.error(e));