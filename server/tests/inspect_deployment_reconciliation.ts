async function inspectDeployment() {
  console.log('--- INSPECTING RENDER DEPLOYMENT ---');
  try {
    const res = await fetch('https://curevo-ai.onrender.com/api/public/status');
    console.log('Status:', res.status, res.statusText);
    console.log('Headers:');
    for (const [k, v] of res.headers.entries()) {
      console.log(`  ${k}: ${v}`);
    }
    const body = await res.text();
    console.log('Body:', body);
  } catch (err: any) {
    console.error('Render check failed:', err.message);
  }

  console.log('\n--- INSPECTING VERCEL DEPLOYMENT ---');
  try {
    const res = await fetch('https://enhancecv-orpin.vercel.app/');
    console.log('Status:', res.status, res.statusText);
    console.log('Headers:');
    for (const [k, v] of res.headers.entries()) {
      console.log(`  ${k}: ${v}`);
    }
    const html = await res.text();
    console.log('HTML preview (first 400 chars):\n', html.slice(0, 400));
    const assetMatches = html.match(/src="(\/assets\/[^"]+)"/g) || [];
    console.log('Referenced assets in deployed index.html:', assetMatches);
  } catch (err: any) {
    console.error('Vercel check failed:', err.message);
  }
}

inspectDeployment();
