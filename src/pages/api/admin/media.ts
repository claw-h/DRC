import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyAdminSession, verifyCsrfToken } from '../../../lib/admin-auth.ts';
import { updateFacultyProfile } from '../../../lib/system-state.ts';

export const prerender = false;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
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

      let imageUrl = dataUrl;
      try {
        const booksDir = path.resolve(process.cwd(), 'public/images/books');
        await fs.mkdir(booksDir, { recursive: true });
        const outPath = path.resolve(booksDir, fileName);
        await fs.writeFile(outPath, buffer);
        imageUrl = `/images/books/${fileName}`;
      } catch {
        // Fallback to dataUrl in read-only / serverless environment (Vercel)
        imageUrl = dataUrl;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          imageUrl,
          message: `Saved book cover asset. URL ready to use in Monograph schema.`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Target: Faculty Identity Profile & Portrait
    const patch: Record<string, any> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.monogram !== undefined) patch.monogram = String(body.monogram).trim();
    if (body.credentialId !== undefined) patch.credentialId = String(body.credentialId).trim();
    if (body.title !== undefined) patch.title = String(body.title).trim();
    if (body.department !== undefined) patch.department = String(body.department).trim();
    if (body.education !== undefined) patch.education = String(body.education).trim();
    if (body.institution !== undefined) patch.institution = String(body.institution).trim();
    if (body.office !== undefined) patch.office = String(body.office).trim();
    if (body.officeHours !== undefined) patch.officeHours = String(body.officeHours).trim();
    if (body.phone !== undefined) patch.phone = String(body.phone).trim();
    if (body.email !== undefined) patch.email = String(body.email).trim();
    if (body.bio !== undefined) patch.bio = String(body.bio).trim();
    if (body.ashokaProfileUrl !== undefined) patch.ashokaProfileUrl = String(body.ashokaProfileUrl).trim();
    if (body.philPeopleUrl !== undefined) patch.philPeopleUrl = String(body.philPeopleUrl).trim();

    if (Array.isArray(body.aos)) {
      patch.aos = body.aos.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof body.aos === 'string') {
      patch.aos = body.aos.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    if (Array.isArray(body.aoc)) {
      patch.aoc = body.aoc.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof body.aoc === 'string') {
      patch.aoc = body.aoc.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    if (Array.isArray(body.awards)) {
      patch.awards = body.awards.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof body.awards === 'string') {
      patch.awards = body.awards.split('\n').map((s: string) => s.trim()).filter(Boolean);
    }

    if (dataUrl.startsWith('data:image/')) {
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const fileName = `duncan-cordry-portrait.${ext}`;

        try {
          const imagesDir = path.resolve(process.cwd(), 'public/images');
          await fs.mkdir(imagesDir, { recursive: true });
          const outPath = path.resolve(imagesDir, fileName);
          await fs.writeFile(outPath, buffer);
          patch.portraitUrl = `/images/${fileName}`;
        } catch {
          // In read-only serverless environment (Vercel), persist dataUrl directly to Turso
          patch.portraitUrl = dataUrl;
        }
      }
    }

    const updated = await updateFacultyProfile(patch);

    return new Response(
      JSON.stringify({
        ok: true,
        profile: updated,
        portraitUrl: updated.portraitUrl,
        message: 'Faculty Identity profile and portrait successfully synchronized.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[Media API Error]', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Failed to save media asset.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
