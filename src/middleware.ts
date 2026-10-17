import { defineMiddleware } from 'astro:middleware';
import { getSystemState } from './lib/system-state';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Allow admin, API, offline screen, and static assets through
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/offline') ||
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/data/')
  ) {
    return next();
  }

  const state = await getSystemState();
  if (state.offlineMode) {
    return context.rewrite('/offline');
  }

  return next();
});
