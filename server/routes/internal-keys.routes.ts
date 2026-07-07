import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { createGatewayKey, listGatewayKeys, revokeGatewayKey } from '../services/internalApiKey.service.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const ownerType = req.query.owner_type === 'partner' ? 'partner' : req.query.owner_type === 'internal' ? 'internal' : undefined;
  res.json(await listGatewayKeys(ownerType));
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const ownerType = req.body?.owner_type === 'partner' ? 'partner' : 'internal';
  const created = await createGatewayKey({
    name,
    owner_type: ownerType,
    owner_name: String(req.body?.owner_name || name).trim(),
    note: String(req.body?.note || '').trim(),
    allowed_models: Array.isArray(req.body?.allowed_models) ? req.body.allowed_models.map(String) : ['*'],
  });
  res.status(201).json(created);
});

router.delete('/:id', async (req, res) => {
  await revokeGatewayKey(req.params.id);
  res.json({ success: true });
});

export default router;
