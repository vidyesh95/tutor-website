// Admin auth: HMAC-signed, expiring session token. The password never leaves the login action.
// Rotating SESSION_SECRET invalidates every session (expected; see docs/design-brief.md).
import type { AstroCookies } from 'astro';
import { env } from 'cloudflare:workers';

export const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set.');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function hmacHex(value: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time password check: compare fixed-length digests so length and content don't leak. */
export async function passwordMatches(candidate: string): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(env.ADMIN_PASSWORD)),
  ]);
  // Workers extension to SubtleCrypto; not in the DOM typings.
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean };
  return subtle.timingSafeEqual(a, b);
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ exp: now + SESSION_TTL_MS })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  try {
    // subtle.verify compares in constant time.
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(), fromBase64Url(sig), encoder.encode(payload));
    if (!valid) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return typeof exp === 'number' && exp > now;
  } catch {
    return false;
  }
}

export async function startSession(cookies: AstroCookies) {
  cookies.set(SESSION_COOKIE, await createSessionToken(), {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function endSession(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}
