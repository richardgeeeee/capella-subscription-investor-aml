import crypto from 'crypto';
import { getLinkByToken, type LinkRow } from '@/db';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export interface TokenValidationResult {
  valid: boolean;
  reason?: 'not_found' | 'expired' | 'revoked';
  link?: LinkRow;
}

export function validateToken(token: string): TokenValidationResult {
  const link = getLinkByToken(token);

  if (!link) {
    return { valid: false, reason: 'not_found' };
  }

  if (link.is_revoked) {
    return { valid: false, reason: 'revoked' };
  }

  const now = new Date();
  const expiresAt = new Date(link.expires_at);
  if (now > expiresAt) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, link };
}
