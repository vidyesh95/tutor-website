import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

// Serves the tutor's photo. Only the key currently on the profile is public.
export const GET: APIRoute = async ({ params }) => {
  const key = `media/${params.name}`;
  const row = await env.DB.prepare('SELECT photo_key AS key FROM tutor_profile WHERE id = 1').first<{ key: string | null }>();
  if (!row?.key || row.key !== key) return new Response('Not found', { status: 404 });
  const object = await env.PDF_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
