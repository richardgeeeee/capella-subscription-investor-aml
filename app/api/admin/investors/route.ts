import { NextResponse } from 'next/server';
import { verifyAdminSession, getAdminSession } from '@/lib/admin-auth';
import { getAllInvestors, upsertInvestorFromDrive, upsertInvestorFromPortal, getDistinctInvestors } from '@/db';
import { listDriveFolders, isDriveSyncConfigured } from '@/lib/google-drive-sync';

function parseFolderName(name: string): { firstName: string; lastName: string } {
  // Remove leading sequence number: "053 George COSTANZA" → "George COSTANZA"
  const stripped = name.replace(/^\d+\s+/, '');
  const parts = stripped.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  // Heuristic: if first word is all uppercase and >1 char, it's LASTNAME
  if (parts[0] === parts[0].toUpperCase() && parts[0].length > 1 && parts[0] !== parts[0].toLowerCase()) {
    return { lastName: parts[0], firstName: parts.slice(1).join(' ') };
  }
  // Otherwise assume "FirstName LASTNAME" (last word uppercase)
  const last = parts[parts.length - 1];
  if (last === last.toUpperCase() && last.length > 1) {
    return { firstName: parts.slice(0, -1).join(' '), lastName: last };
  }
  // Fallback: first word = first name, rest = last name
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export async function GET() {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const investors = getAllInvestors();
  return NextResponse.json({ investors });
}

export async function POST(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  if (body.action === 'sync_drive') {
    if (!isDriveSyncConfigured()) {
      return NextResponse.json({ error: 'Google Drive sync not configured' }, { status: 500 });
    }

    const folders = await listDriveFolders();
    let synced = 0;
    for (const folder of folders) {
      const { firstName, lastName } = parseFolderName(folder.name);
      upsertInvestorFromDrive({
        driveFolderId: folder.id,
        driveFolderName: folder.name,
        driveFolderUrl: folder.url,
        firstName,
        lastName,
      });
      synced++;
    }

    // Also sync portal investors
    const portalInvestors = getDistinctInvestors();
    for (const inv of portalInvestors) {
      upsertInvestorFromPortal({
        firstName: inv.first_name,
        lastName: inv.last_name,
        email: inv.investor_email,
        investorType: inv.investor_type,
        shareClass: inv.share_class,
        driveFolderId: inv.drive_folder_id,
      });
    }

    const admin = await getAdminSession();
    return NextResponse.json({ success: true, synced, actor: admin?.name });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
