import { NextResponse } from 'next/server';
import { authenticateAdmin, setAdminCookie, clearAdminCookie } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const body = await request.json();
  const { username, password, action } = body;

  if (action === 'logout') {
    await clearAdminCookie();
    return NextResponse.json({ success: true });
  }

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }

  const valid = await authenticateAdmin(username, password);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  await setAdminCookie(username);
  return NextResponse.json({ success: true });
}
