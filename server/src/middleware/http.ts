import { Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = (req as Request & { requestId?: string }).requestId;
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}`, requestId },
  });
}

export { errorHandler } from './errors';
