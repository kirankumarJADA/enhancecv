import { makeMasterCV, JAVA_JD } from './fixtures';

async function verifyPhase8Production() {
  console.log('========================================================================');
  console.log('PHASE 8 PRODUCTION VERIFICATION');
  console.log('Target Backend:  https://curevo-ai.onrender.com');
  console.log('Target Frontend: https://enhancecv-orpin.vercel.app');
  console.log(`Started At: ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  const results: Record<string, any> = {};

  // 1. GET /api/health
  console.log('[1/7] Probing GET /api/health...');
  try {
    const t0 = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/health');
    const data = await res.json();
    const duration = Date.now() - t0;
    console.log(`  Status: HTTP ${res.status} (${duration}ms)`);
    console.log('  Data:', JSON.stringify(data));
    results.health = { status: res.status, duration, data };
  } catch (err: any) {
    console.error('  Health probe failed:', err.message);
    results.health = { error: err.message };
  }

  // 2. GET /api/public/status
  console.log('\n[2/7] Probing GET /api/public/status...');
  try {
    const t0 = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/public/status');
    const data = await res.json();
    const duration = Date.now() - t0;
    console.log(`  Status: HTTP ${res.status} (${duration}ms)`);
    console.log('  Data:', JSON.stringify(data));
    results.status = { status: res.status, duration, data };
  } catch (err: any) {
    console.error('  Status probe failed:', err.message);
    results.status = { error: err.message };
  }

  // 3. Probing Malformed JSON: POST /api/public/parse
  console.log('\n[3/7] Probing POST /api/public/parse with malformed JSON ({invalid json)...');
  try {
    const t0 = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/public/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json here',
    });
    const text = await res.text();
    const duration = Date.now() - t0;
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    console.log(`  Status: HTTP ${res.status} (${duration}ms)`);
    console.log('  Body:', text);
    results.malformedParse = { status: res.status, duration, body: json || text };
  } catch (err: any) {
    console.error('  Malformed parse probe failed:', err.message);
    results.malformedParse = { error: err.message };
  }

  // 3b. Probing Malformed JSON: POST /api/public/ats
  console.log('\n[3b/7] Probing POST /api/public/ats with malformed JSON...');
  try {
    const t0 = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/public/ats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"resume": [bad json',
    });
    const text = await res.text();
    const duration = Date.now() - t0;
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    console.log(`  Status: HTTP ${res.status} (${duration}ms)`);
    console.log('  Body:', text);
    results.malformedAts = { status: res.status, duration, body: json || text };
  } catch (err: any) {
    console.error('  Malformed ATS probe failed:', err.message);
    results.malformedAts = { error: err.message };
  }

  // 4. Probing Valid JSON: POST /api/public/ats
  console.log('\n[4/7] Probing POST /api/public/ats with valid resume data...');
  try {
    const master = makeMasterCV();
    const t0 = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/public/ats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume: master }),
    });
    const data: any = await res.json();
    const duration = Date.now() - t0;
    console.log(`  Status: HTTP ${res.status} (${duration}ms)`);
    console.log(`  Score: ${data.audit?.overallScore ?? data.ats?.score}/100`);
    console.log(`  Dimensions count: ${Object.keys(data.audit?.dimensions || {}).length}`);
    results.validAts = {
      status: res.status,
      duration,
      score: data.audit?.overallScore ?? data.ats?.score,
      dimensions: Object.keys(data.audit?.dimensions || {}),
    };
  } catch (err: any) {
    console.error('  Valid ATS probe failed:', err.message);
    results.validAts = { error: err.message };
  }

  // 5. Probing Oversized Payload: POST /api/public/ats (>1MB limit)
  console.log('\n[5/7] Probing POST /api/public/ats with oversized payload (1.5 MB)...');
  try {
    const hugePayload = JSON.stringify({ data: 'X'.repeat(1.5 * 1024 * 1024) });
    const t0 = Date.now();
    const res = await fetch('https://curevo-ai.onrender.com/api/public/ats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hugePayload,
    });
    const text = await res.text();
    const duration = Date.now() - t0;
    console.log(`  Status: HTTP ${res.status} (${duration}ms)`);
    console.log('  Body:', text);
    results.oversized = { status: res.status, duration, body: text };
  } catch (err: any) {
    console.error('  Oversized probe failed:', err.message);
    results.oversized = { error: err.message };
  }

  // 6. Probing Vercel Frontend
  console.log('\n[6/7] Probing Vercel Frontend (https://enhancecv-orpin.vercel.app)...');
  try {
    const t0 = Date.now();
    const res = await fetch('https://enhancecv-orpin.vercel.app');
    const html = await res.text();
    const duration = Date.now() - t0;
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : 'Unknown';
    const hasScript = html.includes('/assets/index-');
    console.log(`  Status: HTTP ${res.status} (${duration}ms)`);
    console.log(`  Title: "${title}"`);
    console.log(`  Has bundled script: ${hasScript}`);
    results.frontend = { status: res.status, duration, title, hasScript };
  } catch (err: any) {
    console.error('  Frontend probe failed:', err.message);
    results.frontend = { error: err.message };
  }

  // 7. Summary & Deployment Assessment
  console.log('\n========================================================================');
  console.log('PROBE SUMMARY & DEPLOYED COMMIT RECONCILIATION:');
  const isMalformedFixed =
    results.malformedParse?.status === 400 || results.malformedAts?.status === 400;
  console.log(`  Malformed JSON returns HTTP 400: ${isMalformedFixed}`);
  if (isMalformedFixed) {
    console.log('  -> Render IS running commit 154b879 (or later) containing the 400 MALFORMED_JSON mapping!');
  } else {
    console.log('  -> Render is still running a pre-154b879 deployment (returned HTTP 500 on malformed JSON).');
    console.log('  -> Manual Deploy on Render dashboard required for commit 154b879.');
  }
  console.log('========================================================================\n');

  return results;
}

verifyPhase8Production()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
