import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import formidable from 'formidable';
import fs from 'fs';
import csvParser from 'csv-parse/sync';

export const config = { api: { bodyParser: false } };

function getUserId(req: VercelRequest): string | null {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    const d = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    return d.id;
  } catch { return null; }
}

function parseAmount(str: string): number {
  if (!str) return 0;
  return parseFloat(str.replace(/\s/g, '').replace(',', '.').replace(/[€$]/g, '')) || 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const form = formidable({ maxFileSize: 10 * 1024 * 1024 });

  const [, files] = await form.parse(req);
  const file = Array.isArray(files.document) ? files.document[0] : files.document;

  if (!file) return res.status(400).json({ message: 'No file uploaded.' });

  const filename = file.originalFilename || '';
  const transactions: any[] = [];

  try {
    if (filename.toLowerCase().endsWith('.csv')) {
      const content = fs.readFileSync(file.filepath, 'utf-8');
      const records = csvParser.parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      for (const row of records) {
        const amount = parseAmount(row['Montant'] || row['Amount'] || row['montant'] || '0');
        const type = row['Type'] || row['type'] || (amount >= 0 ? 'Income' : 'Expense');
        const label = row['Libellé'] || row['Label'] || row['label'] || row['Description'] || 'Transaction';
        const date = row['Date'] || row['date'] || new Date().toISOString().split('T')[0];
        const category = row['Catégorie'] || row['Category'] || row['Categorie'] || 'Business';
        transactions.push({ type, amount, label, date, category });
      }
    } else if (filename.toLowerCase().endsWith('.pdf')) {
      // Basic PDF text extraction fallback
      const { default: pdfParse } = await import('pdf-parse');
      const buffer = fs.readFileSync(file.filepath);
      const data = await pdfParse(buffer);
      const text = data.text;

      // Extract transactions from PDF text using regex
      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const amtRegex = /([-+]?\d{1,3}(?:\s?\d{3})*[,.]\d{2})\s*€?\s*$/;
      const dateRegex = /(\d{2}[./]\d{2}[./]\d{2,4})/;

      for (const line of lines) {
        const amtMatch = line.match(amtRegex);
        const dateMatch = line.match(dateRegex);
        if (!amtMatch || !dateMatch) continue;

        const rawAmt = parseFloat(amtMatch[1].replace(/\s/g, '').replace(',', '.'));
        const label = line.substring(dateMatch.index! + dateMatch[0].length, amtMatch.index!).trim()
          .replace(/\d{2}[./]\d{2}(?:[./]\d{2,4})?[. ]*/g, '').trim() || 'Transaction';

        if (label.toUpperCase().includes('SOLDE') || label.length < 2) continue;

        // Determine type by sign (pdfplumber spatial approach is now in Python;
        // here we use the sign from the PDF)
        const type = rawAmt >= 0 ? 'Income' : 'Expense';
        const amount = rawAmt;

        const dateParts = dateMatch[1].replace(/\./g, '/').split('/');
        const dateStr = dateParts.length === 3
          ? `20${dateParts[2].padStart(2, '0').slice(-2)}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`
          : new Date().toISOString().split('T')[0];

        transactions.push({ type, amount, label, date: dateStr, category: 'Business' });
      }
    }

    fs.unlinkSync(file.filepath);
    return res.json({ filename, transactions });
  } catch (err: any) {
    try { fs.unlinkSync(file.filepath); } catch {}
    return res.status(500).json({ message: err.message });
  }
}
