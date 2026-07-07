import type { GatewayUser } from './index.js';

declare global {
  namespace Express {
    interface Request {
      user?: GatewayUser;
    }
  }
}

export {};
