import Busboy from 'busboy';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getEmployees, resolveManagerId } from '../employees/_lib.js';

type AidStatus =
  | 'Pending Manager Review'
  | 'Rejected by Manager'
  | 'Pending Admin Review'
  | 'Rejected by Admin/CSR'
  | 'Approved';

export interface AidAssistanceRequestRow {
  id: string;
  request_code: string;
  employee_id: string;
  employee_name: string;
  department: string;
  position: string | null;
  manager_id: string | null;
  manager_name: string | null;
  aid_type: string;
  damage_type: 'Major' | 'Minor';
  incident_name: string;
  reason: string;
  status: AidStatus;
  submitted_at: string;
  manager_decision: 'Approved' | 'Rejected' | null;
  manager_remarks: string | null;
  manager_reviewed_by: string | null;
  manager_reviewed_at: string | null;
  admin_decision: 'Approved' | 'Rejected' | null;
  admin_remarks: string | null;
  admin_reviewed_by: string | null;
  admin_reviewed_at: string | null;
}

export interface AidAttachmentRow {
  id: string;
  aid_assistance_id: string;
  employee_id: string;
  file_name: string;
  file_path: string;
  public_url: string;
  uploaded_at: string;
}

export type AidRequestResponse = {
  id: string;
  requestCode: string;
  employeeId: string;
  employeeName: string;
  department: string;
  position?: string;
  incidentId: string;
  incidentName: string;
  aidType: string;
  description: string;
  status: AidStatus;
  damageType: 'Major' | 'Minor';
  filedDate: string;
  islandGroup: 'Luzon' | 'Visayas' | 'Mindanao';
  managerReview: {
    decision: 'Approved' | 'Rejected' | 'Pending';
    remarks?: string;
    reviewedBy?: string;
    reviewedDate?: string;
  };
  adminReview: {
    decision: 'Approved' | 'Rejected' | 'Pending';
    remarks?: string;
    reviewedBy?: string;
    reviewedDate?: string;
  };
  attachments: {
    id: string;
    fileName: string;
    filePath: string;
    publicUrl: string;
    uploadedAt: string;
  }[];
};

const AID_ATTACHMENT_BUCKET = process.env.SUPABASE_AID_ATTACHMENT_BUCKET || 'aid-assistance-attachments';
const ALLOWED_ATTACHMENT_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
const ALLOWED_ATTACHMENT_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).');
  }
  return createClient(url, key);
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export async function loadEmployees() {
  return getEmployees();
}

export function buildAidRequestCode(): string {
  const ts = Date.now().toString();
  const suffix = randomBytes(2).toString('hex').toUpperCase();
  return `AID-${ts.slice(-6)}${suffix}`;
}

export function mapAidRequestToResponse(
  row: AidAssistanceRequestRow,
  attachments: AidAttachmentRow[],
  islandGroup: 'Luzon' | 'Visayas' | 'Mindanao' = 'Luzon'
): AidRequestResponse {
  return {
    id: row.id,
    requestCode: row.request_code,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    department: row.department,
    position: row.position ?? undefined,
    incidentId: '',
    incidentName: row.incident_name,
    aidType: row.aid_type,
    description: row.reason,
    status: row.status,
    damageType: row.damage_type,
    filedDate: new Date(row.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
    islandGroup,
    managerReview: {
      decision: row.manager_decision ?? 'Pending',
      remarks: row.manager_remarks ?? undefined,
      reviewedBy: row.manager_reviewed_by ?? undefined,
      reviewedDate: row.manager_reviewed_at
        ? new Date(row.manager_reviewed_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
        : undefined,
    },
    adminReview: {
      decision: row.admin_decision ?? 'Pending',
      remarks: row.admin_remarks ?? undefined,
      reviewedBy: row.admin_reviewed_by ?? undefined,
      reviewedDate: row.admin_reviewed_at
        ? new Date(row.admin_reviewed_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
        : undefined,
    },
    attachments: attachments.map((file) => ({
      id: file.id,
      fileName: file.file_name,
      filePath: file.file_path,
      publicUrl: file.public_url,
      uploadedAt: file.uploaded_at,
    })),
  };
}

export async function resolveManagerDirectReportIds(managerName: string, managerId?: string): Promise<string[]> {
  const employees = await loadEmployees();
  const resolvedManagerId = resolveManagerId(employees, managerName, managerId);
  const ids = employees
    .filter((emp) => {
      const nameMatch = normalizeText(emp.managerName) === normalizeText(managerName);
      const idMatch = !!resolvedManagerId && emp.managerId === resolvedManagerId;
      return nameMatch || idMatch;
    })
    .map((emp) => emp.id);

  if (ids.length === 0 && normalizeText(managerName) === 'manager') {
    return ['T8U', 'T8S'].filter((id) => employees.some((emp) => emp.id === id));
  }

  return ids;
}

export function enforceManagerAccess(targetId: string, managerName: string, managerId?: string) {
  return loadEmployees().then((employees) => {
    const target = employees.find((e) => e.id === targetId);
    if (!target) return { status: 404, message: 'Employee not found.' } as const;

    const resolvedManagerId = resolveManagerId(employees, managerName, managerId);
    const nameMatch = normalizeText(target.managerName) === normalizeText(managerName);
    const idMatch = !!resolvedManagerId && target.managerId === resolvedManagerId;
    if (!nameMatch && !idMatch) {
      return { status: 403, message: 'Forbidden: the requested employee is not under your management.' } as const;
    }

    return null;
  });
}

export function isAllowedAttachment(file: { originalname: string; mimetype: string }): boolean {
  const ext = file.originalname ? `.${file.originalname.split('.').pop() ?? ''}`.toLowerCase() : '';
  return ALLOWED_ATTACHMENT_MIME.has(file.mimetype) || ALLOWED_ATTACHMENT_EXT.has(ext);
}

export function parseMultipartRequest(req: any): Promise<{ fields: Record<string, string>; files: Array<{ originalname: string; mimetype: string; buffer: Buffer }> }> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    const files: Array<{ originalname: string; mimetype: string; buffer: Buffer }> = [];
    const bb = Busboy({ headers: req.headers });

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (_name, file, info) => {
      const chunks: Buffer[] = [];
      file.on('data', (data: Buffer) => chunks.push(data));
      file.on('end', () => {
        files.push({ originalname: info.filename, mimetype: info.mimeType, buffer: Buffer.concat(chunks) });
      });
    });

    bb.on('error', reject);
    bb.on('finish', () => resolve({ fields, files }));
    req.pipe(bb);
  });
}

export async function getAidRequestsByRole(params: {
  viewerRole: string;
  viewerEmployeeId?: string;
  managerName?: string;
  managerId?: string;
}) {
  const supabase = getSupabase();
  let query = supabase
    .from('aid_assistance_requests')
    .select('*')
    .order('submitted_at', { ascending: false });

  if (params.viewerRole === 'official') {
    if (!params.viewerEmployeeId) {
      throw Object.assign(new Error('Employee identity required.'), { status: 400 });
    }
    query = query.eq('employee_id', params.viewerEmployeeId);
  }

  if (params.viewerRole === 'manager') {
    if (!params.managerName) {
      throw Object.assign(new Error('Manager identity required.'), { status: 401 });
    }
    const directReportIds = await resolveManagerDirectReportIds(params.managerName, params.managerId || undefined);
    if (directReportIds.length === 0) {
      return [] as AidRequestResponse[];
    }
    query = query.in('employee_id', directReportIds);
  }

  if (params.viewerRole === 'admin') {
    query = query.in('status', ['Pending Admin Review', 'Rejected by Admin/CSR', 'Approved']);
  }

  const { data: requests, error } = await query;
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  const requestRows = (requests ?? []) as AidAssistanceRequestRow[];
  if (requestRows.length === 0) return [];

  const supabase2 = getSupabase();
  const requestIds = requestRows.map((row) => row.id);
  const { data: attachmentRows, error: attachmentError } = await supabase2
    .from('aid_assistance_attachments')
    .select('*')
    .in('aid_assistance_id', requestIds)
    .order('uploaded_at', { ascending: false });

  if (attachmentError) {
    throw Object.assign(new Error(attachmentError.message), { status: 500 });
  }

  const grouped = new Map<string, AidAttachmentRow[]>();
  ((attachmentRows ?? []) as AidAttachmentRow[]).forEach((file) => {
    const list = grouped.get(file.aid_assistance_id) ?? [];
    list.push(file);
    grouped.set(file.aid_assistance_id, list);
  });

  const employees = await loadEmployees();
  return requestRows.map((row) => {
    const employee = employees.find((emp) => emp.id === row.employee_id);
    return mapAidRequestToResponse(row, grouped.get(row.id) ?? [], employee?.islandGroup ?? 'Luzon');
  });
}

export function getSupabaseClient() {
  return getSupabase();
}

export type { AidStatus };