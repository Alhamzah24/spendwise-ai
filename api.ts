// In production (Vercel): relative /api/* paths are used.
// In local dev: Vite proxies /api/* to http://localhost:5001 (via vite.config.ts).
const API = '/api';

// Get stored token
export const getToken = () => localStorage.getItem('sw_token');
export const getUser = () => {
  const u = localStorage.getItem('sw_user');
  return u ? JSON.parse(u) : null;
};
export const setAuth = (token: string, user: object) => {
  localStorage.setItem('sw_token', token);
  localStorage.setItem('sw_user', JSON.stringify(user));
};
export const clearAuth = () => {
  localStorage.removeItem('sw_token');
  localStorage.removeItem('sw_user');
};

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}`
});

// Auth → api/auth.ts?action=register | login
export const apiRegister = (name: string, email: string, password: string) =>
  fetch(`${API}/auth?action=register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) }).then(r => r.json());

export const apiLogin = (email: string, password: string) =>
  fetch(`${API}/auth?action=login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(r => r.json());

// Transactions → api/transactions.ts
export const apiGetTransactions = () =>
  fetch(`${API}/transactions`, { headers: headers() }).then(r => r.json());

export const apiCreateTransaction = (data: object) =>
  fetch(`${API}/transactions`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(r => r.json());

export const apiDeleteTransaction = (id: string) =>
  fetch(`${API}/transactions?id=${id}`, { method: 'DELETE', headers: headers() }).then(r => r.json());

export const apiClearTransactions = () =>
  fetch(`${API}/transactions?action=clear`, { method: 'DELETE', headers: headers() }).then(r => r.json());

// ML functions → api/ml.ts (all consolidated)
export const apiAnomalies = (data: { transactions: object[] }) =>
  fetch(`${API}/ml`, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'anomalies', ...data }) }).then(r => r.json());

export const apiHealthScore = (data: { transactions: object[] }) =>
  fetch(`${API}/ml`, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'health_score', ...data }) }).then(r => r.json());

export const apiBudget = (data: { transactions: object[] }) =>
  fetch(`${API}/ml`, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'budget', ...data }) }).then(r => r.json());

export const apiChat = (data: { message: string, transactions: object[] }) =>
  fetch(`${API}/ml`, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'chat', ...data }) }).then(r => r.json());

// PDF/CSV parsing → api/parse.py (Python)
export const apiUploadStatement = async (file: File) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const res = await fetch(`${API}/parse`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ filename: file.name, fileBase64: base64 })
        });
        resolve(await res.json());
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Erreur de lecture du fichier local (I/O)."));
    reader.readAsDataURL(file);
  });
};

// Legacy — kept for compatibility
export const apiUploadBilan = apiUploadStatement;
export const apiForecast = (data: { transactions: object[] }) =>
  fetch(`${API}/ml`, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'forecast', ...data }) }).then(r => r.json());
export const apiPredictXAU = (data: object) => Promise.resolve({ signal: 'HOLD', confidence: 0.5 });
export const apiGetSimulations = () => Promise.resolve([]);
export const apiCreateSimulation = (data: object) => Promise.resolve({ ...data });
export const apiDeleteSimulation = (id: string) => Promise.resolve({ message: 'Deleted.' });
