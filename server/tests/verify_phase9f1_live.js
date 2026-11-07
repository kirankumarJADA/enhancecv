const https = require('https');

function request(options, postData) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', err => resolve({ status: 'ERR', error: err.message }));
    if (postData) req.write(postData);
    req.end();
  });
}

async function verifyAll() {
  console.log('--- Probing Render commit 98aed509 ---');
  const base = 'curevo-ai.onrender.com';

  // 1. Status
  const s = await request({ hostname: base, path: '/api/public/interview/status', method: 'GET' });
  console.log('1. GET /api/public/interview/status:', s.status, s.body.slice(0, 160));

  // 2. Prep
  const prepPayload = JSON.stringify({
    jobTitle: 'Senior Full Stack Engineer',
    jobDescription: 'TypeScript React Node.js AWS microservices',
    category: 'all'
  });
  const p = await request({
    hostname: base,
    path: '/api/public/interview/prep',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(prepPayload) }
  }, prepPayload);
  console.log('2. POST /api/public/interview/prep:', p.status, p.body.slice(0, 160));

  // 3. STAR Coach
  const starPayload = JSON.stringify({
    question: 'Describe a challenging bug you fixed in production.',
    star: {
      situation: 'Payment gateway crashed under peak load with 504 errors.',
      task: 'Identify root cause and resolve without user disruption.',
      action: 'Profiled postgres connections, added pool timeouts and redis cache.',
      result: 'Reduced latency by 70% and handled 3x load with zero downtime.'
    }
  });
  const sc = await request({
    hostname: base,
    path: '/api/public/interview/star-coach',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(starPayload) }
  }, starPayload);
  console.log('3. POST /api/public/interview/star-coach:', sc.status, sc.body.slice(0, 160));

  // 4. Mock Evaluate
  const mePayload = JSON.stringify({
    question: 'Tell me about yourself.',
    category: 'hr',
    answer: 'I am a software engineer with extensive experience building scalable web applications with React and TypeScript.'
  });
  const me = await request({
    hostname: base,
    path: '/api/public/interview/mock-evaluate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(mePayload) }
  }, mePayload);
  console.log('4. POST /api/public/interview/mock-evaluate:', me.status, me.body.slice(0, 160));

  // 5. Mock Final
  const mfPayload = JSON.stringify({
    jobTitle: 'Senior Full Stack Engineer',
    questionsAndAnswers: [{
      question: 'Tell me about yourself.',
      category: 'hr',
      answer: 'I am a software engineer with extensive experience building scalable web applications with React and TypeScript.',
      score: 85,
      feedback: 'Clear and structured introduction.'
    }]
  });
  const mf = await request({
    hostname: base,
    path: '/api/public/interview/mock-final',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(mfPayload) }
  }, mfPayload);
  console.log('5. POST /api/public/interview/mock-final:', mf.status, mf.body.slice(0, 160));
}

verifyAll().catch(console.error);
