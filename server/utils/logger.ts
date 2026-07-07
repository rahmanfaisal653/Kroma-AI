type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[CURRENT_LEVEL];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, module: string, msg: string, meta?: Record<string, any>): string {
  const base = `${formatTimestamp()} [${level.toUpperCase().padEnd(5)}] [${module}] ${msg}`;
  if (meta && Object.keys(meta).length > 0) {
    return `${base} ${JSON.stringify(meta)}`;
  }
  return base;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, any>): void;
  info(msg: string, meta?: Record<string, any>): void;
  warn(msg: string, meta?: Record<string, any>): void;
  error(msg: string, meta?: Record<string, any>): void;
  child(module: string): Logger;
}

function createLogger(module: string): Logger {
  return {
    debug(msg, meta) {
      if (shouldLog('debug')) console.debug(formatMessage('debug', module, msg, meta));
    },
    info(msg, meta) {
      if (shouldLog('info')) console.log(formatMessage('info', module, msg, meta));
    },
    warn(msg, meta) {
      if (shouldLog('warn')) console.warn(formatMessage('warn', module, msg, meta));
    },
    error(msg, meta) {
      if (shouldLog('error')) console.error(formatMessage('error', module, msg, meta));
    },
    child(childModule) {
      return createLogger(`${module}:${childModule}`);
    },
  };
}

export const logger = createLogger('kroma');
export default logger;
