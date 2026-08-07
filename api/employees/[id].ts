import { updateEmployeeAdmin } from './_lib.js';

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'PATCH') {
      res.setHeader('Allow', 'PATCH');
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const empId = String(req.query?.id ?? req.params?.id ?? '').trim();
    if (!empId) {
      return res.status(400).json({ message: 'Employee ID is required.' });
    }

    const result = await updateEmployeeAdmin(empId, req.body ?? {});
    return res.status(200).json(result);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      message: error?.message ?? 'Internal server error.',
      detail: error?.detail ?? String(error),
    });
  }
}
