import { Router } from 'express';
import { db } from '../services/db.service.js';
import { listGatewayKeys } from '../services/internalApiKey.service.js';
import { listProviderConfigs } from '../services/providerConfig.service.js';
import { generateApiKey, maskApiKey, isLikelyUserApiKey, hashApiKey, usersHasColumn, toOwnerUser } from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// GET /api/user/me - owner profile with masked API key and quota (JWT-only)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.findById('users', req.user!.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(toOwnerUser(user));
  } catch (error: any) {
    console.error('Get me error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/user/generate-key — Generate a new API key (returns full key)
router.post('/generate-key', requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const apiKey = generateApiKey();
  try {
    const supportsKeyHash = await usersHasColumn('user_key_hash');
    await db.update('users', userId, supportsKeyHash
      ? { user_key: maskApiKey(apiKey), user_key_hash: hashApiKey(apiKey) }
      : { user_key: apiKey }
    );
    res.json({ success: true, api_key: apiKey, user_key_preview: maskApiKey(apiKey) });
  } catch (error: any) {
    console.error('Generate key error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

// GET /api/user/reveal-key — Reveal full API key (protected)
router.get('/reveal-key', requireAuth, async (req, res) => {
  const userId = req.user!.id;

  try {
    const user = await db.findById('users', userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let fullKey = String(user.user_key || '').trim();
    let regenerated = false;

    // Hashed keys cannot be revealed. Generate a new full key and show it once.
    const supportsKeyHash = await usersHasColumn('user_key_hash');
    if ((supportsKeyHash && (user as any).user_key_hash) || !isLikelyUserApiKey(fullKey)) {
      fullKey = generateApiKey();
      regenerated = true;
      await db.update('users', user.id, supportsKeyHash
        ? { user_key: maskApiKey(fullKey), user_key_hash: hashApiKey(fullKey) }
        : { user_key: fullKey }
      );
    }

    res.json({ user_key: fullKey, user_key_preview: maskApiKey(fullKey), regenerated });
  } catch (error: any) {
    console.error('Reveal key error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/user/revoke-key — Revoke API key (invalidates external access)
router.delete('/revoke-key', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const supportsKeyHash = await usersHasColumn('user_key_hash');
    await db.update('users', userId, supportsKeyHash
      ? { user_key: null, user_key_hash: null }
      : { user_key: null }
    );
    res.json({ success: true, message: 'API key revoked. Generate a new one at POST /api/user/generate-key' });
  } catch (error: any) {
    console.error('Revoke key error:', error.message);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// GET /api/user/quota — Get own quota info (protected)
router.get('/quota', requireAuth, async (req, res) => {
  try {
    const user = await db.findById('users', req.user!.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      name: user.email,
      usage: Number(user.usage_count) || 0,
      quota: Number(user.quota_limit) || 0,
      balance: Number(user.balance) || 0
    });
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/user/usage-history — Owner usage logs for internal/partner keys
router.get('/usage-history', requireAuth, async (req, res) => {
  try {
    await cleanupOldUsageLogs();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.page_size) || Number(req.query.limit) || 25, 1), 100);
    const offset = (page - 1) * pageSize;

    // ponytail: keep this lightweight; logs auto-expire at 7d, cap protects dashboard from huge scans.
    const [logs, keys] = await Promise.all([
      db.query('SELECT * FROM usage_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY created_at DESC LIMIT 5000'),
      listGatewayKeys(),
    ]);
    const keyById = new Map(keys.map((key: any) => [String(key.id), key]));
    const filtered = (Array.isArray(logs) ? logs : []).map((log: any) => {
      const key = keyById.get(String(log.api_key_id || '')) as any;
      return {
        ...log,
        key_name: key?.name || '',
        key_prefix: key?.key_prefix || '',
        owner_type: key?.owner_type || '',
        owner_name: key?.owner_name || '',
        provider: String(log.model_slug || '').split('/')[0] || '',
      };
    }).filter((log: any) => {
      const created = new Date(log.created_at || 0).getTime();
      const from = req.query.from ? new Date(String(req.query.from)).getTime() : 0;
      const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59`).getTime() : Infinity;
      return (!req.query.api_key_id || String(log.api_key_id || '') === String(req.query.api_key_id)) &&
        (!req.query.owner_type || String(log.owner_type || '') === String(req.query.owner_type)) &&
        (!req.query.owner_name || String(log.owner_name || '').toLowerCase().includes(String(req.query.owner_name).toLowerCase())) &&
        (!req.query.provider || String(log.provider || '').includes(String(req.query.provider))) &&
        (!req.query.model || String(log.model_slug || '').includes(String(req.query.model))) &&
        (!req.query.from || created >= from) &&
        (!req.query.to || created <= to);
    }).sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const summary = filtered.reduce((acc: any, log: any) => {
      const tokens = Number(log.total_tokens) || 0;
      acc.requests += 1;
      acc.tokens += tokens;
      acc.errors += Number(log.status_code) >= 400 ? 1 : 0;
      if (String(log.created_at || '').startsWith(today)) acc.today_tokens += tokens;
      if (String(log.created_at || '').startsWith(month)) acc.month_tokens += tokens;
      return acc;
    }, { requests: 0, tokens: 0, today_tokens: 0, month_tokens: 0, errors: 0 });

    res.json({
      logs: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      pageSize,
      summary,
      retentionDays: 7,
    });
  } catch {
    res.json({ logs: [], total: 0, page: 1, pageSize: 25, summary: { requests: 0, tokens: 0, today_tokens: 0, month_tokens: 0, errors: 0 }, retentionDays: 7 }); // ponytail: usage logging may be absent on fresh DB
  }
});

async function cleanupOldUsageLogs() {
  await db.query('DELETE FROM usage_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)');
}

router.delete('/usage-history', requireAuth, async (_req, res) => {
  try {
    await db.query('DELETE FROM usage_logs');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to clear usage logs' });
  }
});

router.post('/usage-history/cleanup', requireAuth, async (_req, res) => {
  try {
    const result: any = await db.query('DELETE FROM usage_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)');
    res.json({ success: true, deleted: Number(result?.affectedRows) || 0 });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to cleanup usage logs' });
  }
});

router.get('/dashboard', requireAuth, async (_req, res) => {
  try {
    await cleanupOldUsageLogs();
    const [keys, providers, logs] = await Promise.all([listGatewayKeys(), listProviderConfigs(), db.query('SELECT * FROM usage_logs ORDER BY created_at DESC LIMIT 500')]);
    const rows = Array.isArray(logs) ? logs : [];
    const recent = rows.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const usage = rows.reduce((acc: any, log: any) => {
      acc.requests += 1;
      acc.tokens += Number(log.total_tokens) || 0;
      acc.errors += Number(log.status_code) >= 400 ? 1 : 0;
      if (String(log.created_at || '').startsWith(today)) acc.today += Number(log.total_tokens) || 0;
      return acc;
    }, { requests: 0, tokens: 0, today: 0, errors: 0 });
    res.json({
      providers: { total: providers.length, enabled: providers.filter((p: any) => p.enabled !== false).length },
      keys: { total: keys.length, internal: keys.filter((k: any) => k.owner_type === 'internal').length, partner: keys.filter((k: any) => k.owner_type === 'partner').length },
      usage,
      recent,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load dashboard' });
  }
});

export default router;
