import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { captureError } from '../lib/monitoring';

export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const FRIENDLY: Record<string, { status: number; message: string }> = {
  UNSUPPORTED_FILE_TYPE: { status: 400, message: 'Unsupported file type. Please upload a PDF or DOCX file.' },
  PARSE_FAILED: { status: 422, message: 'We could not read this file. It may be empty, scanned, or corrupted — try exporting it as a text-based PDF or DOCX.' },
  FILE_TOO_LARGE: { status: 413, message: 'File is too large. Maximum size is 8 MB.' },
  EMAIL_TAKEN: { status: 409, message: 'An account with this email already exists.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Incorrect email or password.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please wait a moment and try again.' },
  NOT_FOUND: { status: 404, message: 'The requested item was not found.' },
  FORBIDDEN: { status: 403, message: 'You do not have access to this item.' },
  EMPTY_JD: { status: 400, message: 'Please paste a job description first.' },
  JD_TOO_SHORT: { status: 400, message: 'This job description looks too short to analyse. Paste the complete description.' },
  NO_MASTER_CV: { status: 400, message: 'Create your Master CV first.' },
  QUOTA_EXCEEDED: {
    status: 402,
    message: 'You have reached your plan limit for this feature. Upgrade your plan or wait for the next monthly cycle.',
  },
  BILLING_UNAVAILABLE: {
    status: 503,
    message: 'Online payments are not configured for this deployment. Billing features are unavailable, but all resume tools keep working.',
  },
  AI_NOT_CONFIGURED: {
    status: 503,
    message: 'This feature requires the AI provider to be configured for this deployment.',
  },
  RESEARCH_NOT_CONFIGURED: {
    status: 503,
    message: 'Company research requires a web search provider so every fact can carry a source. Configure RESEARCH_SEARCH_API_URL.',
  },
  RESEARCH_NO_RESULTS: {
    status: 422,
    message: 'The search provider returned no results for this company.',
  },
};

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  if (err instanceof ZodError) {
    const first = err.errors[0];
    res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: first ? `${first.path.join('.') || 'Input'}: ${first.message}` : 'Invalid input.',
        requestId,
      },
    });
    return;
  }
  if (err instanceof AppError) {
    // Expected, user-facing errors: no error-report capture beyond AI failures,
    // which are recorded for the admin dashboard.
    if (err.code.startsWith('AI_') || err.status >= 500) {
      captureError(err, { requestId, userId: req.user?.uid, code: err.code, route: req.path });
    }
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }
  const anyErr = err as { code?: string; message?: string; status?: number };
  if (anyErr && anyErr.code && FRIENDLY[anyErr.code]) {
    const f = FRIENDLY[anyErr.code];
    res.status(f.status).json({ error: { code: anyErr.code, message: f.message, requestId } });
    return;
  }
  if (anyErr && (anyErr.code === 'LIMIT_FILE_SIZE' || anyErr.status === 413)) {
    res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: FRIENDLY.FILE_TOO_LARGE.message, requestId } });
    return;
  }
  // Unexpected: capture (sanitised) for monitoring, return a safe response.
  captureError(err, { requestId, userId: req.user?.uid, code: 'INTERNAL', route: req.path });
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.', requestId },
  });
}
