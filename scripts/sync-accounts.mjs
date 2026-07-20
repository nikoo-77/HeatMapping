/**
 * One-shot: fill missing accounts from Employee Details (batch insert).
 * Run: node scripts/sync-accounts.mjs
 * Requires accounts.employee_id as primary key (see 20260721_accounts.sql).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync } from 'crypto';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function loadAll(table, select = '*') {
  const rows = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select(select).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return rows;
}

try {
  const employees = await loadAll('Employee Details');
  const accounts = await loadAll('accounts', 'username, employee_id');
  const existingUsernames = new Set(
    accounts.map((a) => String(a.username || '').trim().toLowerCase()).filter(Boolean)
  );
  const existingIds = new Set(
    accounts.map((a) => String(a.employee_id || '').trim()).filter(Boolean)
  );

  const defaultHash = hashPassword('123456');
  const toInsert = [];

  for (const row of employees) {
    const id = String(row['Employee ID'] || '').trim();
    if (!id || existingIds.has(id)) continue;
    const email = String(row['OFFICIAL EMAIL'] || row['PERSONAL EMAIL'] || '')
      .trim()
      .toLowerCase();
    const username = email || id.toLowerCase();
    if (!username || existingUsernames.has(username)) continue;
    existingIds.add(id);
    existingUsernames.add(username);
    toInsert.push({
      employee_id: id,
      username,
      password_hash: defaultHash,
      access_role: 'official',
      display_name: String(row['Employee Name'] || id).trim(),
      is_active: true,
    });
  }

  for (const sys of [
    {
      employee_id: 'ADMIN',
      username: 'admin',
      password: 'admin123',
      access_role: 'admin',
      display_name: 'System Administrator',
    },
    {
      employee_id: 'MANAGER',
      username: 'manager',
      password: 'manager123',
      access_role: 'manager',
      display_name: 'Area Manager',
    },
  ]) {
    if (existingIds.has(sys.employee_id) || existingUsernames.has(sys.username)) continue;
    toInsert.push({
      employee_id: sys.employee_id,
      username: sys.username,
      password_hash: hashPassword(sys.password),
      access_role: sys.access_role,
      display_name: sys.display_name,
      is_active: true,
    });
    existingIds.add(sys.employee_id);
    existingUsernames.add(sys.username);
  }

  console.log(
    `Will insert ${toInsert.length} accounts (employees=${employees.length}, existing=${accounts.length})`
  );

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    const { error } = await sb.from('accounts').upsert(chunk, {
      onConflict: 'employee_id',
      ignoreDuplicates: true,
    });
    if (error) {
      console.error('Chunk failed at', i, error.message, error.details || '', error.hint || '');
      for (const row of chunk) {
        const { error: rowErr } = await sb.from('accounts').upsert(row, {
          onConflict: 'employee_id',
          ignoreDuplicates: true,
        });
        if (rowErr) {
          console.error('Skip', row.employee_id, rowErr.message);
        } else {
          inserted += 1;
        }
      }
      continue;
    }
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }

  const { count } = await sb.from('accounts').select('*', { count: 'exact', head: true });
  console.log(JSON.stringify({ employees: employees.length, inserted, accountsNow: count }, null, 2));
} catch (err) {
  console.error('FATAL', err?.message || err);
  process.exit(1);
}
