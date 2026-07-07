import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter.
 * Uses sliding window per IP.
 * NOTE: For production multi-instance deployments, replace with Redis-backed rate limiter
 * (e.g. rate-limit-redis) to share state across instances.
 */
export function createRateLimiter(opts: { windowMs?: number; max?: number } = {}) {
  const windowMs = opts.windowMs || 60_000; // 1 minute default
  const max = opts.max || 60; // 60 requests per window
  const store = new Map<string, RateLimitEntry>();

  // Prune expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 5 * 60_000).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retry_after_ms: entry.resetAt - now
      });
    }

    next();
  };
}

// Pre-configured limiters
export const apiLimiter = createRateLimiter({ windowMs: 60_000, max: config.apiRateLimitMax });
export const authLimiter = createRateLimiter({ windowMs: 60_000, max: config.authRateLimitMax });
export const gatewayLimiter = createRateLimiter({ windowMs: 60_000, max: config.gatewayRateLimitMax });
