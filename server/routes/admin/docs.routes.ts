import { Router } from 'express';
import { db } from '../../services/db.service.js';

const router = Router();

// GET /api/admin/docs
router.get('/', async (req, res) => {
  try {
    const docs = await db.findAll('docs');
    res.json(docs);
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) return res.json([]);
    res.status(500).json({ error: 'Failed to fetch docs' });
  }
});

// POST /api/admin/docs
router.post('/', async (req, res) => {
  try {
    const { data } = await db.create('docs', req.body);
    res.json(data);
  } catch (error: any) {
    console.error('Create doc error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create doc. Ensure the "docs" table exists.' });
  }
});

// PUT /api/admin/docs/:id
router.put('/:id', async (req, res) => {
  try {
    const data = await db.update('docs', req.params.id, req.body);
    res.json(data);
  } catch (error: any) {
    console.error('Update doc error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to update doc' });
  }
});

// DELETE /api/admin/docs/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.remove('docs', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete doc error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to delete doc' });
  }
});

export default router;
