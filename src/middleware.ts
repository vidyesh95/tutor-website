import { defineMiddleware } from 'astro:middleware';
import { getActionContext } from 'astro:actions';
import { SESSION_COOKIE, verifySessionToken } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const token = context.cookies.get(SESSION_COOKIE)?.value;
  context.locals.isAdmin = token ? await verifySessionToken(token) : false;

  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isAdminArea && pathname !== '/admin/login' && !context.locals.isAdmin) {
    // A lesson save from an expired session still reaches the page, which shows the
    // submitted values with an inline password field instead of discarding the tutor's work.
    const { action } = getActionContext(context);
    const expiredSave = action?.calledFrom === 'form' && action.name === 'saveLesson';
    if (!expiredSave) {
      return context.redirect(`/admin/login?next=${encodeURIComponent(pathname + context.url.search)}`);
    }
  }

  const response = await next();
  if (isAdminArea) {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
});
