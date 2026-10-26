import type { APIRoute } from 'astro';
import { getSitemapEntries } from '../lib/queries';

// Rendered on request from D1 (the build can't see live data), cached briefly.
export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin;
  const entries = await getSitemapEntries();
  const tracks = [...new Set(entries.map((e) => e.track))];
  const subjects = new Map<string, string>();
  for (const e of entries) {
    const path = `/${e.track}/${e.subjectSlug}`;
    if (!subjects.has(path) || subjects.get(path)! < e.updatedAt) subjects.set(path, e.updatedAt);
  }

  const toIso = (sqlTime: string) => new Date(`${sqlTime.replace(' ', 'T')}Z`).toISOString();
  const loc = (path: string, lastmod?: string) =>
    `<url><loc>${origin}${path}</loc>${lastmod ? `<lastmod>${toIso(lastmod)}</lastmod>` : ''}</url>`;

  const urls = [
    loc('/'),
    ...tracks.map((t) => loc(`/${t}`)),
    ...[...subjects].map(([path, updated]) => loc(path, updated)),
    ...entries.map((e) => loc(`/${e.track}/${e.subjectSlug}/${e.slug}`, e.updatedAt)),
  ];

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    },
  );
};
