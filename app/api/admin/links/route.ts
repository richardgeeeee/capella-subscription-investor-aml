import { NextResponse } from 'next/server';
import { getAllLinks, getUnseenEventCounts } from '@/db';
import { verifyApiKey, verifyAdminSession, getAdminSession } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const isApiKey = verifyApiKey(request);
  const isAdmin = await verifyAdminSession();
  if (!isApiKey && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const links = getAllLinks();
  const admin = await getAdminSession();
  const unseenCounts = admin ? getUnseenEventCounts(admin.email) : {};

  const enriched = links.map(l => ({
    ...l,
    recent_event_count: unseenCounts[l.id] || 0,
  }));

  return NextResponse.json({ links: enriched });
}
