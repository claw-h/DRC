import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyAdminSession, verifyCsrfToken } from '../../../lib/admin-auth.ts';
import { listClassReviews, moderateClassReview, setClassReviewsEnabled, loadObservatoryWorkspaceData } from '../../../lib/turso.ts';

export const prerender = false;
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!verifyAdminSession(cookies)) return json({ error: 'Unauthorized session.' }, 401);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (!verifyCsrfToken(cookies, String(body.csrfToken || ''))) return json({ error: 'Invalid CSRF token.' }, 403);

  const action = String(body.action || '');
  if (action === 'list') {
    const classId = String(body.classId || '').trim();
    const { classes } = await loadObservatoryWorkspaceData();
    const course = classes.find((item: any) => item.id === classId);
    if (!course) return json({ error: 'Class not found.' }, 404);
    const reviews = await listClassReviews(classId);
    const legacy = Array.isArray(course.data.reviews) ? course.data.reviews.map((review: any, index: number) => ({ ...review, id: `legacy-${classId}-${index}`, status: 'approved', legacy: true })) : [];
    return json({ ok: true, acceptingReviews: Boolean(course.data.acceptingReviews), reviews: [...reviews, ...legacy] });
  }

  if (action === 'toggle-submissions') {
    const classId = String(body.classId || '').trim();
    const enabled = Boolean(body.enabled);
    const { classes } = await loadObservatoryWorkspaceData();
    const course = classes.find((item: any) => item.id === classId);
    if (!course) return json({ error: 'Class not found.' }, 404);
    const dbSaved = await setClassReviewsEnabled(classId, enabled);
    let fileSaved = false;
    try {
      const filePath = path.resolve(process.cwd(), `src/data/classes/${classId}.md`);
      const source = await fs.readFile(filePath, 'utf8');
      const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);
      if (match) {
        const frontmatter = /^acceptingReviews\s*:/m.test(match[1])
          ? match[1].replace(/^acceptingReviews\s*:.*/m, `acceptingReviews: ${enabled}`)
          : `${match[1]}\nacceptingReviews: ${enabled}`;
        await fs.writeFile(filePath, `---\n${frontmatter}\n---${match[2]}`, 'utf8');
        fileSaved = true;
      }
    } catch { /* Serverless deployments may have a read-only content tree. */ }
    if (!dbSaved && !fileSaved) return json({ error: 'Could not save the class review setting.' }, 503);
    return json({ ok: true, enabled });
  }

  if (action === 'moderate') {
    const reviewId = String(body.reviewId || '').trim();
    const status = String(body.status || '');
    if (!reviewId.startsWith('legacy-') && !['approved', 'rejected', 'removed'].includes(status)) return json({ error: 'Invalid moderation action.' }, 400);
    if (reviewId.startsWith('legacy-')) return json({ error: 'Legacy syllabus reviews are read-only. New reviews can be moderated here.' }, 409);
    const saved = await moderateClassReview(reviewId, status as 'approved' | 'rejected' | 'removed');
    return saved ? json({ ok: true }) : json({ error: 'Could not update this review.' }, 503);
  }
  return json({ error: 'Unknown review action.' }, 400);
};
