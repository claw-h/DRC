export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { loadObservatoryWorkspaceData } from '../../../../lib/turso';
import type { PublicBootstrapPayload } from '../../../../lib/public-content';

export const GET: APIRoute = async ({ request }) => {
  const { publications, books, classes, profile, systemState } = await loadObservatoryWorkspaceData();
  const payload: PublicBootstrapPayload = {
    schemaVersion: 1,
    generatedAt: systemState.updatedAt,
    profile,
    collections: {
      publications: publications.map(({ id, data }: any) => ({ id, data: data as Record<string, unknown> })),
      books: books.map(({ id, data }: any) => ({ id, data: data as Record<string, unknown> })),
      classes: classes.map(({ id, data }: any) => ({ id, data: data as Record<string, unknown> })),
    },
    links: {
      cv: '/cv',
      publications: '/#stage-3',
    },
  };

  const body = JSON.stringify(payload);
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400',
    ETag: etag,
  });

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, { status: 200, headers });
};
