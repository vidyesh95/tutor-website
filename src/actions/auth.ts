import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { t } from '../i18n';
import { endSession, passwordMatches, startSession } from '../lib/auth';
import { clientIp } from '../lib/admin';
import { getDb } from '../lib/db';
import { checkLoginRateLimit, recordFailedLogin } from '../lib/rate-limit';

/** Shared by the login form and the inline re-auth on an expired lesson save. */
export async function attemptLogin(password: string, context: Parameters<typeof clientIp>[0]) {
  const db = getDb();
  const ip = clientIp(context);
  const limit = await checkLoginRateLimit(db, ip);
  if (limit.blocked) return { ok: false as const, message: t('admin.rateLimited', { minutes: limit.retryAfterMinutes }) };
  if (!(await passwordMatches(password))) {
    await recordFailedLogin(db, ip);
    return { ok: false as const, message: t('admin.wrongPassword') };
  }
  await startSession(context.cookies);
  return { ok: true as const };
}

export const auth = {
  loginAdmin: defineAction({
    accept: 'form',
    input: z.object({
      password: z.string({ error: 'Enter the password.' }).min(1, 'Enter the password.'),
    }),
    handler: async ({ password }, context) => {
      const result = await attemptLogin(password, context);
      if (!result.ok) throw new ActionError({ code: 'UNAUTHORIZED', message: result.message });
      return { success: true };
    },
  }),

  logoutAdmin: defineAction({
    accept: 'form',
    handler: async (_, context) => {
      endSession(context.cookies);
      return { success: true };
    },
  }),
};
