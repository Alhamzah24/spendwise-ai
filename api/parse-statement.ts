import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';

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
  return parseFloat(str.replace(/\s/g, '').replace(',', '.').replace(/[€$]/g, '').trim()) || 0;
}

function detectCategory(label: string): string {
  const l = label.toLowerCase();
  if (/disney|netflix|spotify|amazon prime|deezer|canal|apple|abonnement/.test(l)) return 'Abonnements';
  if (/burger|mcdonald|kfc|pizza|resto|sushi|restaurant|food|franprix|carrefour|leclerc|lidl|aldi|supermarche/.test(l)) return 'Alimentation';
  if (/uber|bolt|taxi|sncf|ratp|navigo|train|metro|bus|blabla/.test(l)) return 'Transport';
  if (/virement|salaire|paie|freelance|facture/.test(l)) return 'Business';
  if (/amazon|fnac|decathlon|zara|h&m|shein|achat/.test(l)) return 'Achats';
  if (/loyer|immo|agence|hypotheque/.test(l)) return 'Immobilier';
  if (/trading|bourse|binance|invest|etf|crypto/.test(l)) return 'Trading';
  if (/pharmacie|medecin|docteur|sante|hopital/.test(l)) return 'Santé';
  return 'Business';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // Accept: { filename: string, fileBase64: string }
  const { filename, fileBase64 } = req.body || {};
  if (!filename || !fileBase64) return res.status(400).json({ message: 'Missing filename or fileBase64' });

  const buffer = Buffer.from(fileBase64, 'base64');
  const transactions: any[] = [];

  try {
    if (filename.toLowerCase().endsWith('.csv')) {
      const content = buffer.toString('utf-8');
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return res.json({ filename, transactions: [] });

      // Detect delimiter
      const delim = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(delim).map(h => h.replace(/["']/g, '').trim().toLowerCase());

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delim).map(c => c.replace(/["']/g, '').trim());
        if (cols.length < 2) continue;

        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });

        const rawAmount = row['montant'] || row['amount'] || row['debit'] || row['credit'] || '0';
        const amount = parseAmount(rawAmount);
        const label = row['libellé'] || row['label'] || row['description'] || row['libelle'] || 'Transaction';
        const rawDate = row['date'] || new Date().toISOString().split('T')[0];
        // Normalize date from DD/MM/YYYY to YYYY-MM-DD
        const dateParts = rawDate.split(/[/\-.]/);
        const date = dateParts.length === 3 && rawDate.includes('/')
          ? `20${dateParts[2].slice(-2)}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`
          : rawDate;

        const type = (row['type'] || (amount >= 0 ? 'Income' : 'Expense')) as 'Income' | 'Expense';

        if (label.toUpperCase().includes('SOLDE') || label.length < 2) continue;
        transactions.push({ type, amount, label, date, category: row['catégorie'] || row['categorie'] || detectCategory(label) });
      }
    } else if (filename.toLowerCase().endsWith('.pdf')) {
      // Use dynamic import for pdf-parse
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      const text = data.text;
      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);

      const amtRegex = /([-+]?\d{1,3}(?:\s?\d{3})*[,.]\d{2})/;
      const dateRegex = /(\d{2}[./]\d{2}[./]?\d{0,4})/;

      for (const line of lines) {
        const amtMatch = line.match(amtRegex);
        const dateMatch = line.match(dateRegex);
        if (!amtMatch || !dateMatch) continue;

        const rawAmt = parseFloat(amtMatch[1].replace(/\s/g, '').replace(',', '.'));
        const label = line
          .replace(dateRegex, '')
          .replace(amtRegex, '')
          .replace(/[€\s]+/g, ' ')
          .trim();

        if (!label || label.length < 3 || label.toUpperCase().includes('SOLDE')) continue;

        const dp = dateMatch[1].replace(/\./g, '/').split('/');
        const date = dp.length >= 2
          ? `20${(dp[2] || '26').slice(-2)}-${dp[1].padStart(2, '0')}-${dp[0].padStart(2, '0')}`
          : new Date().toISOString().split('T')[0];

        transactions.push({
          type: rawAmt >= 0 ? 'Income' : 'Expense',
          amount: rawAmt,
          label,
          date,
          category: detectCategory(label)
        });
      }
    } else {
      return res.status(400).json({ message: 'Format non supporté. Utilisez CSV ou PDF.' });
    }

    return res.json({ filename, transactions });
  } catch (err: any) {
    console.error('parse-statement error:', err);
    return res.status(500).json({ message: err.message });
  }
}
