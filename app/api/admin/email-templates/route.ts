import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin-auth';
import { getEmailTemplate, upsertEmailTemplate } from '@/db';

export async function GET(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const name = url.searchParams.get('name') || 'investor_invitation';

  const template = getEmailTemplate(name);
  return NextResponse.json({ template: template || null });
}

export async function PUT(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { name, subject, bodyHtml } = body;

  if (!subject || !bodyHtml) {
    return NextResponse.json({ error: 'subject and bodyHtml are required' }, { status: 400 });
  }

  upsertEmailTemplate({ name: name || 'investor_invitation', subject, bodyHtml });
  return NextResponse.json({ success: true });
}
