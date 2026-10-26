import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { and, count, eq, isNotNull, ne } from 'drizzle-orm';
import { chapters, lessons, subjects } from '../db/schema';
import { moveRow, nextPosition, requireAdmin, sqlNow } from '../lib/admin';
import { getDb } from '../lib/db';
import { syncSearchIndex, syncSearchIndexFor } from '../lib/search-index';
import { SLUG_PATTERN, slugify } from '../lib/slug';
import { TRACK_IDS } from '../lib/tracks';

const id = z.coerce.number().int().positive();
const name = z
  .string({ error: 'Enter a name.' })
  .trim()
  .min(1, 'Enter a name.')
  .max(120, 'Keep the name under 120 characters.');
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

async function assertSlugFree(track: (typeof TRACK_IDS)[number], slug: string, exceptId?: number) {
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
  createSubject: defineAction({
    accept: 'form',
    input: z.object({ track: z.enum(TRACK_IDS), name, slug: z.string().trim().toLowerCase().optional().nullable() }),
    handler: async (input, context) => {
      requireAdmin(context);
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
