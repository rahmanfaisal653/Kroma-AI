import { Router } from 'express';
import { db } from '../services/db.service.js';
import {
  comparePassword, generateTokens,
  verifyRefreshToken, bumpTokenVersion, findUserByEmail, findUserById, toOwnerUser
} from '../services/auth.service.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { loginSchema, refreshSchema } from '../schemas/auth.schema.js';

const router = Router();

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    const loginId = String(email || '').trim();
    const lookupEmail = loginId.includes('@') ? loginId : `${loginId}@local.kroma`;
    const fallbackEmail = loginId === 'kroma123@gmail.com' ? 'kroma123@local.kroma' : '';
    const user = await findUserByEmail(lookupEmail) || (fallbackEmail ? await findUserByEmail(fallbackEmail) : null);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokens = await generateTokens({ id: user.id, email: user.email, role: user.role });
    const ownerUser = toOwnerUser(user);

    res.json({
      success: true,
      user: ownerUser,
      ...tokens
    });
  } catch (error: any) {
    if (db.isTableNotFoundError(error)) {
      return res.status(401).json({ error: 'Invalid email or password (Table not initialized)' });
    }
    console.error('Login error:', error.response?.data || error.message);
    if (db.isConnectionError(error)) {
      return res.status(503).json(db.dependencyError(error));
    }
    res.status(500).json({ error: 'Database connection error' });
  }
});


// POST /api/auth/refresh
router.post('/refresh', validate(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body;

  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const user = await findUserById(payload.id);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  await bumpTokenVersion(user.id);
  const tokens = await generateTokens({ id: user.id, email: user.email, role: user.role });
  res.json({ success: true, ...tokens });
});

// POST /api/auth/logout — revoke current refresh/access token family
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await bumpTokenVersion(req.user!.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Logout error:', error.response?.data || error.message);
    if (db.isConnectionError(error)) {
      return res.status(503).json(db.dependencyError(error));
    }
    res.status(500).json({ error: 'Failed to logout' });
  }
});


export default router;
