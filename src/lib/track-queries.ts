// Track (standard) reads. Admin sees archived tracks; public code uses the `Public` variants.
import { and, asc, eq, isNull } from 'drizzle-orm';
import { tracks } from '../db/schema';
import { getDb } from './db';

/** Every track in order, archived included. Used by admin and for labels on archived content. */
export async function getAllTracks() {
  return getDb().select().from(tracks).orderBy(asc(tracks.position), asc(tracks.slug));
}

/** Tracks students can see, in order. */
export async function getPublicTracks() {
  return getDb().select().from(tracks).where(isNull(tracks.archivedAt)).orderBy(asc(tracks.position), asc(tracks.slug));
}

/** One public track by slug, or null when it is unknown or archived. */
export async function getPublicTrack(slug: string | undefined) {
  if (!slug) return null;
  const [row] = await getDb()
    .select()
    .from(tracks)
    .where(and(eq(tracks.slug, slug), isNull(tracks.archivedAt)));
  return row ?? null;
}
