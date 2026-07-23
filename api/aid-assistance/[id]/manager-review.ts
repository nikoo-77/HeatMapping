import { AidAttachmentRow, AidAssistanceRequestRow, enforceManagerAccess, getSupabaseClient, mapAidRequestToResponse } from '../_lib.js';

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'PATCH').toUpperCase();
    if (method !== 'PATCH') {
      res.setHeader('Allow', 'PATCH');
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { id } = req.query as { id?: string };
    const managerName = String(req.body?.managerName ?? '').trim();
    const managerId = String(req.body?.managerId ?? '').trim();
    const decision = String(req.body?.decision ?? '').trim().toLowerCase();
    const remarks = String(req.body?.remarks ?? '').trim();

    if (!id) return res.status(400).json({ message: 'Aid assistance request id is required.' });
    if (!managerName) return res.status(401).json({ message: 'Manager identity required.' });
    if (!decision || !['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ message: 'Invalid manager decision.' });
    }

    const supabase = getSupabaseClient();
    const { data: rows, error } = await supabase
      .from('aid_assistance_requests')
      .select('*')
      .eq('id', id)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return res.status(404).json({ message: 'Aid assistance request not found.' });
    }

    const row = rows[0] as AidAssistanceRequestRow;
    const denied = await enforceManagerAccess(row.employee_id, managerName, managerId || undefined);
    if (denied) {
      return res.status(denied.status).json({ message: denied.message });
    }
    if (row.status !== 'Pending Manager Review') {
      return res.status(400).json({ message: 'Only pending manager review requests can be actioned.' });
    }

    const nextStatus = decision === 'approve' ? 'Pending Admin Review' : 'Rejected by Manager';
    const managerDecision = decision === 'approve' ? 'Approved' : 'Rejected';

    const { data: updatedRows, error: updateError } = await supabase
      .from('aid_assistance_requests')
      .update({
        status: nextStatus,
        manager_decision: managerDecision,
        manager_remarks: remarks || null,
        manager_reviewed_by: managerName,
        manager_reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .limit(1);

    if (updateError || !updatedRows || updatedRows.length === 0) {
      return res.status(500).json({ message: 'Failed to update manager review.', detail: updateError?.message });
    }

    const updated = updatedRows[0] as AidAssistanceRequestRow;
    const { data: attachmentRows } = await supabase
      .from('aid_assistance_attachments')
      .select('*')
      .eq('aid_assistance_id', id)
      .order('uploaded_at', { ascending: false });

    return res.status(200).json(
      mapAidRequestToResponse(updated, (attachmentRows ?? []) as AidAttachmentRow[], 'Luzon')
    );
  } catch (error: any) {
    return res.status(500).json({
      message: 'Internal server error.',
      detail: error?.message ?? String(error),
    });
  }
}