import type { APIRoute } from 'astro';
import { getSystemState } from '../../lib/system-state';

export const prerender = false;

export const GET: APIRoute = async () => {
  const state = await getSystemState();
  return new Response(
    JSON.stringify({
      offlineMode: Boolean(state.offlineMode),
      updatedAt: state.updatedAt,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
};
