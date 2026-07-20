import { getHealth } from './_lib';

export default async function handler(req: any, res: any) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  return res.status(200).json(getHealth());
}
