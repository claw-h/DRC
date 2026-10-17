import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyAdminSession, verifyCsrfToken } from '../../../lib/admin-auth';
import { updateFacultyProfile } from '../../../lib/system-state';

export const prerender = false;

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

  const dataUrl = String(body.dataUrl || '');
  const officeHours = String(body.officeHours || '').trim();
  const office = String(body.office || '').trim();

  const patch: Record<string, string> = {};
  if (officeHours) patch.officeHours = officeHours;
  if (office) patch.office = office;

  if (dataUrl.startsWith('data:image/')) {
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const fileName = `duncan-cordry-portrait.${ext}`;
      const outPath = path.resolve(process.cwd(), 'public/images', fileName);
      await fs.writeFile(outPath, buffer);
      patch.portraitUrl = `/images/${fileName}`;
    }
  }

  const updated = await updateFacultyProfile(patch);

  return new Response(
    JSON.stringify({
      ok: true,
      portraitUrl: updated.portraitUrl,
      message: 'Faculty ID portrait and office telemetry updated.',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
