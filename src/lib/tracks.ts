// Standards (tracks: Class 10, Engineering, ...) live in the `tracks` table and are managed in admin.
// Reads go through track-queries.ts; this file only holds the pure rules shared by those reads and the admin actions.

/** A track's URL segment, e.g. "class-10". Validated against the `tracks` table, not a fixed list. */
export type TrackId = string;

/** Tracks that ship with built-in OG art. Any other track gets the default card. */
const TRACKS_WITH_OG_ART = new Set(['class-10', 'class-11', 'class-12', 'engineering', 'pro']);

export const trackOgImage = (slug: string) => (TRACKS_WITH_OG_ART.has(slug) ? `/og/${slug}.png` : '/og/default.png');

/** Top-level paths the app already owns. A track can't take one of these as its link. */
export const RESERVED_TRACK_SLUGS = new Set(['admin', 'search', 'about', 'files', 'media', 'og', 'api', '_astro', '404', 'sitemap.xml', 'robots.txt', 'favicon.svg']);

export function isReservedTrackSlug(slug: string) {
  return RESERVED_TRACK_SLUGS.has(slug);
}
