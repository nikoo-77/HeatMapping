import { AidAttachmentRow, AidAssistanceRequestRow, buildAidRequestCode, getAidRequestsByRole, getSupabaseClient, isAllowedAttachment, mapAidRequestToResponse, parseMultipartRequest, loadEmployees, resolveManagerDirectReportIds } from './_lib.js';

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase();

    if (method === 'GET') {
      const viewerRole = String(req.query.viewerRole || '').trim();
      const viewerEmployeeId = String(req.query.viewerEmployeeId || '').trim();
      const managerName = String(req.query.managerName || '').trim();
      const managerId = String(req.query.managerId || '').trim();

      try {
        const response = await getAidRequestsByRole({
          viewerRole,
          viewerEmployeeId,
          managerName,
          managerId,
        });
        return res.status(200).json(response);
      } catch (error: any) {
        const status = Number(error?.status || 500);
        return res.status(status).json({ message: error?.message || 'Failed to load aid assistance requests.' });
      }
    }

    if (method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
    let fields: Record<string, string> = {};
    let files: Array<{ originalname: string; mimetype: string; buffer: Buffer }> = [];

    if (contentType.includes('multipart/form-data')) {
      const parsed = await parseMultipartRequest(req);
      fields = parsed.fields;
      files = parsed.files;
    } else {
      const body = (req.body ?? {}) as Record<string, any>;
      fields = {
        employeeId: String(body.employeeId ?? '').trim(),
        aidType: String(body.aidType ?? '').trim(),
        damageType: String(body.damageType ?? '').trim(),
        incidentName: String(body.incidentName ?? '').trim(),
        description: String(body.description ?? '').trim(),
        submittedByManager: String(body.submittedByManager ?? ''),
        managerName: String(body.managerName ?? '').trim(),
        managerId: String(body.managerId ?? '').trim(),
      };
      files = [];
    }

    const employeeId = String(fields.employeeId || '').trim();
    const aidType = String(fields.aidType || '').trim();
    const damageType = String(fields.damageType || '').trim() as 'Major' | 'Minor';
    const incidentName = String(fields.incidentName || '').trim();
    const description = String(fields.description || '').trim();
    const submittedByManager = String(fields.submittedByManager || '').toLowerCase();
    const bodyManagerName = String(fields.managerName || '').trim();
    const bodyManagerId = String(fields.managerId || '').trim();

    if (!employeeId || !aidType || !damageType || !description) {
      return res.status(400).json({ message: 'Missing required aid assistance fields.' });
    }

    const supabase = getSupabaseClient();
    const employees = await loadEmployees();
    const employee = employees.find((entry) => entry.id === employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    let managerName = employee.managerName?.trim() || null;
    let managerId = employee.managerId?.trim() || null;
    let status: AidAssistanceRequestRow['status'] = 'Pending Manager Review';
    let managerDecision: 'Approved' | 'Rejected' | null = null;
    let managerRemarks: string | null = null;
    let managerReviewedBy: string | null = null;
    let managerReviewedAt: string | null = null;

    const isManagerSubmission = submittedByManager === 'true' || submittedByManager === '1';
    if (isManagerSubmission) {
      if (!bodyManagerName) {
        return res.status(401).json({ message: 'Manager identity required to submit for a team member.' });
      }

      const allowedIds = await resolveManagerDirectReportIds(bodyManagerName, bodyManagerId || undefined);
      if (!allowedIds.includes(employeeId)) {
        return res.status(403).json({ message: 'Forbidden: the requested employee is not under your management.' });
      }

      status = 'Pending Admin Review';
      managerName = bodyManagerName;
      managerId = bodyManagerId || managerId;
      managerDecision = 'Approved';
      managerRemarks = 'Submitted by manager on behalf of team member.';
      managerReviewedBy = bodyManagerName;
      managerReviewedAt = new Date().toISOString();
    }

    for (const file of files) {
      if (!isAllowedAttachment(file)) {
        return res.status(400).json({ message: `Unsupported file type: ${file.originalname}` });
      }
    }

    const requestCode = buildAidRequestCode();
    const employeeName = employee.name.trim();
    const department = employee.department?.trim() || 'Unknown';
    const position = employee.role?.trim() || null;

    const { data: insertedRows, error: insertError } = await supabase
      .from('aid_assistance_requests')
      .insert({
        request_code: requestCode,
        employee_id: employeeId,
        employee_name: employeeName,
        department,
        position,
        manager_id: managerId,
        manager_name: managerName,
        aid_type: aidType,
        damage_type: damageType,
        incident_name: incidentName || 'Self-Reported Local Calamity',
        reason: description,
        status,
        manager_decision: managerDecision,
        manager_remarks: managerRemarks,
        manager_reviewed_by: managerReviewedBy,
        manager_reviewed_at: managerReviewedAt,
      })
      .select('*')
      .limit(1);

    if (insertError || !insertedRows || insertedRows.length === 0) {
      return res.status(500).json({ message: 'Failed to create aid assistance request.', detail: insertError?.message });
    }

    const requestRow = insertedRows[0] as AidAssistanceRequestRow;
    const savedAttachments: AidAttachmentRow[] = [];

    for (const file of files) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${employeeId}/${requestRow.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('aid-assistance-attachments')
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        return res.status(500).json({ message: 'Failed to upload attachment.', detail: uploadError.message });
      }

      const { data: publicData } = supabase.storage.from('aid-assistance-attachments').getPublicUrl(storagePath);
      const { data: insertedAttachmentRows, error: attachmentInsertError } = await supabase
        .from('aid_assistance_attachments')
        .insert({
          aid_assistance_id: requestRow.id,
          employee_id: employeeId,
          file_name: file.originalname,
          file_path: storagePath,
          public_url: publicData.publicUrl,
        })
        .select('*')
        .limit(1);

      if (attachmentInsertError || !insertedAttachmentRows || insertedAttachmentRows.length === 0) {
        return res.status(500).json({ message: 'Failed to save attachment metadata.', detail: attachmentInsertError?.message });
      }

      savedAttachments.push(insertedAttachmentRows[0] as AidAttachmentRow);
    }

    const response = mapAidRequestToResponse(requestRow, savedAttachments, 'Luzon');
    return res.status(201).json(response);
  } catch (error: any) {
    return res.status(500).json({
      message: 'Internal server error.',
      detail: error?.message ?? String(error),
    });
  }
}