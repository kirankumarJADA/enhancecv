// Express 4 does not route rejected promises from async handlers to the
// error middleware. This applies the same behaviour as the MIT-licensed
// express-async-errors shim (inlined to avoid the dependency): route handlers
// that are `async` (or otherwise return a promise) forward rejections to
// `next(err)` so the central errorHandler produces the friendly JSON errors.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
// express/lib/router/layer.js exports the Layer class directly.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Layer = require('express/lib/router/layer') as {
  prototype: { handle_request: (req: Request, res: Response, next: NextFunction) => void };
};

const originalHandle = Layer.prototype.handle_request;

Layer.prototype.handle_request = function handle_request(req: Request, res: Response, next: NextFunction): void {
  const fn = (this as unknown as { handle: RequestHandler }).handle;
  if (fn.length > 3) {
    // express error-handling middleware — defer to the original behaviour
    originalHandle.call(this, req, res, next);
    return;
  }
  try {
    const result = fn(req, res, next) as unknown;
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch((err: unknown) => next(err));
    }
  } catch (err) {
    next(err);
  }
};

export function enableAsyncErrorRouting(): void {
  // import side effects apply the patch; this function documents intent at
  // the call site in app.ts.
}
