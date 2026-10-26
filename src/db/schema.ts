// src/db/schema.ts
import { sqliteTable, integer, text, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const now = sql`(CURRENT_TIMESTAMP)`;

/** Standards / tracks (Class 10, Engineering, ...). Admin-managed; `slug` is the URL segment. */
export const tracks = sqliteTable('tracks', {
  slug: text('slug').primaryKey(),
  label: text('label').notNull(),
  blurb: text('blurb').notNull().default(''),
  position: integer('position').notNull().default(0),
  archivedAt: text('archived_at'),
  createdAt: text('created_at').default(now).notNull(),
});

export const subjects = sqliteTable(
  'subjects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Slug of a row in `tracks`; validated in actions, not a DB foreign key (keeps the migration a plain add). */
    track: text('track').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    position: integer('position').notNull().default(0),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').default(now).notNull(),
  },
  (t) => [uniqueIndex('subjects_track_slug').on(t.track, t.slug)],
);

export const chapters = sqliteTable(
  'chapters',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => subjects.id),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').default(now).notNull(),
  },
  (t) => [index('chapters_subject').on(t.subjectId)],
);

export const lessons = sqliteTable(
  'lessons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Denormalized from chapter so lesson slugs can be unique per subject (the URL scope).
    subjectId: integer('subject_id')
      .notNull()
      .references(() => subjects.id),
    chapterId: integer('chapter_id')
      .notNull()
      .references(() => chapters.id),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    position: integer('position').notNull().default(0),
    youtubeId: text('youtube_id'),
    videoStatus: text('video_status', { enum: ['ok', 'unavailable', 'unchecked'] })
      .notNull()
      .default('unchecked'),
    description: text('description').notNull().default(''),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    publishedAt: text('published_at'),
    createdAt: text('created_at').default(now).notNull(),
    updatedAt: text('updated_at').default(now).notNull(),
  },
  (t) => [
    uniqueIndex('lessons_subject_slug').on(t.subjectId, t.slug),
    index('lessons_chapter').on(t.chapterId, t.position),
  ],
);

export const lessonFiles = sqliteTable(
  'lesson_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    kind: text('kind', { enum: ['notes', 'worksheet', 'solutions'] }).notNull(),
    position: integer('position').notNull().default(0),
    sizeBytes: integer('size_bytes').notNull(),
    originalName: text('original_name').notNull(),
    sha256: text('sha256').notNull(),
  },
  (t) => [index('lesson_files_lesson').on(t.lessonId), index('lesson_files_key').on(t.r2Key)],
);

export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    ipHash: text('ip_hash').notNull(),
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.ipHash, t.windowStart] }),
    index('login_attempts_window').on(t.windowStart),
  ],
);

export type Subject = typeof subjects.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type LessonFile = typeof lessonFiles.$inferSelect;
export type FileKind = LessonFile['kind'];

/** Single-row table (id = 1): the tutor's public profile. Empty name means "don't show". */
export const tutorProfile = sqliteTable('tutor_profile', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().default(''),
  headline: text('headline').notNull().default(''),
  bio: text('bio').notNull().default(''),
  photoKey: text('photo_key'),
  updatedAt: text('updated_at').default(now).notNull(),
});

export type TutorProfile = typeof tutorProfile.$inferSelect;
