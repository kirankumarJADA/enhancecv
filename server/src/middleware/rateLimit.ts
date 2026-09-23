import { Request, Response, NextFunction } from 'express';
import { AppError } from './errors';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(options: { windowMs: number; max: number; keyFn?: (req: Request) => string }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = `${options.keyFn ? options.keyFn(req) : req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    bucket.count++;
    if (bucket.count > options.max) {
      next(new AppError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', 429));
      return;
    }
    next();
  };
}

// Periodic cleanup so the map does not grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}, 60_000).unref();
