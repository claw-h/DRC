import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyAdminSession, verifyCsrfToken } from '../../../lib/admin-auth.ts';
import { updateFacultyProfile, getFacultyProfile } from '../../../lib/system-state.ts';

export const prerender = false;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

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

  const target = String(body.target || 'portrait');
  const dataUrl = String(body.dataUrl || '');

  // 1. Target: Book Cover Monograph Image
  if (target === 'book-cover') {
    if (!dataUrl.startsWith('data:image/')) {
      return new Response(JSON.stringify({ error: 'Valid image data URL required for book cover' }), { status: 400 });
    }

    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) {
      return new Response(JSON.stringify({ error: 'Malformed image data' }), { status: 400 });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const rawName = String(body.customFileName || 'monograph-cover').trim();
    const slugName = slugify(rawName) || 'monograph-cover';
    const fileName = `${slugName}-${Date.now().toString().slice(-4)}.${ext}`;

    const booksDir = path.resolve(process.cwd(), 'public/images/books');
    await fs.mkdir(booksDir, { recursive: true });

    const outPath = path.resolve(booksDir, fileName);
    await fs.writeFile(outPath, buffer);

    const imageUrl = `/images/books/${fileName}`;
    return new Response(
      JSON.stringify({
        ok: true,
        imageUrl,
        message: `Saved book cover to ${imageUrl}. URL ready to use in Monograph schema.`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Target: Faculty ID Portrait & Office Telemetry
  const patch: Record<string, string> = {};
  if (body.office) patch.office = String(body.office).trim();
  if (body.officeHours) patch.officeHours = String(body.officeHours).trim();
  if (body.phone) patch.phone = String(body.phone).trim();
  if (body.email) patch.email = String(body.email).trim();
  if (body.bio) patch.bio = String(body.bio).trim();

  if (dataUrl.startsWith('data:image/')) {
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const fileName = `duncan-cordry-portrait.${ext}`;
      const imagesDir = path.resolve(process.cwd(), 'public/images');
      await fs.mkdir(imagesDir, { recursive: true });

      const outPath = path.resolve(imagesDir, fileName);
      await fs.writeFile(outPath, buffer);
      patch.portraitUrl = `/images/${fileName}`;
    }
  }

  const updated = await updateFacultyProfile(patch);

  return new Response(
    JSON.stringify({
      ok: true,
      profile: updated,
      portraitUrl: updated.portraitUrl,
      message: 'Faculty ID portrait and office telemetry successfully synchronized.',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
