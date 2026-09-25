// Curevo Job Saver — content script.
// Extracts job fields from VISIBLE page content using common structural
// patterns (JSON-LD JobPosting, then schema-like selectors, then meta tags).
// It never bypasses logins, CAPTCHAs or anti-bot mechanisms: if a page does
// not expose a job structure, extraction simply fails and the user can paste
// the description into Curevo manually.

(function () {
  'use strict';

  function pick(obj, keys) {
    for (const k of keys) {
      if (obj && obj[k] != null && String(obj[k]).trim()) return String(obj[k]).trim();
    }
    return '';
  }

  function fromJsonLd() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        let parsed;
        try {
          parsed = JSON.parse(s.textContent || '{}');
        } catch {
          continue;
        }
        const candidates = Array.isArray(parsed) ? parsed : [parsed, ...((parsed['@graph'] || []))];
        const posting = candidates.find((c) => c && String(c['@type'] || '').includes('JobPosting'));
        if (posting) {
          const org = posting.hiringOrganization || {};
          const loc = posting.jobLocation || {};
          const addr = loc.address || {};
          const sal = posting.baseSalary || {};
          const val = sal.value || {};
          return {
            title: pick(posting, ['title', 'name']),
            company: pick(org, ['name']),
            location: [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', '),
            salary: val.minValue || val.maxValue ? `${val.minValue || ''}${val.maxValue && val.maxValue !== val.minValue ? '–' + val.maxValue : ''} ${sal.currency || ''}`.trim() : pick(posting, ['salary']),
            description: (posting.description || '').replace(/<[^>]+>/g, '\n').trim(),
            url: location.href,
          };
        }
      }
    } catch {
      // fall through
    }
    return null;
  }

  function fromSelectors() {
    const q = (selectors) => {
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
      }
      return '';
    };
    const title = q([
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      '.jobsearch-JobInfoHeader-title',
      'h1[data-automation-id="jobPostingHeader"]',
      '.posting-headline h2',
      'h1.topcard__title',
      'h1.jobs-top-card__title',
      'h1',
    ]);
    const company = q([
      '[data-testid="inlineHeader-companyName"]',
      '.jobsearch-InlineCompanyRating a',
      '.topcard__org-name-link',
      'span[data-automation-id="postingCompanyName"]',
      '.company',
    ]);
    const location = q([
      '[data-testid="jobsearch-JobInfoHeader-subtitle"] .location',
      '.topcard__flavor--bullet',
      'span[data-automation-id="location"]',
      '.location',
    ]);
    const description = q([
      '#jobDescriptionText',
      '[data-automation-id="jobPostingDescription"]',
      '.description__text',
      '.show-more-less-html__markup',
      '.job-description',
    ]);
    if (!title || !description) return null;
    return { title, company, location, salary: '', description, url: location.href };
  }

  function fromMeta() {
    const meta = (name) => {
      const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
      return el ? el.getAttribute('content') || '' : '';
    };
    const title = meta('og:title');
    const description = meta('og:description') || meta('description');
    if (!title) return null;
    return { title, company: meta('og:site_name'), location: '', salary: '', description, url: location.href };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'CUREVO_EXTRACT_JOB') {
      const job = fromJsonLd() || fromSelectors() || fromMeta();
      sendResponse({ ok: !!job, job });
    }
    return true;
  });
})();
