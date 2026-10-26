-- Full-text index over published lessons. rowid = lessons.id.
-- Maintained by src/lib/search-index.ts (rows exist only for published lessons in live subjects/chapters).
-- Not modelled in Drizzle; `wrangler d1 export` skips virtual tables, so backups export base tables
-- and the index is rebuilt with the admin "Rebuild search index" action after a restore.
CREATE VIRTUAL TABLE `lessons_fts` USING fts5(
	title,
	description,
	subject,
	chapter,
	tokenize = 'porter unicode61 remove_diacritics 2'
);
