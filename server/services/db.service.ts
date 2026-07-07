import axios from 'axios';
import * as mysql from 'mysql2/promise';
import { config } from '../config.js';
import logger from '../utils/logger.js';

const log = logger.child('db');
const MAX_RETRIES = 1;
const BASE_BACKOFF_MS = 300;

const kroombaseClient = axios.create({
  timeout: config.dbTimeoutMs,
  validateStatus: (status) => status >= 200 && status < 300,
});

const kroombaseHeaders = () => ({
  apikey: config.kroombaseApiKey,
  'Content-Type': 'application/json'
});

let mysqlPool: mysql.Pool | null = null;

const MYSQL_TABLES = new Set([
  'users', 'apis', 'plans', 'payment_methods', 'transactions', 'docs',
  'async_jobs', 'api_keys', 'usage_logs', 'credit_ledger', 'payment_events', 'feedback'
]);

const MYSQL_COLUMNS: Record<string, Set<string>> = {};

function isMysqlEnabled(): boolean {
  return config.dbProvider === 'mysql';
}

function assertSafeTable(table: string): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error(`Invalid table name: ${table}`);
  if (isMysqlEnabled() && !MYSQL_TABLES.has(table)) throw new Error(`Unsupported table: ${table}`);
}

function assertSafeColumn(column: string): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(column)) throw new Error(`Invalid column name: ${column}`);
}

function getMysqlPool(): mysql.Pool {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: config.mysqlHost,
      port: config.mysqlPort,
      user: config.mysqlUser,
      password: config.mysqlPassword,
      database: config.mysqlDatabase,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      namedPlaceholders: true,
      decimalNumbers: false,
      dateStrings: true,
    });
  }
  return mysqlPool;
}

async function withRetry<T>(fn: () => Promise<T>, context?: string): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err.response?.status;
      const code = String(err.code || '').toUpperCase();
      const isRetryable = !status || status >= 500 || ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'].includes(code);
      if (!isRetryable || attempt === MAX_RETRIES) break;
      const delay = BASE_BACKOFF_MS * Math.pow(2, attempt);
      log.warn(`Retry ${attempt + 1}/${MAX_RETRIES} for ${context || 'db call'} in ${delay}ms`, { status, code: err.code });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

async function mysqlColumns(table: string): Promise<Set<string>> {
  assertSafeTable(table);
  if (MYSQL_COLUMNS[table]) return MYSQL_COLUMNS[table];
  const [rows] = await getMysqlPool().query<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM \`${table}\``);
  MYSQL_COLUMNS[table] = new Set(rows.map(row => String(row.Field)));
  return MYSQL_COLUMNS[table];
}

async function mysqlFilterData(table: string, data: Record<string, any>): Promise<Record<string, any>> {
  const columns = await mysqlColumns(table);
  return Object.fromEntries(Object.entries(data).filter(([key]) => columns.has(key)));
}

async function mysqlFindAll(table: string, params?: Record<string, any>): Promise<any[]> {
  assertSafeTable(table);
  const values: any[] = [];
  let sql = `SELECT * FROM \`${table}\``;

  if (params?.column && params?.op === '=') {
    const column = String(params.column);
    assertSafeColumn(column);
    sql += ` WHERE \`${column}\` = ?`;
    values.push(params.value);
  }

  if (params?.limit) {
    const limit = Math.max(1, Math.min(Number(params.limit) || 100, 1000));
    sql += ` LIMIT ${limit}`;
  }

  const [rows] = await getMysqlPool().query(sql, values);
  return Array.isArray(rows) ? rows as any[] : [];
}

async function mysqlCreate(table: string, data: Record<string, any>): Promise<{ id: string | number; data: any }> {
  assertSafeTable(table);
  const filtered = await mysqlFilterData(table, data);
  if (Object.keys(filtered).length === 0) throw new Error(`No valid columns for insert into ${table}`);
  const keys = Object.keys(filtered);
  const placeholders = keys.map(() => '?').join(', ');
  const columns = keys.map(key => `\`${key}\``).join(', ');
  const values = keys.map(key => filtered[key]);
  const [result] = await getMysqlPool().query<mysql.ResultSetHeader>(`INSERT INTO \`${table}\` (${columns}) VALUES (${placeholders})`, values);
  const id = filtered.id ?? result.insertId ?? `${Date.now()}`;
  return { id, data: { id, ...filtered } };
}

async function mysqlUpdate(table: string, id: string | number, data: Record<string, any>): Promise<any> {
  assertSafeTable(table);
  const filtered = await mysqlFilterData(table, data);
  if (Object.keys(filtered).length === 0) return { id };
  const keys = Object.keys(filtered);
  const assignments = keys.map(key => `\`${key}\` = ?`).join(', ');
  const values = keys.map(key => filtered[key]);
  await getMysqlPool().query(`UPDATE \`${table}\` SET ${assignments} WHERE \`id\` = ?`, [...values, id]);
  return { id, ...filtered };
}

export const db = {
  async findAll(table: string, params?: Record<string, any>): Promise<any[]> {
    if (isMysqlEnabled()) return withRetry(() => mysqlFindAll(table, params), `findAll(${table})`);
    const res = await withRetry(() => kroombaseClient.get(`${config.kroombaseUrl}/${table}`, {
      headers: kroombaseHeaders(),
      params
    }), `findAll(${table})`);
    return Array.isArray(res.data) ? res.data : [];
  },

  async findWhere(table: string, column: string, value: any, extra?: Record<string, any>): Promise<any[]> {
    if (isMysqlEnabled()) return this.findAll(table, { column, op: '=', value, ...extra });
    const res = await withRetry(() => kroombaseClient.get(`${config.kroombaseUrl}/${table}`, {
      headers: kroombaseHeaders(),
      params: { column, op: '=', value, ...extra }
    }), `findWhere(${table},${column})`);
    return Array.isArray(res.data) ? res.data : [];
  },

  async findOne(table: string, column: string, value: any): Promise<any | null> {
    const rows = await db.findWhere(table, column, value, { limit: 1 });
    return rows.length > 0 ? rows[0] : null;
  },

  async findById(table: string, id: string | number): Promise<any | null> {
    return db.findOne(table, 'id', id);
  },

  async create(table: string, data: Record<string, any>): Promise<{ id: string | number; data: any }> {
    if (isMysqlEnabled()) return withRetry(() => mysqlCreate(table, data), `create(${table})`);
    const res = await withRetry(() => kroombaseClient.post(`${config.kroombaseUrl}/${table}`, data, { headers: kroombaseHeaders() }), `create(${table})`);
    const id = res.data?.id || res.data?.[0]?.id || `${Date.now()}`;
    return { id, data: res.data };
  },

  async update(table: string, id: string | number, data: Record<string, any>): Promise<any> {
    if (isMysqlEnabled()) return withRetry(() => mysqlUpdate(table, id, data), `update(${table},${id})`);
    const res = await withRetry(() => kroombaseClient.put(`${config.kroombaseUrl}/${table}/${id}`, data, { headers: kroombaseHeaders() }), `update(${table},${id})`);
    return res.data;
  },

  async remove(table: string, id: string | number): Promise<void> {
    assertSafeTable(table);
    if (isMysqlEnabled()) {
      await withRetry(() => getMysqlPool().query(`DELETE FROM \`${table}\` WHERE \`id\` = ?`, [id]), `remove(${table},${id})`);
      return;
    }
    await withRetry(() => kroombaseClient.delete(`${config.kroombaseUrl}/${table}/${id}`, { headers: kroombaseHeaders() }), `remove(${table},${id})`);
  },

  async getTableColumns(table: string): Promise<string[]> {
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) return [];
    if (isMysqlEnabled()) return Array.from(await mysqlColumns(table));
    try {
      const restRes = await kroombaseClient.get(`${config.kroombaseUrl}/${table}`, { headers: kroombaseHeaders(), params: { limit: 1 } });
      const rows = restRes.data;
      if (Array.isArray(rows) && rows.length > 0 && typeof rows[0] === 'object') return Object.keys(rows[0]);
    } catch {
      return [];
    }
    return [];
  },

  async ping(): Promise<void> {
    if (isMysqlEnabled()) {
      await getMysqlPool().query('SELECT 1');
      return;
    }
    await kroombaseClient.get(config.kroombaseUrl, { headers: kroombaseHeaders() });
  },

  async query<T = any>(sql: string, values?: any[]): Promise<T> {
    if (!isMysqlEnabled()) throw new Error('Raw SQL only available with MySQL provider');
    const [rows] = await getMysqlPool().query(sql, values);
    return rows as T;
  },

  async atomicIncrement(table: string, id: string | number, column: string, amount: number): Promise<number> {
    assertSafeTable(table);
    assertSafeColumn(column);
    const sql = `UPDATE \`${table}\` SET \`${column}\` = COALESCE(\`${column}\`, 0) + ? WHERE \`id\` = ?`;
    const result = await this.query(sql, [amount, id]) as mysql.ResultSetHeader;
    return result.affectedRows;
  },

  async conditionalUpdate(table: string, id: string | number, data: Record<string, any>, condition: { column: string; value: any }): Promise<number> {
    assertSafeTable(table);
    assertSafeColumn(condition.column);
    const filtered = await mysqlFilterData(table, data);
    if (Object.keys(filtered).length === 0) return 0;
    const keys = Object.keys(filtered);
    const assignments = keys.map(key => `\`${key}\` = ?`).join(', ');
    const values = keys.map(key => filtered[key]);
    const sql = `UPDATE \`${table}\` SET ${assignments} WHERE \`id\` = ? AND \`${condition.column}\` = ?`;
    const result = await this.query(sql, [...values, id, condition.value]) as mysql.ResultSetHeader;
    return result.affectedRows;
  },

  isTableNotFoundError(error: any): boolean {
    const detail = JSON.stringify(error?.response?.data || error?.message || '').toLowerCase();
    return detail.includes('does not exist') || detail.includes("doesn't exist") || error?.code === 'ER_NO_SUCH_TABLE';
  },

  isConnectionError(error: any): boolean {
    const code = String(error?.code || '').toUpperCase();
    return ['ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'PROTOCOL_CONNECTION_LOST'].includes(code) || !error?.response;
  },

  isMissingColumnError(error: any, column?: string): boolean {
    const detail = JSON.stringify(error?.response?.data || error?.message || '').toLowerCase();
    return (detail.includes('column') || error?.code === 'ER_BAD_FIELD_ERROR') && (!column || detail.includes(column.toLowerCase()));
  },

  dependencyError(error: any) {
    const provider = isMysqlEnabled() ? 'mysql' : 'kroombase';
    const isTimeout = String(error?.code || '').toUpperCase() === 'ECONNABORTED' || String(error?.code || '').toUpperCase() === 'ETIMEDOUT';
    return {
      error: isTimeout ? 'Database request timeout' : 'Database connection error',
      code: `${provider.toUpperCase()}_UNAVAILABLE`,
      dependency: provider,
      retryable: true,
      message: provider === 'mysql'
        ? 'MySQL lokal sedang tidak tersedia. Pastikan service MySQL aktif dan credential env benar.'
        : 'Kroombase sedang tidak tersedia. Coba lagi setelah service database aktif.',
    };
  }
};
