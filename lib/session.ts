import crypto from 'crypto';
import { cookies } from 'next/headers';
import {
  createSession,
  getSessionByToken,
  createVerificationCode,
  getVerificationCode,
  markCodeUsed,
  type SessionRow,
  type LinkRow,
} from '@/db';
import { VERIFICATION_CODE_LENGTH, VERIFICATION_CODE_EXPIRY_MINUTES, SESSION_EXPIRY_DAYS } from './constants';

const SESSION_COOKIE_NAME = 'capella_session';

export function generateVerificationCode(): string {
  const digits = '0123456789';
  let code = '';
  const bytes = crypto.randomBytes(VERIFICATION_CODE_LENGTH);
  for (let i = 0; i < VERIFICATION_CODE_LENGTH; i++) {
    code += digits[bytes[i] % 10];
  }
  return code;
}

export function createAndStoreVerificationCode(linkId: string, email: string): string {
  const code = generateVerificationCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);

  createVerificationCode({
    id: crypto.randomUUID(),
    linkId,
    email,
    code,
    expiresAt: expiresAt.toISOString(),
  });

  return code;
}

export function verifyCodeAndCreateSession(linkId: string, email: string, code: string): string | null {
  const record = getVerificationCode(linkId, email, code);
  if (!record) return null;

  markCodeUsed(record.id);

  const sessionToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  createSession({
    id: crypto.randomUUID(),
    linkId,
    email,
    sessionToken,
    expiresAt: expiresAt.toISOString(),
  });

  return sessionToken;
}

export async function setSessionCookie(sessionToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

export async function getSessionFromCookie(): Promise<SessionRow | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!cookie) return null;

  const session = getSessionByToken(cookie.value);
  if (!session) return null;

  const now = new Date();
  const expiresAt = new Date(session.expires_at);
  if (now > expiresAt) return null;

  return session;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
