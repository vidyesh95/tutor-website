// FTS5 index maintenance. The index only ever holds publicly visible lessons, so search
// needs no visibility filter beyond the join.
import { env } from 'cloudflare:workers';

const SELECT_VISIBLE = `
  SELECT l.id, l.title, l.description, s.name, c.name
  FROM lessons l
  JOIN subjects s ON s.id = l.subject_id
  JOIN chapters c ON c.id = l.chapter_id
  WHERE l.status = 'published' AND s.archived_at IS NULL AND c.archived_at IS NULL`;

const CHUNK = 90; // D1 allows 100 bound parameters per statement.

/** Re-derive index rows for the given lessons (or everything when omitted). */
export async function syncSearchIndex(lessonIds?: number[]) {
  const db = env.DB;
  if (!lessonIds) {
    await db.batch([
      db.prepare('DELETE FROM lessons_fts'),
      db.prepare(`INSERT INTO lessons_fts (rowid, title, description, subject, chapter) ${SELECT_VISIBLE}`),
    ]);
    return;
  }
  for (let i = 0; i < lessonIds.length; i += CHUNK) {
    const ids = lessonIds.slice(i, i + CHUNK);
    const marks = ids.map(() => '?').join(',');
    await db.batch([
      db.prepare(`DELETE FROM lessons_fts WHERE rowid IN (${marks})`).bind(...ids),
      db
        .prepare(
          `INSERT INTO lessons_fts (rowid, title, description, subject, chapter) ${SELECT_VISIBLE} AND l.id IN (${marks})`,
        )
        .bind(...ids),
    ]);
  }
}

export async function syncSearchIndexFor(scope: { subjectId?: number; chapterId?: number }) {
  const column = scope.chapterId ? 'chapter_id' : 'subject_id';
  const value = scope.chapterId ?? scope.subjectId;
  const { results } = await env.DB.prepare(`SELECT id FROM lessons WHERE ${column} = ?`)
    .bind(value)
    .all<{ id: number }>();
  if (results.length) await syncSearchIndex(results.map((r) => r.id));
}

export async function removeFromSearchIndex(lessonIds: number[]) {
  for (let i = 0; i < lessonIds.length; i += CHUNK) {
    const ids = lessonIds.slice(i, i + CHUNK);
    await env.DB.prepare(`DELETE FROM lessons_fts WHERE rowid IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .run();
  }
}

/** Turn free text into a safe FTS5 query: each term quoted, prefix-matched when long enough. */
export function toFtsQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  if (!terms.length) return null;
  // Long terms also match a shorter stem so "matrix" finds "matrices" and "integral" finds "integration".
  return terms
    .map((t) => (t.length >= 6 ? `("${t}"* OR "${t.slice(0, -2)}"*)` : t.length > 1 ? `"${t}"*` : `"${t}"`))
    .join(' AND ');
}
