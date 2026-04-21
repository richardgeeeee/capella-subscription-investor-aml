import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin-auth';
import {
  getLinkById,
  getLatestAddressProofFile,
  getSubmissionsByLinkId,
  updateAddressVerification,
  type AddressVerification,
} from '@/db';
import { verifyAddressAgainstDocument } from '@/lib/address-verify';

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL) {
    return NextResponse.json({ error: 'LLM not configured (set LLM_API_KEY / LLM_BASE_URL)' }, { status: 500 });
  }

  const { linkId } = await request.json();
  if (!linkId) {
    return NextResponse.json({ error: 'linkId is required' }, { status: 400 });
  }

  const link = getLinkById(linkId);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const file = getLatestAddressProofFile(linkId);
  if (!file) {
    return NextResponse.json({ error: 'No address proof uploaded yet' }, { status: 400 });
  }

  const submissions = getSubmissionsByLinkId(linkId);
  const formData = submissions[0]?.form_data;
  const userAddress = formData
    ? (JSON.parse(formData) as Record<string, string>).residentialAddress?.trim() || ''
    : '';

  if (!userAddress) {
    return NextResponse.json({ error: 'No residentialAddress in submission form data' }, { status: 400 });
  }

  updateAddressVerification(file.id, {
    status: 'pending',
    user_address: userAddress,
    extracted_address: '',
    reason: '',
    checked_at: new Date().toISOString(),
  });

  try {
    const result = await verifyAddressAgainstDocument(file.stored_path, file.mime_type, userAddress);
    const verification: AddressVerification = {
      status: result.skipped ? 'skipped' : result.match ? 'matched' : 'mismatched',
      user_address: userAddress,
      extracted_address: result.extracted_address,
      reason: result.reason,
      checked_at: new Date().toISOString(),
    };
    updateAddressVerification(file.id, verification);
    return NextResponse.json({ verification });
  } catch (err) {
    const verification: AddressVerification = {
      status: 'failed',
      user_address: userAddress,
      extracted_address: '',
      reason: err instanceof Error ? err.message : String(err),
      checked_at: new Date().toISOString(),
    };
    updateAddressVerification(file.id, verification);
    return NextResponse.json({ verification }, { status: 200 });
  }
}
