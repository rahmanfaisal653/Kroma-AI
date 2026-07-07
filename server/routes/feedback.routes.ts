/**
 * Feedback routes — thumbs up/down per assistant message.
 * Stores in Kroombase `feedback` table.
 *
 * POST   /api/feedback          — Submit feedback
 * GET    /api/feedback           — Get user's feedback (admin: all)
 * DELETE /api/feedback/:id       — Delete feedback
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../services/db.service.js';
import logger from '../utils/logger.js';

const router = Router();
const TABLE = 'feedback';

// POST /api/feedback
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { conversation_id, message_index, rating, comment } = req.body || {};

    if (!conversation_id || message_index === undefined || !rating) {
      return res.status(400).json({ error: 'Missing required fields: conversation_id, message_index, rating' });
    }

    if (!['up', 'down'].includes(rating)) {
      return res.status(400).json({ error: 'Rating must be "up" or "down"' });
    }

    const feedback = {
      user_id: user?.id || user?.email || 'anonymous',
      conversation_id: String(conversation_id),
      message_index: Number(message_index),
      rating,
      comment: String(comment || '').trim(),
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };

    const result = await db.create(TABLE, feedback);
    logger.info('Feedback submitted', { feedback });
    return res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    // Table might not exist yet — handle gracefully
    if (err?.message?.includes('does not exist')) {
      logger.warn('Feedback table does not exist yet. Create it in Kroombase.');
      return res.status(503).json({
        error: 'Feedback feature not available yet. Table needs to be created.',
      });
    }
    logger.error('Feedback submission failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// GET /api/feedback
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isAdmin = user?.role === 'admin';

    const allFeedback = await db.findAll(TABLE);
    const filtered = isAdmin
      ? allFeedback
      : allFeedback.filter((f: any) => f.user_id === (user?.id || user?.email));

    return res.json({ data: filtered });
  } catch (err: any) {
    if (err?.message?.includes('does not exist')) {
      return res.json({ data: [] });
    }
    return res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// DELETE /api/feedback/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await db.remove(TABLE, req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete feedback' });
  }
});

export default router;
