import { NextResponse } from 'next/server';
import { setAdminCookie, clearAdminCookie } from '@/lib/admin-auth';
import { exchangeCodeForTokens, getGoogleUserInfo, isAllowedDomain } from '@/lib/google-oauth';

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  if (action === 'logout') {
    await clearAdminCookie();
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// Google OAuth callback
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const redirectUri = `${baseUrl}/api/admin/auth`;

  if (error) {
    return NextResponse.redirect(`${baseUrl}/admin/login?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/admin/login?error=no_code`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const userInfo = await getGoogleUserInfo(tokens.access_token);

    if (!isAllowedDomain(userInfo.email)) {
      return NextResponse.redirect(
        `${baseUrl}/admin/login?error=${encodeURIComponent('Only @capella-capital.com accounts are allowed')}`
      );
    }

    await setAdminCookie({
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
    });

    return NextResponse.redirect(`${baseUrl}/admin`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    return NextResponse.redirect(
      `${baseUrl}/admin/login?error=${encodeURIComponent('Authentication failed')}`
    );
  }
}
