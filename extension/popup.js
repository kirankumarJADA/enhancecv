// Curevo Job Saver — Chrome Extension Popup (Phase 9N)
//
// 100% Anonymous & Public: Detects job on active tab and transfers directly
// into Curevo AI's web app without login walls.

const $ = (id) => document.getElementById(id);

let currentJob = null;
const CUREVO_APP_URL = 'https://enhancecv-orpin.vercel.app';

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text;
  el.className = kind || '';
}

async function extractActiveTabJob() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showEmpty();
      return;
    }

    // Send extract message to content script
    let res;
    try {
      res = await chrome.tabs.sendMessage(tab.id, { type: 'CUREVO_EXTRACT_JOB' });
    } catch {
      // Content script may not be injected on this page (e.g. chrome:// or restricted page)
      showEmpty();
      return;
    }

    if (res?.ok && res.job && (res.job.title || res.job.company)) {
      currentJob = res.job;
      $('loading-view').style.display = 'none';
      $('empty-view').style.display = 'none';
      $('job-view').style.display = 'block';

      $('job-title').value = res.job.title || '';
      $('job-company').value = res.job.company || '';
      $('job-location').value = res.job.location || 'Remote';
    } else {
      showEmpty();
    }
  } catch {
    showEmpty();
  }
}

function showEmpty() {
  $('loading-view').style.display = 'none';
  $('job-view').style.display = 'none';
  $('empty-view').style.display = 'block';
}

$('open-curevo').addEventListener('click', () => {
  const title = $('job-title').value.trim();
  const company = $('job-company').value.trim();
  const location = $('job-location').value.trim();
  const desc = currentJob?.description || '';

  const params = new URLSearchParams({
    import_title: title,
    import_company: company,
    import_location: location,
  });

  if (desc) {
    params.set('import_description', desc.slice(0, 3000));
  }

  const targetUrl = `${CUREVO_APP_URL}/jobs?${params.toString()}`;
  chrome.tabs.create({ url: targetUrl });
});

$('copy-json').addEventListener('click', async () => {
  const jobPayload = {
    title: $('job-title').value.trim(),
    company: $('job-company').value.trim(),
    location: $('job-location').value.trim(),
    salary: currentJob?.salary || 'Competitive',
    remote_type: /remote/i.test($('job-location').value) ? 'remote' : 'on-site',
    employment_type: 'Full-time',
    description: currentJob?.description || '',
    requirements: currentJob?.requirements || '',
    technologies: currentJob?.technologies || [],
    url: currentJob?.url || '',
    source: 'Chrome Extension',
    saved_at: new Date().toISOString(),
  };

  try {
    await navigator.clipboard.writeText(JSON.stringify(jobPayload, null, 2));
    setStatus('✓ Copied to clipboard! Ready to paste into Curevo AI.', 'ok');
  } catch {
    setStatus('Failed to copy to clipboard.', 'err');
  }
});

$('open-blank-curevo')?.addEventListener('click', () => {
  chrome.tabs.create({ url: `${CUREVO_APP_URL}/jobs` });
});

extractActiveTabJob();
