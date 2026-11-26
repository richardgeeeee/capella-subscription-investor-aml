import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getLinkById, getSubmissionsByLinkId, logLinkEvent } from '@/db';
import {
  fillIndividualClientAgreement,
  formatAgreementFilename,
  parseAgreementDate,
  defaultAgreementDate,
  isAcroFormTemplateAvailable,
  type AgreementInput,
} from '@/lib/agreement-fill';

const AUTHORISED_STAFF = [
  { name: 'MA Ran', ceNumber: 'BBS460' },
];

export async function GET() {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    templateAvailable: isAcroFormTemplateAvailable(),
    authorisedStaff: AUTHORISED_STAFF,
  });
}

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAcroFormTemplateAvailable()) {
    return NextResponse.json({
      error: 'AcroForm template not found. Place "individual_client_agreement_v3_form.pdf" in the assets/ directory.',
    }, { status: 400 });
  }

  const body = await request.json();
  const {
    linkId,
    legalFullName,
    idNumber,
    registeredAddress,
    agreementDate,
    staffName,
    staffCeNumber,
  } = body;

  if (!linkId || !legalFullName || !idNumber || !registeredAddress || !agreementDate || !staffName || !staffCeNumber) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }

  const link = getLinkById(linkId);
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  const dateParts = parseAgreementDate(agreementDate);
  const input: AgreementInput = {
    legalFullName,
    idNumber,
    registeredAddress,
    agreementDateDay: dateParts.day,
    agreementDateMonth: dateParts.month,
    agreementDateYear: dateParts.year,
    staffName,
    staffCeNumber,
  };

  try {
    const pdfBuffer = await fillIndividualClientAgreement(input);

    const agreementDateObj = new Date(agreementDate + 'T00:00:00');
    const folderName = `${(link.last_name || '').toUpperCase()} ${link.first_name || ''}`.trim() || link.investor_name;
    const fileName = formatAgreementFilename(folderName, agreementDateObj);

    const outDir = path.join(
      process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : './data',
      'agreements',
      linkId
    );
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const storedPath = path.join(outDir, `${crypto.randomUUID()}.pdf`);
    fs.writeFileSync(storedPath, pdfBuffer);

    const admin = await getAdminSession();
    logLinkEvent(linkId, 'agreement_generated', {
      fileName,
      legalFullName,
      agreementDate,
      actor: admin?.name || 'Admin',
    });

    return NextResponse.json({
      success: true,
      fileName,
      storedPath,
      fileSize: pdfBuffer.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
