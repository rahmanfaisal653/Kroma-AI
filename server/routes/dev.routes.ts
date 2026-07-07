import { Router } from 'express';
import { db } from '../services/db.service.js';
import { findUserByEmail } from '../services/auth.service.js';
import { config } from '../config.js';

const router = Router();

/**
 * Dev-only endpoints. Disabled in production.
 * Gate: requires NODE_ENV !== 'production' AND header x-dev-token === DEV_BOOTSTRAP_TOKEN.
 * This file is intentionally tiny and easy to delete after testing.
 */

const DEV_TOKEN = process.env.DEV_BOOTSTRAP_TOKEN || '';

function devGuard(req: any, res: any, next: any) {
  if (config.nodeEnv === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!DEV_TOKEN) {
    return res.status(503).json({ error: 'DEV_BOOTSTRAP_TOKEN not configured.' });
  }
  if (req.headers['x-dev-token'] !== DEV_TOKEN) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  next();
}

// POST /api/dev/promote-admin { email }
router.post('/promote-admin', devGuard, async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'user not found' });
  await db.update('users', user.id, { role: 'admin' });
  res.json({ success: true, id: user.id, role: 'admin' });
});

// POST /api/dev/set-quota { email, quota_limit, usage_count? }
router.post('/set-quota', devGuard, async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const quota_limit = Number(req.body?.quota_limit);
  const usage_count = req.body?.usage_count !== undefined ? Number(req.body.usage_count) : undefined;
  if (!email || !Number.isFinite(quota_limit)) {
    return res.status(400).json({ error: 'email and quota_limit required' });
  }
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'user not found' });
  const payload: any = { quota_limit };
  if (usage_count !== undefined) payload.usage_count = usage_count;
  await db.update('users', user.id, payload);
  res.json({ success: true, ...payload });
});

export default router;
