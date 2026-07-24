import { config } from '../config.js';
import { db } from './db.service.js';

type DependencyStatus = 'ok' | 'down';

export type DependencyHealth = {
  name: 'database';
  status: DependencyStatus;
  latency_ms: number;
  message?: string;
};

const elapsed = (started: number) => Date.now() - started;

async function checkDatabase(): Promise<DependencyHealth> {
  const started = Date.now();
  try {
    await db.ping();
    return { name: 'database', status: 'ok', latency_ms: elapsed(started), message: config.dbProvider };
  } catch (error: any) {
    return {
      name: 'database',
      status: 'down',
      latency_ms: elapsed(started),
      message: `${error?.code || error?.message || 'Connection failed'} (${config.dbProvider})`,
    };
  }
}

export async function checkDependencies() {
  const database = await checkDatabase();
  return {
    status: database.status === 'ok' ? 'ok' : 'degraded',
    configured: 1,
    dependencies: { database },
  };
}
