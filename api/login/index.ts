import { createClient } from '@supabase/supabase-js';
import { scryptSync, timingSafeEqual } from 'crypto';

type AccountRole = 'admin' | 'manager' | 'official';
type SwitchableRole = 'admin' | 'manager' | 'official';

interface AccountRow {
  employee_id: string;
  username: string;
  password_hash: string;
  access_role: AccountRole;
  display_name: string | null;
  profile_picture: string | null;
  is_active: boolean;
}

function normalizeAccountText(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveSwitchableRoles(account: AccountRow): { canSwitchRoles: boolean; switchableRoles: SwitchableRole[] } {
  const employeeId = normalizeAccountText(account.employee_id);
  const username = normalizeAccountText(account.username);
  const displayName = normalizeAccountText(account.display_name);

  const isPrivilegedAccount =
    employeeId === '7rf' ||
    username === '7rf' ||
    username === 'zulueta vladimir' ||
    displayName === 'zulueta vladimir';

  if (!isPrivilegedAccount) {
    if (account.access_role === 'manager') {
      return {
        canSwitchRoles: true,
        switchableRoles: ['official', 'manager'],
      };
    }

    return {
      canSwitchRoles: false,
      switchableRoles: [account.access_role],
    };
  }

  return {
    canSwitchRoles: true,
    switchableRoles: ['official', 'manager', 'admin'],
  };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).');
  }
  return createClient(url, key);
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

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const identifier = String(req.body?.identifier ?? req.body?.username ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const supabase = getSupabase();
    let { data, error } = await supabase
      .from('accounts')
      .select('employee_id, username, password_hash, access_role, display_name, profile_picture, is_active')
      .eq('username', identifier)
      .maybeSingle();

    if (!data && !error) {
      const byEmp = await supabase
        .from('accounts')
        .select('employee_id, username, password_hash, access_role, display_name, profile_picture, is_active')
        .eq('employee_id', String(req.body?.identifier ?? req.body?.username ?? '').trim())
        .maybeSingle();
      data = byEmp.data;
      error = byEmp.error;
    }

    if (error) {
      return res.status(500).json({
        message: 'Login service unavailable. Ensure the accounts table exists (run 20260721_accounts.sql).',
        detail: error.message,
      });
    }

    const account = data as AccountRow | null;
    if (!account || !account.is_active || !verifyPassword(password, account.password_hash)) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const { canSwitchRoles, switchableRoles } = resolveSwitchableRoles(account);

    return res.status(200).json({
      username: account.username,
      role: account.access_role,
      employeeId: account.employee_id,
      displayName: account.display_name ?? account.username,
      profilePicture: account.profile_picture ?? null,
      mustChangePassword:
        account.access_role === 'official' && verifyPassword('123456', account.password_hash),
      canSwitchRoles,
      switchableRoles,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: 'Internal server error.',
      detail: error?.message ?? String(error),
    });
  }
}
