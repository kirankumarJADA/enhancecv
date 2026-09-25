// Curevo Job Saver — popup logic.

const $ = (id) => document.getElementById(id);

async function init() {
  const { apiUrl, token } = await chrome.storage.local.get(['apiUrl', 'token']);
  if (token) {
    $('connect-view').style.display = 'none';
    $('save-view').style.display = 'block';
    $('api-url').value = apiUrl || 'http://localhost:4000';
  } else {
    $('connect-view').style.display = 'block';
    $('save-view').style.display = 'none';
    $('api-url').value = apiUrl || 'http://localhost:4000';
  }
}

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text;
  el.className = kind || '';
}

$('connect').addEventListener('click', async () => {
  const apiUrl = $('api-url').value.trim().replace(/\/$/, '');
  const token = $('api-token').value.trim();
  if (!apiUrl || !token) {
    setStatus('API URL and token are both required.', 'err');
    return;
  }
  // Validate the token against the API before storing it.
  try {
    const res = await fetch(`${apiUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setStatus('Token rejected by the API — generate a new one in Curevo AI.', 'err');
      return;
    }
    await chrome.storage.local.set({ apiUrl, token });
    await init();
    setStatus('Connected.', 'ok');
  } catch {
    setStatus('Could not reach the API URL.', 'err');
  }
});

$('disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove(['apiUrl', 'token']);
  await init();
  setStatus('Disconnected.', 'ok');
});

$('save').addEventListener('click', async () => {
  $('save').disabled = true;
  setStatus('Extracting job from this page…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('No active tab.', 'err');
      return;
    }
    const extract = await chrome.tabs.sendMessage(tab.id, { type: 'CUREVO_EXTRACT_JOB' });
    if (!extract?.ok || !extract.job) {
      setStatus('No job structure found on this page. Paste the description into Curevo manually instead.', 'err');
      return;
    }
    const jobEl = $('job');
    jobEl.style.display = 'block';
    jobEl.innerHTML = `<b>${(extract.job.title || 'Untitled job').replace(/</g, '&lt;')}</b><span class="muted">${(extract.job.company || '').replace(/</g, '&lt;')}</span>`;

    const saved = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CUREVO_SAVE_JOB', job: extract.job }, resolve);
    });
    if (saved?.ok) {
      setStatus('Saved! Open Curevo → Find Jobs → Saved Jobs to see fit analysis.', 'ok');
    } else {
      setStatus(saved?.error || 'Save failed.', 'err');
    }
  } catch (err) {
    setStatus('This page cannot be read (browser-restricted page or missing content script).', 'err');
  } finally {
    $('save').disabled = false;
  }
});

init();
