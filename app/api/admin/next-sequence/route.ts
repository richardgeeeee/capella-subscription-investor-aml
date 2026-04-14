import { NextResponse } from 'next/server';
import { verifyApiKey, verifyAdminSession } from '@/lib/admin-auth';
import { suggestNextSequence } from '@/db';

export async function GET(request: Request) {
  const isApiKey = verifyApiKey(request);
  const isAdmin = await verifyAdminSession();
  if (!isApiKey && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ next: suggestNextSequence() });
}
