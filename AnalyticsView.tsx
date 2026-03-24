import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Legend
} from 'recharts';
import { apiAnomalies, apiHealthScore, apiBudget, apiClearTransactions } from './api';

type Transaction = {
  id: string; type: 'Expense' | 'Income';
  category: string; amount: number; label: string; date: string;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0c0c0c] border border-white/10 rounded-2xl p-4 shadow-2xl">
        <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-2">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="font-black text-sm" style={{ color: p.color }}>{p.name}: {p.value.toLocaleString('fr-FR')}€</p>
        ))}
      </div>
    );
  }
  return null;
};

const AnalyticsView = ({ transactions }: { transactions: Transaction[] }) => {
  const [anomalies, setAnomalies] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [budget, setBudget] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const txPayload = { transactions };
        const [aRes, hRes, bRes] = await Promise.all([
          apiAnomalies(txPayload),
          apiHealthScore(txPayload),
          apiBudget(txPayload)
        ]);
        setAnomalies(aRes);
        setHealth(hRes);
        setBudget(bRes);
      } catch (e) {
        console.error("Error fetching AI Analytics:", e);
      } finally {
        setLoading(false);
      }
    };
    if (transactions.length > 0) {
      fetchData();
    } else { setLoading(false); }
  }, [transactions]);

  // Evolution du Solde (Running Balance)
  const evolutionData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    
    // Group by Date to accumulate daily variations
    const dailyNet: Record<string, number> = {};
    transactions.forEach(t => {
      const net = t.type === 'Income' ? Math.abs(t.amount) : -Math.abs(t.amount);
      dailyNet[t.date] = (dailyNet[t.date] || 0) + net;
    });
    
    // Sort dates chronologically
    const sortedDates = Object.keys(dailyNet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    let runningBalance = 0;
    const dataPoints: any[] = [];
    
    sortedDates.forEach(date => {
      runningBalance += dailyNet[date];
      dataPoints.push({
        date: date,
        balance: runningBalance
      });
    });
    
    return dataPoints;
  }, [transactions]);

  // For the Budget Progress, we calculate current month's spending per category
  const currentMonthSpending = useMemo(() => {
    const map: Record<string, number> = {};
    if (transactions.length === 0) return map;
    
    // Find the latest month in the dataset to act as "current month"
    const latestDate = transactions.reduce((max, t) => t.date > max ? t.date : max, transactions[0].date);
    const currentMonth = latestDate.substring(0, 7); // YYYY-MM
    
    transactions.filter(t => t.type === 'Expense' && t.date.startsWith(currentMonth)).forEach(t => {
      map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
    });
    return map;
  }, [transactions]);

  if (loading) {
    return (
       <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-6">
             <div className="w-16 h-16 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mx-auto"></div>
             <p className="text-emerald-500 font-black tracking-[0.2em] uppercase text-xs animate-pulse">AI Engines Computing...</p>
          </div>
       </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in relative">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">AI Analytics Engine</h2>
          <p className="text-zinc-500 font-medium">Modèles prédictifs et Machine Learning sur vos données financieres.</p>
        </div>
        <button 
          onClick={async () => {
             if (window.confirm("Êtes-vous sûr de vouloir effacer tout l'historique d'analyse ?")) {
                await apiClearTransactions();
                window.location.reload();
             }
          }}
          className="flex items-center gap-2 px-6 py-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
        >
           <i data-lucide="trash-2" className="w-4 h-4"></i> Supprimer l'Historique
        </button>
      </div>

      {/* Score de Santé Financière */}
      {health && (
      <div className="bg-gradient-to-br from-[#0c0c0c] to-[#111] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl">
         <div className="flex flex-col lg:flex-row gap-10 items-center">
            {/* Left: Info & Improvements */}
            <div className="flex-1 space-y-6">
               <div>
                  <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Intelligence Artificielle</p>
                  <h3 className="font-black text-3xl text-white italic">Score de Santé<br/>Financière</h3>
                  <p className="text-zinc-500 text-sm mt-2">Évalué en temps réel par notre moteur XGBoost local.</p>
               </div>
               <div className="grid grid-cols-1 gap-3">
                  {health.improvements?.map((imp: string, i: number) => (
                     <div key={i} className="flex items-center gap-4 bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl hover:border-amber-500/30 transition-all">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                           <i data-lucide="target" className="w-4 h-4 text-amber-500"></i>
                        </div>
                        <p className="text-sm font-bold text-amber-300">{imp}</p>
                     </div>
                  ))}
               </div>
            </div>

            {/* Center: SVG Gauge */}
            <div className="shrink-0 flex flex-col items-center gap-4">
               <div className="relative w-56 h-56 flex items-center justify-center">
                  {/* Background track circle */}
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 200 200">
                     <circle cx="100" cy="100" r="84"
                        fill="none"
                        stroke="#1f1f1f"
                        strokeWidth="12"
                     />
                     <circle cx="100" cy="100" r="84"
                        fill="none"
                        stroke={health.score > 70 ? "#10b981" : health.score > 40 ? "#f59e0b" : "#ef4444"}
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${(2 * Math.PI * 84).toFixed(2)}`}
                        strokeDashoffset={`${(2 * Math.PI * 84 * (1 - health.score / 100)).toFixed(2)}`}
                        className="transition-all duration-1500 ease-out"
                        style={{ filter: `drop-shadow(0 0 8px ${health.score > 70 ? '#10b981' : health.score > 40 ? '#f59e0b' : '#ef4444'})` }}
                     />
                  </svg>

                  {/* Inner content */}
                  <div className="text-center z-10">
                     <span className="text-6xl font-black text-white tracking-tight">{health.score}</span>
                     <div className="flex items-center justify-center gap-2 mt-1">
                        <span className={`text-xs font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full ${
                           health.score > 70 ? 'text-emerald-400 bg-emerald-500/10' :
                           health.score > 40 ? 'text-amber-400 bg-amber-500/10' :
                           'text-red-400 bg-red-500/10'
                        }`}>Grade {health.grade}</span>
                     </div>
                  </div>
               </div>
               {/* Score bar label */}
               <div className="flex justify-between w-56 text-[9px] font-black text-zinc-600 uppercase tracking-widest px-1">
                  <span>0 — Critique</span>
                  <span>100 — Excellent</span>
               </div>
            </div>

            {/* Right: Strengths */}
            <div className="flex-1 space-y-4">
               <h4 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-4">Points Forts Détectés :</h4>
               {health.strengths?.map((str: string, i: number) => (
                  <div key={i} className="flex items-center gap-4 bg-emerald-500/5 border border-emerald-500/10 p-5 rounded-2xl hover:border-emerald-500/30 transition-all">
                     <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <i data-lucide="check-circle" className="w-4 h-4 text-emerald-500"></i>
                     </div>
                     <span className="text-sm font-bold text-emerald-400">{str}</span>
                  </div>
               ))}
            </div>
         </div>
      </div>
      )}

      {/* Budget Intelligent par Catégorie (Heuristic AI) */}
      {budget && budget.budgets && budget.budgets.length > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         {budget.budgets.slice(0, 4).map((b: any, i: number) => {
            const current = currentMonthSpending[b.category] || 0;
            const progress = Math.min(100, (current / b.suggested_budget) * 100);
            const isOver = current > b.suggested_budget;
            return (
               <div key={i}
                  onClick={() => setSelectedCategory(selectedCategory === b.category ? null : b.category)}
                  className={`cursor-pointer bg-[#0c0c0c] border rounded-[2rem] p-6 shadow-xl relative overflow-hidden group transition-all ${
                     selectedCategory === b.category ? 'border-emerald-500/60 shadow-emerald-500/10 shadow-xl' : 'border-white/5 hover:border-emerald-500/30'
                  }`}>
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">{b.category}</p>
                        <p className="text-xl font-black text-white mt-1">{b.suggested_budget.toLocaleString('fr-FR')}€</p>
                     </div>
                     <span className={`text-[8px] font-bold px-2 py-1 rounded-full ${
                        selectedCategory === b.category ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-500'
                     }`}>{selectedCategory === b.category ? 'ACTIF ▼' : b.reason}</span>
                  </div>
                  <div className="space-y-2">
                     <div className="flex justify-between text-[10px] font-bold">
                        <span className={isOver ? 'text-red-400' : 'text-zinc-400'}>{current.toLocaleString('fr-FR')}€ dépensés</span>
                        <span className="text-zinc-600">{Math.round(progress)}%</span>
                     </div>
                     <div className="w-full h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-1000 ${isOver ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }}></div>
                     </div>
                  </div>
               </div>
            );
         })}
      </div>
      )}

      {/* Category Drill-Down Panel */}
      {selectedCategory && (() => {
        const catTransactions = transactions.filter(t => t.type === 'Expense' && t.category === selectedCategory);
        const catTotal = catTransactions.reduce((acc, t) => acc + Math.abs(t.amount), 0);
        return (
          <div className="bg-[#0c0c0c] border border-emerald-500/20 rounded-[2.5rem] p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1">Filtrage Catégorie</p>
                <h3 className="font-black text-2xl text-white italic">Dépenses — {selectedCategory}</h3>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Total</p>
                  <p className="text-2xl font-black text-white">{catTotal.toLocaleString('fr-FR')}€</p>
                </div>
                <button onClick={() => setSelectedCategory(null)} className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-all">
                  <i data-lucide="x" className="w-4 h-4 text-zinc-400"></i>
                </button>
              </div>
            </div>
            {catTransactions.length === 0 ? (
              <p className="text-center text-zinc-600 py-8 font-black uppercase text-xs tracking-widest">Aucune dépense trouvée dans cette catégorie</p>
            ) : (
              <div className="space-y-3">
                {catTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-[#121212] rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                        <i data-lucide="credit-card" className="w-4 h-4 text-red-400"></i>
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm">{t.label}</p>
                        <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">{t.date}</p>
                      </div>
                    </div>
                    <p className="text-red-400 font-black text-lg">-{Math.abs(t.amount).toLocaleString('fr-FR')}€</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Evolution du Solde */}
      {evolutionData && evolutionData.length > 0 && (
      <div className="bg-[#0c0c0c] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl relative mb-6">
         <div className="flex justify-between items-center mb-8">
            <h3 className="font-black text-2xl text-white italic">Évolution du Solde</h3>
            <span className={`text-[10px] font-black tracking-widest px-3 py-1 rounded-full ${evolutionData[evolutionData.length - 1].balance >= (evolutionData[0]?.balance || 0) ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
               TREND: {evolutionData[evolutionData.length - 1].balance >= (evolutionData[0]?.balance || 0) ? 'UP' : 'DOWN'}
            </span>
         </div>
         <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
             <AreaChart data={evolutionData}>
                <defs>
                   <linearGradient id="colorBal2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                   </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} strokeOpacity={0.05} />
                <XAxis dataKey="date" stroke="#52525b" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900 }} dy={10} minTickGap={30} />
                <YAxis stroke="#52525b" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900 }} dx={-10} domain={['dataMin - 1000', 'dataMax + 1000']} tickFormatter={(val) => `${val.toLocaleString('fr-FR')}€`} />
                <RechartsTooltip content={({ active, payload, label }: any) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-[#121212] border border-white/5 p-4 rounded-xl shadow-xl">
                        <p className="text-zinc-500 text-xs font-bold mb-1 tracking-widest uppercase">{label}</p>
                        <p className="text-white font-black text-xl">{payload[0].value.toLocaleString('fr-FR')}€</p>
                      </div>
                    );
                  }
                  return null;
                }} />
                <Area type="stepAfter" dataKey="balance" name="Solde Actuel" stroke="#10b981" fill="url(#colorBal2)" strokeWidth={4} activeDot={{ r: 8, fill: '#10b981', stroke: '#0c0c0c', strokeWidth: 4 }} />
             </AreaChart>
            </ResponsiveContainer>
         </div>
      </div>
      )}

      {/* Détecteur d'Anomalies de Dépenses (Random Forest) */}
      <div className="bg-[#0c0c0c] border border-red-500/10 rounded-[2.5rem] p-10 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
            <i data-lucide="shield-alert" className="w-48 h-48 text-red-500"></i>
         </div>
         <h3 className="font-black text-xl text-white italic mb-2 relative z-10 flex items-center gap-3">
            <i data-lucide="radar" className="w-5 h-5 text-red-500"></i> 
            Détecteur d'Anomalies (Random Forest)
         </h3>
         <p className="text-zinc-500 text-sm mb-8 relative z-10">Analyse de vos habitudes de consommation et détection d'outliers géographiques, financiers ou séquentiels.</p>
         
         <div className="space-y-4 relative z-10">
            {anomalies && anomalies.anomalies && anomalies.anomalies.length > 0 ? (
               anomalies.anomalies.map((ano: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-6 bg-[#121212] rounded-2xl border border-red-500/20 hover:border-red-500/50 transition-all">
                     <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                           <i data-lucide="alert-triangle" className="w-5 h-5 text-red-500"></i>
                        </div>
                        <div>
                           <p className="font-black text-white text-lg">{ano.reason}</p>
                           <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Sévérité: <span className={ano.severity === 'high' ? 'text-red-500' : 'text-amber-500'}>{ano.severity}</span></p>
                        </div>
                     </div>
                     <button className="px-6 py-3 bg-red-500/10 text-red-400 text-[10px] font-black tracking-widest uppercase rounded-xl hover:bg-red-500 hover:text-white transition-all">
                        {ano.suggested_action}
                     </button>
                  </div>
               ))
            ) : (
               <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl bg-[#080808]">
                  <i data-lucide="shield-check" className="w-10 h-10 text-emerald-500 mx-auto mb-3"></i>
                  <p className="text-emerald-500 font-black uppercase text-xs tracking-[0.2em]">Aucune anomalie détectée</p>
                  <p className="text-zinc-600 text-[10px] mt-2">Votre comportement financier est cohérent avec vos patterns historiques.</p>
               </div>
            )}
         </div>
      </div>

    </div>
  );
};

export default AnalyticsView;
