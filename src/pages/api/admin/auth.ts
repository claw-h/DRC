import type { APIRoute } from 'astro';
import {
  verifyPassword,
  createAdminSession,
  clearAdminSession,
} from '../../../lib/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const action = String(formData.get('action') || 'login');

  if (action === 'logout') {
    clearAdminSession(cookies);
    return redirect('/admin/login');
  }

  const password = String(formData.get('password') || '');
  if (!verifyPassword(password)) {
    return redirect('/admin/login?error=invalid');
  }

  createAdminSession(cookies);
  return redirect('/admin');
};
