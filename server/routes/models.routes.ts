import { Router } from 'express';
import { db } from '../services/db.service.js';
import { parseList } from '../utils/helpers.js';

const router = Router();

// GET /api/apis — PUBLIC: List all API services (strips sensitive fields)
router.get('/', async (req, res) => {
  try {
    const raw = await db.findAll('apis');
    const apis = raw
      .filter((api: any) => api?.active === 1 || api?.active === true || api?.active === 'true')
      .map((api: any) => ({
        id: api.id,
        name: api.name || '',
        type: api.type || '',
        description: api.description || '',
        endpoint: api.endpoint || '',
        model_slug: api.model_slug || '',
        features: parseList(api.features),
        versions: parseList(api.versions),
        price_per_token: Number(api.price_per_token) || 0,
        price_input: Number(api.price_input) || 0,
        price_output: Number(api.price_output) || 0,
        max_tokens: Number(api.max_tokens) || undefined,
        default_temperature: api.default_temperature !== undefined ? Number(api.default_temperature) : undefined,
        is_streaming: api.is_streaming === 1 || api.is_streaming === true || api.is_streaming === 'true'
      }));
    res.json(apis);
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json([]);
    console.error('Failed to fetch APIs:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch APIs' });
  }
});

// GET /api/docs — PUBLIC: List docs, optionally filtered by section
router.get('/docs', async (req, res) => {
  try {
    const { section } = req.query;
    if (section) {
      const docs = await db.query(
        `SELECT * FROM docs WHERE section = ? AND published = 1 ORDER BY sort_order ASC, id ASC`,
        [section]
      );
      return res.json(docs);
    }
    const docs = await db.query(`SELECT * FROM docs WHERE published = 1 ORDER BY sort_order ASC, id ASC`);
    res.json(docs);
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json([]);
    res.status(500).json({ error: 'Failed to fetch docs' });
  }
});

// GET /api/plans — PUBLIC: List all pricing plans
router.get('/plans', async (req, res) => {
  try {
    const raw = await db.findAll('plans');
    const plans = raw.map((plan: any) => {
      let features = plan.features;
      try { if (typeof features === 'string') features = JSON.parse(features); } catch { features = []; }
      return {
        id: plan.id,
        name: plan.name || '',
        price: plan.price || '0',
        credits: Number(plan.credits) || 0,
        bonus_credits: Number(plan.bonus_credits) || 0,
        processing_fee: Number(plan.processing_fee) || 0,
        features: Array.isArray(features) ? features : [],
        popular: plan.popular === 1 || plan.popular === true || plan.popular === 'true',
        billing_cycle: plan.billing_cycle || 'one-time',
        stripe_product_id: plan.stripe_product_id || ''
      };
    });
    res.json(plans);
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json([]);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// GET /api/payment-methods — PUBLIC: List active payment methods
router.get('/payment-methods', async (req, res) => {
  try {
    const raw = await db.findAll('payment_methods');
    const methods = raw.map((m: any) => ({
      id: m.id,
      name: m.name || '',
      type: m.type || 'transfer',
      icon: m.icon || '',
      bank_name: m.bank_name || '',
      account_number: m.account_number || '',
      account_name: m.account_name || '',
      qr_url: m.qr_url || '',
      min_amount: Number(m.min_amount) || 0,
      active: m.active === 1 || m.active === true || m.active === 'true'
    }));
    res.json(methods.filter((m: any) => m.active));
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json([]);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

export default router;
