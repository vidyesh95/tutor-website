// Admin reads: see everything, including drafts and archived structure.
import { and, asc, count, desc, eq, inArray, like, type SQL } from 'drizzle-orm';
import { chapters, lessonFiles, lessons, subjects, tracks } from '../db/schema';
import { getDb } from './db';
import { getAllTracks } from './track-queries';
import type { TrackId } from './tracks';

export type LessonFilters = { track?: TrackId; subjectId?: number; status?: 'draft' | 'published'; q?: string };

export async function listLessons(filters: LessonFilters) {
  const db = getDb();
  const where: SQL[] = [];
  if (filters.track) where.push(eq(subjects.track, filters.track));
  if (filters.subjectId) where.push(eq(lessons.subjectId, filters.subjectId));
  if (filters.status) where.push(eq(lessons.status, filters.status));
  if (filters.q) where.push(like(lessons.title, `%${filters.q.replace(/[%_]/g, '')}%`));

  const rows = await db
    .select({
      id: lessons.id,
      title: lessons.title,
      slug: lessons.slug,
      status: lessons.status,
      youtubeId: lessons.youtubeId,
      videoStatus: lessons.videoStatus,
      updatedAt: lessons.updatedAt,
      track: subjects.track,
      trackLabel: tracks.label,
      subjectName: subjects.name,
      subjectSlug: subjects.slug,
      subjectArchived: subjects.archivedAt,
      chapterName: chapters.name,
      chapterArchived: chapters.archivedAt,
    })
    .from(lessons)
    .innerJoin(subjects, eq(subjects.id, lessons.subjectId))
    .innerJoin(tracks, eq(tracks.slug, subjects.track))
    .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(lessons.updatedAt))
    .limit(200);

  const fileCounts = rows.length
    ? await db
        .select({ lessonId: lessonFiles.lessonId, n: count() })
        .from(lessonFiles)
        .where(
          inArray(
            lessonFiles.lessonId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(lessonFiles.lessonId)
    : [];
  const byLesson = new Map(fileCounts.map((f) => [f.lessonId, f.n]));
  return rows.map((r) => ({ ...r, fileCount: byLesson.get(r.id) ?? 0 }));
}

export type StructureTree = {
  track: TrackId;
  label: string;
  blurb: string;
  archived: boolean;
  /** Published lessons exist under this track, so its link is frozen. */
  slugLocked: boolean;
  subjects: {
    id: number;
    name: string;
    slug: string;
    archived: boolean;
    slugLocked: boolean;
    lessonCount: number;
    chapters: {
      id: number;
      name: string;
      archived: boolean;
      lessons: { id: number; title: string; status: 'draft' | 'published' }[];
    }[];
  }[];
}[];

export async function getStructure(): Promise<StructureTree> {
  const db = getDb();
  const [trackRows, subjectRows, chapterRows, lessonRows] = await Promise.all([
    getAllTracks(),
    db.select().from(subjects).orderBy(asc(subjects.position), asc(subjects.id)),
    db.select().from(chapters).orderBy(asc(chapters.position), asc(chapters.id)),
    db
      .select({
        id: lessons.id,
        title: lessons.title,
        status: lessons.status,
        chapterId: lessons.chapterId,
        subjectId: lessons.subjectId,
        publishedAt: lessons.publishedAt,
      })
      .from(lessons)
      .orderBy(asc(lessons.position), asc(lessons.id)),
  ]);

  return trackRows.map((track) => {
    const trackSubjects = subjectRows.filter((s) => s.track === track.slug);
    return {
      track: track.slug,
      label: track.label,
      blurb: track.blurb,
      archived: !!track.archivedAt,
      slugLocked: trackSubjects.some((s) => lessonRows.some((l) => l.subjectId === s.id && l.publishedAt)),
      subjects: trackSubjects.map((s) => {
        const subjectLessons = lessonRows.filter((l) => l.subjectId === s.id);
        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          archived: !!s.archivedAt,
          slugLocked: subjectLessons.some((l) => l.publishedAt),
          lessonCount: subjectLessons.length,
          chapters: chapterRows
            .filter((c) => c.subjectId === s.id)
            .map((c) => ({
              id: c.id,
              name: c.name,
              archived: !!c.archivedAt,
              lessons: subjectLessons.filter((l) => l.chapterId === c.id),
            })),
        };
      }),
    };
  });
}

/** Options for the lesson form: every subject (grouped by track) with its chapters. */
export async function getChapterOptions() {
  const tree = await getStructure();
  return tree.flatMap(({ track, label, subjects }) => subjects.map((s) => ({ track, trackLabel: label, ...s })));
}
