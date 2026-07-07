import { Router } from 'express';
import type { Request, Response } from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/admin.middleware.js';
import { isPrivateOrLocalHost } from '../services/gateway.service.js';

const router = Router();

/**
 * POST /api/debug/proxy-test
 * Test connectivity to a target URL (Admin only — SSRF protection)
 *
 * Body: { target_url: string, target_auth?: string }
 * Returns: connection status, response time, status code, and error details
 */
router.post('/proxy-test', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const { target_url, target_auth } = req.body;

  // Validation
  if (!target_url || typeof target_url !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'target_url is required',
      detail: 'Kirim target_url di body request.'
    });
  }

  // Basic URL validation
  if (!target_url.startsWith('http://') && !target_url.startsWith('https://')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format',
      detail: 'target_url harus dimulai dengan http:// atau https://'
    });
  }

  // SSRF protection: block private/local hosts for non-admin safety
  try {
    const parsed = new URL(target_url);
    if (isPrivateOrLocalHost(parsed.hostname)) {
      return res.status(403).json({
        success: false,
        error: 'Private/local addresses tidak diizinkan',
        detail: `Hostname "${parsed.hostname}" mengarah ke jaringan internal.`,
        suggestion: 'Gunakan URL publik untuk proxy-test.'
      });
    }
  } catch {
    return res.status(400).json({ success: false, error: 'URL tidak valid' });
  }

  const startTime = Date.now();

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'KromaGateway-ConnectionTest/1.0'
  };

  // Add target_auth if provided
  if (target_auth && typeof target_auth === 'string') {
    const trimmed = target_auth.trim();
    if (trimmed.startsWith('Basic ') || trimmed.startsWith('Bearer ')) {
      headers['Authorization'] = trimmed;
    } else if (trimmed.includes(':')) {
      // Format: "x-api-key: value" or "Header-Name: value"
      const [key, ...valueParts] = trimmed.split(':');
      headers[key.trim()] = valueParts.join(':').trim();
    } else {
      headers['Authorization'] = `Bearer ${trimmed}`;
    }
  }

  try {
    // Test 1: Simple HEAD/GET request to check reachability
    const response = await axios({
      method: 'GET',
      url: target_url,
      headers,
      timeout: 8000,
      validateStatus: () => true, // Accept any status code
      maxRedirects: 3,
    });

    const responseTime = Date.now() - startTime;

    // Determine status
    let status: 'ok' | 'warning' | 'error' = 'ok';
    let message = 'Server reachable';

    if (response.status >= 200 && response.status < 300) {
      message = `Server reachable (HTTP ${response.status})`;
    } else if (response.status === 401 || response.status === 403) {
      status = 'warning';
      message = `Server reachable tapi butuh autentikasi (HTTP ${response.status}). Cek target_auth.`;
    } else if (response.status === 404) {
      status = 'warning';
      message = `Server reachable tapi endpoint tidak ditemukan (HTTP 404). Cek target_url.`;
    } else if (response.status === 405) {
      // Method not allowed — server is alive but doesn't support GET
      status = 'ok';
      message = `Server reachable (HTTP 405 — GET not supported, kemungkinan butuh POST)`;
    } else if (response.status >= 500) {
      status = 'error';
      message = `Server reachable tapi error internal (HTTP ${response.status})`;
    } else {
      status = 'warning';
      message = `Server reachable (HTTP ${response.status})`;
    }

    return res.json({
      success: status !== 'error',
      status,
      message,
      http_status: response.status,
      response_time_ms: responseTime,
      server: response.headers['server'] || null,
      content_type: response.headers['content-type'] || null,
    });

  } catch (err: any) {
    const responseTime = Date.now() - startTime;

    // Detailed error classification
    let errorType = 'UNKNOWN_ERROR';
    let message = 'Koneksi gagal';
    let detail = err.message || 'Unknown error';
    let suggestion = '';

    if (err.code === 'ECONNREFUSED') {
      errorType = 'CONNECTION_REFUSED';
      message = 'Server menolak koneksi';
      detail = `Tidak ada service yang berjalan di ${target_url}`;
      suggestion = 'Pastikan server AI sedang berjalan dan port-nya benar.';
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      errorType = 'TIMEOUT';
      message = 'Koneksi timeout (8 detik)';
      detail = `Server di ${target_url} tidak merespons dalam waktu 8 detik`;
      suggestion = 'Server mungkin lambat atau overload. Coba increase timeout atau cek kesehatan server.';
    } else if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      errorType = 'DNS_ERROR';
      message = 'Hostname tidak ditemukan';
      detail = `DNS tidak bisa resolve hostname dari ${target_url}`;
      suggestion = 'Cek apakah URL sudah benar dan DNS server berfungsi.';
    } else if (err.code === 'ECONNRESET') {
      errorType = 'CONNECTION_RESET';
      message = 'Koneksi di-reset oleh server';
      detail = 'Server menutup koneksi secara tiba-tiba';
      suggestion = 'Server mungkin overload atau ada firewall yang memblokir.';
    } else if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') {
      errorType = 'NETWORK_UNREACHABLE';
      message = 'Network tidak bisa dijangkau';
      detail = `Host ${target_url} tidak bisa dijangkau dari server gateway`;
      suggestion = 'Cek network/firewall antara gateway server dan target.';
    } else if (err.code === 'ERR_SSL' || err.message?.includes('SSL') || err.message?.includes('TLS')) {
      errorType = 'SSL_ERROR';
      message = 'SSL/TLS handshake gagal';
      detail = err.message;
      suggestion = 'Cek certificate SSL target server. Jika self-signed, perlu konfigurasi tambahan.';
    } else if (err.response) {
      // Axios got a response but it was an error
      errorType = 'HTTP_ERROR';
      message = `Server returned HTTP ${err.response.status}`;
      detail = err.response.data?.error || err.response.statusText || err.message;
      suggestion = err.response.status >= 500
        ? 'Server mengalami masalah internal.'
        : 'Cek apakah request format sudah benar.';
    }

    return res.status(200).json({
      success: false,
      status: 'error',
      message,
      detail,
      error_type: errorType,
      error_code: err.code || null,
      response_time_ms: responseTime,
      suggestion,
    });
  }
});

export default router;
