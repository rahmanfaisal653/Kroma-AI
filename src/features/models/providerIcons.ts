// Icon provider: LobeHub (https://icons.lobehub.com) buat yang tersedia,
// robot.png lokal buat custom provider dan provider tanpa icon LobeHub.
export const ROBOT_ICON = '/brand/robot.png';

// Provider id → slug LobeHub (kalau sama dengan id, tak perlu masuk sini).
const ICON_ALIASES: Record<string, string> = {
  'github-models': 'github',
  'nvidia-nim': 'nvidia',
};

// Provider dgn icon LobeHub tersedia (kunci lookup pakai slug LobeHub, bukan provider id).
const LOBEHUB_SLUGS = new Set([
  'groq', 'gemini', 'openrouter', 'cerebras', 'github', 'mistral',
  'nvidia', 'deepseek', 'sambanova', 'hyperbolic', 'together',
]);

// Slug yg punya varian berwarna (-color.png) di LobeHub CDN.
const COLOR_SLUGS = new Set([
  'gemini', 'openrouter', 'cerebras', 'mistral', 'deepseek',
  'nvidia', 'sambanova', 'hyperbolic', 'together',
]);

export function providerIconUrl(providerId: string, theme: 'light' | 'dark' = 'light'): string {
  const slug = ICON_ALIASES[providerId] || providerId;
  if (!LOBEHUB_SLUGS.has(slug)) return ROBOT_ICON;
  const file = COLOR_SLUGS.has(slug) ? `${slug}-color.png` : `${slug}.png`;
  return `https://unpkg.com/@lobehub/icons-static-png@latest/${theme}/${file}`;
}
