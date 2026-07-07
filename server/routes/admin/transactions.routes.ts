import { Router } from 'express';
import { db } from '../../services/db.service.js';
import { findUserByEmail, findUserByKey } from '../../services/auth.service.js';
import { logCreditLedger, adjustUserUsageSafely } from '../../services/gateway.service.js';

const router = Router();

// GET /api/admin/transactions — with pagination
router.get('/', async (req, res) => {
  try {
    const { status, page, limit } = req.query;
    const pageSize = Math.min(Number(limit) || 100, 500);
    const pageNum = Math.max(Number(page) || 1, 1);
    const offset = (pageNum - 1) * pageSize;

    // Build query with offset support via raw SQL
    let sql = `SELECT * FROM transactions`;
    const values: any[] = [];
    if (status) {
      sql += ` WHERE status = ?`;
      values.push(status);
    }
    sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
    values.push(pageSize, offset);

    const rows = await db.query(sql, values);

    // Also get total count for pagination metadata
    let countSql = `SELECT COUNT(*) as total FROM transactions`;
    const countValues: any[] = [];
    if (status) {
      countSql += ` WHERE status = ?`;
      countValues.push(status);
    }
    const countResult = await db.query(countSql, countValues) as any[];
    const total = countResult?.[0]?.total || 0;

    res.json({
      data: Array.isArray(rows) ? rows : [],
      pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } });
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// PUT /api/admin/transactions/:id/confirm — atomic, optimistic lock
router.put('/:id/confirm', async (req, res) => {
  const { notes } = req.body;
  try {
    const tx = await db.findById('transactions', req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.status === 'CONFIRMED') return res.status(400).json({ error: 'Already confirmed' });
    if (tx.status === 'REJECTED') return res.status(400).json({ error: 'Transaction already rejected' });

    // Find user by email first, then by key
    let user: any = null;
    if (tx.user_email) {
      user = await findUserByEmail(tx.user_email);
    }
    if (!user && tx.user_key) {
      user = await findUserByKey(tx.user_key);
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found for this transaction' });
    }

    const totalCredits = (Number(tx.credits) || 0) + (Number(tx.bonus_credits) || 0);

    // Atomic credit addition — no read-modify-write race
    const affectedUser = await db.atomicIncrement('users', user.id, 'quota_limit', totalCredits);
    if (affectedUser === 0) {
      return res.status(500).json({ error: 'Failed to update user credits' });
    }

    // Optimistic lock — only update if still PENDING (prevents double-confirm)
    const affectedTx = await db.conditionalUpdate('transactions', req.params.id, {
      status: 'CONFIRMED',
      notes: notes || 'Dikonfirmasi oleh admin'
    }, { column: 'status', value: 'PENDING' });

    if (affectedTx === 0) {
      // Another admin confirmed it between our check and update — rollback credits
      await db.atomicIncrement('users', user.id, 'quota_limit', -totalCredits);
      const updatedTx = await db.findById('transactions', req.params.id);
      if (updatedTx?.status === 'CONFIRMED') {
        return res.status(409).json({ error: 'Transaction was already confirmed by another admin' });
      }
      return res.status(409).json({ error: 'Transaction status changed, please refresh and retry' });
    }

    // Read updated quota for response
    const updatedUser = await db.findById('users', user.id);
    const newQuota = Number(updatedUser?.quota_limit) || 0;

    // Log to credit ledger for audit trail
    logCreditLedger({
      user_id: user.id,
      type: 'purchase',
      amount: totalCredits,
      balance_after: newQuota,
      reason: `Transaction #${req.params.id} confirmed — ${tx.plan_name || 'credit purchase'}`,
      metadata: { transaction_id: req.params.id, plan: tx.plan_name, price: tx.price, payment_method: tx.payment_method },
    });

    res.json({ success: true, credits_added: totalCredits, new_quota: newQuota });
  } catch (error: any) {
    console.error('Confirm transaction error:', error.message);
    res.status(500).json({ error: 'Gagal konfirmasi transaksi' });
  }
});

// PUT /api/admin/transactions/:id/reject — with status guard
router.put('/:id/reject', async (req, res) => {
  const { notes } = req.body;
  try {
    const tx = await db.findById('transactions', req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.status === 'CONFIRMED') {
      return res.status(400).json({ error: 'Cannot reject a confirmed transaction. Credits have already been added.' });
    }
    if (tx.status === 'REJECTED') {
      return res.status(400).json({ error: 'Transaction already rejected' });
    }

    // Optimistic lock — only reject if still PENDING
    const affected = await db.conditionalUpdate('transactions', req.params.id, {
      status: 'REJECTED',
      notes: notes || 'Ditolak oleh admin'
    }, { column: 'status', value: 'PENDING' });

    if (affected === 0) {
      return res.status(409).json({ error: 'Transaction status changed, please refresh and retry' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Reject transaction error:', error.message);
    res.status(500).json({ error: 'Gagal menolak transaksi' });
  }
});

// GET /api/admin/transactions/failed-refunds — list failed refunds needing reconciliation
router.get('/failed-refunds', async (req, res) => {
  try {
    const failedRefunds = await db.query(
      `SELECT cl.*, u.email, u.quota_limit, u.usage_count 
       FROM credit_ledger cl 
       JOIN users u ON u.id = cl.user_id
       WHERE cl.type = 'refund' 
         AND JSON_EXTRACT(cl.metadata, '$.failed') = true
         AND (cl.reconciled IS NULL OR cl.reconciled = 0)
       ORDER BY cl.created_at DESC`
    );
    
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const total = Array.isArray(failedRefunds) ? failedRefunds.length : 0;
    const rows = Array.isArray(failedRefunds) ? failedRefunds.slice((page - 1) * limit, page * limit) : [];
    
    res.json({
      data: rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1
    });
  } catch (error: any) {
    console.error('Failed refunds query error:', error.message);
    res.status(500).json({ error: 'Gagal mengambil data refund gagal' });
  }
});

// POST /api/admin/transactions/retry-refund/:id — retry a failed refund by ledger ID
router.post('/retry-refund/:id', async (req, res) => {
  try {
    const ledgerId = Number(req.params.id);
    if (!ledgerId) return res.status(400).json({ error: 'ID tidak valid' });
    
    const entry = await db.findById('credit_ledger', ledgerId);
    if (!entry) return res.status(404).json({ error: 'Ledger entry tidak ditemukan' });
    if (entry.type !== 'refund') return res.status(400).json({ error: 'Bukan refund entry' });
    if (entry.reconciled) return res.status(400).json({ error: 'Sudah direkonsiliasi' });
    
    const amount = Number(entry.amount) || 0;
    const userId = entry.user_id;
    
    // Attempt the refund
    await adjustUserUsageSafely(userId, -amount);
    
    // Mark as reconciled
    await db.update('credit_ledger', ledgerId, { reconciled: 1 });
    
    // Log successful reconciliation
    const user = await db.findById('users', userId);
    const quotaLimit = Number(user?.quota_limit) || 0;
    const usageCount = Number(user?.usage_count) || 0;
    logCreditLedger({
      user_id: userId,
      type: 'refund',
      amount,
      balance_after: quotaLimit - usageCount,
      reason: `Refund reconciled (from ledger #${ledgerId})`,
    });
    
    res.json({ success: true, message: `Refund ${amount} kredit berhasil dikembalikan ke user ${userId}` });
  } catch (error: any) {
    console.error('Retry refund error:', error.message);
    res.status(500).json({ error: 'Gagal retry refund', detail: error.message });
  }
});

export default router;
