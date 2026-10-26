// Public read queries. Everything here excludes drafts and archived subjects/chapters
// unless a caller explicitly asks for an admin preview.
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { chapters, lessonFiles, lessons, subjects, tracks, tutorProfile, type FileKind, type LessonFile } from '../db/schema';
import { getDb } from './db';
import { FILE_KINDS } from './files';
import { toFtsQuery } from './search-index';
import { getPublicTracks } from './track-queries';
import type { TrackId } from './tracks';

export type SubjectSummary = {
  id: number;
  track: TrackId;
  trackLabel: string;
  name: string;
  slug: string;
  lessonCount: number;
  chapterCount: number;
};

/** Public subjects grouped by track, tracks in admin order (empty tracks included, so callers filter). */
export async function getLibraryIndex(): Promise<Map<TrackId, SubjectSummary[]>> {
  const db = getDb();
  const [rows, publicTracks] = await Promise.all([
    db
      .select({
        id: subjects.id,
        track: subjects.track,
        trackLabel: tracks.label,
        name: subjects.name,
        slug: subjects.slug,
        lessonCount: sql<number>`count(${lessons.id})`,
        chapterCount: sql<number>`count(distinct ${chapters.id})`,
      })
      .from(subjects)
      .innerJoin(tracks, and(eq(tracks.slug, subjects.track), isNull(tracks.archivedAt)))
      .innerJoin(chapters, and(eq(chapters.subjectId, subjects.id), isNull(chapters.archivedAt)))
      .innerJoin(lessons, and(eq(lessons.chapterId, chapters.id), eq(lessons.status, 'published')))
      .where(isNull(subjects.archivedAt))
      .groupBy(subjects.id)
      .orderBy(asc(subjects.position), asc(subjects.name)),
    getPublicTracks(),
  ]);

  const byTrack = new Map<TrackId, SubjectSummary[]>(publicTracks.map((t) => [t.slug, []]));
  for (const row of rows) byTrack.get(row.track)?.push(row);
  return byTrack;
}

export type CourseLesson = {
  id: number;
  title: string;
  slug: string;
  number: number;
  hasVideo: boolean;
  kinds: FileKind[];
  /** First notes PDF (or first file) for the one-tap PDF button. */
  primaryFile: { r2Key: string; sizeBytes: number; kind: FileKind } | null;
  fileCount: number;
};

export type CourseChapter = { id: number; name: string; number: number; lessons: CourseLesson[] };

export type Course = {
  subject: { id: number; track: TrackId; trackLabel: string; name: string; slug: string };
  chapters: CourseChapter[];
  lessonCount: number;
  fileCount: number;
};

/** Published, ordered course outline. Returns null when nothing public exists for the subject. */
export async function getCourse(track: TrackId, subjectSlug: string): Promise<Course | null> {
  const db = getDb();
  const [subject] = await db
    .select({ id: subjects.id, track: subjects.track, trackLabel: tracks.label, name: subjects.name, slug: subjects.slug })
    .from(subjects)
    .innerJoin(tracks, and(eq(tracks.slug, subjects.track), isNull(tracks.archivedAt)))
    .where(and(eq(subjects.track, track), eq(subjects.slug, subjectSlug), isNull(subjects.archivedAt)));
  if (!subject) return null;

  const rows = await db
    .select({
      chapterId: chapters.id,
      chapterName: chapters.name,
      id: lessons.id,
      title: lessons.title,
      slug: lessons.slug,
      youtubeId: lessons.youtubeId,
      videoStatus: lessons.videoStatus,
    })
    .from(lessons)
    .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
    .where(and(eq(lessons.subjectId, subject.id), eq(lessons.status, 'published'), isNull(chapters.archivedAt)))
    .orderBy(asc(chapters.position), asc(chapters.id), asc(lessons.position), asc(lessons.id));
  if (!rows.length) return null;

  const kindRows = await db
    .select({
      lessonId: lessonFiles.lessonId,
      kind: lessonFiles.kind,
      r2Key: lessonFiles.r2Key,
      sizeBytes: lessonFiles.sizeBytes,
      position: lessonFiles.position,
    })
    .from(lessonFiles)
    .where(
      inArray(
        lessonFiles.lessonId,
        rows.map((r) => r.id),
      ),
    );
  const filesByLesson = new Map<number, typeof kindRows>();
  for (const row of kindRows) {
    if (!filesByLesson.has(row.lessonId)) filesByLesson.set(row.lessonId, []);
    filesByLesson.get(row.lessonId)!.push(row);
  }

  const chapterList: CourseChapter[] = [];
  for (const row of rows) {
    let chapter = chapterList.at(-1);
    if (!chapter || chapter.id !== row.chapterId) {
      chapter = { id: row.chapterId, name: row.chapterName, number: chapterList.length + 1, lessons: [] };
      chapterList.push(chapter);
    }
    const files = (filesByLesson.get(row.id) ?? []).sort(
      (a, b) => FILE_KINDS.indexOf(a.kind) - FILE_KINDS.indexOf(b.kind) || a.position - b.position,
    );
    const kinds = new Set(files.map((f) => f.kind));
    chapter.lessons.push({
      id: row.id,
      title: row.title,
      slug: row.slug,
      number: chapter.lessons.length + 1,
      hasVideo: !!row.youtubeId && row.videoStatus !== 'unavailable',
      kinds: FILE_KINDS.filter((k) => kinds.has(k)),
      primaryFile: files[0] ? { r2Key: files[0].r2Key, sizeBytes: files[0].sizeBytes, kind: files[0].kind } : null,
      fileCount: files.length,
    });
  }

  return { subject, chapters: chapterList, lessonCount: rows.length, fileCount: kindRows.length };
}

export type LessonDetail = {
  id: number;
  title: string;
  slug: string;
  description: string;
  youtubeId: string | null;
  videoStatus: 'ok' | 'unavailable' | 'unchecked';
  status: 'draft' | 'published';
  publishedAt: string | null;
  updatedAt: string;
  chapter: { id: number; name: string };
  files: LessonFile[];
};

function sortFiles(files: LessonFile[]) {
  return files.sort((a, b) => FILE_KINDS.indexOf(a.kind) - FILE_KINDS.indexOf(b.kind) || a.position - b.position);
}

export async function getLessonDetail(where: { subjectId: number; slug: string } | { id: number }) {
  const db = getDb();
  const condition =
    'id' in where ? eq(lessons.id, where.id) : and(eq(lessons.subjectId, where.subjectId), eq(lessons.slug, where.slug));
  const [row] = await db
    .select({
      id: lessons.id,
      title: lessons.title,
      slug: lessons.slug,
      description: lessons.description,
      youtubeId: lessons.youtubeId,
      videoStatus: lessons.videoStatus,
      status: lessons.status,
      publishedAt: lessons.publishedAt,
      updatedAt: lessons.updatedAt,
      subjectId: lessons.subjectId,
      chapterId: chapters.id,
      chapterName: chapters.name,
      chapterArchived: chapters.archivedAt,
    })
    .from(lessons)
    .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
    .where(condition);
  if (!row) return null;
  const files = await db.select().from(lessonFiles).where(eq(lessonFiles.lessonId, row.id));
  const detail: LessonDetail = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    youtubeId: row.youtubeId,
    videoStatus: row.videoStatus,
    status: row.status,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    chapter: { id: row.chapterId, name: row.chapterName },
    files: sortFiles(files),
  };
  return { detail, subjectId: row.subjectId, chapterArchived: !!row.chapterArchived };
}

export type SearchHit = {
  id: number;
  track: TrackId;
  trackLabel: string;
  subjectSlug: string;
  subjectName: string;
  chapterName: string;
  slug: string;
  titleHtml: string;
  snippetHtml: string;
  hasVideo: boolean;
  fileCount: number;
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** FTS highlight markers are control characters, swapped for <mark> only after escaping. */
const markup = (s: string | null) => escapeHtml(s ?? '').replaceAll('\u0001', '<mark>').replaceAll('\u0002', '</mark>');

export const SEARCH_PAGE_SIZE = 20;

export async function searchLessons(q: string, opts: { track?: TrackId; subjectId?: number; page?: number } = {}) {
  const match = toFtsQuery(q);
  if (!match) return { hits: [] as SearchHit[], total: 0 };
  const page = Math.max(1, opts.page ?? 1);
  const binds: unknown[] = [match];
  let trackClause = '';
  if (opts.track) {
    binds.push(opts.track);
    trackClause += ` AND s.track = ?${binds.length}`;
  }
  if (opts.subjectId) {
    binds.push(opts.subjectId);
    trackClause += ` AND s.id = ?${binds.length}`;
  }

  const from = `
    FROM lessons_fts
    JOIN lessons l ON l.id = lessons_fts.rowid
    JOIN subjects s ON s.id = l.subject_id
    JOIN chapters c ON c.id = l.chapter_id
    JOIN tracks tr ON tr.slug = s.track AND tr.archived_at IS NULL
    WHERE lessons_fts MATCH ?1 ${trackClause}`;

  let list: D1Result, count: D1Result;
  try {
    [list, count] = await env.DB.batch([
    env.DB.prepare(
      `SELECT l.id, l.slug, s.track, tr.label AS trackLabel, s.slug AS subjectSlug, s.name AS subjectName, c.name AS chapterName,
         (l.youtube_id IS NOT NULL AND l.video_status != 'unavailable') AS hasVideo,
         (SELECT count(*) FROM lesson_files f WHERE f.lesson_id = l.id) AS fileCount,
         highlight(lessons_fts, 0, char(1), char(2)) AS titleHl,
         snippet(lessons_fts, 1, char(1), char(2), '…', 16) AS snippetHl
       ${from}
       ORDER BY bm25(lessons_fts, 10.0, 2.0, 4.0, 3.0)
       LIMIT ${SEARCH_PAGE_SIZE} OFFSET ${(page - 1) * SEARCH_PAGE_SIZE}`,
    ).bind(...binds),
    env.DB.prepare(`SELECT count(*) AS total ${from}`).bind(...binds),
  ]);
  } catch (err) {
    // A malformed query must never take the page down; show "no results" instead.
    console.error('Search failed for', JSON.stringify(match), err);
    return { hits: [] as SearchHit[], total: 0 };
  }

  type Row = Omit<SearchHit, 'titleHtml' | 'snippetHtml' | 'hasVideo'> & {
    titleHl: string;
    snippetHl: string;
    hasVideo: number;
  };
  const hits = (list.results as Row[]).map((r) => ({
    id: r.id,
    track: r.track,
    trackLabel: r.trackLabel,
    subjectSlug: r.subjectSlug,
    subjectName: r.subjectName,
    chapterName: r.chapterName,
    slug: r.slug,
    titleHtml: markup(r.titleHl),
    snippetHtml: markup(r.snippetHl),
    hasVideo: !!r.hasVideo,
    fileCount: r.fileCount,
  }));
  return { hits, total: (count.results[0] as { total: number }).total };
}

export async function getSitemapEntries() {
  const { results } = await env.DB.prepare(
    `SELECT s.track, s.slug AS subjectSlug, l.slug, l.updated_at AS updatedAt
     FROM lessons l
     JOIN subjects s ON s.id = l.subject_id
     JOIN chapters c ON c.id = l.chapter_id
     JOIN tracks tr ON tr.slug = s.track AND tr.archived_at IS NULL
     WHERE l.status = 'published' AND s.archived_at IS NULL AND c.archived_at IS NULL
     ORDER BY tr.position, s.track, s.position, c.position, l.position`,
  ).all<{ track: TrackId; subjectSlug: string; slug: string; updatedAt: string }>();
  return results;
}

export type LessonCard = {
  id: number;
  track: TrackId;
  trackLabel: string;
  subjectName: string;
  subjectSlug: string;
  chapterName: string;
  title: string;
  slug: string;
  description: string;
  youtubeId: string | null;
  primaryFile: { r2Key: string; sizeBytes: number; kind: FileKind } | null;
  kinds: FileKind[];
};

/** Most recently published lessons, optionally narrowed by track and subject name (across tracks). */
export async function getLatestLessons(opts: { track?: TrackId; subject?: string; limit?: number } = {}) {
  const where = [`l.status = 'published'`, 's.archived_at IS NULL', 'c.archived_at IS NULL'];
  const binds: unknown[] = [];
  if (opts.track) {
    binds.push(opts.track);
    where.push(`s.track = ?${binds.length}`);
  }
  if (opts.subject) {
    binds.push(opts.subject);
    where.push(`s.name = ?${binds.length} COLLATE NOCASE`);
  }
  const clause = where.join(' AND ');
  const from = `FROM lessons l JOIN subjects s ON s.id = l.subject_id JOIN chapters c ON c.id = l.chapter_id
       JOIN tracks tr ON tr.slug = s.track AND tr.archived_at IS NULL`;
  const limit = opts.limit ?? 9;
  const [list, count] = await env.DB.batch([
    env.DB.prepare(
      `SELECT l.id, s.track, tr.label AS trackLabel, s.name AS subjectName, s.slug AS subjectSlug, c.name AS chapterName, l.title, l.slug,
         l.description, CASE WHEN l.video_status = 'unavailable' THEN NULL ELSE l.youtube_id END AS youtubeId
       ${from}
       WHERE ${clause}
       ORDER BY l.published_at DESC, l.id DESC
       LIMIT ${limit}`,
    ).bind(...binds),
    env.DB.prepare(`SELECT count(*) AS total ${from} WHERE ${clause}`).bind(...binds),
  ]);
  const rows = list.results as Omit<LessonCard, 'primaryFile' | 'kinds'>[];
  const files = rows.length
    ? await getDb()
        .select({ lessonId: lessonFiles.lessonId, kind: lessonFiles.kind, r2Key: lessonFiles.r2Key, sizeBytes: lessonFiles.sizeBytes, position: lessonFiles.position })
        .from(lessonFiles)
        .where(inArray(lessonFiles.lessonId, rows.map((r) => r.id)))
    : [];
  const cards: LessonCard[] = rows.map((r) => {
    const own = files
      .filter((f) => f.lessonId === r.id)
      .sort((a, b) => FILE_KINDS.indexOf(a.kind) - FILE_KINDS.indexOf(b.kind) || a.position - b.position);
    const kinds = new Set(own.map((f) => f.kind));
    return {
      ...r,
      primaryFile: own[0] ? { r2Key: own[0].r2Key, sizeBytes: own[0].sizeBytes, kind: own[0].kind } : null,
      kinds: FILE_KINDS.filter((k) => kinds.has(k)),
    };
  });
  return { cards, total: (count.results[0] as { total: number }).total };
}

/** Distinct public subject names, for the subject filter chips. */
export async function getSubjectNames(track?: TrackId) {
  const { results } = await env.DB.prepare(
    `SELECT s.name, count(*) AS n FROM lessons l JOIN subjects s ON s.id = l.subject_id JOIN chapters c ON c.id = l.chapter_id
     JOIN tracks tr ON tr.slug = s.track AND tr.archived_at IS NULL
     WHERE l.status = 'published' AND s.archived_at IS NULL AND c.archived_at IS NULL ${track ? 'AND s.track = ?1' : ''}
     GROUP BY s.name COLLATE NOCASE ORDER BY n DESC, s.name`,
  )
    .bind(...(track ? [track] : []))
    .all<{ name: string; n: number }>();
  return results.map((r) => r.name);
}

/** Navigation around a course: other subjects in its track, and the same subject in other tracks. */
export async function getCourseNeighbours(track: TrackId, subjectSlug: string) {
  const index = await getLibraryIndex();
  const sameTrack = index.get(track) ?? [];
  const sameSubject = [...index.values()].flat().filter((s) => s.slug === subjectSlug);
  return { sameTrack, sameSubject };
}

export async function getTutorProfile() {
  const [row] = await getDb().select().from(tutorProfile).where(eq(tutorProfile.id, 1));
  return row?.name ? row : null;
}
