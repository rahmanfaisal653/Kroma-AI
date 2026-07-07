/**
 * URL detection and validation for auto-scrape feature.
 */

const URL_REGEX = /https?:\/\/[^\s)<>\]"']+/gi;

const NON_SCRAPABLE_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'tar', 'gz',
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico',
  'mp3', 'mp4', 'avi', 'mov', 'wav', 'flac',
  'exe', 'dmg', 'apk', 'msi',
]);

/** Extract all URLs from text. */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  return (text.match(URL_REGEX) || []).map(url =>
    url.replace(/[.,;!?)]+$/, '')
  );
}

/** Check if a URL points to an HTML page (not a binary file). */
export function isScrapableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const pathParts = parsed.pathname.split('.');
    if (pathParts.length > 1) {
      const ext = pathParts.pop()!.toLowerCase();
      if (NON_SCRAPABLE_EXTENSIONS.has(ext)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Quick check if text contains any URLs. */
export function hasUrls(text: string): boolean {
  return URL_REGEX.test(text);
}
