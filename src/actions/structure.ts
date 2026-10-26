import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { and, asc, count, eq, isNotNull, max, ne } from 'drizzle-orm';
import { chapters, lessons, subjects, tracks } from '../db/schema';
import { moveRow, nextPosition, requireAdmin, sqlNow } from '../lib/admin';
import { getDb } from '../lib/db';
import { syncSearchIndex, syncSearchIndexFor } from '../lib/search-index';
import { SLUG_PATTERN, slugify } from '../lib/slug';
import { isReservedTrackSlug } from '../lib/tracks';

const id = z.coerce.number().int().positive();
const name = z
  .string({ error: 'Enter a name.' })
  .trim()
  .min(1, 'Enter a name.')
  .max(120, 'Keep the name under 120 characters.');
const blurb = z.string().trim().max(160, 'Keep the description under 160 characters.').optional().nullable();
const trackSlug = z.string().trim().min(1, 'Choose a standard first.');
const direction = z.enum(['up', 'down']);
const mode = z.enum(['archive', 'restore']);

/** A subject's slug freezes once any of its lessons has ever been published. */
async function subjectSlugLocked(subjectId: number) {
  const [row] = await getDb()
    .select({ n: count() })
    .from(lessons)
    .where(and(eq(lessons.subjectId, subjectId), isNotNull(lessons.publishedAt)));
  return (row?.n ?? 0) > 0;
}

/** A track's link freezes once any lesson in any of its subjects has been published. */
async function trackSlugLocked(track: string) {
  const [row] = await getDb()
    .select({ n: count() })
    .from(lessons)
    .innerJoin(subjects, eq(subjects.id, lessons.subjectId))
    .where(and(eq(subjects.track, track), isNotNull(lessons.publishedAt)));
  return (row?.n ?? 0) > 0;
}

async function assertTrackExists(slug: string) {
  const [row] = await getDb().select({ slug: tracks.slug }).from(tracks).where(eq(tracks.slug, slug));
  if (!row) throw new ActionError({ code: 'NOT_FOUND', message: 'That standard no longer exists. Refresh the page and try again.' });
}

async function assertTrackSlugFree(slug: string, exceptSlug?: string) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new ActionError({ code: 'BAD_REQUEST', message: 'Use lowercase letters, numbers and single hyphens for the link. Example: class-9' });
  }
  if (isReservedTrackSlug(slug)) {
    throw new ActionError({ code: 'BAD_REQUEST', message: `“${slug}” is used by the site itself. Choose another link.` });
  }
  const clash = await getDb()
    .select({ slug: tracks.slug })
    .from(tracks)
    .where(and(eq(tracks.slug, slug), exceptSlug ? ne(tracks.slug, exceptSlug) : undefined));
  if (clash.length) throw new ActionError({ code: 'CONFLICT', message: `Another standard already uses “${slug}”.` });
}

async function assertSlugFree(track: string, slug: string, exceptId?: number) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new ActionError({ code: 'BAD_REQUEST', message: 'Use lowercase letters, numbers and single hyphens for the link. Example: maths' });
  }
  const clash = await getDb()
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.track, track), eq(subjects.slug, slug), exceptId ? ne(subjects.id, exceptId) : undefined));
  if (clash.length) throw new ActionError({ code: 'CONFLICT', message: `Another subject in this track already uses “${slug}”.` });
}

async function lessonCount(column: 'subjectId' | 'chapterId', value: number) {
  const [row] = await getDb().select({ n: count() }).from(lessons).where(eq(lessons[column], value));
  return row?.n ?? 0;
}

export const structureActions = {
  createTrack: defineAction({
    accept: 'form',
    input: z.object({ label: name, slug: z.string().trim().toLowerCase().optional().nullable(), blurb }),
    handler: async (input, context) => {
      requireAdmin(context);
      const slug = input.slug || slugify(input.label);
      await assertTrackSlugFree(slug);
      const db = getDb();
      const [top] = await db.select({ top: max(tracks.position) }).from(tracks);
      await db.insert(tracks).values({ slug, label: input.label, blurb: input.blurb ?? '', position: (top?.top ?? -1) + 1 });
      return { message: `Added ${input.label}. Now add its subjects below.` };
    },
  }),

  updateTrack: defineAction({
    accept: 'form',
    input: z.object({ current: trackSlug, label: name, slug: z.string().trim().toLowerCase().optional().nullable(), blurb }),
    handler: async (input, context) => {
      requireAdmin(context);
      const db = getDb();
      await assertTrackExists(input.current);
      const newSlug = input.slug && input.slug !== input.current ? input.slug : null;
      if (newSlug) {
        if (await trackSlugLocked(input.current)) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'This link is locked because lessons in it have been published.' });
        }
        await assertTrackSlugFree(newSlug, input.current);
        // Swap the primary key: insert the renamed row, re-point subjects, then drop the old row.
        const [old] = await db.select().from(tracks).where(eq(tracks.slug, input.current));
        if (!old) throw new ActionError({ code: 'NOT_FOUND', message: 'That standard no longer exists. Refresh the page and try again.' });
        await db.batch([
          db.insert(tracks).values({ ...old, slug: newSlug, label: input.label, blurb: input.blurb ?? '' }),
          db.update(subjects).set({ track: newSlug }).where(eq(subjects.track, input.current)),
          db.delete(tracks).where(eq(tracks.slug, input.current)),
        ]);
      } else {
        await db.update(tracks).set({ label: input.label, blurb: input.blurb ?? '' }).where(eq(tracks.slug, input.current));
      }
      return { message: `Saved ${input.label}.` };
    },
  }),

  moveTrack: defineAction({
    accept: 'form',
    input: z.object({ current: trackSlug, direction }),
    handler: async (input, context) => {
      requireAdmin(context);
      const db = getDb();
      const rows = await db.select({ slug: tracks.slug }).from(tracks).orderBy(asc(tracks.position), asc(tracks.slug));
      const from = rows.findIndex((r) => r.slug === input.current);
      const to = input.direction === 'up' ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= rows.length) return { message: '' };
      // Swap with the neighbour; positions stay dense because every insert uses max + 1.
      const [a, b] = [rows[from], rows[to]];
      await db.batch([
        db.update(tracks).set({ position: to }).where(eq(tracks.slug, a.slug)),
        db.update(tracks).set({ position: from }).where(eq(tracks.slug, b.slug)),
      ]);
      return { message: '' };
    },
  }),

  archiveTrack: defineAction({
    accept: 'form',
    input: z.object({ current: trackSlug, mode }),
    handler: async (input, context) => {
      requireAdmin(context);
      const [track] = await getDb()
        .update(tracks)
        .set({ archivedAt: input.mode === 'archive' ? sqlNow() : null })
        .where(eq(tracks.slug, input.current))
        .returning({ label: tracks.label });
      return {
        message:
          input.mode === 'archive'
            ? `${track?.label} is archived and hidden from students.`
            : `${track?.label} is visible again.`,
      };
    },
  }),

  deleteTrack: defineAction({
    accept: 'form',
    input: z.object({ current: trackSlug }),
    handler: async (input, context) => {
      requireAdmin(context);
      const [subjectRow] = await getDb().select({ n: count() }).from(subjects).where(eq(subjects.track, input.current));
      if ((subjectRow?.n ?? 0) > 0) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'This standard still has subjects. Archive it instead, or delete its subjects first.' });
      }
      await getDb().delete(tracks).where(eq(tracks.slug, input.current));
      return { message: 'Standard deleted.' };
    },
  }),

  createSubject: defineAction({
    accept: 'form',
    input: z.object({ track: trackSlug, name, slug: z.string().trim().toLowerCase().optional().nullable() }),
    handler: async (input, context) => {
      requireAdmin(context);
      await assertTrackExists(input.track);
      const slug = input.slug || slugify(input.name);
      await assertSlugFree(input.track, slug);
      const [created] = await getDb()
        .insert(subjects)
        .values({ track: input.track, name: input.name, slug, position: await nextPosition('subjects', 'track', input.track) })
        .returning({ id: subjects.id });
      return { id: created.id, message: `Added ${input.name}.` };
    },
  }),

  updateSubject: defineAction({
    accept: 'form',
    input: z.object({ id, name, slug: z.string().trim().toLowerCase().optional().nullable() }),
    handler: async (input, context) => {
      requireAdmin(context);
      const db = getDb();
      const [subject] = await db.select().from(subjects).where(eq(subjects.id, input.id));
      if (!subject) throw new ActionError({ code: 'NOT_FOUND', message: 'That subject no longer exists.' });
      let slug = subject.slug;
      if (input.slug && input.slug !== subject.slug) {
        if (await subjectSlugLocked(subject.id)) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'This link is locked because lessons in it have been published.' });
        }
        await assertSlugFree(subject.track, input.slug, subject.id);
        slug = input.slug;
      }
      await db.update(subjects).set({ name: input.name, slug }).where(eq(subjects.id, subject.id));
      await syncSearchIndexFor({ subjectId: subject.id });
      return { message: `Saved ${input.name}.` };
    },
  }),

  moveSubject: defineAction({
    accept: 'form',
    input: z.object({ id, direction }),
    handler: async (input, context) => {
      requireAdmin(context);
      await moveRow({ table: 'subjects', scopeColumn: 'track' }, input.id, input.direction);
      return { message: '' };
    },
  }),

  archiveSubject: defineAction({
    accept: 'form',
    input: z.object({ id, mode }),
    handler: async (input, context) => {
      requireAdmin(context);
      const db = getDb();
      const [subject] = await db
        .update(subjects)
        .set({ archivedAt: input.mode === 'archive' ? sqlNow() : null })
        .where(eq(subjects.id, input.id))
        .returning({ name: subjects.name });
      await syncSearchIndexFor({ subjectId: input.id });
      return { message: input.mode === 'archive' ? `${subject?.name} is archived and hidden from students.` : `${subject?.name} is visible again.` };
    },
  }),

  deleteSubject: defineAction({
    accept: 'form',
    input: z.object({ id }),
    handler: async (input, context) => {
      requireAdmin(context);
      if (await lessonCount('subjectId', input.id)) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'This subject still has lessons. Archive it instead, or move its lessons first.' });
      }
      const db = getDb();
      await db.batch([db.delete(chapters).where(eq(chapters.subjectId, input.id)), db.delete(subjects).where(eq(subjects.id, input.id))]);
      return { message: 'Subject deleted.' };
    },
  }),

  createChapter: defineAction({
    accept: 'form',
    input: z.object({ subjectId: id, name }),
    handler: async (input, context) => {
      requireAdmin(context);
      await getDb()
        .insert(chapters)
        .values({ subjectId: input.subjectId, name: input.name, position: await nextPosition('chapters', 'subject_id', input.subjectId) });
      return { message: `Added chapter ${input.name}.` };
    },
  }),

  renameChapter: defineAction({
    accept: 'form',
    input: z.object({ id, name }),
    handler: async (input, context) => {
      requireAdmin(context);
      await getDb().update(chapters).set({ name: input.name }).where(eq(chapters.id, input.id));
      await syncSearchIndexFor({ chapterId: input.id });
      return { message: `Saved ${input.name}.` };
    },
  }),

  moveChapter: defineAction({
    accept: 'form',
    input: z.object({ id, direction }),
    handler: async (input, context) => {
      requireAdmin(context);
      await moveRow({ table: 'chapters', scopeColumn: 'subject_id' }, input.id, input.direction);
      return { message: '' };
    },
  }),

  archiveChapter: defineAction({
    accept: 'form',
    input: z.object({ id, mode }),
    handler: async (input, context) => {
      requireAdmin(context);
      const [chapter] = await getDb()
        .update(chapters)
        .set({ archivedAt: input.mode === 'archive' ? sqlNow() : null })
        .where(eq(chapters.id, input.id))
        .returning({ name: chapters.name });
      await syncSearchIndexFor({ chapterId: input.id });
      return { message: input.mode === 'archive' ? `${chapter?.name} is archived and hidden from students.` : `${chapter?.name} is visible again.` };
    },
  }),

  deleteChapter: defineAction({
    accept: 'form',
    input: z.object({ id }),
    handler: async (input, context) => {
      requireAdmin(context);
      if (await lessonCount('chapterId', input.id)) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'This chapter still has lessons. Archive it instead, or move its lessons first.' });
      }
      await getDb().delete(chapters).where(eq(chapters.id, input.id));
      return { message: 'Chapter deleted.' };
    },
  }),

  rebuildSearchIndex: defineAction({
    accept: 'form',
    handler: async (_, context) => {
      requireAdmin(context);
      await syncSearchIndex();
      return { message: 'Search index rebuilt.' };
    },
  }),
};

export { subjectSlugLocked };
