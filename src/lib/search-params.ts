import { searchLessons } from './queries';
import { getPublicTrack, getPublicTracks } from './track-queries';

export async function runSearch(url: URL) {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const trackParam = url.searchParams.get('track') ?? undefined;
  const track = (await getPublicTrack(trackParam))?.slug;
  const page = Math.min(50, Math.max(1, Number(url.searchParams.get('page')) || 1));
  const subjectId = Number(url.searchParams.get('subject')) || undefined;
  const [{ hits, total }, tracks] = await Promise.all([
    q ? searchLessons(q, { track, subjectId, page }) : Promise.resolve({ hits: [], total: 0 }),
    getPublicTracks(),
  ]);
  return { q, track, subjectId, page, hits, total, tracks };
}
