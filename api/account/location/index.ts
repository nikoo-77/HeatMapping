import { createClient } from '@supabase/supabase-js';
import { clearEmployeesCache } from '../../employees/_lib.js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).');
  }
  return createClient(url, key);
}

async function findAccount(supabase: ReturnType<typeof getSupabase>, identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  const byUsername = await supabase
    .from('accounts')
    .select('employee_id, username, is_active')
    .eq('username', normalized)
    .maybeSingle();
  if (byUsername.error) throw new Error(byUsername.error.message);
  if (byUsername.data) return byUsername.data;

  const byEmp = await supabase
    .from('accounts')
    .select('employee_id, username, is_active')
    .eq('employee_id', identifier.trim())
    .maybeSingle();
  if (byEmp.error) throw new Error(byEmp.error.message);
  return byEmp.data;
}

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'POST' && method !== 'PATCH') {
      res.setHeader('Allow', 'POST, PATCH');
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const identifier = String(req.body?.identifier ?? req.body?.username ?? '').trim();
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);

    if (!identifier) {
      return res.status(400).json({ message: 'Account identifier is required.' });
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ message: 'Valid latitude and longitude are required.' });
    }
    if (latitude < 4.5 || latitude > 21.5 || longitude < 116 || longitude > 127) {
      return res.status(400).json({ message: 'Location must be inside the Philippines.' });
    }

    const supabase = getSupabase();
    const account = await findAccount(supabase, identifier);
    if (!account || !account.is_active) {
      return res.status(401).json({ message: 'Account not found or inactive.' });
    }
    if (!account.employee_id || account.employee_id === 'ADMIN' || account.employee_id === 'MANAGER') {
      return res.status(400).json({ message: 'This account cannot store a home map pin.' });
    }

    const employeeId = String(account.employee_id).trim();
    const username = String(account.username ?? '').trim().toLowerCase();
    const now = new Date().toISOString();
    const attempts: Array<Record<string, unknown>> = [
      { latitude, longitude, location_set_at: now, updated_at: now },
      { latitude, longitude, updated_at: now },
      { latitude, longitude },
    ];

    let saved: { employee_id: string; username?: string; latitude: number | null; longitude: number | null } | null =
      null;
    let lastError = '';

    for (const patch of attempts) {
      let result = await supabase
        .from('accounts')
        .update(patch)
        .eq('employee_id', employeeId)
        .select('employee_id, username, latitude, longitude')
        .maybeSingle();

      if ((result.error || !result.data) && username) {
        result = await supabase
          .from('accounts')
          .update(patch)
          .eq('username', username)
          .select('employee_id, username, latitude, longitude')
          .maybeSingle();
      }

      if (!result.error && result.data) {
        saved = result.data as {
          employee_id: string;
          username?: string;
          latitude: number | null;
          longitude: number | null;
        };
        break;
      }
      lastError = result.error?.message ?? 'No account row was updated.';
      if (result.error && !/location_set_at|updated_at|column/i.test(result.error.message)) {
        break;
      }
    }

    if (!saved) {
      return res.status(500).json({
        message:
          'Failed to save location to the database. Confirm accounts.latitude and accounts.longitude exist.',
        detail: lastError,
      });
    }

    const savedLat = Number(saved.latitude);
    const savedLng = Number(saved.longitude);
    if (!Number.isFinite(savedLat) || !Number.isFinite(savedLng)) {
      return res.status(500).json({
        message: 'Location update did not persist latitude/longitude.',
      });
    }

    clearEmployeesCache();

    return res.status(200).json({
      message: 'Home location saved.',
      employeeId: String(saved.employee_id || employeeId).trim(),
      username: saved.username ?? account.username,
      latitude: savedLat,
      longitude: savedLng,
      locationSetAt: now,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: 'Location save failed.',
      detail: error?.message ?? String(error),
    });
  }
}
