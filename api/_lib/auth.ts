import jwt from 'jsonwebtoken';
import type { VercelRequest } from '@vercel/node';

export function getAuthenticatedUserId(req: VercelRequest): string | null {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    return decoded.id;
  } catch {
    return null;
  }
}
