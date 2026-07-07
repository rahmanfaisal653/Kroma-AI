import axios from 'axios';

const SERVICE_DOWN_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN'
]);

export class UpstreamServiceError extends Error {
  service: string;
  statusCode: number;
  code: string;
  detail: any;

  constructor(service: string, statusCode: number, code: string, detail: any) {
    super(`${service} service is unavailable`);
    this.service = service;
    this.statusCode = statusCode;
    this.code = code;
    this.detail = detail;
  }
}

export const toUpstreamServiceError = (service: string, error: any): UpstreamServiceError => {
  const code = String(error?.code || '').toUpperCase();
  const upstreamStatus = Number(error?.response?.status || 0);
  const isTransportDown =
    SERVICE_DOWN_CODES.has(code) ||
    upstreamStatus === 0 ||
    upstreamStatus === 502 ||
    upstreamStatus === 503 ||
    upstreamStatus === 504;
  const statusCode = isTransportDown ? 503 : 500;
  const detail = axios.isAxiosError(error)
    ? (error.response?.data || error.message)
    : (error?.message || String(error || 'Unknown upstream error'));
  return new UpstreamServiceError(service, statusCode, code || 'UPSTREAM_ERROR', detail);
};

