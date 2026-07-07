import axios from 'axios';
import { load } from 'cheerio';
import { toUpstreamServiceError } from './upstreamError.js';

const CHROME_USER_AGENT = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
].join(' ');

const normalizeWhitespace = (text: string): string => (
  String(text || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\t+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
);

const cleanLine = (line: string): string => String(line || '')
  .replace(/\[[0-9]+\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const filterInformativeLines = (text: string): string => {
  const lines = String(text || '')
    .split('\n')
    .map(cleanLine)
    .filter(Boolean);
  const ignored = [
    /^toggle the table of contents/i,
    /^contents$/i,
    /^daftar isi$/i,
    /^navigation$/i,
    /^menu$/i,
    /^search$/i,
    /^login$/i,
    /^register$/i
  ];
  const unique = new Set<string>();
  const kept: string[] = [];
  for (const line of lines) {
    // Keep lines with 8+ chars (lowered from 15 to capture more content)
    if (line.length < 8) continue;
    if (ignored.some((re) => re.test(line))) continue;
    const key = line.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    kept.push(line);
  }
  if (kept.length === 0) {
    return normalizeWhitespace(String(text || ''));
  }
  return kept.join('\n').trim();
};

const extractHtmlPayload = (data: any): string => {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  const candidates = [data.html, data.content, data.text];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  if (typeof data.text === 'string' && data.text.includes('<')) {
    return data.text;
  }
  return JSON.stringify(data);
};

const cleanHtmlToPlainText = (html: string): string => {
  const $ = load(String(html || ''));

  // Remove non-content elements (but keep header for titles)
  $('script, style, nav, footer, aside, iframe, noscript, form, button, svg, canvas').remove();

  const preferredRoot = $('main, article, .content, .post, .entry, [role="main"]').first();
  const root = preferredRoot.length ? preferredRoot : $('body').first();
  const blocks = root
    .find('p, li, article, section, h1, h2, h3, h4, h5, h6, td, th, dt, dd, pre, blockquote, figcaption')
    .toArray()
    .map((el) => cleanLine($(el).text()))
    .filter(Boolean);
  const combinedBlocks = normalizeWhitespace(blocks.join('\n'));
  const plain = normalizeWhitespace((root.length ? root : $('body')).text());
  const base = combinedBlocks.length >= 200 ? combinedBlocks : plain;
  return filterInformativeLines(base);
};

export const fetchHtmlDirect = async (targetUrl: string): Promise<string> => {
  try {
    const response = await axios.get(targetUrl, {
      timeout: 30000,
      validateStatus: () => true,
      headers: {
        'User-Agent': CHROME_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    if (response.status >= 400 && typeof response.data !== 'string') {
      throw new Error(`Direct fetch failed (${response.status})`);
    }
    if (typeof response.data === 'string') return response.data;
    return extractHtmlPayload(response.data);
  } catch (error: any) {
    const maybeHtml = error?.response?.data;
    if (typeof maybeHtml === 'string' && maybeHtml.includes('<html')) {
      return maybeHtml;
    }
    throw toUpstreamServiceError('SCRAPER', error);
  }
};

export const scrapeAndCleanUrl = async (scraperApiUrl: string, targetUrl: string): Promise<string> => {
  let rawHtml = '';
  let scraperFailed = false;

  try {
    // Try POST first (some scraper APIs use POST)
    const response = await axios.post(
      scraperApiUrl,
      { url: targetUrl },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': CHROME_USER_AGENT
        }
      }
    );
    rawHtml = extractHtmlPayload(response.data);
  } catch (error: any) {
    const status = Number(error?.response?.status || 0);
    
    // If POST returns 405 or 422, try GET method
    if (status === 405 || status === 422) {
      try {
        const fallback = await axios.get(scraperApiUrl, {
          params: { url: targetUrl },
          timeout: 30000,
          headers: { 'User-Agent': CHROME_USER_AGENT }
        });
        rawHtml = extractHtmlPayload(fallback.data);
      } catch (getError: any) {
        scraperFailed = true;
        rawHtml = await fetchHtmlDirect(targetUrl);
      }
    } else {
      // For other errors, fallback to direct fetch
      scraperFailed = true;
      rawHtml = await fetchHtmlDirect(targetUrl);
    }
  }

  const scrapedText = cleanHtmlToPlainText(rawHtml);
  if (scrapedText.length >= 400 && !scraperFailed) return scrapedText;

  try {
    const directHtml = await fetchHtmlDirect(targetUrl);
    const directText = cleanHtmlToPlainText(directHtml);
    const bestText = directText.length > scrapedText.length ? directText : scrapedText;
    if (bestText.trim()) return bestText;
  } catch {
    // Direct fetch also failed, return what we have
  }
  
  const minimal = normalizeWhitespace(String(rawHtml || '').replace(/<[^>]+>/g, ' '));
  return minimal;
};
