import { NextResponse } from 'next/server';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getFileById, updatePaymentExtraction, logLinkEvent } from '@/db';
import { extractPaymentInfo } from '@/lib/payment-verify';

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileId } = await request.json();
  if (!fileId) return NextResponse.json({ error: 'fileId is required' }, { status: 400 });

  const file = getFileById(fileId);
  if (!file || file.document_type !== 'payment_proof') {
    return NextResponse.json({ error: 'Payment proof file not found' }, { status: 404 });
  }

  const admin = await getAdminSession();

  try {
    const result = await extractPaymentInfo(file.stored_path, file.mime_type);
    const extraction = {
      ...result,
      checked_at: new Date().toISOString(),
    };
    updatePaymentExtraction(fileId, extraction);
    logLinkEvent(file.link_id, 'payment_extracted', {
      fileId,
      records: result.records.length,
      error: result.error || undefined,
      actor: admin?.name || 'Admin',
    });
    return NextResponse.json({ extraction });
  } catch (err) {
    const extraction = {
      records: [],
      error: err instanceof Error ? err.message : String(err),
      checked_at: new Date().toISOString(),
    };
    updatePaymentExtraction(fileId, extraction);
    return NextResponse.json({ extraction });
  }
}
