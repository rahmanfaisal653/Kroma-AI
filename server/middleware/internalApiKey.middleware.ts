import type { Request, Response, NextFunction } from 'express';
import { findGatewayKey } from '../services/internalApiKey.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    gatewayKey?: Awaited<ReturnType<typeof findGatewayKey>>;
  }
}

async function resolveGatewayKey(req: Request) {
  const xKey = String(req.headers['x-api-key'] || '').trim();
  const auth = String(req.headers.authorization || '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  // ponytail: support clients that send both; first valid kg_ key wins.
  for (const key of [xKey, bearer]) {
    const clean = key.replace(/^bearer\s+/i, '').trim();
    if (!clean.startsWith('kg_')) continue;
    const record = await findGatewayKey(clean);
    if (record) return record;
  }
  return null;
}

export async function requireGatewayKey(req: Request, res: Response, next: NextFunction) {
  const record = await resolveGatewayKey(req);
  if (!record) return res.status(401).json({ error: { message: 'Invalid or missing API key', code: 'INVALID_API_KEY' } });
  req.gatewayKey = record;
  next();
}
