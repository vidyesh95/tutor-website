// Login rate limit backed by D1. Interface is deliberately small so a Cloudflare WAF rule
// can sit in front later without touching callers; this stays as defense-in-depth.
import { and, eq, lt, sql } from 'drizzle-orm';
import { loginAttempts } from '../db/schema';
import { hmacHex } from './auth';
import type { Db } from './db';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const RETENTION_MS = 24 * 60 * 60 * 1000;

function windowStart(now: number) {
  return Math.floor(now / WINDOW_MS) * WINDOW_MS;
}

/** Keyed hash: a plain SHA-256 of an IPv4 address is brute-forceable, so never store that. */
function ipHash(ip: string) {
  return hmacHex(`login:${ip}`);
}

export async function checkLoginRateLimit(db: Db, ip: string, now = Date.now()) {
  // Opportunistic sweep keeps the table tiny without a cron.
  await db.delete(loginAttempts).where(lt(loginAttempts.windowStart, now - RETENTION_MS));

  const start = windowStart(now);
  const [row] = await db
    .select({ count: loginAttempts.count })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ipHash, await ipHash(ip)), eq(loginAttempts.windowStart, start)));

  const blocked = (row?.count ?? 0) >= MAX_FAILURES;
  const retryAfterMinutes = Math.max(1, Math.ceil((start + WINDOW_MS - now) / 60000));
  return { blocked, retryAfterMinutes };
}

export async function recordFailedLogin(db: Db, ip: string, now = Date.now()) {
  await db
    .insert(loginAttempts)
    .values({ ipHash: await ipHash(ip), windowStart: windowStart(now), count: 1 })
    .onConflictDoUpdate({
      target: [loginAttempts.ipHash, loginAttempts.windowStart],
      set: { count: sql`${loginAttempts.count} + 1` },
    });
}
