import { NextRequest, NextResponse } from 'next/server';
import { validateToken } from '@/lib/token';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ valid: false, reason: 'no_token' }, { status: 400 });
  }

  const result = validateToken(token);

  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: result.reason });
  }

  return NextResponse.json({
    valid: true,
    investorName: result.link!.investor_name,
    investorType: result.link!.investor_type,
    expiresAt: result.link!.expires_at,
    linkId: result.link!.id,
  });
}
