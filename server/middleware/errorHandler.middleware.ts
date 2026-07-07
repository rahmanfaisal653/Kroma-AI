import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

const log = logger.child('error-handler');

export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    status: 404,
  });
}

export function globalErrorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  const isProduction = process.env.NODE_ENV === 'production';

  log.error(`${req.method} ${req.originalUrl} → ${status}`, {
    error: message,
    stack: isProduction ? undefined : err.stack?.split('\n').slice(0, 3).join(' | '),
    ip: req.ip,
  });

  // For 500 errors, don't expose internal error messages to user
  const userMessage = (status === 500 && !err.statusCode) 
    ? 'Terjadi kesalahan pada server.' 
    : message;

  res.status(status).json({
    error: userMessage,
    ...(status === 500 && isProduction ? {} : { details: err.details || undefined }),
    status,
  });
}
