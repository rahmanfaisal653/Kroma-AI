import { Router } from 'express';
import { db } from '../../services/db.service.js';

const router = Router();

// GET /api/admin/payment-methods — all (including inactive)
router.get('/', async (req, res) => {
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
    res.json(methods);
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json([]);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// POST /api/admin/payment-methods
router.post('/', async (req, res) => {
  try {
    const payload: any = {
      name: req.body.name || '',
      type: req.body.type || 'transfer',
      icon: req.body.icon || '',
      bank_name: req.body.bank_name || '',
      account_number: req.body.account_number || '',
      account_name: req.body.account_name || '',
      qr_url: req.body.qr_url || '',
      min_amount: Math.round(Number(req.body.min_amount) || 0),
      active: req.body.active ? 1 : 0
    };
    if (req.body.id !== undefined) payload.id = String(req.body.id).trim();
    if (!payload.id) payload.id = String(payload.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `method-${Date.now()}`;
    if (!payload.name) return res.status(400).json({ error: 'name is required' });
    const { id } = await db.create('payment_methods', payload);
    res.status(201).json({ success: true, id, ...payload });
  } catch (error: any) {
    const detail = error.response?.data || error.message;
    res.status(500).json({ error: 'Failed to create payment method', detail });
  }
});

// PUT /api/admin/payment-methods/:id
router.put('/:id', async (req, res) => {
  try {
    const payload: any = {};
    if (req.body.name !== undefined) payload.name = req.body.name;
    if (req.body.type !== undefined) payload.type = req.body.type;
    if (req.body.icon !== undefined) payload.icon = req.body.icon;
    if (req.body.bank_name !== undefined) payload.bank_name = req.body.bank_name;
    if (req.body.account_number !== undefined) payload.account_number = req.body.account_number;
    if (req.body.account_name !== undefined) payload.account_name = req.body.account_name;
    if (req.body.qr_url !== undefined) payload.qr_url = req.body.qr_url;
    if (req.body.min_amount !== undefined) payload.min_amount = Math.round(Number(req.body.min_amount) || 0);
    if (req.body.active !== undefined) payload.active = req.body.active ? 1 : 0;
    await db.update('payment_methods', req.params.id, payload);
    res.json({ success: true });
  } catch (error: any) {
    const detail = error.response?.data || error.message;
    res.status(500).json({ error: 'Failed to update payment method', detail });
  }
});

// DELETE /api/admin/payment-methods/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.remove('payment_methods', req.params.id);
    res.json({ success: true, deleted_id: req.params.id });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete payment method' });
  }
});

export default router;
