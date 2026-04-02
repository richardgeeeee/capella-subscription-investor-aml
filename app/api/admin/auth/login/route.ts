import { NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/google-oauth';

export async function GET() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const redirectUri = `${baseUrl}/api/admin/auth`;
  const authUrl = getGoogleAuthUrl(redirectUri);
  return NextResponse.redirect(authUrl);
}
