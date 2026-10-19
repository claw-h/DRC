import crypto from 'node:crypto';
import type { AstroCookies } from 'astro';

const SESSION_COOKIE = 'drc_obs_session';
const CSRF_COOKIE = 'drc_obs_csrf';

// Secret key & default admin passphrases (override via DRC_ADMIN_PASSWORD and DRC_SESSION_SECRET in .env)
const SECRET = process.env.DRC_SESSION_SECRET || 'drc-observatory-sovereign-secret-2026-key';
const PRIMARY_PASSWORD = process.env.DRC_ADMIN_PASSWORD || 'observatory-drc-2026';
const ALIAS_PASSWORD = 'cordry-observatory-2026';
const SALT = 'drc-salt-j2000';

const PRIMARY_HASH = crypto.scryptSync(PRIMARY_PASSWORD, SALT, 64);
const ALIAS_HASH = crypto.scryptSync(ALIAS_PASSWORD, SALT, 64);

export function verifyPassword(candidate: string): boolean {
  if (!candidate) return false;
  const candidateHash = crypto.scryptSync(candidate, SALT, 64);
  const matchPrimary = crypto.timingSafeEqual(candidateHash, PRIMARY_HASH);
  const matchAlias = crypto.timingSafeEqual(candidateHash, ALIAS_HASH);
  return matchPrimary || matchAlias;
}

export function createAdminSession(cookies: AstroCookies): string {
  const expires = Date.now() + 1000 * 60 * 60 * 12; // 12 hours
  const payload = `admin:${expires}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const token = `${payload}.${sig}`;
  const csrf = crypto.randomBytes(24).toString('hex');

  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 12,
  });

  cookies.set(CSRF_COOKIE, csrf, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 12,
  });

  return csrf;
}

export function clearAdminSession(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  cookies.delete(CSRF_COOKIE, { path: '/' });
}

export function verifyAdminSession(cookies: AstroCookies): boolean {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;

  const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (sig.length !== expectedSig.length) return false;
  const validSig = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  if (!validSig) return false;

  const [, expStr] = payload.split(':');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  return true;
}

export function getSessionExpiry(cookies: AstroCookies): number | null {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload] = parts;
  const [, expStr] = payload.split(':');
  const exp = Number(expStr);
  return Number.isFinite(exp) ? exp : null;
}

export function getCsrfToken(cookies: AstroCookies): string {
  const existing = cookies.get(CSRF_COOKIE)?.value;
  if (existing) return existing;
  const csrf = crypto.randomBytes(24).toString('hex');
  cookies.set(CSRF_COOKIE, csrf, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 12,
  });
  return csrf;
}

export function verifyCsrfToken(cookies: AstroCookies, candidate: string): boolean {
  const expected = cookies.get(CSRF_COOKIE)?.value;
  if (!expected || !candidate || expected.length !== candidate.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
}

// In-Memory Brute-Force Rate Limiting (5 attempts per 15 minutes per IP)
interface RateLimitEntry {
  attempts: number;
  lockedUntil: number;
}
const FAILED_ATTEMPTS = new Map<string, RateLimitEntry>();
const MAX_FAILED = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export function checkLoginAllowed(ip: string): { allowed: boolean; waitMinutes?: number } {
  const entry = FAILED_ATTEMPTS.get(ip);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil > Date.now()) {
    const waitMinutes = Math.ceil((entry.lockedUntil - Date.now()) / (60 * 1000));
    return { allowed: false, waitMinutes };
  }
  if (entry.lockedUntil > 0 && entry.lockedUntil <= Date.now()) {
    FAILED_ATTEMPTS.delete(ip);
  }
  return { allowed: true };
}

export function recordFailedLogin(ip: string): { locked: boolean; waitMinutes?: number } {
  const entry = FAILED_ATTEMPTS.get(ip) || { attempts: 0, lockedUntil: 0 };
  entry.attempts += 1;
  if (entry.attempts >= MAX_FAILED) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    FAILED_ATTEMPTS.set(ip, entry);
    return { locked: true, waitMinutes: 15 };
  }
  FAILED_ATTEMPTS.set(ip, entry);
  return { locked: false };
}

export function clearFailedLogins(ip: string): void {
  FAILED_ATTEMPTS.delete(ip);
}

