import { Router } from 'express';
import { db } from '../../services/db.service.js';
import { maskApiKey } from '../../services/auth.service.js';

const router = Router();

// GET /api/admin/users
router.get('/', async (req, res) => {
  try {
    const users = await db.findAll('users');
    const safeUsers = users.map((u: any) => {
      const { password, user_key, ...safe } = u;
      return { ...safe, user_key: maskApiKey(user_key) };
    });
    res.json(safeUsers);
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json([]);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/admin/users/:id
router.put('/:id', async (req, res) => {
  try {
    // Whitelist allowed fields to prevent privilege escalation
    const ALLOWED_FIELDS = ['role', 'status', 'quota_limit', 'usage_count', 'balance', 'email'];
    const safePayload: Record<string, any> = {};
    for (const key of ALLOWED_FIELDS) {
      if (req.body[key] !== undefined) safePayload[key] = req.body[key];
    }
    if (Object.keys(safePayload).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await db.update('users', req.params.id, safePayload);
    const user = await db.findById('users', req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password, user_key, ...safe } = user;
    res.json({ ...safe, user_key: maskApiKey(user_key) });
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.remove('users', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// PUT /api/admin/users/:id/quota
router.put('/:id/quota', async (req, res) => {
  try {
    const { quota_limit, usage_count } = req.body;
    const updatePayload: any = {};
    if (quota_limit !== undefined) updatePayload.quota_limit = quota_limit;
    if (usage_count !== undefined) updatePayload.usage_count = usage_count;

    await db.update('users', req.params.id, updatePayload);
    const user = await db.findById('users', req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password, user_key, ...safe } = user;
    res.json({ ...safe, user_key: maskApiKey(user_key) });
  } catch (error: any) {
    console.error('Update user quota error:', error);
    res.status(500).json({ error: 'Failed to update user quota' });
  }
});

export default router;
