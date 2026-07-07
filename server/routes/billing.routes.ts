import { Router } from 'express';
import { db } from '../services/db.service.js';
import { findUserByKey } from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/admin.middleware.js';
import { logCreditLedger } from '../services/gateway.service.js';

const router = Router();

// POST /api/billing/buy-credits — Admin-only direct-add credits
router.post('/buy-credits', requireAuth, requireRole('admin'), async (req, res) => {
  const { userKey, amount } = req.body;
  if (!userKey || !amount) return res.status(400).json({ error: 'userKey and amount are required' });

  const parsedAmount = Math.round(Number(amount));
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer' });
  }

  try {
    const user = await findUserByKey(userKey);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Atomic increment — no read-modify-write race
    const affected = await db.atomicIncrement('users', user.id, 'quota_limit', parsedAmount);
    if (affected === 0) {
      return res.status(500).json({ error: 'Failed to update user credits' });
    }

    const updated = await db.findById('users', user.id);
    const newQuota = Number(updated?.quota_limit) || 0;

    logCreditLedger({
      user_id: user.id,
      type: 'admin_grant',
      amount: parsedAmount,
      balance_after: newQuota,
      reason: 'Admin direct credit addition',
    });

    res.json({ success: true, credits_added: parsedAmount, new_quota: newQuota });
  } catch (error: any) {
    console.error('Buy credits error:', error.message);
    res.status(500).json({ error: 'Failed to process credit purchase' });
  }
});

// POST /api/transactions — User submits a purchase (creates "pending" transaction)
router.post('/transactions', requireAuth, async (req, res) => {
  const { plan_id, payment_method, payment_method_id, custom_credits } = req.body;
  const paymentMethodRef = payment_method || payment_method_id;
  if (!paymentMethodRef) {
    return res.status(400).json({ error: 'Data tidak lengkap (payment_method wajib diisi)' });
  }

  try {
    let credits = 0;
    let bonusCredits = 0;
    let price = 0;
    let planName = '';
    let planIdStr = '';

    // Handle custom credits purchase
    if (custom_credits) {
      const customAmount = Math.round(Number(custom_credits) || 0);
      if (!Number.isFinite(customAmount) || customAmount <= 0) {
        return res.status(400).json({ error: 'Jumlah credits harus lebih dari 0' });
      }
      if (customAmount > 50000) {
        return res.status(400).json({ error: 'Maksimal pembelian 50.000 credits' });
      }

      credits = customAmount;
      bonusCredits = 0;
      price = customAmount * 100; // Rate: 1 credit = Rp 100
      planName = `Custom ${customAmount} Credits`;
      planIdStr = 'custom';
    } else {
      // Regular plan purchase
      if (!plan_id) {
        return res.status(400).json({ error: 'plan_id atau custom_credits wajib diisi' });
      }

      const plan = await db.findById('plans', plan_id);
      if (!plan) return res.status(404).json({ error: 'Plan tidak ditemukan' });

      credits = Math.round(Number(plan.credits) || 0);
      bonusCredits = Math.round(Number(plan.bonus_credits) || 0);
      price = Math.round(Number(plan.price) || 0);
      planName = String(plan.name || '');
      planIdStr = String(plan.id);
    }

    // Validate payment method
    const methodRows = payment_method_id
      ? await db.findWhere('payment_methods', 'id', payment_method_id)
      : await db.findWhere('payment_methods', 'name', paymentMethodRef);
    const method = methodRows.find((m: any) => m?.active === 1 || m?.active === true || m?.active === 'true');
    if (!method) return res.status(400).json({ error: 'Metode pembayaran tidak valid atau tidak aktif' });

    const userRecord = await db.findById('users', req.user!.id);
    if (!userRecord) return res.status(404).json({ error: 'User not found' });

    // Check for existing pending transactions (prevent spam)
    const existingPending = await db.findWhere('transactions', 'user_email', String(userRecord.email || ''), {
      column: 'status', op: '=', value: 'PENDING', limit: 5, order: 'id.desc'
    });
    if (existingPending.length >= 3) {
      return res.status(429).json({
        error: 'Terlalu banyak transaksi pending. Selesaikan atau batalkan transaksi sebelumnya.'
      });
    }

    const payload = {
      user_key: String(userRecord.user_key || ''),
      user_email: String(userRecord.email || req.user!.email || ''),
      user_name: String(userRecord.email || ''),
      plan_id: planIdStr,
      plan_name: planName,
      credits: credits,
      bonus_credits: bonusCredits,
      price: price,
      payment_method: String(method.name || payment_method),
      status: 'PENDING',
      notes: '',
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };
    const { id } = await db.create('transactions', payload);
    res.status(201).json({ success: true, id, ...payload });
  } catch (error: any) {
    console.error('Create transaction error:', error.message);
    res.status(500).json({ error: 'Gagal membuat transaksi' });
  }
});

// GET /api/transactions — User views their own transactions (by email, not just key)
router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const userRecord = await db.findById('users', req.user!.id);
    if (!userRecord) return res.json([]);

    // Lookup by email (more reliable than user_key after masking migration)
    const email = String(userRecord.email || '');
    if (!email) return res.json([]);

    const rows = await db.findWhere('transactions', 'user_email', email, { order: 'id.desc', limit: 50 });
    res.json(rows);
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json([]);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
