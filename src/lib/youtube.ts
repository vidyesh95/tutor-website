const ID = /^[A-Za-z0-9_-]{11}$/;

/** Accepts watch, youtu.be, embed, shorts and live URLs, or a bare 11-character ID. */
export function parseYouTubeId(input: string | null | undefined): string | null {
  const value = input?.trim();
  if (!value) return null;
  if (ID.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value.startsWith('http') ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') candidate = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') candidate = url.searchParams.get('v');
    else {
      const [, kind, id] = url.pathname.split('/');
      if (['embed', 'shorts', 'live', 'v'].includes(kind)) candidate = id;
    }
  }
  return candidate && ID.test(candidate) ? candidate : null;
}

export type VideoStatus = 'ok' | 'unavailable' | 'unchecked';

/**
 * Embeds can't report removed/private videos, so we ask oEmbed at save time.
 * 401/403/404 mean the video can't be embedded; network trouble leaves it unchecked.
 */
export async function checkVideo(youtubeId: string): Promise<{ status: VideoStatus; title?: string }> {
  const target = encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`);
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${target}&format=json`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { title?: string };
      return { status: 'ok', title: data.title };
    }
    if ([400, 401, 403, 404].includes(res.status)) return { status: 'unavailable' };
    return { status: 'unchecked' };
  } catch {
    return { status: 'unchecked' };
  }
}

export function thumbnailUrl(youtubeId: string, size: 'mq' | 'hq' = 'hq') {
  return `https://i.ytimg.com/vi/${youtubeId}/${size}default.jpg`;
}
