import { getEmployees, parseRequestBody, updateEmployeeProfile } from '../_lib.js';

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'PATCH') {
      res.setHeader('Allow', 'PATCH');
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const empId = String(req.query?.id || '').trim();
    if (!empId) {
      return res.status(400).json({ message: 'Employee id is required.' });
    }

    const body = parseRequestBody(req);
    const employees = await getEmployees();
    const target = employees.find((e) => e.id === empId);
    if (!target) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    await updateEmployeeProfile(empId, {
      contactNumber: typeof body.contactNumber === 'string' ? body.contactNumber : undefined,
      address: typeof body.address === 'string' ? body.address : undefined,
    });

    return res.status(200).json({
      message: 'Profile updated successfully.',
      employeeId: empId,
      updated: {
        contactNumber: typeof body.contactNumber === 'string' ? body.contactNumber : undefined,
        gcashNumber: typeof body.gcashNumber === 'string' ? body.gcashNumber : undefined,
        bankAccountDetails: typeof body.bankAccountDetails === 'string' ? body.bankAccountDetails : undefined,
        address: typeof body.address === 'string' ? body.address : undefined,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      message: 'Internal server error.',
      detail: error?.message ?? String(error),
    });
  }
}
