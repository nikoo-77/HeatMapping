import { getEmployees, readManagerFromRequest, resolveManagerId } from './_lib.js';

export default async function handler(req: any, res: any) {
	try {
		const method = String(req.method || 'GET').toUpperCase();
		if (method !== 'GET') {
			res.setHeader('Allow', 'GET');
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
		return res.status(500).json({
			message: 'Internal server error.',
			detail: error?.message ?? String(error),
		});
	}
}
