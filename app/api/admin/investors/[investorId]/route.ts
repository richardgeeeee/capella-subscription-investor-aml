import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getInvestorById, updateInvestor } from '@/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ investorId: string }> }
) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { investorId } = await params;
  const investor = getInvestorById(investorId);
  if (!investor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  updateInvestor(investorId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    shareClass: body.shareClass,
  });

  return NextResponse.json({ success: true, investor: getInvestorById(investorId) });
}
