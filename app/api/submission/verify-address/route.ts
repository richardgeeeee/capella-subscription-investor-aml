import { NextResponse } from 'next/server';
import { validateToken } from '@/lib/token';
import { getSessionFromCookie } from '@/lib/session';
import { getLatestAddressProofFile, updateAddressVerification, type AddressVerification } from '@/db';
import { verifyAddressAgainstDocument } from '@/lib/address-verify';

function isConfigured(): boolean {
  return !!(process.env.LLM_API_KEY && process.env.LLM_BASE_URL);
}

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'Address verification is not configured' });
  }

  const body = await request.json();
  const { token, userAddress } = body;
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const result = validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: `Link is ${result.reason}` }, { status: 400 });
  }
  if (session.link_id !== result.link!.id) {
    return NextResponse.json({ error: 'Session does not match link' }, { status: 403 });
  }

  const file = getLatestAddressProofFile(result.link!.id);
  if (!file) {
    return NextResponse.json({ skipped: true, reason: 'No address proof uploaded yet' });
  }

  const address = (userAddress || '').trim();
  if (!address) {
    return NextResponse.json({ skipped: true, reason: 'No address entered yet' });
  }

  // Mark as pending
  const pending: AddressVerification = {
    status: 'pending',
    user_address: address,
    extracted_address: '',
    reason: '',
    checked_at: new Date().toISOString(),
  };
  updateAddressVerification(file.id, pending);

  try {
    const verifyResult = await verifyAddressAgainstDocument(file.stored_path, file.mime_type, address);
    const verification: AddressVerification = {
      status: verifyResult.skipped ? 'skipped' : verifyResult.match ? 'matched' : 'mismatched',
      user_address: address,
      extracted_address: verifyResult.extracted_address,
      reason: verifyResult.reason,
      checked_at: new Date().toISOString(),
    };
    updateAddressVerification(file.id, verification);
    return NextResponse.json({ verification });
  } catch (err) {
    const verification: AddressVerification = {
      status: 'failed',
      user_address: address,
      extracted_address: '',
      reason: err instanceof Error ? err.message : String(err),
      checked_at: new Date().toISOString(),
    };
    updateAddressVerification(file.id, verification);
    return NextResponse.json({ verification }, { status: 200 });
  }
}

export async function GET(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const result = validateToken(token);
  if (!result.valid) return NextResponse.json({ error: `Link is ${result.reason}` }, { status: 400 });
  if (session.link_id !== result.link!.id) return NextResponse.json({ error: 'Session mismatch' }, { status: 403 });

  const file = getLatestAddressProofFile(result.link!.id);
  if (!file?.address_verification) return NextResponse.json({ verification: null });

  const verification = JSON.parse(file.address_verification) as AddressVerification;
  return NextResponse.json({ verification });
}
