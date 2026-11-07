import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { __setEmailSenderForTests } from '../src/lib/email';

describe('Public Email Dispatch Endpoints (Phase 9K)', () => {
  let app: any;
  let sentMessages: any[] = [];

  beforeEach(async () => {
    app = await buildApp();
    sentMessages = [];
    __setEmailSenderForTests(async (msg) => {
      sentMessages.push(msg);
      return { delivered: true, provider: 'resend' };
    });
  });

  afterEach(() => {
    __setEmailSenderForTests(null);
  });

  it('GET /api/public/email/status returns provider readiness', async () => {
    const res = await request(app).get('/api/public/email/status');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('configured');
    expect(res.body).toHaveProperty('provider');
  });

  it('POST /api/public/email/resume rejects requests without consent', async () => {
    const res = await request(app)
      .post('/api/public/email/resume')
      .send({
        email: 'user@example.com',
        resumeSummary: 'Experienced SRE with Kubernetes experience.',
        consent: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_EMAIL_REQUEST');
  });

  it('POST /api/public/email/resume rejects malformed emails', async () => {
    const res = await request(app)
      .post('/api/public/email/resume')
      .send({
        email: 'not-an-email',
        resumeSummary: 'Experienced SRE.',
        consent: true,
      });

    expect(res.status).toBe(400);
  });

  it('POST /api/public/email/resume dispatches email with valid payload and consent', async () => {
    const res = await request(app)
      .post('/api/public/email/resume')
      .send({
        email: 'testcandidate@example.co.uk',
        candidateName: 'Jane Doe',
        resumeSummary: '10+ years leading site reliability engineering teams.',
        consent: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.delivered).toBe(true);
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].to).toBe('testcandidate@example.co.uk');
    expect(sentMessages[0].subject).toContain('Jane Doe');
  });

  it('POST /api/public/email/interview-report dispatches coaching report', async () => {
    const res = await request(app)
      .post('/api/public/email/interview-report')
      .send({
        email: 'engineer@example.com',
        role: 'Staff Platform Engineer',
        overallScore: 88,
        summary: 'Excellent technical depth and STAR structure.',
        consent: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.delivered).toBe(true);
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].subject).toContain('Staff Platform Engineer');
    expect(sentMessages[0].text).toContain('88/100');
  });
});
