import { createClient } from '@supabase/supabase-js';
import { scryptSync, timingSafeEqual, randomBytes } from 'crypto';

type AccountRole = 'admin' | 'manager' | 'official';

interface AccountRow {
  employee_id: string;
  username: string;
  password_hash: string;
  access_role: AccountRole;
  display_name: string | null;
  is_active: boolean;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY.');
  }
  return createClient(url, key);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function findAccount(supabase: ReturnType<typeof getSupabase>, identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  const byUsername = await supabase
    .from('accounts')
    .select('employee_id, username, password_hash, access_role, display_name, is_active')
    .eq('username', normalized)
    .maybeSingle();
  if (byUsername.error) throw new Error(byUsername.error.message);
  if (byUsername.data) return byUsername.data as AccountRow;

  const byEmp = await supabase
    .from('accounts')
    .select('employee_id, username, password_hash, access_role, display_name, is_active')
    .eq('employee_id', identifier.trim())
    .maybeSingle();
  if (byEmp.error) throw new Error(byEmp.error.message);
  return (byEmp.data as AccountRow | null) ?? null;
}

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const identifier = String(req.body?.identifier ?? req.body?.username ?? '').trim();
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (!identifier || !currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from the current password.' });
    }

    const supabase = getSupabase();
    const account = await findAccount(supabase, identifier);
    if (!account || !account.is_active || !verifyPassword(currentPassword, account.password_hash)) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    const { error } = await supabase
      .from('accounts')
      .update({
        password_hash: hashPassword(newPassword),
        updated_at: new Date().toISOString(),
      })
      .eq('employee_id', account.employee_id);

    if (error) {
      return res.status(500).json({ message: 'Failed to update password in the database.', detail: error.message });
    }

    return res.status(200).json({ message: 'Password updated successfully.', username: account.username });
  } catch (error: any) {
    return res.status(500).json({
      message: 'Internal server error.',
      detail: error?.message ?? String(error),
    });
  }
}
