import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { fetchProviderModels } from '../ai/modelCatalog.js';
import { testProviderModel } from '../ai/modelTester.js';
import { createProviderConfig, deleteProviderConfig, getProviderConfig, publicProviderConfigs, setProviderModelCheck, updateProviderConfig } from '../services/providerConfig.service.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const providers = await publicProviderConfigs();
  const data = await Promise.all(providers.map(async provider => {
    if (provider.enabled === false) return { ...provider, status: 'disabled', models: [] };
    const full = await getProviderConfig(provider.id);
    const result = await fetchProviderModels({ ...provider, apiKey: full?.apiKey });
    return { ...provider, status: result.status, error: result.error, models: result.models };
  }));
  res.json(data);
});

router.post('/', async (req, res) => {
  const created = await createProviderConfig({
    id: req.body?.id,
    name: req.body?.name,
    baseUrl: req.body?.baseUrl,
    token: req.body?.apiKey,
    enabled: req.body?.enabled,
    visibility: req.body?.visibility,
    chatPath: req.body?.chatPath,
    modelsPath: req.body?.modelsPath,
  });
  if (!created) return res.status(400).json({ error: 'invalid or duplicate provider' });
  res.status(201).json({ ...(await publicProviderConfigs()).find(p => p.id === created.id) });
});

router.put('/:id', async (req, res) => {
  const updated = await updateProviderConfig(req.params.id, {
    name: req.body?.name,
    baseUrl: req.body?.baseUrl,
    token: req.body?.apiKey,
    enabled: req.body?.enabled,
    visibility: req.body?.visibility,
    chatPath: req.body?.chatPath,
    modelsPath: req.body?.modelsPath,
  });
  if (!updated) return res.status(404).json({ error: 'provider not found' });
  res.json({ ...(await publicProviderConfigs()).find(p => p.id === updated.id) });
});

router.post('/:id/test-model', async (req, res) => {
  const provider = await getProviderConfig(req.params.id);
  const model = String(req.body?.model || '').trim();
  if (!provider) return res.status(404).json({ error: 'provider not found' });
  if (!model) return res.status(400).json({ error: 'model is required' });
  const providerModel = model.startsWith(`${provider.id}/`) ? model.slice(provider.id.length + 1) : model;
  const result = await testProviderModel(provider, providerModel);
  await setProviderModelCheck(provider.id, `${provider.id}/${providerModel}`, result);
  res.json({ model: `${provider.id}/${providerModel}`, ...result });
});

router.delete('/:id', async (req, res) => {
  const existing = await getProviderConfig(req.params.id);
  if (!existing) return res.status(404).json({ error: 'provider not found' });
  await deleteProviderConfig(req.params.id);
  res.json({ success: true });
});

export default router;
