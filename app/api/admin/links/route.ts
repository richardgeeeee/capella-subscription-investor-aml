import { NextResponse } from 'next/server';
import { getAllLinks } from '@/db';
import { verifyApiKey, verifyAdminSession } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const isApiKey = verifyApiKey(request);
  const isAdmin = await verifyAdminSession();
  if (!isApiKey && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const links = getAllLinks();
  return NextResponse.json({ links });
}
