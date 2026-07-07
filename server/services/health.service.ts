import axios from 'axios';
import net from 'net';
import { URL } from 'url';
import { config } from '../config.js';
import { db } from './db.service.js';

type DependencyName = 'database' | 'kroombase' | 'chromadb' | 'mongodb';
type DependencyStatus = 'ok' | 'down' | 'not_configured';

export type DependencyHealth = {
  name: DependencyName;
  status: DependencyStatus;
  latency_ms: number | null;
  message?: string;
};

const maskUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (parsed.username) parsed.username = '***';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
};

const elapsed = (started: number) => Date.now() - started;

const checkHttp = async (
  name: DependencyName,
  url: string,
  options?: { headers?: Record<string, string>; paths?: string[] }
): Promise<DependencyHealth> => {
  if (!url) {
    return { name, status: 'not_configured', latency_ms: null, message: 'Environment variable belum diset.' };
  }

  const baseUrl = url.replace(/\/+$/, '');
  const paths = options?.paths?.length ? options.paths : [''];
  const started = Date.now();
  let lastMessage = '';

  for (const path of paths) {
    try {
      await axios.get(`${baseUrl}${path}`, {
        headers: options?.headers,
        timeout: config.healthTimeoutMs,
        validateStatus: (status) => status >= 200 && status < 500,
      });
      return { name, status: 'ok', latency_ms: elapsed(started) };
    } catch (error: any) {
      lastMessage = error?.code || error?.message || 'Connection failed';
    }
  }

  return {
    name,
    status: 'down',
    latency_ms: elapsed(started),
    message: `${lastMessage} (${maskUrl(baseUrl)})`,
  };
};

const parseMongoTarget = (uri: string): { host: string; port: number } | null => {
  try {
    const normalized = uri.startsWith('mongodb+srv://')
      ? uri.replace('mongodb+srv://', 'mongodb://')
      : uri;
    const parsed = new URL(normalized);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 27017,
    };
  } catch {
    return null;
  }
};

const checkDatabase = async (): Promise<DependencyHealth> => {
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
};

const checkMongoDb = async (): Promise<DependencyHealth> => {
  if (!config.mongodbUri) {
    return { name: 'mongodb', status: 'not_configured', latency_ms: null, message: 'MONGODB_URI belum diset.' };
  }

  const target = parseMongoTarget(config.mongodbUri);
  if (!target) {
    return { name: 'mongodb', status: 'down', latency_ms: null, message: 'MONGODB_URI tidak valid.' };
  }

  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection(target.port, target.host);
    const finish = (status: DependencyStatus, message?: string) => {
      socket.destroy();
      resolve({ name: 'mongodb', status, latency_ms: elapsed(started), message });
    };

    socket.setTimeout(config.healthTimeoutMs);
    socket.once('connect', () => finish('ok'));
    socket.once('timeout', () => finish('down', `Timeout connect ke ${target.host}:${target.port}`));
    socket.once('error', (error: any) => finish('down', `${error?.code || error?.message || 'Connection failed'} (${target.host}:${target.port})`));
  });
};

export const checkDependencies = async () => {
  const [database, chromadb, mongodb] = await Promise.all([
    checkDatabase(),
    checkHttp('chromadb', config.chromaDbUrl, {
      paths: ['/api/v2/heartbeat', '/api/v1/heartbeat'],
    }),
    checkMongoDb(),
  ]);

  const dependencies = { database, chromadb, mongodb };
  const values = Object.values(dependencies);
  const requiredDown = values.some(dep => dep.status === 'down');
  const configured = values.filter(dep => dep.status !== 'not_configured');

  return {
    status: requiredDown ? 'degraded' : 'ok',
    configured: configured.length,
    dependencies,
  };
};
