import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyAdminSession, verifyCsrfToken } from '../../../lib/admin-auth';

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

  const constellationId = String(body.id || '').trim();
  if (!constellationId) {
    return new Response(JSON.stringify({ error: 'Constellation ID required' }), { status: 400 });
  }

  const indexPath = path.resolve(process.cwd(), 'public/data/sky/index.json');
  const indexRaw = await fs.readFile(indexPath, 'utf8');
  const indexData = JSON.parse(indexRaw);

  const entry = indexData.catalog.find((c: any) => c.id === constellationId);
  if (!entry) {
    return new Response(JSON.stringify({ error: `Constellation ${constellationId} not found` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  indexData.catalog = indexData.catalog.filter((c: any) => c.id !== constellationId);
  indexData.total = indexData.catalog.length;
  await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2), 'utf8');

  const shardId = String(entry.shard).padStart(2, '0');
  const shardPath = path.resolve(
    process.cwd(),
    `public/data/sky/shards/shard-${shardId}.json`
  );
  try {
    const shardRaw = await fs.readFile(shardPath, 'utf8');
    const shardArr = JSON.parse(shardRaw);
    const filtered = shardArr.filter((c: any) => c.id !== constellationId);
    await fs.writeFile(shardPath, JSON.stringify(filtered), 'utf8');
  } catch {
    // Ignore if shard already pruned
  }

  return new Response(
    JSON.stringify({
      ok: true,
      deletedId: constellationId,
      remainingTotal: indexData.total,
      message: `Constellation ${constellationId} (${entry.name}) purged from celestial catalog.`,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
