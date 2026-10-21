import { defineMiddleware } from 'astro:middleware';
import { getSystemState } from './lib/system-state';
import { verifyAdminSession } from './lib/admin-auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // 1. Static assets and internal paths bypass
  if (
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/data/') ||
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.webmanifest'
  ) {
    return next();
  }

  // 2. Admin routes protection
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      // If already authenticated, redirect straight to dashboard
      if (verifyAdminSession(context.cookies)) {
        return context.redirect('/admin');
      }
      return next();
    }

    // Gated admin sub-routes require valid session
    if (!verifyAdminSession(context.cookies)) {
      return context.redirect('/admin/login');
    }
    return next();
  }

  // 3. Admin API endpoints protection
  if (pathname.startsWith('/api/admin/')) {
    // Dynamic same-origin protection for POST/PUT/DELETE
    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
      const origin = context.request.headers.get('origin');
      const host = context.request.headers.get('host');
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            return new Response(JSON.stringify({ error: 'Cross-origin request forbidden' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        } catch {
          // If URL parsing fails, continue to session & CSRF verification
        }
      }
    }

    if (pathname === '/api/admin/auth') {
      return next();
    }
    if (!verifyAdminSession(context.cookies)) {
      return new Response(JSON.stringify({ error: 'Unauthorized observatory session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return next();
  }

  // 4. Offline screen & status API passthrough
  if (pathname.startsWith('/offline') || pathname === '/api/status') {
    return next();
  }

  // 5. Public maintenance mode interception
  const state = await getSystemState();
  if (state.offlineMode) {
    // Allow authenticated faculty preview if explicitly requested via ?preview=true
    if (context.url.searchParams.get('preview') === 'true' && verifyAdminSession(context.cookies)) {
      return next();
    }

    const userAgent = context.request.headers.get('user-agent') || '';
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    return context.rewrite(isMobile ? '/offline/mobile?reason=maintenance' : '/offline?reason=maintenance');
  }

  return next();
});

