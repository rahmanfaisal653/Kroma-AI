import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import { config, validateSecurityConfig } from './config.js';
import './types/index.js';
import logger from './utils/logger.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.middleware.js';

// Middleware
import { apiLimiter } from './middleware/rateLimiter.middleware.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';

// Dev-only routes (auto-disabled in production by the route guard)
import devRoutes from './routes/dev.routes.js';

import internalKeysRoutes from './routes/internal-keys.routes.js';
import v1Routes from './routes/v1.routes.js';
import providerStatusRoutes from './routes/provider-status.routes.js';
import { checkDependencies } from './services/health.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// --- Global Middleware ---
// V12: Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// V11: CORS — restrictive in production
const corsOrigins = config.corsOrigin
  ? config.corsOrigin.split(',').map(s => s.trim()).filter(Boolean)
  : undefined;
if (config.nodeEnv === 'production' && !corsOrigins) {
  // In production without explicit CORS_ORIGIN, only allow same-origin
  app.use(cors({ origin: false }));
} else {
  app.use(cors(corsOrigins ? { origin: corsOrigins, credentials: true } : undefined));
}
app.use(express.json({ limit: config.maxBodyJson }));
app.use(apiLimiter);

// --- Health Check (PUBLIC — minimal info only) ---
app.get('/api/health', async (req, res, next) => {
  try {
    const health = await checkDependencies();
    res.status(health.status === 'ok' ? 200 : 503).json({
      status: health.status,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/ready', async (req, res, next) => {
  try {
    const health = await checkDependencies();
    const databaseReady = health.dependencies.database.status === 'ok';
    res.status(databaseReady ? 200 : 503).json({
      status: databaseReady ? 'ready' : 'not_ready',
    });
  } catch (error) {
    next(error);
  }
});

// --- Public API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/v1', v1Routes);                      // OpenAI-compatible gateway

// --- Owner-managed gateway ---
app.use('/api/internal-keys', internalKeysRoutes);
app.use('/api/provider-status', providerStatusRoutes);

// --- Dev-only Routes (gated by env + token; auto-404 in production) ---
app.use('/api/dev', devRoutes);

// Unknown API routes should return JSON 404, not the SPA HTML.
app.use('/api/*', (req, res) => res.status(404).json({ error: 'API route not found' }));

// --- Global Error Handlers (must be AFTER routes) ---
// Note: notFoundHandler is added AFTER vite/static in startServer()

// --- Server Start ---
async function startServer() {
  validateSecurityConfig();
  
  if (config.nodeEnv !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, '..', 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handlers (must be last)
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  app.listen(config.port, '0.0.0.0', () => {
    logger.info(`Server running on http://localhost:${config.port}`, { env: config.nodeEnv });
  });
}

startServer();
