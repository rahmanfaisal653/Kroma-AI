import { Router } from 'express';
import { db } from '../../services/db.service.js';
import { parsePrice } from '../../utils/helpers.js';

const router = Router();

// GET /api/admin/plans
router.get('/', async (req, res) => {
  try {
    const plans = await db.findAll('plans');
    res.json(plans);
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json([]);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// POST /api/admin/plans
router.post('/', async (req, res) => {
  try {
    const payload = {
      name: req.body.name || '',
      price: parsePrice(req.body.price),
      credits: Math.round(Number(req.body.credits) || 0),
      bonus_credits: Math.round(Number(req.body.bonus_credits) || 0),
      processing_fee: Math.round(Number(req.body.processing_fee) || 0),
      billing_cycle: req.body.billing_cycle || 'one-time',
      stripe_product_id: req.body.stripe_product_id || '',
      features: JSON.stringify(
        Array.isArray(req.body.features)
          ? req.body.features
          : (req.body.features || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      ),
      popular: req.body.popular ? 1 : 0
    };

    // Auto-calculate credits (Rp 10 = 1 Credit)
    if (payload.credits === 0 && payload.price > 0) {
      payload.credits = Math.round(payload.price / 10);
    }

    const { id } = await db.create('plans', payload);
    res.status(201).json({ success: true, id, ...payload });
  } catch (error: any) {
    const detail = error.response?.data || error.message;
    console.error('Create plan error:', JSON.stringify(detail));
    res.status(500).json({ error: 'Failed to create plan.', detail });
  }
});

// PUT /api/admin/plans/:id
router.put('/:id', async (req, res) => {
  try {
    const payload: any = {};
    if (req.body.name !== undefined) payload.name = req.body.name;
    if (req.body.price !== undefined) payload.price = parsePrice(req.body.price);
    if (req.body.credits !== undefined) payload.credits = Math.round(Number(req.body.credits) || 0);
    if (req.body.bonus_credits !== undefined) payload.bonus_credits = Math.round(Number(req.body.bonus_credits) || 0);
    if (req.body.processing_fee !== undefined) payload.processing_fee = Math.round(Number(req.body.processing_fee) || 0);
    if (req.body.billing_cycle !== undefined) payload.billing_cycle = req.body.billing_cycle;
    if (req.body.stripe_product_id !== undefined) payload.stripe_product_id = req.body.stripe_product_id;
    if (req.body.features !== undefined) {
      payload.features = Array.isArray(req.body.features) ? JSON.stringify(req.body.features) : req.body.features;
    }
    if (req.body.popular !== undefined) payload.popular = req.body.popular ? 1 : 0;

    await db.update('plans', req.params.id, payload);
    res.json({ success: true });
  } catch (error: any) {
    const detail = error.response?.data || error.message;
    console.error('Update plan error:', JSON.stringify(detail));
    res.status(500).json({ error: 'Failed to update plan', detail });
  }
});

// DELETE /api/admin/plans/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.remove('plans', req.params.id);
    res.json({ success: true, deleted_id: req.params.id });
  } catch (error: any) {
    console.error('Delete plan error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

export default router;
