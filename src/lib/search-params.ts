import { searchLessons } from './queries';
import { isTrackId } from './tracks';

export async function runSearch(url: URL) {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  const trackParam = url.searchParams.get('track') ?? undefined;
  const track = isTrackId(trackParam) ? trackParam : undefined;
  const page = Math.min(50, Math.max(1, Number(url.searchParams.get('page')) || 1));
  const { hits, total } = q ? await searchLessons(q, { track, page }) : { hits: [], total: 0 };
  return { q, track, page, hits, total };
}
