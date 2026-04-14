import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createContractTemplate, getAllContractTemplates, createFieldMapping } from '@/db';
import { verifyApiKey, verifyAdminSession } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const isApiKey = verifyApiKey(request);
  const isAdmin = await verifyAdminSession();
  if (!isApiKey && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const templates = getAllContractTemplates();
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const isApiKey = verifyApiKey(request);
  const isAdmin = await verifyAdminSession();
  if (!isApiKey && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const name = formData.get('name') as string;
  const kind = (formData.get('kind') as string) || 'other';
  const investorType = formData.get('investorType') as string;
  const file = formData.get('file') as File;
  const mappingsJson = formData.get('mappings') as string;

  if (!name || !investorType || !file) {
    return NextResponse.json({ error: 'name, investorType, and file are required' }, { status: 400 });
  }

  if (!['client_agreement', 'subscription_agreement', 'other'].includes(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  if (!['individual', 'corporate'].includes(investorType)) {
    return NextResponse.json({ error: 'Invalid investorType' }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  const fileType = ext === '.docx' ? 'docx' : ext === '.pdf' ? 'pdf' : null;
  if (!fileType) {
    return NextResponse.json({ error: 'Only .docx and .pdf files are supported' }, { status: 400 });
  }

  const templateDir = process.env.TEMPLATE_DIR || './templates';
  if (!fs.existsSync(templateDir)) {
    fs.mkdirSync(templateDir, { recursive: true });
  }

  const templateId = crypto.randomUUID();
  const filePath = path.join(templateDir, `${templateId}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  createContractTemplate({
    id: templateId,
    name,
    kind,
    investorType: investorType as 'individual' | 'corporate',
    filePath,
    fileType,
    originalName: file.name,
  });

  // Create field mappings if provided
  if (mappingsJson) {
    const mappings = JSON.parse(mappingsJson) as Array<{ placeholder: string; formField: string; description?: string }>;
    for (const mapping of mappings) {
      createFieldMapping({
        id: crypto.randomUUID(),
        templateId,
        placeholder: mapping.placeholder,
        formField: mapping.formField,
        description: mapping.description,
      });
    }
  }

  return NextResponse.json({ success: true, templateId });
}
