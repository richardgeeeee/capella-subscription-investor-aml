import { NextResponse } from 'next/server';
import { getDistinctInvestors } from '@/db';
import { verifyAdminSession } from '@/lib/admin-auth';

export async function GET() {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const investors = getDistinctInvestors();
  return NextResponse.json({ investors });
}
