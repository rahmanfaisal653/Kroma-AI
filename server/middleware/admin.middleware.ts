import type { Request, Response, NextFunction } from 'express';
import type { GatewayUser } from '../types/index.js';

/**
 * Role Guard Middleware Factory.
 * Requires requireAuth to run first (attaches req.user).
 * Checks that req.user.role matches the required role.
 */
export const requireRole = (role: string) => (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user as GatewayUser | undefined;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  const userRole = String(user.role || '').toLowerCase();
  const userStatus = String((user as any).status || '').toLowerCase();
  if (userRole !== role && userStatus !== role) {
    return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
  }
  next();
};
