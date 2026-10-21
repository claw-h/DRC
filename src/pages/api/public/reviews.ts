import type { APIRoute } from 'astro';
import { createClassReview, listClassReviews } from '../../../lib/turso.ts';
import { loadObservatoryWorkspaceData } from '../../../lib/turso.ts';

export const prerender = false;

const submissionsByIp = new Map<string, number[]>();
const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ url }) => {
  const classId = (url.searchParams.get('classId') || '').trim();
  if (!classId) return response({ error: 'A class ID is required.' }, 400);
  const { classes } = await loadObservatoryWorkspaceData();
  const course = classes.find((item: any) => item.id === classId);
  if (!course) return response({ error: 'Class not found.' }, 404);
  const records = await listClassReviews(classId, 'approved');
  const legacy = Array.isArray(course.data.reviews) ? course.data.reviews.map((review: any, index: number) => ({ ...review, id: `legacy-${classId}-${index}`, status: 'approved' })) : [];
  return response({ ok: true, reviews: [...records, ...legacy].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))) });
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const recent = (submissionsByIp.get(ip) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (recent.length >= 3) return response({ error: 'Please wait before sending another review.' }, 429);
  let body: any;
  try { body = await request.json(); } catch { return response({ error: 'Invalid review submission.' }, 400); }

  const classId = String(body.classId || '').trim();
  const author = String(body.author || '').trim();
  const role = String(body.role || '').trim();
  const term = String(body.term || '').trim();
  const highlight = String(body.highlight || '').trim();
  const quote = String(body.quote || '').trim();
  const rating = Number(body.rating);
  if (!classId || !author || !role || !term || !quote || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return response({ error: 'Complete the required fields and choose a rating from 1 to 5.' }, 400);
  }
  if (author.length > 80 || role.length > 120 || term.length > 80 || highlight.length > 180 || quote.length > 3000) {
    return response({ error: 'One or more fields exceed the allowed length.' }, 400);
  }

  const { classes } = await loadObservatoryWorkspaceData();
  const course = classes.find((item: any) => item.id === classId);
  if (!course) return response({ error: 'Class not found.' }, 404);
  if (!course.data.acceptingReviews) return response({ error: 'This class is not accepting reviews right now.' }, 403);
  const saved = await createClassReview(classId, { id: crypto.randomUUID(), author, role, term, rating, highlight, quote });
  if (!saved) return response({ error: 'Reviews are temporarily unavailable. Please try again later.' }, 503);
  recent.push(now);
  submissionsByIp.set(ip, recent);
  return response({ ok: true, message: 'Your review was received and is awaiting approval.' }, 201);
};
