import { Router } from 'express';
import { db } from '../services/db.service.js';
import {
  generateApiKey, maskApiKey, isLikelyUserApiKey, hashApiKey,
  hashPassword, comparePassword, generateTokens,
  verifyRefreshToken, bumpTokenVersion, usersHasColumn, findUserByEmail, findUserById, toSafeUser, toOwnerUser
} from '../services/auth.service.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { loginSchema, registerSchema, refreshSchema } from '../schemas/auth.schema.js';

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

// POST /api/auth/register
router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if email exists
    try {
      const existing = await findUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    } catch (checkError: any) {
      if (!db.isTableNotFoundError(checkError)) throw checkError;
    }

    const apiKey = generateApiKey();
    const hashedPassword = await hashPassword(password);

    const supportsKeyHash = await usersHasColumn('user_key_hash');
    const newUser = {
      email,
      password: hashedPassword,
      role: 'user',
      user_key: supportsKeyHash ? maskApiKey(apiKey) : apiKey,
      ...(supportsKeyHash ? { user_key_hash: hashApiKey(apiKey) } : {}),
      quota_limit: 0,
      usage_count: 0,
      balance: 0
    };

    const created = await db.create('users', newUser);
    const { id } = created;
    const ownerUser = {
      id,
      email,
      role: 'user',
      user_key: apiKey,
      quota_limit: 0,
      usage_count: 0,
      balance: 0,
    };
    const tokens = await generateTokens({ id, email, role: 'user' });

    // Return full api_key (owner sees their own key)
    res.json({
      success: true,
      user: ownerUser,
      api_key: apiKey,
      ...tokens
    });
  } catch (error: any) {
    console.error('Registration error:', error.response?.data || error.message);
    if (db.isConnectionError(error)) {
      return res.status(503).json(db.dependencyError(error));
    }
    res.status(500).json({ error: 'Failed to register user. Ensure the "users" table exists.' });
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

// PUT /api/auth/update-key
router.put('/update-key', requireAuth, async (req, res) => {
  const { userKey } = req.body;
  const userId = req.user!.id;
  const normalizedUserKey = String(userKey || '').trim();
  if (!isLikelyUserApiKey(normalizedUserKey)) {
    return res.status(400).json({ error: 'Invalid API key format. Must start with "sk-".' });
  }

  try {
    const supportsKeyHash = await usersHasColumn('user_key_hash');
    await db.update('users', userId, supportsKeyHash
      ? { user_key: maskApiKey(normalizedUserKey), user_key_hash: hashApiKey(normalizedUserKey) }
      : { user_key: normalizedUserKey }
    );
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found after update' });
    res.json({ success: true, user: toOwnerUser(user) });
  } catch (error: any) {
    console.error('Update key error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to update user key' });
  }
});

export default router;
