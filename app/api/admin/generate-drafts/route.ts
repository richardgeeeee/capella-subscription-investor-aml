import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getLinkById, getSubmissionsByLinkId, getTemplatesByLinkAndKind, logLinkEvent, type ContractTemplateRow } from '@/db';
import { generateContract } from '@/lib/contract';
import { formatAgreementName } from '@/lib/file-naming';

const DRAFT_KINDS = ['client_agreement', 'subscription_agreement'] as const;

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { linkId } = body;
  if (!linkId) {
    return NextResponse.json({ error: 'linkId is required' }, { status: 400 });
  }

  const link = getLinkById(linkId);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const submissions = getSubmissionsByLinkId(linkId);
  const submission = submissions[0];
  if (!submission) {
    return NextResponse.json({ error: 'No submission found' }, { status: 400 });
  }

  const formData = JSON.parse(submission.form_data || '{}');
  const subscriptionDate = formData.subscriptionDate as string;
  if (!subscriptionDate) {
    return NextResponse.json({ error: 'Submission has no subscriptionDate yet — investor must fill the form first' }, { status: 400 });
  }

  // Output directory for drafts
  const dataDir = process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : './data';
  const draftDir = path.join(dataDir, 'drafts', linkId);
  if (!fs.existsSync(draftDir)) fs.mkdirSync(draftDir, { recursive: true });

  const generated: { kind: string; fileName: string; templateName: string }[] = [];
  const errors: { kind: string; error: string }[] = [];

  for (const kind of DRAFT_KINDS) {
    const templates = getTemplatesByLinkAndKind(link.investor_type, kind);
    if (templates.length === 0) {
      errors.push({ kind, error: `No template uploaded for kind=${kind}` });
      continue;
    }

    // Use the most recent template of this kind
    const template: ContractTemplateRow = templates[0];

    try {
      const result = await generateContract(template.id, formData);
      if (!result) {
        errors.push({ kind, error: 'generateContract returned null' });
        continue;
      }
      const ext = template.file_type === 'docx' ? '.docx' : '.pdf';
      const agreementType = template.name; // admin-set, e.g. "Individual Client Agreement"
      const fileName = formatAgreementName(
        link.first_name,
        link.last_name,
        link.investor_name,
        agreementType,
        subscriptionDate,
        ext
      );
      const filePath = path.join(draftDir, fileName);
      fs.writeFileSync(filePath, result.buffer);
      generated.push({ kind, fileName, templateName: template.name });
    } catch (err) {
      errors.push({ kind, error: err instanceof Error ? err.message : String(err) });
    }
  }

  logLinkEvent(linkId, 'drafts_generated', {
    generated: generated.map(g => g.fileName),
    errors: errors.length > 0 ? errors : undefined,
  });

  return NextResponse.json({ success: true, generated, errors });
}

export async function GET(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const linkId = url.searchParams.get('linkId');
  if (!linkId) {
    return NextResponse.json({ error: 'linkId is required' }, { status: 400 });
  }

  const dataDir = process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : './data';
  const draftDir = path.join(dataDir, 'drafts', linkId);
  if (!fs.existsSync(draftDir)) {
    return NextResponse.json({ files: [] });
  }

  const files = fs.readdirSync(draftDir).map(name => {
    const stat = fs.statSync(path.join(draftDir, name));
    return { name, size: stat.size, mtime: stat.mtime.toISOString() };
  });

  return NextResponse.json({ files });
}
