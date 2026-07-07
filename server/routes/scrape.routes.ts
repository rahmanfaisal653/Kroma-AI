/**
 * POST /api/scrape — Scrape a URL and return clean text.
 * Protected by requireAuth. Rate-limited to 5 per minute per user.
 *
 * ChromaDB integration:
 * - Before scraping: check if URL is cached in ChromaDB (< 24h)
 * - After scraping: auto-store to ChromaDB in background (fire-and-forget)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { scrapeAndCleanUrl } from '../../src/rag/scraperService.js';
import { config } from '../config.js';
import logger from '../utils/logger.js';
import { isPrivateOrLocalHost } from '../utils/helpers.js';
import { getCachedUrl, ingestToChromaDB } from '../services/knowledge.service.js';

const router = Router();

const MAX_CONTEXT_CHARS = Number(process.env.MAX_SCRAPE_CONTEXT_CHARS) || 32000;

// Simple in-memory rate limiter per user (resets every minute)
const scrapeRateMap = new Map<string, { count: number; resetAt: number }>();
const MAX_SCRAPES_PER_MIN = 5;

function checkScrapeRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = scrapeRateMap.get(userId);
  if (!entry || now > entry.resetAt) {
    scrapeRateMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= MAX_SCRAPES_PER_MIN) return false;
  entry.count++;
  return true;
}

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of scrapeRateMap) {
    if (now > entry.resetAt) scrapeRateMap.delete(key);
  }
}, 5 * 60_000).unref();

router.post('/', async (req: Request, res: Response) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing or invalid "url" field.' });
  }

  // Validate URL format
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid URL format.' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ success: false, error: 'Only http/https URLs are supported.' });
  }
  if (!config.allowPrivateScrapeTargets && isPrivateOrLocalHost(parsed.hostname)) {
    return res.status(400).json({ success: false, error: 'Private or local scrape targets are not allowed.' });
  }

  // Rate limit check
  const userId = String((req as any).user?.id || (req as any).user?.email || 'unknown');
  if (!checkScrapeRateLimit(userId)) {
    return res.status(429).json({
      success: false,
      error: `Rate limit exceeded. Max ${MAX_SCRAPES_PER_MIN} scrapes per minute.`,
    });
  }

  // ─── Step 1: Check ChromaDB cache (skip scrape if fresh) ───
  try {
    const cached = await getCachedUrl(url);
    if (cached) {
      const truncated = cached.length > MAX_CONTEXT_CHARS;
      const resultText = truncated
        ? cached.slice(0, MAX_CONTEXT_CHARS) + '\n\n...[content truncated]'
        : cached;

      logger.info('URL served from ChromaDB cache', { url, chars: cached.length });
      return res.json({
        success: true,
        url,
        text: resultText,
        chars: resultText.length,
        truncated,
        cached: true,
      });
    }
  } catch {
    // ChromaDB unavailable — proceed with fresh scrape
  }

  // ─── Step 2: Fresh scrape ───
  const scraperUrl = config.scraperApiUrl;
  if (!scraperUrl) {
    logger.warn('SCRAPER_API_URL not configured, falling back to direct fetch', { url });
  }

  try {
    const startTime = Date.now();
    let text = '';
    
    if (scraperUrl) {
      // Use scraper API if available
      text = await scrapeAndCleanUrl(scraperUrl, url);
    } else {
      // Fallback to direct fetch
      const { fetchHtmlDirect } = await import('../../src/rag/scraperService.js');
      const html = await fetchHtmlDirect(url);
      const { load } = await import('cheerio');
      const $ = load(html);
      $('script, style, nav, footer, header, aside, iframe, noscript, form, button').remove();
      text = $('body').text().replace(/\s+/g, ' ').trim();
    }

    const elapsed = Date.now() - startTime;
    const truncated = text.length > MAX_CONTEXT_CHARS;
    const resultText = truncated
      ? text.slice(0, MAX_CONTEXT_CHARS) + '\n\n...[content truncated]'
      : text;

    logger.info('URL scraped successfully', {
      url,
      chars: text.length,
      truncated,
      elapsed: `${elapsed}ms`,
    });

    // ─── Step 3: Auto-ingest to ChromaDB (background, fire-and-forget) ───
    if (text.length > 50) {
      ingestToChromaDB(url, text, userId).catch(err => {
        logger.warn('Background ChromaDB ingest failed (non-fatal)', { url, error: err.message });
      });
    }

    return res.json({
      success: true,
      url,
      text: resultText,
      chars: resultText.length,
      truncated,
      cached: false,
    });
  } catch (err: any) {
    logger.error('Scrape failed', { url, error: err.message });
    return res.status(502).json({
      success: false,
      url,
      error: `Failed to scrape URL: ${err.message || 'Unknown error'}`,
    });
  }
});

export default router;
