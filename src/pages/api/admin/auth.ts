import type { APIRoute } from 'astro';
import {
  verifyPassword,
  createAdminSession,
  clearAdminSession,
  checkLoginAllowed,
  recordFailedLogin,
  clearFailedLogins,
} from '../../../lib/admin-auth';

export const prerender = false;

function getClientIp(request: Request, clientAddress?: string): string {
  const xForwarded = request.headers.get('x-forwarded-for');
  if (xForwarded) {
    return xForwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return clientAddress || '127.0.0.1';
}

export const POST: APIRoute = async ({ request, cookies, redirect, clientAddress }) => {
  const ip = getClientIp(request, clientAddress);
  const contentType = request.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let action = 'login';
  let password = '';

  if (isJson) {
    const body = await request.json().catch(() => ({}));
    action = String(body.action || 'login');
    password = String(body.password || '');
  } else {
    const formData = await request.formData().catch(() => new FormData());
    action = String(formData.get('action') || 'login');
    password = String(formData.get('password') || '');
  }

  if (action === 'logout') {
    clearAdminSession(cookies);
    if (isJson) {
      return new Response(JSON.stringify({ ok: true, redirected: '/admin/login' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect('/admin/login');
  }

  // Rate Limiting Check
  const rateLimit = checkLoginAllowed(ip);
  if (!rateLimit.allowed) {
    const msg = `Too many failed attempts. Locked out for ${rateLimit.waitMinutes} minute(s).`;
    if (isJson) {
      return new Response(JSON.stringify({ error: msg, locked: true }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect(`/admin/login?error=ratelimit&wait=${rateLimit.waitMinutes}`);
  }

  if (!verifyPassword(password)) {
    const status = recordFailedLogin(ip);
    if (status.locked) {
      const msg = `Too many failed attempts. Observatory console locked for 15 minutes.`;
      if (isJson) {
        return new Response(JSON.stringify({ error: msg, locked: true }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect('/admin/login?error=ratelimit&wait=15');
    }

    if (isJson) {
      return new Response(JSON.stringify({ error: 'Invalid passphrase' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect('/admin/login?error=invalid');
  }

  // Success
  clearFailedLogins(ip);
  createAdminSession(cookies);

  if (isJson) {
    return new Response(JSON.stringify({ ok: true, redirected: '/admin' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return redirect('/admin');
};

