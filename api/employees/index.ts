import {
  createEmployee,
  updateEmployeeAdmin,
  getEmployees,
  readManagerFromRequest,
  resolveManagerId,
} from './_lib.js';

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase();

    if (method === 'POST') {
      const result = await createEmployee(req.body ?? {});
      return res.status(201).json(result);
    }

    if (method !== 'GET') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const employees = await getEmployees();
    const { name, id } = readManagerFromRequest(req);

    if (!name) {
      return res.status(200).json(employees);
    }

    const managerId = resolveManagerId(employees, name, id);
    const scoped = employees.filter((emp) => {
      const nameMatch = emp.managerName?.trim().toLowerCase() === name.toLowerCase();
      const idMatch = !!managerId && emp.managerId === managerId;
      return emp.id !== managerId && (nameMatch || idMatch);
    });

    return res.status(200).json(scoped);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      message: error?.message ?? 'Internal server error.',
      detail: error?.detail ?? String(error),
    });
  }
}
