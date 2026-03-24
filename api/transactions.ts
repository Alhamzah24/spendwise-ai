import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

function getUserId(req: VercelRequest): string | null {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    const d = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    return d.id;
  } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // GET /api/transactions
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ message: error.message });
    return res.json(data.map(r => ({ ...r, _id: r.id })));
  }

  // POST /api/transactions
  if (req.method === 'POST') {
    const { type, category = 'Business', amount, label, date } = req.body || {};
    if (!type || !amount || !label || !date)
      return res.status(400).json({ message: 'Missing required fields.' });
    const { data, error } = await supabase
      .from('transactions')
      .insert({ user_id: userId, type, category, amount, label, date })
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });
    return res.status(201).json({ ...data, _id: data.id });
  }

  // DELETE /api/transactions?action=clear
  if (req.method === 'DELETE' && req.query.action === 'clear') {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId);
    if (error) return res.status(500).json({ message: error.message });
    return res.json({ message: 'All transactions deleted.' });
  }

  // DELETE /api/transactions?id=xxx
  if (req.method === 'DELETE' && req.query.id) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', req.query.id)
      .eq('user_id', userId);
    if (error) return res.status(500).json({ message: error.message });
    return res.json({ message: 'Deleted.' });
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
