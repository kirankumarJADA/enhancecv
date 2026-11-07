import { makeMasterCV, JAVA_JD } from './fixtures';

async function verifyAllEndpoints() {
  console.log('=== VERIFYING ALL PRODUCTION ENDPOINTS ===');
  console.log('Target: https://curevo-ai.onrender.com\n');
  const master = makeMasterCV();
  const results: any[] = [];

  // 1. GET /api/health
  {
    const started = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/health');
    const data: any = await res.json();
    console.log(`1. GET /api/health -> HTTP ${res.status} (${Date.now() - started}ms)`, data);
    results.push({ endpoint: 'GET /api/health', status: res.status, ok: res.ok && data.ok === true });
  }

  // 2. GET /api/public/status
  {
    const started = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/public/status');
    const data: any = await res.json();
    console.log(`2. GET /api/public/status -> HTTP ${res.status} (${Date.now() - started}ms)`, data);
    results.push({ endpoint: 'GET /api/public/status', status: res.status, ok: res.ok && data.enabled === true });
  }

  // 3. POST /api/public/ats
  {
    const started = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/public/ats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume: master }),
    });
    const data = (await res.json()) as any;
    const dims = data.audit?.dimensions ? Object.keys(data.audit.dimensions).length : 0;
    console.log(`3. POST /api/public/ats -> HTTP ${res.status} (${Date.now() - started}ms), Score: ${data.ats?.overallScore}, Dimensions: ${dims}`);
    results.push({ endpoint: 'POST /api/public/ats', status: res.status, ok: res.ok && dims === 9 });
  }

  // 4. POST /api/public/cover-letter
  let letter: any = null;
  {
    const started = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/public/cover-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume: master,
        jobDescription: JAVA_JD,
        company: 'Nomos Bank',
        targetRole: 'Senior Java Backend Engineer',
      }),
    });
    const data = (await res.json()) as any;
    letter = data.letter;
    console.log(`4. POST /api/public/cover-letter -> HTTP ${res.status} (${Date.now() - started}ms), Paragraphs: ${letter?.paragraphs?.length}`);
    results.push({ endpoint: 'POST /api/public/cover-letter', status: res.status, ok: res.ok && Boolean(letter) });
  }

  // 5. POST /api/public/pdf
  {
    const started = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/public/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume: master, template: 'modern', spacing: 'compact' }),
    });
    const bytes = await res.arrayBuffer();
    const header = Buffer.from(bytes.slice(0, 5)).toString();
    console.log(`5. POST /api/public/pdf -> HTTP ${res.status} (${Date.now() - started}ms), Size: ${bytes.byteLength} bytes, Header: ${header}`);
    results.push({ endpoint: 'POST /api/public/pdf', status: res.status, ok: res.ok && header === '%PDF-' });
  }

  // 6. POST /api/public/cover-letter/pdf
  {
    const started = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/public/cover-letter/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letter: letter,
        candidateName: master.personal.fullName,
        role: 'Senior Java Backend Engineer',
        company: 'Nomos Bank',
        pageSize: 'A4',
      }),
    });
    const bytes = await res.arrayBuffer();
    const header = Buffer.from(bytes.slice(0, 5)).toString();
    console.log(`6. POST /api/public/cover-letter/pdf -> HTTP ${res.status} (${Date.now() - started}ms), Size: ${bytes.byteLength} bytes, Header: ${header}`);
    results.push({ endpoint: 'POST /api/public/cover-letter/pdf', status: res.status, ok: res.ok && header === '%PDF-' });
  }

  console.log('\nSUMMARY TABLE:');
  console.table(results);
  const allPass = results.every((r) => r.ok);
  console.log(`\nALL ENDPOINTS FUNCTIONAL: ${allPass ? 'YES (100% OPERATIONAL)' : 'NO'}`);
  process.exit(allPass ? 0 : 1);
}

verifyAllEndpoints().catch(console.error);
