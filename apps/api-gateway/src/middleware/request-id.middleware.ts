import type { Request, Response, NextFunction } from 'express';

/**
 * Injects an x-request-id header into every incoming request.
 * If the client already provides one it is kept as-is, otherwise a UUID is
 * generated. The header is forwarded downstream by http-proxy-middleware.
 */
export function RequestIdMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = crypto.randomUUID();
  }
  next();
}
