import { Router } from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/auth.middleware.js';
import { createProviderConfig, deleteProviderConfig, getProviderConfig, publicProviderConfigs, updateProviderConfig } from '../services/providerConfig.service.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const providers = await publicProviderConfigs();
  const data = await Promise.all(providers.map(async provider => {
    if (provider.id === 'openai' && !provider.configured) return { ...provider, status: 'not_configured' };
    try {
      const full = await getProviderConfig(provider.id);
      const headers: Record<string, string> = {};
      if (full?.apiKey) {
        headers.Authorization = ['Bearer', full.apiKey].join(' ');
        headers['x-api-key'] = full.apiKey;
      }
      const native = !String(provider.baseUrl).endsWith('/v1');
      let response = await axios.get(`${provider.baseUrl}${native ? '/api/tags' : '/models'}`, { timeout: 3000, headers, validateStatus: () => true });
      if (response.status === 404 && !native) response = await axios.get(`${provider.baseUrl.replace(/\/v1$/, '')}/api/tags`, { timeout: 3000, headers, validateStatus: () => true });
      if (response.status >= 400) throw new Error(`GET models failed: HTTP ${response.status}`);
      return { ...provider, status: 'ok' };
    } catch (err: any) {
      return { ...provider, status: 'error', error: err.message };
    }
  }));
  res.json(data);
});

router.post('/', async (req, res) => {
  const created = await createProviderConfig({ id: req.body?.id, name: req.body?.name, baseUrl: req.body?.baseUrl, token: req.body?.apiKey });
  if (!created) return res.status(400).json({ error: 'invalid or duplicate provider' });
  res.status(201).json({ ...(await publicProviderConfigs()).find(p => p.id === created.id) });
});

router.put('/:id', async (req, res) => {
  const updated = await updateProviderConfig(req.params.id, { name: req.body?.name, baseUrl: req.body?.baseUrl, token: req.body?.apiKey });
  if (!updated) return res.status(404).json({ error: 'provider not found' });
  res.json({ ...(await publicProviderConfigs()).find(p => p.id === updated.id) });
});

router.delete('/:id', async (req, res) => {
  const existing = await getProviderConfig(req.params.id);
  if (!existing) return res.status(404).json({ error: 'provider not found' });
  await deleteProviderConfig(req.params.id);
  res.json({ success: true });
});

export default router;
