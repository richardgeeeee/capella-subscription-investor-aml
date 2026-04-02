import { cookies } from 'next/headers';
import { getAdminByUsername } from '@/db';
import bcrypt from 'bcryptjs';

const ADMIN_COOKIE_NAME = 'capella_admin';

export function verifyApiKey(request: Request): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === process.env.ADMIN_API_KEY;
}

export async function verifyAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(ADMIN_COOKIE_NAME);
  if (!cookie) return false;

  // Simple: cookie value is "username:hash" where hash matches password_hash
  const [username] = cookie.value.split(':');
  if (!username) return false;

  const admin = getAdminByUsername(username);
  return !!admin;
}

export async function setAdminCookie(username: string) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, `${username}:${Date.now()}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60, // 1 day
    path: '/',
  });
}

export async function clearAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

export async function authenticateAdmin(username: string, password: string): Promise<boolean> {
  const admin = getAdminByUsername(username);
  if (!admin) return false;
  return bcrypt.compareSync(password, admin.password_hash);
}
