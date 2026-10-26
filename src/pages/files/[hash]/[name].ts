import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

// Streams a PDF from R2. Keys are content-addressed, so responses are immutable.
// Only files attached to a published lesson in a live subject/chapter are served publicly.
export const GET: APIRoute = async ({ params, url, locals }) => {
  const key = `files/${params.hash}/${params.name}`;

  const row = await env.DB.prepare(
    `SELECT f.original_name AS originalName,
       (l.status = 'published' AND s.archived_at IS NULL AND c.archived_at IS NULL) AS isPublic
     FROM lesson_files f
     JOIN lessons l ON l.id = f.lesson_id
     JOIN subjects s ON s.id = l.subject_id
     JOIN chapters c ON c.id = l.chapter_id
     WHERE f.r2_key = ?
     ORDER BY isPublic DESC
     LIMIT 1`,
  )
    .bind(key)
    .first<{ originalName: string; isPublic: number }>();

  const isAdmin = (locals as { isAdmin?: boolean }).isAdmin;
  if (!row || (!row.isPublic && !isAdmin)) {
    return new Response('This file isn’t available.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const object = await env.PDF_BUCKET.get(key);
  if (!object) {
    return new Response('This file is missing. Please let your tutor know.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const filename = row.originalName.replace(/[\r\n"]/g, '') || 'notes.pdf';
  const disposition = url.searchParams.has('download') ? 'attachment' : 'inline';
  const asciiName = filename.replace(/[^\x20-\x7e]/g, '_');

  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(object.size),
      'Content-Disposition': `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': row.isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
      ETag: object.httpEtag,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
