import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyAdminSession, verifyCsrfToken } from '../../../lib/admin-auth.ts';
import { getSystemState, updateSystemState } from '../../../lib/system-state.ts';

export const prerender = false;

interface ConstellationCatalogEntry {
  id: string;
  name: string;
  genitive?: string;
  plate?: string;
  plateNumber?: number;
  meaning?: string;
  english?: string;
  ra: string;
  dec: string;
  shard: string;
  indexInShard?: number;
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

  const action = String(body.action || 'delete');
  const constellationId = String(body.id || '').trim();

  if (!constellationId) {
    return new Response(JSON.stringify({ error: 'Constellation ID is required' }), { status: 400 });
  }

  const indexPath = path.resolve(process.cwd(), 'public/data/sky/index.json');
  const indexRaw = await fs.readFile(indexPath, 'utf8');
  const indexData = JSON.parse(indexRaw);

  const entry: ConstellationCatalogEntry = indexData.catalog.find(
    (c: any) => c.id.toLowerCase() === constellationId.toLowerCase()
  );

  if (!entry) {
    return new Response(JSON.stringify({ error: `Constellation "${constellationId}" not found in catalog` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawShard = String(entry.shard || 'shard-00.json');
  const shardFile = rawShard.endsWith('.json') ? rawShard : `shard-${rawShard.padStart(2, '0')}.json`;
  const shardPath = path.resolve(process.cwd(), `public/data/sky/shards/${shardFile}`);

  // ACTION 1: Get Full Constellation Data for Interactive Canvas Editor
  if (action === 'get-constellation') {
    try {
      const shardRaw = await fs.readFile(shardPath, 'utf8');
      const shardArr = JSON.parse(shardRaw);
      const detail = shardArr.find((c: any) => c.id.toLowerCase() === entry.id.toLowerCase());

      const systemState = await getSystemState();
      const isFeatured = systemState.featuredConstellationId === entry.id;

      return new Response(
        JSON.stringify({
          ok: true,
          catalogEntry: entry,
          constellation: detail || entry,
          isFeatured,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err: any) {
      return new Response(JSON.stringify({ error: `Failed reading shard: ${err?.message}` }), { status: 500 });
    }
  }

  // ACTION 2: Save Shard Coordinate & Edge Mutations
  if (action === 'update-coordinates') {
    try {
      const shardRaw = await fs.readFile(shardPath, 'utf8');
      const shardArr = JSON.parse(shardRaw);
      const targetIndex = shardArr.findIndex((c: any) => c.id.toLowerCase() === entry.id.toLowerCase());

      if (targetIndex === -1) {
        return new Response(JSON.stringify({ error: `Constellation ${entry.id} not found in ${shardFile}` }), { status: 404 });
      }

      const current = shardArr[targetIndex];

      // Mutate stars array if provided
      if (Array.isArray(body.stars)) {
        current.stars = body.stars.map((s: any) => [
          Math.max(0, Math.min(10000, Math.round(Number(s[0]) || 0))),
          Math.max(0, Math.min(10000, Math.round(Number(s[1]) || 0))),
          Number(s[2]) || 3.0,
          Number(s[3]) || 5,
          Number(s[4]) || 0,
          String(s[5] || ''),
          String(s[6] || ''),
          Number(s[7]) || 12,
        ]);
      }

      // Mutate edges array if provided
      if (Array.isArray(body.edges)) {
        current.edges = body.edges.map((e: any) => [Number(e[0]), Number(e[1])]);
      }

      shardArr[targetIndex] = current;
      await fs.writeFile(shardPath, JSON.stringify(shardArr), 'utf8');

      // Also sync constellations.json if present
      const allPath = path.resolve(process.cwd(), 'public/data/sky/constellations.json');
      try {
        const allRaw = await fs.readFile(allPath, 'utf8');
        const allArr = JSON.parse(allRaw);
        const allIdx = allArr.findIndex((c: any) => c.id.toLowerCase() === entry.id.toLowerCase());
        if (allIdx !== -1) {
          allArr[allIdx] = current;
          await fs.writeFile(allPath, JSON.stringify(allArr), 'utf8');
        }
      } catch {}

      return new Response(
        JSON.stringify({
          ok: true,
          message: `Saved ${current.stars.length} vertices and ${current.edges.length} edges for ${entry.name}.`,
          constellation: current,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err: any) {
      return new Response(JSON.stringify({ error: `Failed writing shard: ${err?.message}` }), { status: 500 });
    }
  }

  // ACTION 3: Pin Featured Sky Constellation
  if (action === 'pin-featured') {
    const isPinning = Boolean(body.pin);
    const updated = await updateSystemState({
      featuredConstellationId: isPinning ? entry.id : null,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        featuredConstellationId: updated.featuredConstellationId,
        message: isPinning
          ? `Pinned ${entry.name} (${entry.id}) as the default celestial landing plate.`
          : 'Default random celestial orientation restored.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ACTION 4: Purge Constellation from Registry
  if (action === 'delete') {
    indexData.catalog = indexData.catalog.filter((c: any) => c.id.toLowerCase() !== entry.id.toLowerCase());
    indexData.total = indexData.catalog.length;
    indexData.totalConstellations = indexData.total;
    await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2), 'utf8');

    try {
      const shardRaw = await fs.readFile(shardPath, 'utf8');
      const shardArr = JSON.parse(shardRaw);
      const filtered = shardArr.filter((c: any) => c.id.toLowerCase() !== entry.id.toLowerCase());
      await fs.writeFile(shardPath, JSON.stringify(filtered), 'utf8');
    } catch {}

    return new Response(
      JSON.stringify({
        ok: true,
        deletedId: entry.id,
        remainingTotal: indexData.total,
        message: `Constellation ${entry.id} (${entry.name}) purged from celestial shards.`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ error: 'Unknown constellation action' }), { status: 400 });
};
