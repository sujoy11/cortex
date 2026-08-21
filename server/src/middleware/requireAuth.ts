import type { Request, Response, NextFunction } from 'express';
import { validateSession } from '../services/auth.js';

// Gate the /api/* admin surface behind a dashboard session (#35, item #2).
// The token is the opaque session token issued by /api/auth/login|setup, sent
// as `Authorization: Bearer *** The /v1 proxy is NOT gated by this — it
// keeps its own unified-API-key auth for app clients.
//
// When DISABLE_AUTH=true is set (self-hosted, single-operator demo), the gate
// is skipped and every request is treated as the operator. The /v1 proxy still
// requires its own unified API key.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (process.env.DISABLE_AUTH === 'true') {
    (req as Request & { user?: { userId: number; email: string | null } }).user = {
      userId: 0,
      email: null,
    };
    next();
    return;
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    ?? (req.headers['x-dashboard-token'] as string | undefined);
  const session = validateSession(token);
  if (!session) {
    res.status(401).json({ error: { message: 'Authentication required', type: 'authentication_error' } });
    return;
  }
  (req as Request & { user?: typeof session }).user = session;
  next();
}
