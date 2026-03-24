import os
import joblib
import pandas as pd
import numpy as np
from xgboost import XGBClassifier, XGBRegressor
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import accuracy_score, mean_squared_error

models_dir = os.path.dirname(os.path.abspath(__file__))
print("🚀 Starting Model Training for SpendWise AI...")

np.random.seed(42)
n_samples = 5000

# ---------------------------------------------------------
# 1. Trading Model (XGBoost Classifier) - Existing
# ---------------------------------------------------------
X_trade = pd.DataFrame({
    'price': np.random.uniform(2000, 3000, n_samples),
    'volatility': np.random.uniform(0.001, 0.05, n_samples),
    'rsi': np.random.uniform(10, 90, n_samples),
    'macd': np.random.uniform(-10, 10, n_samples)
})
def get_label(row):
    if row['rsi'] < 30 and row['macd'] > 0: return 1 # BUY
    if row['rsi'] > 70 and row['macd'] < 0: return 0 # SELL
    return 2 # WAIT
y_trade = X_trade.apply(get_label, axis=1)

print("Training XGBoost Trading Model...")
xgb_model = XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.1, objective='multi:softprob')
xgb_model.fit(X_trade, y_trade)
joblib.dump(xgb_model, os.path.join(models_dir, 'trading_model.pkl'))
print("💾 Saved trading_model.pkl")

# ---------------------------------------------------------
# 2. Financial Document Scoring Model (Isolation Forest) - Existing
# ---------------------------------------------------------
X_fin = pd.DataFrame({
    'revenue_growth': np.random.normal(0.05, 0.1, n_samples),
    'expense_ratio': np.random.normal(0.6, 0.2, n_samples),
    'debt_ratio': np.random.normal(0.4, 0.3, n_samples)
})
n_anomalies = int(n_samples * 0.05)
X_fin.iloc[:n_anomalies, X_fin.columns.get_loc('revenue_growth')] = np.random.uniform(-0.5, -0.2, n_anomalies)
X_fin.iloc[:n_anomalies, X_fin.columns.get_loc('debt_ratio')] = np.random.uniform(1.2, 2.0, n_anomalies)

print("Training Isolation Forest Scoring Model...")
iso_model = IsolationForest(contamination=0.05, random_state=42)
iso_model.fit(X_fin)
joblib.dump(iso_model, os.path.join(models_dir, 'scoring_model.pkl'))
print("💾 Saved scoring_model.pkl")

# ---------------------------------------------------------
# 3. Cash Flow Forecast (XGBoost Regressor) - NEW
# ---------------------------------------------------------
# Predicts future balance based on past days' mean spend, mean income
X_cf = pd.DataFrame({
    'avg_income_30d': np.random.uniform(2000, 5000, n_samples),
    'avg_spend_30d': np.random.uniform(1000, 4000, n_samples),
    'current_balance': np.random.uniform(1000, 10000, n_samples),
    'days_ahead': np.random.randint(30, 91, n_samples)
})
# Target: predicted balance = current + days * (income - spend)/30 + noise
y_cf = X_cf['current_balance'] + (X_cf['days_ahead'] * (X_cf['avg_income_30d'] - X_cf['avg_spend_30d']) / 30) + np.random.normal(0, 200, n_samples)

print("Training XGBoost Cash Flow Model...")
cf_model = XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.1)
cf_model.fit(X_cf, y_cf)
joblib.dump(cf_model, os.path.join(models_dir, 'cashflow_forecast_model.pkl'))
print("💾 Saved cashflow_forecast_model.pkl")

# ---------------------------------------------------------
# 4. Transaction Anomaly Detection (Random Forest) - NEW
# ---------------------------------------------------------
# Features: amount, freq_in_month, is_weekend
X_tx = pd.DataFrame({
    'amount': np.random.exponential(50, n_samples),
    'freq_in_month': np.random.randint(1, 10, n_samples),
    'is_weekend': np.random.randint(0, 2, n_samples)
})
# Inject anomalies (very high amount, strange frequency)
def tx_label(row):
    if row['amount'] > 400 or (row['amount'] > 100 and row['freq_in_month'] > 8): return 1 # Anomaly
    return 0 # Normal
y_tx = X_tx.apply(tx_label, axis=1)

print("Training Random Forest Anomaly Model...")
rf_model = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=5)
rf_model.fit(X_tx, y_tx)
joblib.dump(rf_model, os.path.join(models_dir, 'anomaly_rf_model.pkl'))
print("💾 Saved anomaly_rf_model.pkl")

# ---------------------------------------------------------
# 5. Financial Health Live (XGBoost Classifier) - NEW
# ---------------------------------------------------------
X_health = pd.DataFrame({
    'savings_rate': np.random.uniform(-20, 50, n_samples), # percentage
    'investment_ratio': np.random.uniform(0, 40, n_samples),
    'expense_diversity': np.random.uniform(1, 10, n_samples)
})
def health_score_logic(row):
    score = 50 + row['savings_rate'] * 0.8 + row['investment_ratio'] * 0.5 + row['expense_diversity'] * 2
    return max(0, min(100, score))

y_health = X_health.apply(health_score_logic, axis=1)

print("Training XGBoost Health Score Model...")
# Use Regressor for 0-100 score
health_model = XGBRegressor(n_estimators=100, max_depth=3)
health_model.fit(X_health, y_health)
joblib.dump(health_model, os.path.join(models_dir, 'health_score_model.pkl'))
print("💾 Saved health_score_model.pkl")

print("🎉 All Models successfully compiled and saved!")
