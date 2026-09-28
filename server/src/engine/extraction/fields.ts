// Field/entity extraction over section spans: contact header, experience
// entries (highest priority — internships are real experience), education,
// skills, projects, certifications vs interests, languages, achievements.
// Everything is deterministic: keyword lists + positional heuristics, no AI.

import type { ParsedLine, SectionSpan } from './types';
import { findDateRange } from './dates';
import { isBulletLine, stripBulletPrefix, normalizeWhitespace } from '../../lib/text';
import { splitSkillList, SOFT_SKILLS, findSkillsInText } from '../../lib/skills';

export function makeId(prefix: string, n: number): string {
  return `${prefix}_${n}_${Math.random().toString(36).slice(2, 8)}`;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;
const EMAIL_RE_G = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const PHONE_TOKEN_RE = /^[+()0-9.\-–—]+$/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|profile|pub)\/[a-z0-9\-_%]+/i;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-z0-9\-_]+(?:\/[a-z0-9\-_.]+)?/i;
const URL_TOKEN_RE = /(?:https?:\/\/|www\.)[^\s,|;<>"'）)]+/gi;
const BARE_DOMAIN_RE = /(?:^|[\s(（"'|])([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)\b(?![\w.])/gi;

const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com',
  'protonmail.com', 'proton.me', 'aol.com', 'zoho.com', 'ymail.com', 'googlemail.com', 'mail.com',
]);
/** Coding-platform / social profile hosts — real links, but never a portfolio. */
const SOCIAL_PROFILE_HOSTS = new Set([
  'leetcode.com', 'hackerrank.com', 'codechef.com', 'codeforces.com', 'topcoder.com',
  'kaggle.com', 'twitter.com', 'x.com', 'instagram.com', 'facebook.com',
  'reddit.com', 'quora.com', 'stackoverflow.com', 'hackerone.com',
]);

function isSocialProfileHost(host: string): boolean {
  return (
    SOCIAL_PROFILE_HOSTS.has(host) ||
    [...SOCIAL_PROFILE_HOSTS].some((h) => host.endsWith(`.${h}`))
  );
}
const BARE_TLD_ALLOW = new Set([
  'dev', 'io', 'me', 'app', 'site', 'tech', 'xyz', 'ai', 'design', 'blog', 'page', 'codes', 'works', 'link',
]);
const FILE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|pdf|docx?|xlsx?|pptx?|zip|mp4)$/i;
const LINKEDIN_LABELED_RE = /linkedin(?:\.com\/in)?\s*[:\-–]\s*([a-z0-9-]{3,})/i;
const GITHUB_LABELED_RE = /github(?:\.com)?\s*[:\-–]\s*([a-z0-9-]{2,})/i;

const ROLE_KEYWORD_RE = new RegExp(
  '\\b(intern|internship|trainee|apprentice|engineer|engineering|developer|development|scientist|' +
  'analyst|manager|consultant|associate|administrator|specialist|architect|designer|lead|head|' +
  'director|officer|executive|coordinator|technician|researcher|research\\s+fellow|fellow|resident|' +
  'programmer|contributor|assistant|advisor|tutor|mentor|freelancer|freelance|founder|co-?founder)\\b',
  'i',
);
const COMPANY_KEYWORD_RE = new RegExp(
  '\\b(pvt\\.?|private|ltd\\.?|limited|llp|llc|inc\\.?|incorporated|corp(oration)?|company|' +
  'technolog(y|ies)|solutions?|systems?|labs?|laboratories|software|services?|consulting|consultancy|' +
  'group|holdings|enterprises?|academy|institute|foundation|associates|partners|media|studios?|' +
  'eduskills|aicte|neat|bank|industries|ventures|communications|networks|digital|labs)\\b',
  'i',
);
const LOCATION_ONLY_RE = /^(remote|hybrid|on-?site|work\s+from\s+home|wfh)\b/i;
const CITY_LOCATION_RE = /^[A-Z][a-zA-Z.'’-]+(?:\s[A-Z][a-zA-Z.'’-]+)*,\s*(?:[A-Z]{2}\b|[A-Z][a-zA-Z]+)$/;
const LOCATION_INLINE_RE = /\b([A-Z][a-zA-Z.'’-]+(?:\s[A-Z][a-zA-Z.'’-]+)*),\s*(?:[A-Z]{2}\b|[A-Z][a-zA-Z]+)\b/;
// Degree vocabulary (case/punctuation tolerant). Alternation is ordered so
// longer tokens win: "BSc" must match b sc before b s, "BBA" before "BA".
const DEGREE_RE = /\b(b\.?\s?tech|b\.?\s?sc|b\.?\s?com|b\.?\s?b\.?\s?a\.?|b\.?\s?a\.?|b\.?\s?s\.?|b\.?\s?e\.?|bachelor'?s?|master'?s?|m\.?\s?tech|m\.?\s?sc|m\.?\s?com|m\.?\s?b\.?\s?a\.?|m\.?\s?a\.?|m\.?\s?s\.?|m\.?\s?e\.?|mba|mbbs|ph\.?\s?d|doctorate|post\s+graduate\s+diploma|pg\s+diploma|diploma|associate(?:'s)?\s+degree|beng|meng|hnd|a[\s-]?levels?|hsc|sslc|intermediate)\b/i;
const INSTITUTION_RE = /\b(university|institute|college|school|polytechnic|vidyalaya|vidyalay|academy|campus|iit|nit|iiit|vit|bits)\b/i;
// Strong institution evidence for the heading-less fallback: only these words
// mark a line as education (deliberately excludes "academy"/"campus", which
// appear in real employer names like "AWS Academy").
const STRONG_INSTITUTION_RE = /\b(university|institute|college|polytechnic|iit|nit|iiit|vidyalaya|vidyalay)\b/i;

/** Sections that must never contribute experience entries in the heading-less fallback scan. */
const NON_EXPERIENCE_KEYS = new Set([
  'summary', 'projects', 'education', 'skills', 'soft', 'certifications',
  'certifications+interests', 'languages', 'achievements', 'interests',
  'publications', 'volunteering', 'links',
]);

function lineTexts(lines: ParsedLine[]): string[] {
  return lines.map((l) => l.text.trim()).filter(Boolean);
}

function isYearRangeCandidate(candidate: string): boolean {
  const groups = candidate.match(/\d{4}/g) || [];
  return (
    groups.length === 2 &&
    candidate.replace(/\D/g, '').length === 8 &&
    groups.every((y) => Number(y) >= 1900 && Number(y) <= 2099)
  );
}

/**
 * Stitches a phone number out of adjacent visual tokens so formatting never
 * loses digits: '+91 98765 43210', '(+44) 7700-900-123', '0161 496 0008'.
 * Year ranges ('2022 - 2026') and date-bearing tokens are rejected.
 */
export function extractPhoneFromLine(line: string): string {
  let best = '';
  let run: string[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const candidate = run.join(' ').trim().replace(/[.,;:]+$/, '');
    run = [];
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return;
    if (isYearRangeCandidate(candidate)) return;
    // without a country code the local part alone must be substantial
    if (!/\+\d{1,3}|\(\d{2,4}\)/.test(candidate) && digits.length < 10) return;
    if (best === '' || digits.length > best.replace(/\D/g, '').length) best = candidate;
  };
  for (const raw of line.split(/\s+/)) {
    const token = raw.replace(/[|,;]+$/, '');
    if (/\d/.test(token) && !token.includes('/') && PHONE_TOKEN_RE.test(token)) {
      run.push(token);
    } else {
      flush();
    }
  }
  flush();
  return best;
}

// ---------------------------------------------------------------- contact

export interface ContactInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  otherLinks: string[];
}

function looksLikeName(line: string): boolean {
  const clean = line.trim().replace(/[^a-zA-Z\s'.’-]/g, '').trim();
  if (clean.length < 3 || clean.length > 50) return false;
  const words = clean.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) => /^[A-Z][a-zA-Z'’.-]*$/.test(w) || /^[A-Z.]+$/.test(w));
}

function domainOf(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLowerCase();
}

/**
 * Strict link extraction. The portfolio can only be a real personal site:
 * free-mail providers (gmail/yahoo/hotmail/outlook/…) are never portfolios,
 * the email's own domain is never a portfolio, and LinkedIn/GitHub are
 * captured into their own fields first. Remaining public links are reported
 * as otherLinks for user review.
 */
export function extractLinks(text: string): { linkedin: string; github: string; portfolio: string; otherLinks: string[] } {
  let linkedin = text.match(LINKEDIN_RE)?.[0]?.replace(/[.,;)]+$/, '') || '';
  let github = text.match(GITHUB_RE)?.[0]?.replace(/[.,;)]+$/, '') || '';

  // Remove emails FIRST so an email address can never leak into link fields.
  const emailDomain = domainOf(text.match(EMAIL_RE)?.[0] || '');
  const scrubbed = text.replace(EMAIL_RE_G, ' ');

  if (!linkedin) {
    const labeled = scrubbed.match(LINKEDIN_LABELED_RE);
    if (labeled) linkedin = `linkedin.com/in/${labeled[1]}`;
  }
  if (!github) {
    const labeled = scrubbed.match(GITHUB_LABELED_RE);
    if (labeled && !/\.github\.io$/i.test(labeled[1])) github = `github.com/${labeled[1]}`;
  }

  const candidates: string[] = [];
  for (const m of scrubbed.matchAll(URL_TOKEN_RE)) candidates.push(m[0]);
  for (const m of scrubbed.matchAll(BARE_DOMAIN_RE)) {
    const host = m[1];
    const tld = host.split('.').pop() || '';
    if (BARE_TLD_ALLOW.has(tld)) candidates.push(host);
  }

  let portfolio = '';
  const otherLinks: string[] = [];
  for (const raw of candidates) {
    const token = raw.trim().replace(/[.,;:]+$/, '');
    const host = domainOf(token);
    if (!host || !host.includes('.')) continue;
    if (FILE_EXT_RE.test(token)) continue;
    if (FREEMAIL_DOMAINS.has(host.replace(/^www\./, ''))) continue;
    if (/^www\.linkedin\.com$|^linkedin\.com$/i.test(host)) {
      if (!linkedin && /linkedin\.com\/(in|profile|pub)\//i.test(token)) {
        linkedin = token.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
      }
      continue;
    }
    if (/(^|\.)github\.com$/i.test(host)) {
      if (!github && GITHUB_RE.test(token)) {
        github = token.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
      }
      continue;
    }
    if (emailDomain && (host === emailDomain || host.endsWith(`.${emailDomain}`))) continue;
    if (isSocialProfileHost(host)) {
      if (otherLinks.length < 5 && !otherLinks.some((l) => domainOf(l) === host)) otherLinks.push(token);
      continue;
    }
    // Bare domains without a scheme are only trusted as personal sites when
    // their TLD is a known personal-site TLD (.dev/.io/.me/…); ordinary
    // "company.com" mentions in text stay out of the contact fields.
    if (!token.match(/^https?:\/\//i) && !token.match(/^www\./i)) {
      const tld = host.split('.').pop() || '';
      if (!BARE_TLD_ALLOW.has(tld)) continue;
    }
    // github.io pages are personal sites and the strongest portfolio signal;
    // any other qualifying public site can take the portfolio slot once.
    if (!portfolio) {
      portfolio = token;
    } else if (otherLinks.length < 5 && !otherLinks.some((l) => domainOf(l) === host)) {
      otherLinks.push(token);
    }
  }
  return { linkedin, github, portfolio, otherLinks };
}

export function parseContact(sections: SectionSpan[], fullText: string): { contact: ContactInfo; warnings: string[] } {
  const warnings: string[] = [];
  const headerLines = lineTexts(sections.filter((s) => s.key === 'header').flatMap((s) => s.lines)).slice(0, 14);
  const headerText = headerLines.join('\n');

  let fullName = '';
  for (const line of headerLines) {
    if (looksLikeName(line) && !EMAIL_RE.test(line) && !findDateRange(line)) {
      fullName = normalizeWhitespace(line);
      break;
    }
  }
  if (!fullName) warnings.push('Could not confidently detect your name — please set it below.');

  const email = fullText.match(EMAIL_RE)?.[0] || '';
  if (!email) warnings.push('No email detected — please add it.');

  let phone = '';
  for (const line of headerLines) {
    phone = extractPhoneFromLine(line);
    if (phone) break;
  }
  if (!phone) {
    for (const line of fullText.split('\n').slice(0, 40)) {
      phone = extractPhoneFromLine(line);
      if (phone) break;
    }
  }
  if (!phone) warnings.push('No phone number detected — please add it.');

  // Personal location: only from the contact header (never from section bodies,
  // where e.g. "NEAT Cell, AICTE" would falsely match a City, Country pattern).
  let location = '';
  for (const line of headerLines) {
    const m = line.match(LOCATION_INLINE_RE);
    if (m && !EMAIL_RE.test(line)) {
      location = m[0];
      break;
    }
  }

  const links = extractLinks(fullText);
  return {
    contact: {
      fullName,
      email,
      phone,
      location,
      linkedin: links.linkedin,
      github: links.github,
      portfolio: links.portfolio,
      otherLinks: links.otherLinks,
    },
    warnings,
  };
}

// ---------------------------------------------------------------- experience

export interface RawExperience {
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  dateDisplay: string;
  bullets: string[];
  ambiguous: boolean;
}

function roleScore(s: string): number {
  let sc = 0;
  if (ROLE_KEYWORD_RE.test(s)) sc += 3;
  if (s.split(/\s+/).length <= 7) sc += 0.5;
  if (/^[A-Z]/.test(s.trim())) sc += 0.25;
  return sc;
}

function companyScore(s: string): number {
  let sc = 0;
  if (COMPANY_KEYWORD_RE.test(s)) sc += 2;
  if (/\((?:[^)]*(?:via|by|through|in association with|curriculum))/i.test(s) || /\b(via|through)\b/i.test(s)) sc += 2;
  if (/\([^)]+\)/.test(s)) sc += 1;
  if (/^[A-Z0-9&.\- ]{2,14}$/.test(s.trim())) sc += 1; // ALL-CAPS acronym e.g. "DELOITTE"
  return sc;
}

function splitInlineHeader(text: string): string[] {
  return text
    .split(/\s*[|·]\s*|\s+[–—]\s+|,\s+|\s+at\s+|\s+@\s+/)
    .map((p) => p.replace(/^[\s•·\-–—]+|[\s|·,•\-–—]+$/g, '').trim())
    .filter(Boolean);
}

/** Assigns role/company/location among pending header candidates. */
export function assignRoleCompany(candidates: string[]): { title: string; company: string; location: string; ambiguous: boolean } {
  let title = '';
  let company = '';
  let location = '';
  let ambiguous = false;

  const rest: string[] = [];
  for (const c of candidates) {
    const t = c.trim();
    if (!t) continue;
    if (LOCATION_ONLY_RE.test(t) && t.split(/\s+/).length <= 4) {
      if (!location) location = t;
      continue;
    }
    if (CITY_LOCATION_RE.test(t) && !ROLE_KEYWORD_RE.test(t) && !COMPANY_KEYWORD_RE.test(t) && t.split(/\s+/).length <= 5) {
      if (!location) location = t;
      continue;
    }
    rest.push(t);
  }

  if (rest.length === 1) {
    const [only] = rest;
    const r = roleScore(only);
    const c = companyScore(only);
    if (c > r) company = only;
    else if (r > c) title = only;
    else if (/\(/.test(only) || /\b(pvt|ltd|llc|inc|corp)/i.test(only)) company = only;
    else { title = only; ambiguous = true; }
  } else if (rest.length >= 2) {
    const scored = rest.map((t, i) => ({ t, i, r: roleScore(t), c: companyScore(t) }));
    const withRoleKw = scored.filter((s) => s.r >= 3);
    const withCompanyKw = scored.filter((s) => s.c >= 2);
    if (withRoleKw.length >= 1 && withRoleKw.length < scored.length) {
      const rolePick = withRoleKw.reduce((a, b) => (b.r - b.c > a.r - a.c ? b : a));
      title = rolePick.t;
      const remaining = scored.filter((s) => s.i !== rolePick.i);
      // Never assign a person's name as the employer when any other
      // candidate carries company evidence.
      const companyEligible = remaining.filter((s) => s.c > 0 || !looksLikeName(s.t));
      const pool = companyEligible.length > 0 ? companyEligible : remaining;
      const companyPick = pool.reduce((a, b) => (b.c - b.r > a.c - a.r ? b : a));
      company = companyPick.t;
      if (remaining.length > 1) {
        const locRest = remaining.filter((s) => s.i !== companyPick.i);
        if (locRest.length && !location && LOCATION_ONLY_RE.test(locRest[0].t)) location = locRest[0].t;
      }
    } else if (withCompanyKw.length >= 1 && withCompanyKw.length < scored.length) {
      const companyPick = withCompanyKw.reduce((a, b) => (b.c - b.r > a.c - a.r ? b : a));
      company = companyPick.t;
      const rolePick = scored.find((s) => s.i !== companyPick.i);
      if (rolePick) title = rolePick.t;
    } else {
      title = scored[0].t;
      company = scored[1].t;
      ambiguous = true;
    }
  }
  return { title, company, location, ambiguous };
}

export function parseExperience(sections: SectionSpan[], warnings: string[]): RawExperience[] {
  const expSpans = sections.filter((s) => s.key === 'experience');
  const hasSection = expSpans.length > 0;

  let lines: ParsedLine[];
  if (hasSection) {
    lines = expSpans.flatMap((s) => s.lines);
  } else {
    // No standard employment heading — scan the rest of the document for
    // date-anchored entry blocks. Sections that are definitely not experience
    // are excluded by section evidence, and contact/name/education lines are
    // excluded by line evidence so they can never become fake employers.
    warnings.push('No EXPERIENCE heading was found — experience entries were detected heuristically. Please review.');
    lines = sections
      .filter((s) => !NON_EXPERIENCE_KEYS.has(s.key))
      .flatMap((s) => s.lines)
      .filter((l) => {
        const t = l.text.trim();
        if (!t) return false;
        if (EMAIL_RE.test(t) || /^https?:\/\//i.test(t)) return false;
        if (LINKEDIN_RE.test(t) || GITHUB_RE.test(t)) return false;
        if (/^(linkedin|github|portfolio|email|phone)\s*[:\-–]/i.test(t)) return false;
        // contact line: a phone plus at most a few surrounding words
        const phone = extractPhoneFromLine(t);
        if (phone && t.replace(phone, '').replace(/\D/g, '').trim() === '' && t.replace(phone, '').split(/\s+/).filter(Boolean).length <= 4) return false;
        // candidate name line: never an employer (date lines like
        // "Jan 2025 – Mar 2025" look like two capitalized words once digits
        // are stripped, so require a digit-free line; role lines such as
        // "Data Science Virtual Intern" also look like names, so any role
        // keyword keeps the line in the experience pool)
        if (!/\d/.test(t) && !findDateRange(t) && !ROLE_KEYWORD_RE.test(t) && looksLikeName(t)) return false;
        // bare location line ("Austin, TX" / "Remote")
        if (CITY_LOCATION_RE.test(t) || /^remote$/i.test(t.trim())) return false;
        // education evidence: degree token OR strong institution keyword
        if (DEGREE_RE.test(t) || STRONG_INSTITUTION_RE.test(t)) return false;
        return true;
      });
  }

  const entries: RawExperience[] = [];
  let pending: string[] = [];
  // Post-date collection (F2): header lines that FOLLOW a date-bearing title
  // line ("Software Engineer   Mar 2019 - Present" / "Acme Systems") belong to
  // the entry just created, until the first bullet or the next entry anchor.
  let postLines: string[] = [];
  let collectingPost = false;

  const flushPost = () => {
    const current = entries[entries.length - 1];
    if (collectingPost && current && postLines.length > 0) {
      const assigned = assignRoleCompany(postLines);
      if (!current.company) current.company = assigned.company;
      if (!current.location) current.location = assigned.location;
      if (!current.title && assigned.title) current.title = assigned.title;
      if (assigned.ambiguous && !current.title) current.ambiguous = true;
    }
    postLines = [];
    collectingPost = false;
  };

  const startEntry = (inlineText: string, range: { start: string; end: string; current: boolean; display: string }) => {
    flushPost(); // any unclaimed post-date lines belong to the previous entry
    const inlineParts = splitInlineHeader(inlineText);
    const candidates = [...pending, ...inlineParts];
    pending = [];
    const { title, company, location, ambiguous } = assignRoleCompany(candidates);
    entries.push({
      title,
      company,
      location,
      startDate: range.start,
      endDate: range.end,
      current: range.current,
      dateDisplay: range.display,
      bullets: [],
      ambiguous,
    });
    collectingPost = true;
  };

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    if (line.isListItem || isBulletLine(text)) {
      flushPost(); // bullets close the post-date header block
      if (entries.length > 0) entries[entries.length - 1].bullets.push(stripBulletPrefix(text));
      continue;
    }
    const range = findDateRange(text);
    if (range) {
      const inline = text.replace(range.display, '').replace(/^[\s|,;•·\-–—]+|[\s|,;•·\-–—]+$/g, '').trim();
      // A date range also appears inside long bullet sentences; treat it as an
      // entry anchor only when the line itself looks like a header.
      const looksLikeBulletSentence = isBulletLine(text) || (text.length > 140 && entries.length > 0);
      if (!looksLikeBulletSentence) {
        startEntry(inline, range);
        continue;
      }
    }
    // Wrapped bullet continuation: a line that continues the previous bullet
    // (lowercase start, or the previous bullet ends with a comma) must extend
    // that bullet, never become a second bullet or a new entity.
    const lastEntry = entries[entries.length - 1];
    const lastBullet = lastEntry?.bullets[lastEntry.bullets.length - 1] || '';
    const continuesPreviousBullet =
      !collectingPost &&
      pending.length === 0 &&
      Boolean(lastBullet) &&
      text.length < 200 &&
      !findDateRange(text) &&
      (/^[a-z]/.test(text) || /[,:]$/.test(lastBullet));
    if (continuesPreviousBullet) {
      lastEntry.bullets[lastEntry.bullets.length - 1] = `${lastBullet} ${text}`.replace(/\s+/g, ' ');
      continue;
    }
    if (collectingPost) {
      // Header material for the entry just created (company/location below a
      // title+date line). Capped so a runaway layout cannot absorb a section.
      postLines.push(text);
      if (postLines.length > 3) {
        postLines.shift();
      }
      continue;
    }
    // Non-bullet, non-date line: header material for the NEXT entry.
    pending.push(text);
    if (pending.length > 4) pending.shift();
  }
  flushPost();
  // leftover pending with no date anchor: cannot belong to any entry
  if (pending.length > 0 && entries.length === 0) {
    warnings.push('Found lines that looked like a role or company but no date range — entries were skipped. Please add them manually.');
  }

  // Drop empty husks, de-duplicate identical entries, flag ambiguity.
  const cleaned: RawExperience[] = [];
  for (const e of entries) {
    if (!e.title && !e.company && e.bullets.length === 0) continue;
    const dup = cleaned.find(
      (x) =>
        x.title.toLowerCase() === e.title.toLowerCase() &&
        x.company.toLowerCase() === e.company.toLowerCase() &&
        x.startDate === e.startDate &&
        x.endDate === e.endDate,
    );
    if (dup) {
      if (e.bullets.length > dup.bullets.length) dup.bullets = e.bullets;
      continue;
    }
    if (e.ambiguous) warnings.push('Some experience entries had an ambiguous role/company layout — please review them.');
    cleaned.push(e);
  }
  if (cleaned.length === 0) {
    warnings.push('No work experience detected — add your roles manually below.');
  } else if (cleaned.some((e) => !e.title || (!e.company && !e.current))) {
    warnings.push('Some experience entries are missing a role or company — please review them.');
  }
  return cleaned;
}

// ---------------------------------------------------------------- education

export interface RawEducation {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  grade: string;
  dateDisplay: string;
}

export function parseEducation(sections: SectionSpan[], warnings: string[]): RawEducation[] {
  const lines = lineTexts(
    sections
      .filter((s) => s.key.split('+').includes('education'))
      .flatMap((s) => linesForPart(s, 'education')),
  );
  const items: RawEducation[] = [];
  for (const text of lines) {
    const degreeMatch = text.match(DEGREE_RE);
    const range = findDateRange(text);
    if (degreeMatch) {
      const degree = degreeMatch[0].replace(/\s+/g, ' ').trim();
      const after = text.replace(degreeMatch[0], '').replace(range?.display || '', '');
      const parts = after.split(/[|,•·]|\s+[–—]\s+/).map((p) => p.trim()).filter(Boolean);
      let field = '';
      let institution = '';
      const institutionPart = parts.find((p) => INSTITUTION_RE.test(p));
      if (institutionPart) {
        institution = institutionPart.replace(range?.display || '', '').replace(/[\s\-–—]+$/, '').trim();
        field = parts.filter((p) => p !== institutionPart).join(', ');
      } else {
        field = parts.join(', ');
      }
      items.push({
        degree: degree.charAt(0).toUpperCase() + degree.slice(1),
        field,
        institution,
        startDate: range?.start || '',
        endDate: range?.end || '',
        grade: '',
        dateDisplay: range?.display || '',
      });
    } else if (range && items.length > 0) {
      const last = items[items.length - 1];
      if (!last.startDate) {
        last.startDate = range.start;
        last.endDate = range.end;
        last.dateDisplay = range.display;
      }
    } else if (items.length > 0) {
      const last = items[items.length - 1];
      const gradeMatch = text.match(/((?:cgpa|gpa|percentage|aggregate)\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)(?:\s*\/\s*(?:10|100))?|(\d{1,2}(?:\.\d+)?)\s*\/\s*10|\d{1,3}(?:\.\d+)?\s*%)/i);
      if (!last.institution && text.length < 120 && !isBulletLine(text)) {
        last.institution = text;
      } else if (gradeMatch && !last.grade) {
        last.grade = gradeMatch[0].trim();
      }
    }
  }
  if (items.length === 0 && lines.length > 0) {
    warnings.push('An education section was present but no degree lines could be parsed — please review.');
  }
  return items;
}

// ---------------------------------------------------------------- skills

export function parseSkills(sections: SectionSpan[], fullText: string, warnings: string[]): { technical: string[]; soft: string[] } {
  const technical: string[] = [];
  const soft: string[] = [];
  const push = (arr: string[], token: string) => {
    const clean = token.replace(/\s{2,}/g, ' ').trim().replace(/^[\s•·\-–—]+/, '');
    if (clean && clean.length <= 60 && !arr.some((t) => t.toLowerCase() === clean.toLowerCase())) arr.push(clean);
  };
  for (const span of sections.filter((s) => s.key.split('+').includes('skills') || s.key.split('+').includes('soft'))) {
    const parts = span.key.split('+').filter((p) => p === 'skills' || p === 'soft');
    for (const part of parts) {
      for (const raw of linesForPart(span, part)) {
        const text = stripBulletPrefix(raw.text.trim());
        if (!text) continue;
        const categorized = text.match(/^([A-Za-z][A-Za-z &/+-]{1,30}):\s*(.+)$/);
        const body = categorized ? categorized[2] : text;
        const target = part === 'soft' ? soft : technical;
        for (const token of splitSkillList(body)) {
          const isSoft = SOFT_SKILLS.some((s) => s.toLowerCase() === token.trim().toLowerCase());
          push(isSoft && target === technical ? soft : target, token);
        }
      }
    }
  }
  if (technical.length === 0) {
    for (const s of findSkillsInText(fullText)) {
      if (!technical.some((t) => t.toLowerCase() === s.canonical.toLowerCase())) technical.push(s.canonical);
    }
    if (technical.length > 0) {
      warnings.push('No dedicated skills section was found — technical skills were harvested from your document text. Please review.');
    }
  }
  return { technical, soft };
}

// ---------------------------------------------------------------- projects

export interface RawProject {
  name: string;
  link: string;
  description: string;
  bullets: string[];
  tech: string[];
}

export function parseProjects(sections: SectionSpan[]): RawProject[] {
  const projects: RawProject[] = [];
  for (const span of sections.filter((s) => s.key === 'projects')) {
    for (const raw of span.lines) {
      const text = stripBulletPrefix(raw.text.trim());
      if (!text) continue;
      if (raw.isListItem || isBulletLine(raw.text)) {
        if (projects.length > 0) projects[projects.length - 1].bullets.push(text);
        continue;
      }
      const techMatch = text.match(/^(?:tech(?:nolog(?:y|ies))?|tech\s*stack|built\s+with|stack)\s*[:\-]\s*(.+)$/i);
      if (techMatch && projects.length > 0) {
        for (const t of splitSkillList(techMatch[1])) {
          const cur = projects[projects.length - 1];
          if (!cur.tech.some((x) => x.toLowerCase() === t.toLowerCase())) cur.tech.push(t);
        }
        continue;
      }
      const linkMatch = text.match(/https?:\/\/[^\s,|]+/i);
      if (text.length < 90) {
        projects.push({
          name: text.replace(/^\d+[.)]\s*/, ''),
          link: linkMatch ? linkMatch[0] : '',
          description: '',
          bullets: [],
          tech: [],
        });
      } else if (projects.length > 0 && !projects[projects.length - 1].description) {
        projects[projects.length - 1].description = text;
      }
    }
  }
  return projects;
}

// ------------------------------------------------- combined heading routing

const ACHIEVEMENTISH_RE = /^\s*(winner|award|won|gold|silver|bronze|first|second|third|1st|2nd|3rd|top|best|finalist|runner[\s-]?up|medal|honou?r|champion)\b/i;

function isCommaTokenList(t: string): boolean {
  return t.includes(',') && !/\.\s/.test(t) && t.split(',').length <= 8 && t.split(',').every((p) => p.split(/\s+/).length <= 5);
}

/** Scores how well a line's content matches one semantic part of a combined heading. */
function partScore(t: string, part: string): number {
  switch (part) {
    case 'education':
      return (DEGREE_RE.test(t) ? 2 : 0) + (INSTITUTION_RE.test(t) ? 2 : 0);
    case 'certifications':
      if (CERT_LINE_RE.test(t)) return 3;
      if (/(?:19|20)\d{2}/.test(t)) return ACHIEVEMENTISH_RE.test(t) ? 0 : 1;
      return 0;
    case 'achievements':
      if (ACHIEVEMENTISH_RE.test(t)) return 2;
      return !/(?:19|20)\d{2}/.test(t) && !CERT_LINE_RE.test(t) && t.length > 12 ? 1 : 0;
    case 'interests':
      if (/^interests?\s*[:\-]/i.test(t)) return 3;
      return !/(?:19|20)\d{2}/.test(t) && !CERT_LINE_RE.test(t) && isCommaTokenList(t) ? 2 : 0;
    case 'skills':
      return /^skills?\s*[:\-]/i.test(t) ? 2 : 0;
    case 'experience':
      return findDateRange(t) ? 1 : 0;
    default:
      return 0;
  }
}

/**
 * Generic combined-heading router: "CERTIFICATIONS & AWARDS",
 * "EDUCATION & TRAINING", "SKILLS & LANGUAGES", … Each line goes to the
 * highest-scoring part (ties: earlier part in the heading), so no combined
 * section is ever silently discarded.
 */
export function splitCombinedLines(span: SectionSpan): Map<string, ParsedLine[]> {
  const parts = span.key.split('+');
  const buckets = new Map<string, ParsedLine[]>(parts.map((p) => [p, []]));
  for (const line of span.lines) {
    const t = line.text.trim();
    if (!t) continue;
    let bestPart = parts[0];
    let bestScore = -1;
    for (const part of parts) {
      const score = partScore(t, part);
      if (score > bestScore) {
        bestScore = score;
        bestPart = part;
      }
    }
    buckets.get(bestPart)!.push(line);
  }
  return buckets;
}

/** Lines of a span belonging to `part`, splitting combined spans generically. */
export function linesForPart(span: SectionSpan, part: string): ParsedLine[] {
  if (!span.key.includes('+')) return span.lines;
  return splitCombinedLines(span).get(part) ?? [];
}

// ------------------------------------------------- certifications & interests

const CERT_LINE_RE = /\b(certifi|credential|certificate|aws\s+academy|coursera|udemy|nptel|eduskills|oracle\s+certified|microsoft\s+certified|google\s+ai|ibm\s+certified|cisco\s+certified)\b/i;
const KNOWN_ISSUERS = [
  'AWS Academy', 'Google', 'Microsoft', 'Oracle', 'Coursera', 'Udemy', 'NPTEL',
  'IBM', 'Cisco', 'EduSkills', 'AICTE', 'Huawei', 'Altair', 'Meta', 'Amazon',
];

export interface RawCertification {
  name: string;
  issuer: string;
  year: string;
}

export function parseCertifications(sections: SectionSpan[]): RawCertification[] {
  const certifications: RawCertification[] = [];
  for (const span of sections) {
    if (!span.key.split('+').includes('certifications')) continue;
    for (const raw of linesForPart(span, 'certifications')) {
      const text = stripBulletPrefix(raw.text.trim());
      if (!text) continue;
      const year = text.match(/(?:19|20)\d{2}/)?.[0] || '';
      const issuer =
        KNOWN_ISSUERS.find((i) => new RegExp(`\\b${i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) || '';
      certifications.push({ name: text, issuer, year });
    }
  }
  return certifications;
}

/** Interests from standalone INTERESTS sections and the interests part of combined headings. */
export function parseInterestLines(sections: SectionSpan[]): string[] {
  const interestLines: string[] = [];
  for (const span of sections) {
    if (!span.key.split('+').includes('interests')) continue;
    for (const raw of linesForPart(span, 'interests')) {
      const text = stripBulletPrefix(raw.text.trim());
      if (!text) continue;
      const prefixed = text.match(/^interests?\s*[:\-]\s*(.+)$/i);
      interestLines.push(prefixed ? prefixed[1] : text);
    }
  }
  return interestLines;
}

// ----------------------------------------------------- languages, achievements, custom

export function parseLanguages(sections: SectionSpan[]): { name: string; proficiency?: string }[] {
  const languages: { name: string; proficiency?: string }[] = [];
  for (const span of sections.filter((s) => s.key.split('+').includes('languages'))) {
    for (const raw of linesForPart(span, 'languages')) {
      const text = stripBulletPrefix(raw.text.trim());
      if (!text) continue;
      for (const part of splitSkillList(text)) {
        const m = part.match(/^([A-Za-z]+)\s*\(([^)]+)\)$/) || part.match(/^([A-Za-z]+)\s*[-–—:]\s*(.+)$/);
        if (m) {
          languages.push({ name: m[1], proficiency: m[2] });
        } else if (/^[A-Za-z]{3,}$/.test(part)) {
          languages.push({ name: part });
        }
      }
    }
  }
  return languages;
}

export function parseAchievements(sections: SectionSpan[]): string[] {
  const achievements: string[] = [];
  for (const span of sections.filter((s) => s.key.split('+').includes('achievements'))) {
    for (const raw of linesForPart(span, 'achievements')) {
      const text = stripBulletPrefix(raw.text.trim());
      if (text && text.length > 5) achievements.push(text);
    }
  }
  return achievements;
}

export function parseSummary(sections: SectionSpan[]): string {
  const lines = sections
    .filter((s) => s.key.split('+').includes('summary'))
    .flatMap((s) => linesForPart(s, 'summary'))
    .map((l) => l.text.trim())
    .filter((t) => t && !isBulletLine(t));
  const summary = normalizeWhitespace(lines.join(' '));
  return summary.slice(0, 600);
}
