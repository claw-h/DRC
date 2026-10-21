import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  verifyAdminSession,
  verifyCsrfToken,
  verifyPassword,
} from '../../../lib/admin-auth.ts';
import { updateSystemState } from '../../../lib/system-state.ts';
import { generateObservatoryBackup } from '../../../lib/archive.ts';

export const prerender = false;

// GET: Stream Archive Backup (.tar.gz)
export const GET: APIRoute = async ({ request, cookies }) => {
  if (!verifyAdminSession(cookies)) {
    return new Response('Unauthorized session', { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'download-archive') {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const archiveBuffer = await generateObservatoryBackup();

      return new Response(archiveBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Disposition': `attachment; filename="drc-observatory-archive-${today}.tar.gz"`,
          'Content-Length': String(archiveBuffer.length),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    } catch (err: any) {
      console.error('[Archive Generation Error]', err);
      return new Response(`Failed generating archive: ${err?.message}`, { status: 500 });
    }
  }

  return new Response('Invalid request', { status: 400 });
};

// POST: Lifecycle State Mutations & Escalated Protocols
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!verifyAdminSession(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json().catch(() => ({}));
  if (!verifyCsrfToken(cookies, String(body.csrfToken || ''))) {
    return new Response(JSON.stringify({ error: 'Invalid CSRF token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const action = String(body.action || '');

  // Archive metadata or download URL request
  if (action === 'get-archive-url') {
    return new Response(
      JSON.stringify({
        ok: true,
        downloadUrl: '/api/admin/lifecycle?action=download-archive',
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Level 1: Soft Offline Shutter (Public Access toggle)
  if (action === 'toggle-offline') {
    const offlineMode = Boolean(body.offline);
    const updated = await updateSystemState({ offlineMode });
    return new Response(
      JSON.stringify({
        ok: true,
        state: updated,
        message: offlineMode
          ? 'Observatory shutter engaged (Public site is now offline).'
          : 'Observatory shutter opened (Public site access restored).',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Level 2: Hard Node Server Termination (SIGTERM)
  if (action === 'shutdown-server') {
    if (!verifyPassword(String(body.password || ''))) {
      return new Response(JSON.stringify({ error: 'Invalid administrator password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    setTimeout(() => {
      process.kill(process.pid, 'SIGTERM');
    }, 600);

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'SIGTERM dispatched to Node process. Server shutting down in 600ms.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Level 3: Sovereign Codebase Purge (Requires phrase DESTROY-DRC-OBSERVATORY + password)
  if (action === 'purge-codebase') {
    const phrase = String(body.confirmationPhrase || '');
    const password = String(body.password || '');

    if (phrase !== 'DESTROY-DRC-OBSERVATORY' && phrase !== 'CONFIRM-PERMANENT-RESET') {
      return new Response(
        JSON.stringify({ error: 'Confirmation phrase must match CONFIRM-PERMANENT-RESET' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!verifyPassword(password)) {
      return new Response(JSON.stringify({ error: 'Invalid administrator password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const allowDestructive = process.env.DRC_ALLOW_DESTRUCTIVE_PURGE === 'true';
    if (allowDestructive) {
      const targetDirs = ['src/data/publications', 'src/data/books', 'src/data/classes', 'public/data/sky'];
      for (const rel of targetDirs) {
        const abs = path.resolve(process.cwd(), rel);
        await fs.rm(abs, { recursive: true, force: true });
      }
      setTimeout(() => process.exit(0), 500);
    } else {
      await updateSystemState({ offlineMode: true });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: allowDestructive
          ? 'Sovereign codebase purge executed and process terminated.'
          : 'Sovereign purge engaged (Safety lock active: switched to permanent 503 decommissioned state; set DRC_ALLOW_DESTRUCTIVE_PURGE=true to enable physical disk rm).',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ error: 'Unknown lifecycle action' }), { status: 400 });
};
