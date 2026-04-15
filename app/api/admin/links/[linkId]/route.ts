import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getLinkById, updateLink } from '@/db';
import { SHARE_CLASSES } from '@/lib/constants';

export async function PATCH(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { linkId } = await params;
  const link = getLinkById(linkId);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const body = await request.json();
  const { firstName, lastName, sequenceNumber, shareClass, investorEmail } = body;

  if (sequenceNumber !== undefined && (!Number.isInteger(sequenceNumber) || sequenceNumber <= 0)) {
    return NextResponse.json({ error: 'sequenceNumber must be a positive integer' }, { status: 400 });
  }

  if (shareClass !== undefined && shareClass !== null && shareClass !== '' && !SHARE_CLASSES.includes(shareClass)) {
    return NextResponse.json({ error: `shareClass must be one of: ${SHARE_CLASSES.join(', ')}` }, { status: 400 });
  }

  if (investorEmail !== undefined && investorEmail !== null && investorEmail !== '') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(investorEmail)) {
      return NextResponse.json({ error: 'investorEmail is not a valid email address' }, { status: 400 });
    }
  }

  updateLink(linkId, {
    firstName: firstName !== undefined ? firstName : undefined,
    lastName: lastName !== undefined ? lastName : undefined,
    sequenceNumber: sequenceNumber !== undefined ? sequenceNumber : undefined,
    shareClass: shareClass !== undefined ? shareClass : undefined,
    investorEmail: investorEmail !== undefined ? investorEmail : undefined,
  });

  return NextResponse.json({ success: true, link: getLinkById(linkId) });
}
