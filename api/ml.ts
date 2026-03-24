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

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

type Transaction = { type: string; amount: number; category: string; date: string; label: string; };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { action, ...data } = req.body || {};
  const txs: Transaction[] = data.transactions || [];

  const incomes = txs.filter(t => t.type === 'Income').reduce((s, t) => s + Math.abs(t.amount), 0);
  const expenses = txs.filter(t => t.type === 'Expense').reduce((s, t) => s + Math.abs(t.amount), 0);

  if (action === 'health_score') {
    const savingsRate = incomes > 0 ? ((incomes - expenses) / incomes) * 100 : 0;
    const savingsScore = Math.min(40, (savingsRate / 20) * 40);

    const invExp = txs.filter(t => t.type === 'Expense' && ['Trading', 'Immobilier'].includes(t.category))
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const invRatio = incomes > 0 ? (invExp / incomes) * 100 : 0;
    const invScore = Math.min(20, (invRatio / 10) * 20);

    const catTotals: Record<string, number> = {};
    txs.filter(t => t.type === 'Expense').forEach(t => {
      catTotals[t.category] = (catTotals[t.category] || 0) + Math.abs(t.amount);
    });
    const maxCatPct = expenses > 0 && Object.keys(catTotals).length > 0
      ? (Math.max(...Object.values(catTotals)) / expenses) * 100 : 100;
    const diversityScore = Math.max(0, 20 - (Math.max(0, maxCatPct - 40) / 60) * 20);

    const surplus = incomes - expenses;
    const bufferScore = surplus > 0 ? 20 : Math.max(0, 20 + (surplus / Math.max(1, incomes)) * 20);

    const score = Math.max(0, Math.min(100, Math.round(savingsScore + invScore + diversityScore + bufferScore)));
    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 30 ? 'D' : 'F';

    const strengths: string[] = [];
    const improvements: string[] = [];

    if (savingsRate >= 20) strengths.push(`Excellent taux d'épargne (${savingsRate.toFixed(1)}%)`);
    else if (savingsRate >= 10) strengths.push(`Bon taux d'épargne (${savingsRate.toFixed(1)}%)`);
    else improvements.push(`Augmenter votre épargne (actuel: ${savingsRate.toFixed(1)}%, cible: 20%)`);

    if (surplus > 0) strengths.push(`Surplus mensuel positif de ${surplus.toLocaleString('fr-FR')}€`);
    else improvements.push(`Déficit de ${Math.abs(surplus).toLocaleString('fr-FR')}€ à combler`);

    if (invRatio >= 10) strengths.push(`Bonne exposition investissement (${invRatio.toFixed(1)}%)`);
    else improvements.push(`Augmenter l'investissement (actuel: ${invRatio.toFixed(1)}%, cible: 10%)`);

    if (maxCatPct > 60 && Object.keys(catTotals).length > 0) {
      const topCat = Object.entries(catTotals).sort(([,a],[,b]) => b - a)[0][0];
      improvements.push(`${topCat} représente ${maxCatPct.toFixed(0)}% des dépenses — diversifiez`);
    } else {
      strengths.push('Dépenses bien réparties entre les catégories');
    }

    if (strengths.length === 0) strengths.push('Revenus enregistrés');
    if (improvements.length === 0) improvements.push('Continuez sur cette excellente lancée !');

    return res.json({ score, grade, strengths: strengths.slice(0, 3), improvements: improvements.slice(0, 3) });
  }

  if (action === 'budget') {
    const expenseTxs = txs.filter(t => t.type === 'Expense');
    const months = new Set(expenseTxs.map(t => t.date.substring(0, 7)));
    const numMonths = months.size || 1;

    const catTotals: Record<string, number> = {};
    expenseTxs.forEach(t => {
      catTotals[t.category] = (catTotals[t.category] || 0) + Math.abs(t.amount);
    });

    const budgets = Object.entries(catTotals).map(([category, total]) => ({
      category,
      current_avg: Math.round(total / numMonths * 100) / 100,
      suggested_budget: Math.round(total / numMonths * 0.90 * 100) / 100,
      reason: "10% d'optimisation IA appliquée"
    }));

    return res.json({ budgets });
  }

  if (action === 'anomalies') {
    if (txs.length === 0) return res.json({ anomalies: [] });
    const amounts = txs.filter(t => t.type === 'Expense').map(t => Math.abs(t.amount));
    const mean = amounts.reduce((s, a) => s + a, 0) / (amounts.length || 1);
    const stddev = Math.sqrt(amounts.map(a => (a - mean) ** 2).reduce((s, v) => s + v, 0) / (amounts.length || 1));

    const anomalies = txs
      .filter(t => t.type === 'Expense' && Math.abs(t.amount) > mean + 2 * stddev)
      .map(t => ({
        transaction_id: `${t.date}_${t.label}`,
        reason: `Dépense inhabituelle de ${Math.abs(t.amount).toLocaleString('fr-FR')}€ — ${t.label}`,
        severity: Math.abs(t.amount) > mean + 3 * stddev ? 'high' : 'medium',
        suggested_action: 'Vérifier la validité de cette transaction.'
      }));

    return res.json({ anomalies });
  }

  if (action === 'chat') {
    const msgRaw = (data.message || '').toLowerCase();
    const msg = msgRaw
      .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a')
      .replace(/[ùû]/g, 'u').replace(/[ôö]/g, 'o');

    const isExpense = ['combien', 'cb ', 'quel'].some(w => msg.includes(w)) &&
      ['depense', 'cout', 'frais', 'budget', 'parti'].some(w => msg.includes(w));
    const isIncome = ['combien', 'cb ', 'quel'].some(w => msg.includes(w)) &&
      ['gagne', 'revenu', 'recu', 'rentre'].some(w => msg.includes(w));
    const isSavings = ['cote', 'epargn', 'economi'].some(w => msg.includes(w));

    const categories = ['Trading', 'Immobilier', 'Alimentation', 'Transport', 'Abonnements', 'Business', 'Consommation', 'Santé', 'Achats'];
    let reply = "Je suis SpendWise AI local. Essayez 'Combien j'ai dépensé en Alimentation ?' ou 'Tesla ?'";

    if (isExpense) {
      const foundCat = categories.find(c => msg.includes(c.toLowerCase().replace(/[éè]/g, 'e')));
      if (foundCat) {
        const total = txs.filter(t => t.type === 'Expense' && t.category.toLowerCase() === foundCat.toLowerCase())
          .reduce((s, t) => s + Math.abs(t.amount), 0);
        reply = `Vous avez dépensé un total de ${total.toLocaleString('fr-FR')}€ dans la catégorie ${foundCat}.`;
      } else {
        const total = txs.filter(t => t.type === 'Expense').reduce((s, t) => s + Math.abs(t.amount), 0);
        reply = `Vos dépenses totales s'élèvent à ${total.toLocaleString('fr-FR')}€ en tout.`;
      }
    } else if (isIncome) {
      const total = txs.filter(t => t.type === 'Income').reduce((s, t) => s + Math.abs(t.amount), 0);
      reply = `Vos revenus totaux s'élèvent à ${total.toLocaleString('fr-FR')}€ en tout.`;
    } else if (isSavings) {
      const surplus = incomes - expenses;
      const ideal = incomes * 0.20;
      if (surplus >= ideal) reply = `Bravo ! Vous avez mis de côté ${surplus.toLocaleString('fr-FR')}€ (objectif 20%: ${ideal.toLocaleString('fr-FR')}€). Continuez !`;
      else if (surplus > 0) reply = `Vous avez épargné ${surplus.toLocaleString('fr-FR')}€. L'IA recommande ${ideal.toLocaleString('fr-FR')}€ (20%). Un effort !`;
      else reply = `Attention, vous êtes en déficit de ${Math.abs(surplus).toLocaleString('fr-FR')}€.`;
    } else if (msg.includes('solde') || msg.includes('reste')) {
      reply = `Votre solde global est de ${(incomes - expenses).toLocaleString('fr-FR')}€.`;
    } else if (msg.includes('tesla')) {
      const bal = incomes - expenses;
      reply = bal > 40000
        ? `Avec un solde de ${bal.toLocaleString('fr-FR')}€, vous pouvez vous offrir une Tesla Model 3 !`
        : `Votre solde de ${bal.toLocaleString('fr-FR')}€ est insuffisant pour un achat comptant. Pensez au leasing.`;
    }

    return res.json({ reply });
  }

  return res.status(400).json({ message: `Unknown action: ${action}` });
}
