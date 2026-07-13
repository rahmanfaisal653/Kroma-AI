/**
 * useScraper — Detects URLs in chat messages and scrapes them automatically.
 * Returns scraped content for context injection, with caching and status.
 */

import { useState, useCallback, useRef } from 'react';
import { scrapeApi, type ScrapeResponse } from '../../../services/api';
import { extractUrls, isScrapableUrl } from '../utils/urlDetector';

export type ScrapeStatus = 'idle' | 'scraping' | 'done' | 'error';

export interface ScrapeResult {
  url: string;
  text: string;
  chars: number;
  truncated: boolean;
  error?: string;
}

export interface UseScraperReturn {
  status: ScrapeStatus;
  results: ScrapeResult[];
  combinedContext: string;
  scrapeFromMessage: (message: string) => Promise<string>;
  clearScrapeResults: () => void;
}

export function useScraper(): UseScraperReturn {
  const [status, setStatus] = useState<ScrapeStatus>('idle');
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const cacheRef = useRef<Map<string, ScrapeResult>>(new Map());

  const scrapeFromMessage = useCallback(async (message: string): Promise<string> => {
    const urls = extractUrls(message).filter(isScrapableUrl);
    if (urls.length === 0) return '';

    setStatus('scraping');
    const newResults: ScrapeResult[] = [];

    for (const url of urls) {
      // Check cache first
      const cached = cacheRef.current.get(url);
      if (cached) {
        newResults.push(cached);
        continue;
      }

      try {
        console.log(`[Scraper] Scraping URL: ${url}`);
        // Increased timeout from 8s to 30s to match backend timeout
        const response: ScrapeResponse = await scrapeApi.scrapeUrl(url, { timeout: 30000 });
        
        console.log(`[Scraper] Response received:`, {
          success: response.success,
          chars: response.chars,
          truncated: response.truncated,
          cached: response.cached,
        });
        
        const result: ScrapeResult = {
          url,
          text: response.text || '',
          chars: response.chars || 0,
          truncated: response.truncated || false,
        };
        
        if (!result.text) {
          console.warn(`[Scraper] Warning: Empty text received for ${url}`);
          result.error = 'Empty response from scraper';
        }
        
        cacheRef.current.set(url, result);
        newResults.push(result);
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || err.message || 'Failed to scrape';
        console.error(`[Scraper] Error scraping ${url}:`, errorMessage);
        
        const result: ScrapeResult = {
          url,
          text: '',
          chars: 0,
          truncated: false,
          error: errorMessage,
        };
        newResults.push(result);
      }
    }

    setResults(newResults);
    const hasContent = newResults.some(r => r.text.length > 0);
    const hasErrors = newResults.some(r => r.error);
    
    console.log(`[Scraper] Scraping complete:`, {
      totalUrls: urls.length,
      withContent: newResults.filter(r => r.text.length > 0).length,
      withErrors: newResults.filter(r => r.error).length,
    });
    
    setStatus(hasContent ? 'done' : (hasErrors ? 'error' : 'done'));

    // Combine all scraped content
    const combined = newResults
      .filter(r => r.text)
      .map(r => `[Source: ${r.url}]\n${r.text}`)
      .join('\n\n---\n\n');

    return combined;
  }, []);

  const clearScrapeResults = useCallback(() => {
    setStatus('idle');
    setResults([]);
    // Clear cache to prevent stale content from previous URLs
    cacheRef.current.clear();
  }, []);

  const combinedContext = results
    .filter(r => r.text)
    .map(r => `[Source: ${r.url}]\n${r.text}`)
    .join('\n\n---\n\n');

  return {
    status,
    results,
    combinedContext,
    scrapeFromMessage,
    clearScrapeResults,
  };
}
