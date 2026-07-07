import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, findUserByKey, findUserById } from '../services/auth.service.js';
import type { GatewayUser } from '../types/index.js';

/**
 * JWT Auth Middleware — protects routes that need authenticated user.
 * Reads token from Authorization: Bearer <token> header.
 * Attaches user payload to req.user.
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Token missing.' });
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  const dbUser = await findUserById(payload.id);
  if (!dbUser) {
    return res.status(401).json({ error: 'User no longer exists.' });
  }
  const currentTokenVersion = Number((dbUser as any).token_version) || 0;
  const payloadTokenVersion = payload.token_version === undefined ? 0 : Number(payload.token_version);
  if (payloadTokenVersion !== currentTokenVersion) {
    return res.status(401).json({ error: 'Token has been revoked.' });
  }

  (req as any).user = {
    id: dbUser.id,
    email: dbUser.email || payload.email,
    role: dbUser.role || payload.role || 'user',
    status: (dbUser as any).status,
    quota_limit: Number(dbUser.quota_limit) || 0,
    usage_count: Number(dbUser.usage_count) || 0,
  } as GatewayUser;

  next();
};

/**
 * API Key Auth Middleware — for gateway requests.
 * Accepts:
 *   1. x-user-key header (API key)
 *   2. Authorization: Bearer <api_key> (starts with sk-)
 *   3. Authorization: Bearer <jwt_token> (fallback: resolves user from JWT)
 * Looks up user in DB and attaches full quota info to req.user.
 */
export const requireApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const keyFromXHeader = String(req.headers['x-user-key'] || '').trim();
  let apiKey = '';
  let jwtToken = '';

  // Priority: x-user-key > Authorization header
  if (keyFromXHeader && keyFromXHeader.startsWith('sk-')) {
    apiKey = keyFromXHeader;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('sk-')) {
      apiKey = token;
    } else {
      jwtToken = token;
    }
  } else if (keyFromXHeader) {
    // x-user-key might be a JWT token from frontend
    jwtToken = keyFromXHeader;
  }

  // Try API key lookup first
  if (apiKey) {
    try {
      const user = await findUserByKey(apiKey);
      if (!user) {
        return res.status(401).json({ error: 'Invalid API key.' });
      }
      
      // Check user status
      const userStatus = (user as any).status;
      if (userStatus === 'suspended' || userStatus === 'banned') {
        return res.status(403).json({ error: 'Akun dinonaktifkan.', error_code: 'ACCOUNT_SUSPENDED' });
      }
      
      (req as any).user = {
        id: user.id,
        email: user.email || '',
        role: user.role || 'user',
        status: userStatus,
        quota_limit: Number(user.quota_limit) || 0,
        usage_count: Number(user.usage_count) || 0,
      } as GatewayUser;
      return next();
    } catch (error: any) {
      console.error('[requireApiKey] Error:', error.message);
      return res.status(500).json({ error: 'Authentication service error.' });
    }
  }

  // Fallback: JWT token — resolve user from token payload
  if (jwtToken) {
    const payload = await verifyAccessToken(jwtToken);
    if (payload) {
      try {
        const user = await findUserById(payload.id);
        const currentTokenVersion = Number((user as any)?.token_version) || 0;
        const payloadTokenVersion = payload.token_version === undefined ? 0 : Number(payload.token_version);
        if (user && payloadTokenVersion === currentTokenVersion) {
          (req as any).user = {
            id: user.id,
            email: user.email || '',
            role: user.role || 'user',
            status: (user as any).status,
            quota_limit: Number(user.quota_limit) || 0,
            usage_count: Number(user.usage_count) || 0,
          } as GatewayUser;
          return next();
        }
      } catch (error: any) {
        console.error('[requireApiKey] JWT user lookup error:', error.message);
      }
    }
  }

  return res.status(401).json({
    error: 'Authorization required.',
    hint: 'Use: Authorization: Bearer <YOUR_API_KEY> or x-user-key: <YOUR_API_KEY>'
  });
};
