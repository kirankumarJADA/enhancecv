import { makeMasterCV, JAVA_JD } from './fixtures';

async function checkCritique() {
  const master = makeMasterCV();
  const res = await fetch('https://curevo-ai.onrender.com/api/public/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume: master, jobText: JAVA_JD }),
  });
  const data = (await res.json()) as any;
  console.log('AGENT:', JSON.stringify(data.agent, null, 2));
}

checkCritique().catch(console.error);
