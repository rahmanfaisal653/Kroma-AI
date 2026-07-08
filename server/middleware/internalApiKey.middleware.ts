import type { Request, Response, NextFunction } from 'express';
import { findGatewayKey } from '../services/internalApiKey.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    gatewayKey?: Awaited<ReturnType<typeof findGatewayKey>>;
  }
}

export async function requireGatewayKey(req: Request, res: Response, next: NextFunction) {
  const auth = String(req.headers.authorization || '').trim();
  const raw = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : String(req.headers['x-api-key'] || '');
  const key = String(raw).trim().replace(/^bearer\s+/i, '');
  if (!key) return res.status(401).json({ error: { message: 'Missing API key', code: 'INVALID_API_KEY' } });
  const record = await findGatewayKey(key);
  if (!record) return res.status(401).json({ error: { message: 'Invalid API key', code: 'INVALID_API_KEY' } });
  req.gatewayKey = record;
  next();
}
