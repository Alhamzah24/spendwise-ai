import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { apiPredictXAU, apiUploadBilan } from './api';

// @ts-nocheck
class ErrorBoundary extends React.Component<any, any> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-white bg-red-900 min-h-screen">
          <h1 className="text-3xl font-bold mb-4">React App Crashed</h1>
          <pre className="bg-black/50 p-4 rounded text-sm overflow-auto">{this.state.error?.stack || this.state.error?.message}</pre>
        </div>
      );
    }
    return (this as any).props.children;
  }
}
// @ts-ignore

import AuthPage from './AuthPage';
import AnalyticsView from './AnalyticsView';
import {
  getToken, getUser, clearAuth,
  apiGetTransactions, apiCreateTransaction, apiDeleteTransaction,
  apiGetSimulations, apiCreateSimulation,
  apiUploadStatement, apiChat
} from './api';

// --- Types ---

type Transaction = {
  id: string;
  type: 'Expense' | 'Income';
  category: string;
  amount: number;
  label: string;
  date: string;
};

type Simulation = {
  id: string;
  type: string;
  amount: number;
  duration: number;
  risk: string;
  date: string;
  result?: string;
  signal?: 'BUY' | 'SELL' | 'WAIT';
  sl?: string;
  tp?: string;
};

type View = 'dashboard' | 'transactions' | 'documents' | 'investments' | 'analytics';

// --- Shared Components ---

const Sidebar = ({ activeView, setView }: { activeView: View; setView: (v: View) => void }) => {
  const menuItems = [
    { id: 'dashboard', icon: 'layout-grid', label: 'Overview' },
    { id: 'transactions', icon: 'arrow-left-right', label: 'Operations' },
    { id: 'analytics', icon: 'bar-chart-2', label: 'Analytics' },
    { id: 'documents', icon: 'files', label: 'Archives' },
    { id: 'investments', icon: 'line-chart', label: 'Terminal' },
  ];

  useEffect(() => {
    // @ts-ignore
    if (window.lucide) window.lucide.createIcons();
  }, [activeView]);

  return (
    <aside className="w-20 lg:w-72 bg-[#080808] h-full flex flex-col border-r border-[#1a1a1a] transition-all duration-300 z-50">
      <div className="p-8 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.3)]">
             <i data-lucide="shield-check" className="w-6 h-6 text-white"></i>
          </div>
          <h1 className="text-xl font-black text-white tracking-tighter hidden lg:block uppercase italic">SPENDWISE</h1>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id as View)}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 group ${
              activeView === item.id 
                ? 'bg-[#121212] text-emerald-500 border border-white/5 shadow-lg' 
                : 'text-zinc-500 hover:bg-[#111] hover:text-zinc-200'
            }`}
          >
            <i data-lucide={item.icon} className={`w-5 h-5 ${activeView === item.id ? 'text-emerald-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}></i>
            <span className="hidden lg:block font-bold tracking-tight uppercase text-xs">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-6 mt-auto">
        <button className="w-full flex items-center gap-4 p-4 text-zinc-600 hover:text-red-400 transition-colors border-t border-white/5 pt-8">
          <i data-lucide="log-out" className="w-5 h-5"></i>
          <span className="hidden lg:block font-bold tracking-tight uppercase text-xs">Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

// --- Market Chart Component ---

const MarketChart = ({ symbol, interval }: { symbol: string, interval: string }) => {
  const containerId = `tv_chart_${symbol.replace(':', '_')}`;
  
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      // @ts-ignore
      if (window.TradingView) {
        // @ts-ignore
        new window.TradingView.widget({
          "width": "100%",
          "height": 500,
          "symbol": symbol,
          "interval": interval === '1D' ? 'D' : interval.replace('M', ''),
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "fr",
          "toolbar_bg": "#050505",
          "enable_publishing": false,
          "hide_top_toolbar": false,
          "hide_legend": false,
          "save_image": false,
          "container_id": containerId
        });
      }
    };
    document.head.appendChild(script);
  }, [symbol, interval]);

  return <div id={containerId} className="rounded-3xl overflow-hidden border border-[#1a1a1a] bg-[#050505]" />;
};

// --- Views ---

const DashboardView = ({ transactions, addTransaction }: { transactions: Transaction[], addTransaction: (t: Transaction) => void }) => {
  const [reportResult, setReportResult] = useState<{ score: number, status: string, suggestions: string[], filename: string } | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Bank Modal State
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankStep, setBankStep] = useState<'select' | 'connecting' | 'success'>('select');
  const [selectedBank, setSelectedBank] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalIncome = transactions.reduce((acc, t) => t.type === 'Income' ? acc + Math.abs(t.amount) : acc, 0);
  const totalExpense = transactions.reduce((acc, t) => t.type === 'Expense' ? acc + Math.abs(t.amount) : acc, 0);
  const balance = totalIncome - totalExpense;
  
  const savingsRatio = totalIncome > 0 ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100)) : 0;
  
  const investmentExposure = transactions.reduce((acc, t) => (t.type === 'Expense' && (t.category === 'Trading' || t.category === 'Immobilier')) ? acc + Math.abs(t.amount) : acc, 0);
  const investmentRatio = totalExpense > 0 ? Math.max(0, Math.min(100, Math.round((investmentExposure / totalExpense) * 100))) : 0;
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setReportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    try {
      const res = await apiUploadStatement(file) as any;
      if (res.transactions) {
        // It parsed the pdf/csv and got transactions! We could add them to the global state.
        setReportResult({ 
          score: 100, // mock success score
          status: 'SUCCESS', 
          suggestions: [
             `✅ Extraction réussie : ${res.transactions.length} transactions trouvées.`,
             `💰 Montant total évalué : ${res.transactions.reduce((acc: number, t: any) => acc + Math.abs(t.amount), 0).toLocaleString('fr-FR')}€.`
          ], 
          filename: res.filename 
        });
        
        // Insert all parsed transactions into DB/Context
        for (let t of res.transactions) {
            // @ts-ignore
            await addTransaction({ id: Date.now().toString() + Math.random(), ...t });
        }
      } else {
        throw new Error(res.message || 'Erreur interne de IA Parsing.');
      }
    } catch (e) {
      console.error(e);
      setReportError("Erreur lors de l'analyse ML : " + (e as Error).message);
    } finally {
      setIsAnalyzing(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBankConnect = async (bankName: string) => {
     setSelectedBank(bankName);
     setBankStep('connecting');
     
     // Simulate API latency & sync
     setTimeout(async () => {
        setBankStep('success');
        
        // Add realistic transactions directly into DB
        const today = new Date().toISOString().split('T')[0];
        const txs = [
           { type: 'Expense', category: 'Consommation', amount: 45.99, label: `Netflix / Uber via ${bankName}`, date: today },
           { type: 'Income', category: 'Business', amount: 3200.00, label: `Virement Salaire / Facture (${bankName})`, date: today },
           { type: 'Expense', category: 'Immobilier', amount: 850.00, label: `Loyer Mensuel (${bankName})`, date: today }
        ];
        
        for (let t of txs) {
           // @ts-ignore
           await addTransaction({ id: Date.now().toString() + Math.random(), ...t });
        }
        
        setTimeout(() => {
           setShowBankModal(false);
           setBankStep('select');
           setSelectedBank(null);
        }, 3000);
     }, 2500);
  };

  const triggerUpload = () => fileInputRef.current?.click();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in relative">
      
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/90 backdrop-blur-md animate-fade-in p-6">
           <div className="bg-[#0c0c0c] border border-white/5 rounded-[2.5rem] p-10 max-w-xl w-full shadow-[0_0_100px_rgba(16,185,129,0.1)] relative overflow-hidden">
               {bankStep === 'select' && (
                  <div className="space-y-6">
                      <div className="flex justify-between items-center mb-8">
                          <h3 className="text-2xl font-black text-white italic tracking-tighter">Synchronisation Bancaire</h3>
                          <button onClick={() => setShowBankModal(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all"><i data-lucide="x" className="w-5 h-5"></i></button>
                      </div>
                      <p className="text-zinc-500 text-sm">Sélectionnez votre établissement pour configurer l'Open Banking et l'import automatique des transactions.</p>
                      <div className="grid grid-cols-2 gap-4">
                         {['Revolut', 'Boursorama', 'Société Générale', 'BNP Paribas', 'LCL'].map(b => (
                            <button key={b} onClick={() => handleBankConnect(b)} className="p-4 bg-[#121212] border border-white/5 hover:border-emerald-500/30 rounded-2xl flex items-center justify-between group transition-all">
                               <span className="font-bold text-zinc-300 group-hover:text-emerald-500">{b}</span>
                               <i data-lucide="chevron-right" className="w-4 h-4 text-zinc-600 group-hover:text-emerald-500"></i>
                            </button>
                         ))}
                      </div>
                  </div>
               )}

               {bankStep === 'connecting' && (
                  <div className="py-12 text-center space-y-6">
                     <div className="w-20 h-20 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mx-auto shadow-[0_0_30px_rgba(16,185,129,0.2)]"></div>
                     <h3 className="text-xl font-black text-white italic">Connexion Sécurisée en cours</h3>
                     <p className="text-emerald-500 font-bold uppercase tracking-[0.2em] text-xs animate-pulse">Synchronisation avec {selectedBank} via API...</p>
                     <p className="text-zinc-600 text-xs">Chiffrement AES-256 actif. Veuillez patienter.</p>
                  </div>
               )}

               {bankStep === 'success' && (
                  <div className="py-12 text-center space-y-6">
                     <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mx-auto shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                        <i data-lucide="check" className="w-10 h-10"></i>
                     </div>
                     <h3 className="text-2xl font-black text-emerald-400 italic">Connexion Établie !</h3>
                     <p className="text-zinc-400 text-sm">Les 30 derniers jours de transactions ont été importés et analysés automatiquement dans SpendWise.</p>
                  </div>
               )}
           </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Executive Suite</h2>
          <p className="text-zinc-500 font-medium">Flux financiers consolidés en temps réel.</p>
        </div>
        <div className="flex gap-10 items-center">
            <button 
                onClick={() => setShowBankModal(true)} 
                className="group flex flex-col items-end gap-1 px-6 py-3 bg-gradient-to-l from-emerald-500/10 to-transparent border-r-2 border-emerald-500 rounded-xl hover:bg-emerald-500/20 transition-all cursor-pointer"
            >
               <span className="flex items-center gap-2 text-emerald-400 font-black text-sm uppercase tracking-widest leading-none">
                  <i data-lucide="landmark" className="w-4 h-4"></i> Synchro Bancaire
               </span>
               <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Connectez vos comptes</span>
            </button>
            <div className="text-right">
               <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Solde Global</p>
               <h3 className="text-3xl font-black text-emerald-500">{balance.toLocaleString('fr-FR')} €</h3>
            </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-[#0c0c0c] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
             <div className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-3">
                   <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                      <i data-lucide="file-up" className="w-6 h-6 text-emerald-500"></i>
                   </div>
                   <h3 className="font-black text-2xl text-white">Import Auto Relevé Bancaire</h3>
                </div>
             </div>
             
             <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.xml,.csv,.xlsx" />

             <div 
               className="border-2 border-dashed border-[#222] rounded-[2rem] p-12 text-center space-y-6 group-hover:border-emerald-500/40 transition-all cursor-pointer bg-[#080808]/50 hover:bg-[#080808]" 
               onClick={triggerUpload}
             >
                {isAnalyzing ? (
                   <div key="analyzing" className="space-y-6 py-4">
                      <div className="w-16 h-16 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mx-auto"></div>
                      <p className="text-emerald-500 font-black tracking-[0.2em] uppercase text-xs animate-pulse">Isolation Forest Scoring active...</p>
                   </div>
                ) : (
                   <div key="idle">
                      <div className="w-20 h-20 bg-[#121212] rounded-3xl flex items-center justify-center mx-auto mb-4 text-zinc-600 group-hover:text-emerald-500 group-hover:scale-110 transition-all shadow-inner">
                         <i data-lucide="scan-line" className="w-10 h-10"></i>
                      </div>
                      <h4 className="font-black text-xl text-white italic">Déposez votre Relevé (PDF/CSV)</h4>
                      <p className="text-zinc-500 text-sm max-w-sm mx-auto leading-relaxed">Notre IA extraira, nettoiera et catégorisera automatiquement toutes vos transactions.</p>
                      <button className="mt-6 px-10 py-4 bg-emerald-500 text-[#0a0a0a] font-black rounded-2xl text-xs uppercase tracking-[0.2em] hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/10">Sélectionner fichier</button>
                   </div>
                )}
             </div>

             {reportError && !isAnalyzing && (
                 <div className="mt-8 p-6 bg-red-500/10 border border-red-500/30 rounded-2xl animate-fade-in flex items-center gap-4">
                     <i data-lucide="alert-triangle" className="w-6 h-6 text-red-500 shrink-0"></i>
                     <p className="text-red-400 text-sm font-bold">{reportError}</p>
                 </div>
             )}

             {reportResult && !isAnalyzing && !reportError && (
                <div className="mt-10 p-8 bg-[#0c0c0c] border border-white/5 rounded-3xl animate-fade-in space-y-6 shadow-inner">
                   <div className="flex items-center gap-3 pb-4 border-b border-white/5">
                      <i data-lucide="cpu" className="w-4 h-4 text-emerald-500"></i>
                      <p className="text-zinc-400 font-black text-xs uppercase tracking-widest">{reportResult.filename}</p>
                   </div>
                   
                   <div className="flex items-center gap-6">
                      <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center flex-col shrink-0 ${reportResult.status === 'HEALTHY' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                         <span className="text-3xl font-black">{reportResult.score}</span>
                         <span className="text-[9px] uppercase tracking-widest font-black opacity-80 mt-1">/ 100</span>
                      </div>
                      <div>
                         <h4 className="text-xl font-black italic text-white uppercase tracking-tighter mb-2">Scoring de Santé</h4>
                         <span className={`px-3 py-1 text-[10px] font-black tracking-widest rounded-full uppercase ${reportResult.status === 'HEALTHY' ? 'bg-emerald-500 text-[#0a0a0a]' : 'bg-red-500 text-white'}`}>{reportResult.status}</span>
                      </div>
                   </div>

                   <div className="space-y-3 pt-4">
                      {reportResult.suggestions?.map((s, i) => (
                         <div key={i} className="flex gap-3 bg-[#121212] p-4 rounded-xl border border-white/5">
                            <i data-lucide="check-circle" className="w-5 h-5 text-emerald-500 shrink-0"></i>
                            <p className="text-sm font-bold text-zinc-300">{s}</p>
                         </div>
                      ))}
                   </div>
                </div>
             )}
          </div>

          <div className="bg-[#0c0c0c] border border-white/5 rounded-[2.5rem] p-8">
            <div className="flex justify-between items-center mb-8">
               <h3 className="font-black text-xl text-white italic">Flux de Trésorerie Récents</h3>
            </div>
            <div className="space-y-4">
              {transactions.length === 0 ? (
                <div className="py-20 text-center text-zinc-700 italic border border-dashed border-white/5 rounded-3xl">Aucune donnée transactionnelle</div>
              ) : (
                transactions.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center justify-between p-5 bg-[#080808] rounded-[1.5rem] border border-white/5 hover:border-emerald-500/20 transition-all">
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${t.type === 'Income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        <i data-lucide={t.type === 'Income' ? 'trending-up' : 'trending-down'} className="w-6 h-6"></i>
                      </div>
                      <div>
                        <p className="font-black text-white text-lg">{t.label}</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{t.category} — {t.date}</p>
                      </div>
                    </div>
                    <p className={`text-xl font-black ${t.type === 'Income' ? 'text-emerald-500' : 'text-zinc-300'}`}>
                      {t.type === 'Income' ? '+' : '-'}{Math.abs(t.amount).toFixed(2)}€
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-gradient-to-br from-[#121212] to-[#080808] border border-white/5 rounded-[2.5rem] p-10 text-center space-y-6 shadow-2xl relative overflow-hidden group">
             <i data-lucide="gem" className="w-16 h-16 text-amber-500 mx-auto mb-2 group-hover:scale-110 transition-transform"></i>
             <h3 className="font-black text-2xl text-white italic">SpendWise Private</h3>
             <p className="text-zinc-500 text-sm leading-relaxed">Accédez aux marchés dérivés, cryptomonnaies et métaux précieux avec un effet de levier institutionnel.</p>
             <button className="w-full py-5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black rounded-2xl shadow-xl shadow-orange-500/30 uppercase tracking-[0.2em] text-[10px]">Upgrade to Elite</button>
             <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-amber-500/5 blur-[80px] rounded-full"></div>
          </div>

          <div className="bg-[#0c0c0c] border border-white/5 rounded-[2.5rem] p-8 space-y-8">
            <h3 className="font-black text-xl text-white italic uppercase tracking-tighter">Monitoring de Santé</h3>
            <div className="space-y-8">
              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em] mb-3">
                  <span className="text-zinc-500">Ratio d'Épargne</span>
                  <span className="text-emerald-500">{savingsRatio}%</span>
                </div>
                <div className="w-full bg-[#121212] h-2.5 rounded-full overflow-hidden border border-white/5 p-0.5">
                  <div className="bg-emerald-500 h-full rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-1000" style={{ width: `${savingsRatio}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em] mb-3">
                  <span className="text-zinc-500">Exposition Investissement</span>
                  <span className="text-amber-500">{investmentRatio}%</span>
                </div>
                <div className="w-full bg-[#121212] h-2.5 rounded-full overflow-hidden border border-white/5 p-0.5">
                  <div className="bg-amber-500 h-full rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)] transition-all duration-1000" style={{ width: `${investmentRatio}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


const TransactionsView = ({ onAddTransaction, transactions }: { onAddTransaction: (t: Transaction) => void, transactions: Transaction[] }) => {
  const [type, setType] = useState<'Expense' | 'Income'>('Expense');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('Business');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !label) return;
    onAddTransaction({
      id: Date.now().toString(),
      type,
      amount: parseFloat(amount),
      label,
      category,
      date
    });
    setAmount('');
    setLabel('');
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 animate-fade-in">
      <div className="mb-12">
        <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Saisie Transactionnelle</h2>
        <p className="text-zinc-500 font-medium">Contrôle manuel des entrées et sorties de fonds.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="bg-[#0c0c0c] border border-white/5 p-12 rounded-[3rem] shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex bg-[#080808] p-2 rounded-2xl border border-white/5">
              <button 
                type="button" 
                onClick={() => setType('Expense')}
                className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${type === 'Expense' ? 'bg-zinc-800 text-white shadow-xl' : 'text-zinc-600 hover:text-zinc-400'}`}
              >Dépense</button>
              <button 
                type="button" 
                onClick={() => setType('Income')}
                className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${type === 'Income' ? 'bg-zinc-800 text-white shadow-xl' : 'text-zinc-600 hover:text-zinc-400'}`}
              >Revenu</button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Montant Brut (€)</label>
                <input 
                  type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#121212] border border-white/5 rounded-2xl p-5 text-white focus:border-emerald-500/50 outline-none transition-all text-xl font-black"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Date Valeur</label>
                <input 
                  type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-[#121212] border border-white/5 rounded-2xl p-5 text-white focus:border-emerald-500/50 outline-none transition-all font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Description / Bénéficiaire</label>
              <input 
                type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                className="w-full bg-[#121212] border border-white/5 rounded-2xl p-5 text-white focus:border-emerald-500/50 outline-none transition-all font-bold"
                placeholder="ex: Versement Dividendes"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Nature de l'opération</label>
              <select 
                value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#121212] border border-white/5 rounded-2xl p-5 text-white focus:border-emerald-500/50 outline-none appearance-none transition-all font-bold"
              >
                <option>Business</option>
                <option>Immobilier</option>
                <option>Consommation</option>
                <option>Trading</option>
                <option>Santé</option>
                <option>Dividendes</option>
              </select>
            </div>

            <button type="submit" className="w-full py-6 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-[1.5rem] transition-all shadow-xl shadow-emerald-600/10 uppercase tracking-[0.3em] text-xs">
              Valider l'Opération
            </button>
          </form>
        </div>

        <div className="space-y-8">
           <div className="bg-[#0c0c0c] border border-white/5 rounded-[3rem] p-10">
              <h3 className="font-black text-xl mb-8 italic">Audit des dernières saisies</h3>
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-3 custom-scroll">
                 {transactions.length === 0 ? (
                    <div className="py-24 text-center text-zinc-800 font-black uppercase tracking-widest italic opacity-50">Journal vide</div>
                 ) : (
                    transactions.map(t => (
                       <div key={t.id} className="flex items-center justify-between p-6 bg-[#080808] rounded-3xl border border-white/5 hover:border-emerald-500/30 transition-all group">
                          <div className="flex items-center gap-5">
                             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${t.type === 'Income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                <i data-lucide={t.type === 'Income' ? 'chevron-up' : 'chevron-down'} className="w-6 h-6"></i>
                             </div>
                             <div>
                                <p className="font-black text-white text-lg group-hover:text-emerald-500 transition-colors italic">{t.label}</p>
                                <p className="text-[10px] text-zinc-600 font-black uppercase tracking-[0.2em]">{t.category} — {t.date}</p>
                             </div>
                          </div>
                          <p className={`font-black text-xl ${t.type === 'Income' ? 'text-emerald-500' : 'text-zinc-400'}`}>
                             {t.type === 'Expense' ? '-' : '+'}{Math.abs(t.amount).toLocaleString('fr-FR')}€
                          </p>
                       </div>
                    ))
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const DocumentsView = ({ transactions }: { transactions: Transaction[] }) => {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiChat({ message: userMsg, transactions });
      setMessages(prev => [...prev, { role: 'ai', content: res.reply || "Je n'ai pas pu analyser cette demande." }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', content: "Erreur de connexion au moteur NLP local." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in h-screen flex flex-col pb-24">
      <div>
        <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Assistant Financier Chat (IA)</h2>
        <p className="text-zinc-500 font-medium">Un chat local connecté à vos vraies données.</p>
      </div>

      <div className="flex-1 bg-[#0c0c0c] border border-white/5 rounded-[2.5rem] p-8 flex flex-col shadow-2xl overflow-hidden relative">
         <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
            <i data-lucide="bot" className="w-64 h-64 text-emerald-500"></i>
         </div>

         <div 
            ref={containerRef} 
            className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scroll relative z-10"
         >
            {messages.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                  <div className="w-20 h-20 bg-[#121212] rounded-3xl flex items-center justify-center mb-6">
                     <i data-lucide="sparkles" className="w-10 h-10 text-emerald-500"></i>
                  </div>
                  <h3 className="font-black text-xl italic uppercase tracking-widest text-zinc-400">Demandez à votre IA</h3>
                  <p className="text-zinc-600 text-sm mt-3">Ex: "Combien j'ai dépensé en loyer ?" ou "Est-ce que je peux m'offrir une Tesla ?"</p>
               </div>
            ) : (
               messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[80%] p-6 rounded-3xl ${m.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-[#121212] border border-white/5 text-zinc-300 rounded-tl-sm shadow-inner'}`}>
                        {m.role === 'ai' && <i data-lucide="bot" className="w-4 h-4 text-emerald-500 mb-3 block"></i>}
                        <p className="font-bold leading-relaxed">{m.content}</p>
                     </div>
                  </div>
               ))
            )}
            {loading && (
               <div className="flex justify-start">
                  <div className="bg-[#121212] border border-white/5 p-6 rounded-3xl rounded-tl-sm flex items-center gap-3">
                     <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></span>
                     <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-75"></span>
                     <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-150"></span>
                  </div>
               </div>
            )}
         </div>

         <form onSubmit={handleSend} className="mt-8 relative z-10 flex gap-4">
            <input 
               type="text" 
               value={input}
               onChange={e => setInput(e.target.value)}
               placeholder="Posez votre question financière..."
               className="flex-1 bg-[#121212] border border-white/10 rounded-2xl px-8 py-5 text-white font-bold outline-none focus:border-emerald-500/50 transition-all"
            />
            <button 
               type="submit" 
               disabled={!input.trim() || loading}
               className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-[#050505] w-16 rounded-2xl flex items-center justify-center transition-all shadow-xl shadow-emerald-500/10"
            >
               <i data-lucide="send" className="w-6 h-6"></i>
            </button>
         </form>
      </div>
    </div>
  );
};

const InvestmentsView = ({ onSimulate }: { onSimulate: (s: Simulation) => void }) => {
  const [gap, setGap] = useState('1H');
  const [goldAnalysis, setGoldAnalysis] = useState<{decision: string, signal: 'BUY' | 'SELL' | 'WAIT', sl: string, tp: string, reason: string} | null>(null);
  const [isAnalyzingGold, setIsAnalyzingGold] = useState(false);

  const handleGoldAnalysis = async () => {
    setIsAnalyzingGold(true);
    try {
      const data = {
        price: 2738.50,
        rsi: Math.random() * 50 + 20, // simulate dynamic indicator
        macd: (Math.random() - 0.5) * 5,
        volatility: 0.02
      };
      
      const res = await apiPredictXAU(data);
      
      setGoldAnalysis({
          decision: "INVESTIR", // Simplified for UI
          signal: res.signal,
          sl: res.sl || "N/A",
          tp: res.tp || "N/A",
          reason: res.reason
      });
      
      onSimulate({
        id: Date.now().toString(),
        type: `Gold ML (XGBoost ${gap})`,
        amount: 2738.50,
        duration: 0,
        risk: 'High',
        date: new Date().toLocaleString('fr-FR'),
        result: res.reason,
        signal: res.signal,
        sl: res.sl,
        tp: res.tp
      });
    } catch (e) {
      console.error(e);
      alert("Erreur du moteur XGBoost : " + (e as Error).message);
    } finally {
      setIsAnalyzingGold(false);
    }
  };

  return (
    <div className="p-10 max-w-7xl mx-auto space-y-12 animate-fade-in pb-32">
      {/* --- Terminal Header --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
        <div className="space-y-4">
           <div className="flex items-center gap-3">
             <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[8px] font-black text-emerald-500 uppercase tracking-[0.2em]">v4.2.0 Stable</span>
             <span className="px-3 py-1 bg-zinc-900 border border-white/5 rounded-full text-[8px] font-black text-zinc-500 uppercase tracking-[0.2em]">Neural Engine Active</span>
           </div>
           <h2 className="text-6xl font-black text-white tracking-tighter uppercase italic leading-none">
             Trading <span className="text-emerald-500">Terminal</span>
           </h2>
           <p className="text-zinc-500 font-bold uppercase tracking-[0.4em] text-[10px]">Quantum Alpha intelligence System</p>
        </div>
        
        <div className="flex items-center gap-4 bg-[#0c0c0c]/50 backdrop-blur-xl border border-white/5 rounded-3xl p-2 shadow-2xl">
           {['1M', '5M', '15M', '1H', '4H', '1D'].map(t => (
             <button 
               key={t}
               onClick={() => setGap(t)}
               className={`px-8 py-4 rounded-2xl text-[10px] font-black tracking-widest transition-all duration-500 ${gap === t ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] scale-105' : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'}`}
             >
               {t}
             </button>
           ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* --- Main Chart Column --- */}
        <div className="lg:col-span-8 space-y-12">
          <div className="bg-[#0c0c0c] border border-white/5 rounded-[4rem] p-12 space-y-12 shadow-3xl relative overflow-hidden group/main">
             <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/5 blur-[120px] rounded-full group-hover/main:bg-emerald-500/10 transition-colors duration-1000"></div>
             
             <div className="flex justify-between items-center relative z-10">
                <div className="flex items-center gap-6">
                   <div className="w-16 h-16 bg-gradient-to-br from-amber-500/20 to-amber-600/5 rounded-3xl flex items-center justify-center border border-amber-500/20 shadow-2xl shadow-amber-500/10 group-hover/main:rotate-6 transition-transform">
                      <i data-lucide="landmark" className="w-9 h-9 text-amber-500"></i>
                   </div>
                   <div>
                      <h3 className="font-black text-4xl text-white italic tracking-tighter">XAU/USD <span className="text-zinc-700 not-italic ml-2 font-medium">Gold Spot</span></h3>
                      <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em] mt-2 flex items-center gap-3">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        OANDA EXECUTION NODE • LEVERAGE 1:100
                      </p>
                   </div>
                </div>
                <div className="hidden md:block text-right">
                   <p className="text-[10px] font-black text-zinc-700 uppercase tracking-widest mb-1 italic">Real-time Feed</p>
                   <p className="text-3xl font-black text-emerald-500 tracking-tighter drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">2,738.50 <span className="text-xs font-bold opacity-40 ml-1">USD</span></p>
                </div>
             </div>

             <div className="relative rounded-[2.5rem] overflow-hidden border border-white/5 bg-black/40 group/chart shadow-inner">
                <MarketChart symbol="OANDA:XAUUSD" interval={gap} />
                <div className="absolute top-6 right-6 flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                    <i data-lucide="shield-check" className="w-3 h-3 text-emerald-500"></i>
                    <span className="text-[8px] font-black text-zinc-300 uppercase tracking-widest">Secure Link Established</span>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                <button 
                  onClick={handleGoldAnalysis}
                  disabled={isAnalyzingGold}
                  className="group/btn relative py-8 bg-zinc-900 overflow-hidden font-black rounded-[2.5rem] transition-all duration-500 shadow-2xl hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                >
                   <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-600 opacity-90 group-hover/btn:opacity-100 transition-opacity"></div>
                   <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                   
                   <div className="relative flex items-center justify-center gap-5 text-white uppercase tracking-[0.3em] text-xs">
                      {isAnalyzingGold ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                          <span>Quantum Signal Search...</span>
                        </>
                      ) : (
                        <>
                          <i data-lucide="brain-cog" className="w-6 h-6 group-hover/btn:rotate-180 transition-transform duration-1000"></i>
                          <span>Neural Alpha Scan</span>
                        </>
                      )}
                   </div>
                </button>
                
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 flex flex-col justify-center text-center group/stat hover:bg-white/[0.04] transition-colors">
                      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.3em] mb-3 group-hover/stat:text-emerald-500 transition-colors">Network Gap</p>
                      <p className="text-white font-black text-3xl italic tracking-tighter">{gap}</p>
                   </div>
                   <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 flex flex-col justify-center text-center group/stat hover:bg-white/[0.04] transition-colors">
                      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.3em] mb-3 group-hover/stat:text-emerald-500 transition-colors">Confidence</p>
                      <p className="text-emerald-500 font-black text-3xl tracking-tighter">94.2%</p>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* --- Side Analysis Column --- */}
        <div className="lg:col-span-4 h-full">
          {goldAnalysis ? (
            <div className={`bg-[#0c0c0c] border-[3px] rounded-[4rem] p-12 h-full flex flex-col relative overflow-hidden shadow-3xl transition-all duration-700 ${goldAnalysis.signal === 'BUY' ? 'border-emerald-500/20 shadow-emerald-500/10' : goldAnalysis.signal === 'SELL' ? 'border-red-500/20 shadow-red-500/10' : 'border-zinc-500/20 shadow-zinc-500/10'}`}>
               
               <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                  <i data-lucide={goldAnalysis.signal === 'BUY' ? 'trending-up' : goldAnalysis.signal === 'SELL' ? 'trending-down' : 'activity'} className="w-64 h-64"></i>
               </div>

               <div className="relative z-10 flex flex-col h-full space-y-12">
                  <div className="space-y-6">
                     <p className="text-zinc-600 font-black text-[10px] uppercase tracking-[0.4em]">Signal Vector</p>
                     <div className="flex items-center gap-6">
                        <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-2xl shrink-0 ${goldAnalysis.signal === 'BUY' ? 'bg-emerald-500/10 text-emerald-500 shadow-emerald-500/20' : goldAnalysis.signal === 'SELL' ? 'bg-red-500/10 text-red-500 shadow-red-500/20' : 'bg-zinc-500/10 text-zinc-500 shadow-zinc-500/20'}`}>
                           <i data-lucide={goldAnalysis.signal === 'BUY' ? 'arrow-up-right' : goldAnalysis.signal === 'SELL' ? 'arrow-down-left' : 'pause'} className="w-10 h-10"></i>
                        </div>
                        <div>
                           <p className={`text-4xl font-black italic uppercase tracking-tighter leading-none ${goldAnalysis.signal === 'BUY' ? 'text-emerald-500' : goldAnalysis.signal === 'SELL' ? 'text-red-500' : 'text-zinc-500'}`}>{goldAnalysis.signal}</p>
                           <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mt-2">Quantitative Decision</p>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-6">
                     <div className="flex justify-between items-end">
                        <p className="text-zinc-600 font-black text-[10px] uppercase tracking-[0.4em]">Order Matrix</p>
                        <span className="text-[9px] font-bold text-emerald-500/60 uppercase">Optimal Entry</span>
                     </div>
                     <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white/[0.02] p-8 rounded-[2.5rem] border border-white/5 flex justify-between items-center group/readout hover:bg-white/[0.04] transition-colors">
                           <div>
                              <p className="text-zinc-600 text-[9px] font-black uppercase tracking-widest mb-1 group-hover/readout:text-red-500 transition-colors">Stop Loss</p>
                              <p className="text-red-400 font-black text-2xl italic tracking-tighter">{goldAnalysis.sl}</p>
                           </div>
                           <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                              <i data-lucide="shield-alert" className="w-4 h-4 text-red-500"></i>
                           </div>
                        </div>
                        <div className="bg-white/[0.02] p-8 rounded-[2.5rem] border border-white/5 flex justify-between items-center group/readout hover:bg-white/[0.04] transition-colors">
                           <div>
                              <p className="text-zinc-600 text-[9px] font-black uppercase tracking-widest mb-1 group-hover/readout:text-emerald-500 transition-colors">Take Profit</p>
                              <p className="text-emerald-400 font-black text-2xl italic tracking-tighter">{goldAnalysis.tp}</p>
                           </div>
                           <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                              <i data-lucide="target" className="w-5 h-5 text-emerald-500"></i>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="flex-1 p-8 bg-zinc-900/40 rounded-[2.5rem] border border-white/5 flex flex-col justify-center relative group/reason">
                     <div className="absolute top-4 right-6 text-zinc-800 group-hover/reason:text-emerald-500/20 transition-colors">
                        <i data-lucide="quote" className="w-10 h-10"></i>
                     </div>
                     <p className="text-zinc-400 text-sm leading-relaxed font-bold italic relative z-10">"{goldAnalysis.reason}"</p>
                  </div>

                  <button className="group/exec w-full py-8 bg-white text-black font-black rounded-[2.5rem] transition-all duration-500 uppercase tracking-[0.4em] text-[10px] hover:bg-emerald-500 hover:text-white hover:scale-[1.05] active:scale-95 shadow-2xl shadow-white/5">
                    Execute Terminal Order
                  </button>
               </div>
            </div>
          ) : (
            <div className="bg-[#0c0c0c] border border-dashed border-white/10 rounded-[4rem] p-16 h-full flex flex-col items-center justify-center text-center space-y-10 group hover:border-emerald-500/30 transition-all duration-1000">
               <div className="relative">
                  <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full scale-150 animate-pulse"></div>
                  <div className="relative w-32 h-32 bg-[#121212] rounded-[3rem] flex items-center justify-center text-zinc-800 shadow-2xl border border-white/5 group-hover:scale-110 group-hover:text-emerald-500 transition-all duration-700">
                    <i data-lucide="cpu" className="w-16 h-16 animate-pulse"></i>
                  </div>
               </div>
               <div className="space-y-6">
                 <h4 className="text-white font-black text-3xl uppercase italic tracking-tighter">Neural Engine <span className="text-emerald-500">Standby</span></h4>
                 <p className="text-zinc-500 text-sm max-w-[240px] leading-relaxed font-medium mx-auto">Prêt pour la séquence d'analyse. Sélectionnez une unité de temps et synchronisez le moteur pour générer un vecteur de trading optimal.</p>
               </div>
               <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 bg-zinc-800 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-zinc-800 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-zinc-800 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- App Shell ---

const App = () => {
  const [view, setView] = useState<View>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string } | null>(() => getUser());
  const [loading, setLoading] = useState(false);

  // Load data from backend when logged in
  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([apiGetTransactions(), apiGetSimulations()])
      .then(([tx, sims]) => {
        if (Array.isArray(tx)) {
          setTransactions(tx.map((t: any) => ({ id: t._id, type: t.type, category: t.category, amount: t.amount, label: t.label, date: t.date })));
        } else {
          // fallback demo data
          setTransactions([
            { id: '1', type: 'Expense', category: 'Trading', amount: 1520.00, label: 'XAU Long Margin Fee', date: '2024-05-18' },
            { id: '2', type: 'Income', category: 'Dividendes', amount: 4850.00, label: 'Quarterly Payout MSFT', date: '2024-05-15' },
            { id: '3', type: 'Expense', category: 'Immobilier', amount: 2450.00, label: 'Monthly Asset Lease', date: '2024-05-01' },
          ]);
        }
        if (Array.isArray(sims)) {
          setSimulations(sims.map((s: any) => ({ id: s._id, type: s.type, amount: s.amount, duration: s.duration, risk: s.risk, date: s.date, result: s.result, signal: s.signal, sl: s.sl, tp: s.tp })));
        }
      })
      .finally(() => setLoading(false));
  }, [currentUser]);

  useEffect(() => {
    // @ts-ignore
    if (window.lucide) window.lucide.createIcons();
  }, [view, transactions, simulations]);

  const addTransaction = async (t: Transaction) => {
    const created = await apiCreateTransaction({ type: t.type, category: t.category, amount: t.amount, label: t.label, date: t.date }) as any;
    const newT = created._id
      ? { id: created._id, type: created.type, category: created.category, amount: created.amount, label: created.label, date: created.date }
      : t;
    setTransactions(prev => [newT, ...prev]);
  };

  const addSimulation = async (s: Simulation) => {
    const created = await apiCreateSimulation({ type: s.type, amount: s.amount, duration: s.duration, risk: s.risk, date: s.date, result: s.result, signal: s.signal, sl: s.sl, tp: s.tp }) as any;
    const newS = created._id ? { ...s, id: created._id } : s;
    setSimulations(prev => [newS, ...prev]);
  };

  const handleLogout = () => {
    clearAuth();
    setCurrentUser(null);
    setTransactions([]);
    setSimulations([]);
  };

  if (!currentUser) {
    return <AuthPage onAuth={(user) => setCurrentUser(user)} />;
  }

  return (
    <div className="flex h-screen bg-[#050505] text-zinc-300 overflow-hidden font-inter selection:bg-emerald-500/30 selection:text-emerald-300">
      <Sidebar activeView={view} setView={setView} />
      
      <main className="flex-1 overflow-hidden flex flex-col relative">
        <header className="h-24 border-b border-white/5 flex items-center justify-between px-12 bg-[#050505]/95 backdrop-blur-3xl z-40 shrink-0">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 bg-zinc-900/50 rounded-2xl border border-white/5 flex items-center justify-center shadow-inner">
               <i data-lucide="user-round" className="w-5 h-5 text-zinc-500"></i>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-zinc-600 tracking-[0.2em] mb-0.5">Session Active</p>
              <span className="text-sm font-black text-white italic">{currentUser.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-10">
             <div className="flex items-center gap-8 border-x border-white/5 px-10">
                <div className="text-center">
                   <p className="text-[10px] font-black text-zinc-700 uppercase mb-0.5 tracking-widest">Latency</p>
                   <p className="text-xs font-black text-emerald-500">22ms</p>
                </div>
                <div className="text-center">
                   <p className="text-[10px] font-black text-zinc-700 uppercase mb-0.5 tracking-widest">Node</p>
                   <p className="text-xs font-black text-white">Paris-01</p>
                </div>
             </div>
             <div className="text-right">
               <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">Status AI</p>
               <p className="text-[10px] font-black text-emerald-500 flex items-center gap-2 justify-end">
                 <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                 SYNCED
               </p>
             </div>
             <button onClick={handleLogout} className="p-3 bg-zinc-900/50 border border-white/5 rounded-xl text-zinc-600 hover:text-red-400 hover:border-red-500/20 transition-all" title="Déconnexion">
               <i data-lucide="log-out" className="w-4 h-4"></i>
             </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-transparent relative z-10 custom-scroll">
          {loading && (
            <div className="flex items-center justify-center py-32">
              <div className="w-12 h-12 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin"></div>
            </div>
          )}
          {!loading && view === 'dashboard' && <DashboardView transactions={transactions} addTransaction={addTransaction} />}
          {!loading && view === 'transactions' && <TransactionsView onAddTransaction={addTransaction} transactions={transactions} />}
          {!loading && view === 'analytics' && <AnalyticsView transactions={transactions} />}
          {!loading && view === 'documents' && <DocumentsView transactions={transactions} />}
          {!loading && view === 'investments' && <InvestmentsView onSimulate={addSimulation} />}
        </div>

        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[150px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/5 blur-[120px] rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>
      </main>
    </div>
  );
};

// --- Initialization ---

const container = document.getElementById('root');
if (container) {
  const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
}
