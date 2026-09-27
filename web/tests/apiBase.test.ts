// Unit tests for the real frontend API-base helpers (web/src/apiBase.ts).

import { describe, it, expect } from 'vitest';
import { resolveApiBase, apiUrl } from '../src/apiBase';

describe('resolveApiBase', () => {
  it('local development: absent/empty VITE_API_URL → same-origin base (empty string)', () => {
    expect(resolveApiBase(undefined)).toBe('');
    expect(resolveApiBase('')).toBe('');
  });

  it('production: trims trailing slashes from VITE_API_URL', () => {
    expect(resolveApiBase('https://curevo-ai.onrender.com')).toBe('https://curevo-ai.onrender.com');
    expect(resolveApiBase('https://curevo-ai.onrender.com/')).toBe('https://curevo-ai.onrender.com');
    expect(resolveApiBase('https://curevo-ai.onrender.com///')).toBe('https://curevo-ai.onrender.com');
  });
});

describe('apiUrl', () => {
  it('local development keeps requests same-origin: /api/...', () => {
    expect(apiUrl('/auth/signup', '')).toBe('/api/auth/signup');
    expect(apiUrl('resumes/r1/pdf', '')).toBe('/api/resumes/r1/pdf');
  });

  it('production prefixes the configured Render origin', () => {
    expect(apiUrl('/auth/signup', 'https://curevo-ai.onrender.com')).toBe('https://curevo-ai.onrender.com/api/auth/signup');
    expect(apiUrl('/resumes/r1/pdf', 'https://curevo-ai.onrender.com/')).toBe('https://curevo-ai.onrender.com/api/resumes/r1/pdf');
  });

  it('never produces //, /api/api, or missing slashes', () => {
    expect(apiUrl('/auth/signup', 'https://curevo-ai.onrender.com//')).toBe('https://curevo-ai.onrender.com/api/auth/signup');
    expect(apiUrl('/api/auth/signup', 'https://curevo-ai.onrender.com')).toBe('https://curevo-ai.onrender.com/api/auth/signup');
    expect(apiUrl('auth/x', '')).toBe('/api/auth/x');
  });

  it('passes external URLs through untouched', () => {
    expect(apiUrl('https://external.example.com/file.pdf', 'https://curevo-ai.onrender.com')).toBe('https://external.example.com/file.pdf');
  });
});
