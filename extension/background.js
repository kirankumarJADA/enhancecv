// Curevo Job Saver — service worker. Holds no secrets: the user's API token
// lives in chrome.storage.local and is sent only to the Curevo API origin.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'CUREVO_SAVE_JOB') {
    (async () => {
      try {
        const { apiUrl, token } = await chrome.storage.local.get(['apiUrl', 'token']);
        if (!token) {
          sendResponse({ ok: false, error: 'Not connected. Open the popup and connect your Curevo account first.' });
          return;
        }
        const base = (apiUrl || 'http://localhost:4000').replace(/\/$/, '');
        const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

        const post = (path, body) =>
          fetch(`${base}${path}`, { method: 'POST', headers: auth, body: JSON.stringify(body) });

        // Preferred path: server-side URL import (consistent parsing + fit).
        let res = await post('/api/jobs/import-url', { url: msg.job.url });
        if (res.status === 401) {
          sendResponse({ ok: false, error: 'Token rejected — reconnect your account in the popup.' });
          return;
        }
        if (res.status === 402) {
          sendResponse({ ok: false, error: 'Monthly import limit reached on your plan.' });
          return;
        }
        if (!res.ok) {
          // Login-walled or JS-rendered pages: fall back to the fields the
          // content script extracted from the VISIBLE page (no scraping of
          // protected content — if the page showed it to the user, it is
          // user-provided data).
          const first = await res.json().catch(() => ({}));
          if (first?.error?.code === 'IMPORT_FAILED' && msg.job.description && msg.job.title) {
            res = await post('/api/jobs/import-paste', {
              url: msg.job.url,
              title: msg.job.title,
              company: msg.job.company,
              location: msg.job.location,
              salary: msg.job.salary,
              description: msg.job.description,
            });
          }
        }
        if (res.status === 401) {
          sendResponse({ ok: false, error: 'Token rejected — reconnect your account in the popup.' });
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          sendResponse({ ok: false, error: body?.error?.message || `Import failed (${res.status}).` });
          return;
        }
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : 'Unexpected error.' });
      }
    })();
    return true; // async sendResponse
  }
});
