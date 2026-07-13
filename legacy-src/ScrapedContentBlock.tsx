import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Globe, Loader2, AlertCircle, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { ScrapeResult, ScrapeStatus } from '../hooks/useScraper';

interface ScrapedContentBlockProps {
  status: ScrapeStatus;
  results: ScrapeResult[];
}

export function ScrapedContentBlock({ status, results }: ScrapedContentBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (status === 'idle' || results.length === 0) return null;

  const totalChars = results.reduce((sum, r) => sum + r.chars, 0);
  const hasErrors = results.some(r => r.error);
  const successCount = results.filter(r => r.text).length;

  const getStatusIcon = () => {
    if (status === 'scraping') return <Loader2 size={12} className="animate-spin text-blue-400" />;
    if (hasErrors && successCount === 0) return <AlertCircle size={12} className="text-red-400" />;
    return <Check size={12} className="text-green-400" />;
  };

  const getStatusLabel = () => {
    if (status === 'scraping') return `Scraping ${results.length} URL${results.length > 1 ? 's' : ''}...`;
    if (hasErrors && successCount === 0) return 'Failed to scrape';
    return `Scraped ${totalChars.toLocaleString()} chars from ${successCount} URL${successCount > 1 ? 's' : ''}`;
  };

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors',
          'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          'bg-[var(--color-surface)] hover:bg-[var(--color-border)]',
          'border border-[var(--color-border)]'
        )}
      >
        <Globe size={12} className="text-blue-400" />
        {getStatusIcon()}
        <span>{getStatusLabel()}</span>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          {results.map((r, i) => (
            <div
              key={i}
              className={cn(
                'px-3 py-2 rounded-lg text-xs leading-relaxed',
                'bg-[var(--color-surface)] border border-[var(--color-border)]',
                'max-h-40 overflow-y-auto'
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {r.error ? (
                  <AlertCircle size={10} className="text-red-400" />
                ) : (
                  <Globe size={10} className="text-blue-400" />
                )}
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline truncate"
                >
                  {r.url}
                </a>
                {r.truncated && (
                  <span className="text-amber-400 text-[10px] ml-auto">[truncated]</span>
                )}
              </div>
              {r.error ? (
                <p className="text-red-400">{r.error}</p>
              ) : (
                <p className="text-[var(--color-text-muted)] whitespace-pre-wrap line-clamp-6">
                  {r.text.slice(0, 500)}{r.text.length > 500 ? '...' : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
