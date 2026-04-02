import { cookies } from 'next/headers';

const ADMIN_COOKIE_NAME = 'capella_admin';

export function verifyApiKey(request: Request): boolean {
  const apiKey = request.headers.get('x-api-key');
  return !!apiKey && apiKey === process.env.ADMIN_API_KEY;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(ADMIN_COOKIE_NAME);
  if (!cookie) return null;

  try {
    const session = JSON.parse(cookie.value) as AdminSession;
    if (!session.email || !session.name) return null;
    return session;
  } catch {
    return null;
  }
}

export async function verifyAdminSession(): Promise<boolean> {
  const session = await getAdminSession();
  return !!session;
}

export async function setAdminCookie(session: AdminSession) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });
}

export async function clearAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

export interface AdminSession {
  email: string;
  name: string;
  picture?: string;
}
