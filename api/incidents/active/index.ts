import { createClient } from '@supabase/supabase-js';

type IncidentSnapshotPayload = {
  calamityReports: unknown[];
  pendingEmployeeReports: unknown[];
  resolvedReports: Record<string, boolean>;
  simulationActive: boolean;
  epicenter: { lat: number; lng: number; radiusKm: number };
  activeDisaster: Record<string, unknown>;
};

interface IncidentSnapshotRow {
  id: string;
  snapshot: IncidentSnapshotPayload;
  updated_at: string;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).');
  }
  return createClient(url, key);
}

function normalizeIncidentSnapshotPayload(value: unknown): IncidentSnapshotPayload | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Partial<IncidentSnapshotPayload>;
  if (!snapshot.epicenter || !snapshot.activeDisaster) return null;
  return {
    calamityReports: Array.isArray(snapshot.calamityReports) ? snapshot.calamityReports : [],
    pendingEmployeeReports: Array.isArray(snapshot.pendingEmployeeReports) ? snapshot.pendingEmployeeReports : [],
    resolvedReports:
      snapshot.resolvedReports && typeof snapshot.resolvedReports === 'object' && !Array.isArray(snapshot.resolvedReports)
        ? snapshot.resolvedReports
        : {},
    simulationActive: Boolean(snapshot.simulationActive),
    epicenter: snapshot.epicenter,
    activeDisaster: snapshot.activeDisaster,
  };
}

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    const supabase = getSupabase();

    if (method === 'GET') {
      const { data, error } = await supabase
        .from('active_incident_state')
        .select('*')
        .eq('id', 'global')
        .limit(1);

      if (error) {
        return res.status(500).json({ message: 'Failed to load active incident.', detail: error.message });
      }

      const row = (data ?? [])[0] as IncidentSnapshotRow | undefined;
      if (!row) {
        return res.status(200).json({ snapshot: null });
      }

      const snapshot = normalizeIncidentSnapshotPayload(row.snapshot);
      if (!snapshot) {
        return res.status(500).json({ message: 'Stored active incident is invalid.' });
      }

      return res.status(200).json({ snapshot, updatedAt: row.updated_at });
    }

    if (method === 'PUT') {
      const snapshot = normalizeIncidentSnapshotPayload((req.body as { snapshot?: unknown } | undefined)?.snapshot);
      if (!snapshot) {
        return res.status(400).json({ message: 'Invalid active incident snapshot.' });
      }

      const { error } = await supabase
        .from('active_incident_state')
        .upsert({ id: 'global', snapshot, updated_at: new Date().toISOString() }, { onConflict: 'id' });

      if (error) {
        return res.status(500).json({ message: 'Failed to save active incident.', detail: error.message });
      }

      return res.status(200).json({ message: 'Active incident saved.', snapshot });
    }

    if (method === 'DELETE') {
      const role = String(req.query.role || req.header('x-user-role') || '').trim().toLowerCase();
      if (role !== 'admin') {
        return res.status(403).json({ message: 'Only admin accounts can clear active incident records from the database.' });
      }

      const { error } = await supabase
        .from('active_incident_state')
        .delete()
        .eq('id', 'global');

      if (error) {
        return res.status(500).json({ message: 'Failed to clear active incident.', detail: error.message });
      }

      return res.status(200).json({ message: 'Active incident cleared.' });
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (error: any) {
    return res.status(500).json({
      message: 'Internal server error.',
      detail: error?.message ?? String(error),
    });
  }
}