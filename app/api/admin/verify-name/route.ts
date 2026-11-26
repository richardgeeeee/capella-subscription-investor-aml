import { NextResponse } from 'next/server';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getLinkById, getFilesByLinkId, getSubmissionsByLinkId, logLinkEvent, getDb } from '@/db';
import { verifyNameAgainstDocument } from '@/lib/name-verify';

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL) {
    return NextResponse.json({ error: 'LLM not configured' }, { status: 500 });
  }

  const { linkId } = await request.json();
  if (!linkId) return NextResponse.json({ error: 'linkId is required' }, { status: 400 });

  const link = getLinkById(linkId);
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  // Get legal name from link or form data
  let legalName = '';
  if (link.legal_first_name && link.legal_last_name) {
    legalName = `${link.legal_last_name} ${link.legal_first_name}`;
  } else {
    const submissions = getSubmissionsByLinkId(linkId);
    const formData = submissions[0]?.form_data;
    if (formData) {
      const fd = JSON.parse(formData) as Record<string, string>;
      const lf = fd.legalFirstName || '';
      const ll = fd.legalLastName || '';
      if (lf && ll) legalName = `${ll} ${lf}`;
    }
  }

  if (!legalName) {
    return NextResponse.json({ error: 'No legal name available — investor must fill in legal name first' }, { status: 400 });
  }

  // Find passport/ID files
  const idDocTypes = ['passport_front', 'id_card'];
  const files = getFilesByLinkId(linkId).filter(f => idDocTypes.includes(f.document_type));
  if (files.length === 0) {
    return NextResponse.json({ error: 'No passport or ID document uploaded' }, { status: 400 });
  }

  const admin = await getAdminSession();
  const actor = admin?.name || 'Admin';
  const db = getDb();
  const results: Array<{ fileId: string; status: string; extracted_name: string; reason: string }> = [];

  for (const file of files) {
    const verification = { status: 'pending', legal_name: legalName, extracted_name: '', reason: '', checked_at: new Date().toISOString() };
    db.prepare('UPDATE uploaded_files SET name_verification = ? WHERE id = ?').run(JSON.stringify(verification), file.id);

    try {
      const result = await verifyNameAgainstDocument(file.stored_path, file.mime_type, legalName);
      const v = {
        status: result.skipped ? 'skipped' : result.match ? 'matched' : 'mismatched',
        legal_name: legalName,
        extracted_name: result.extracted_name,
        reason: result.reason,
        checked_at: new Date().toISOString(),
      };
      db.prepare('UPDATE uploaded_files SET name_verification = ? WHERE id = ?').run(JSON.stringify(v), file.id);
      results.push({ fileId: file.id, status: v.status, extracted_name: v.extracted_name, reason: v.reason });
    } catch (err) {
      const v = {
        status: 'failed',
        legal_name: legalName,
        extracted_name: '',
        reason: err instanceof Error ? err.message : String(err),
        checked_at: new Date().toISOString(),
      };
      db.prepare('UPDATE uploaded_files SET name_verification = ? WHERE id = ?').run(JSON.stringify(v), file.id);
      results.push({ fileId: file.id, status: 'failed', extracted_name: '', reason: v.reason });
    }
  }

  logLinkEvent(linkId, 'name_verified', {
    results: results.map(r => ({ fileId: r.fileId, status: r.status })),
    actor,
  });

  return NextResponse.json({ results });
}
