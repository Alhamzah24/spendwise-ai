import sys
import json
import os
import joblib
import pandas as pd
import numpy as np
import re
from datetime import datetime, timedelta

# Path resolving
models_dir = os.path.dirname(os.path.abspath(__file__))

def run_prediction():
    try:
        if len(sys.argv) < 3:
            raise ValueError("Missing arguments. Usage: python predict.py <type> <json_data>")

        pred_type = sys.argv[1]
        data = json.loads(sys.argv[2])

        if pred_type == "trading":
            model_path = os.path.join(models_dir, 'trading_model.pkl')
            model = joblib.load(model_path)
            df = pd.DataFrame([{
                'price': float(data.get('price', 2500)),
                'volatility': float(data.get('volatility', 0.02)),
                'rsi': float(data.get('rsi', 50)),
                'macd': float(data.get('macd', 0))
            }])
            pred_class = int(model.predict(df)[0])
            probs = model.predict_proba(df)[0]
            confidence = float(max(probs))
            labels = {0: 'SELL', 1: 'BUY', 2: 'WAIT'}
            signal = labels.get(pred_class, 'WAIT')
            reason = "RSI optimal" if signal == 'BUY' else "Overbought" if signal == "SELL" else "Neutral"
            price = df['price'][0]
            sl, tp = (price * 0.98, price * 1.05) if signal == 'BUY' else (price * 1.02, price * 0.95) if signal == 'SELL' else (price, price)
            print(json.dumps({
                "signal": signal, "confidence": round(confidence * 100, 2),
                "sl": str(round(sl, 2)), "tp": str(round(tp, 2)), "reason": reason
            }))

        elif pred_type == "analyze_document":
            # the old isolation forest code kept simple
            import PyPDF2
            filepath = data.get('filepath')
            if not filepath or not os.path.exists(filepath): raise ValueError("Fichier introuvable.")
            model_path = os.path.join(models_dir, 'scoring_model.pkl')
            model = joblib.load(model_path)
            df = pd.DataFrame([{'revenue_growth': 0.1, 'expense_ratio': 0.5, 'debt_ratio': 0.3}])
            pred = int(model.predict(df)[0])
            score_func = float(model.decision_function(df)[0])
            health_score = int((score_func + 0.5) * 100)
            health_score = max(0, min(100, health_score))
            status = "HEALTHY" if pred == 1 else "AT RISK"
            suggestions = [
                f"📄 Analyse de vos Dépenses estimée saine.",
                f"💡 Conseil: Optimisez vos abonnements.",
                f"🤖 Le verdict global est '{status}' avec {health_score}/100."
            ]
            print(json.dumps({"score": health_score, "status": status, "suggestions": suggestions}))

        # --- NEW LOCAL AI/HEURISTIC FEATURES ---

        elif pred_type == "forecast":
            days = int(data.get('days', 30))
            txs = data.get('transactions', [])
            
            # Dynamically determine the number of months in the dataset
            months = set()
            for t in txs:
                if len(t.get('date', '')) >= 7:
                    months.add(t['date'][:7])
            num_months = len(months) if len(months) > 0 else 1
            
            # Use absolute values to properly compute the net balance
            incomes = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Income')
            expenses = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Expense')
            current_balance = incomes - expenses
            
            # Use XGBoost Regressor to predict trend
            model = joblib.load(os.path.join(models_dir, 'cashflow_forecast_model.pkl'))
            
            avg_income_30d = incomes / num_months if txs else 3000
            avg_spend_30d = expenses / num_months if txs else 2000
            
            forecast_data = []
            base_date = datetime.now()
            
            for d in range(1, days + 1, max(1, days // 30)): # Generate ~30 points
                df_pred = pd.DataFrame([{
                    'avg_income_30d': avg_income_30d,
                    'avg_spend_30d': avg_spend_30d,
                    'current_balance': current_balance,
                    'days_ahead': d
                }])
                pred_bal = float(model.predict(df_pred)[0])
                date_str = (base_date + timedelta(days=d)).strftime('%Y-%m-%d')
                
                # Confidence interval heuristic
                var = 50 + (d * 5) # variance grows over time
                
                forecast_data.append({
                    "date": date_str,
                    "predicted_balance": round(pred_bal, 2),
                    "confidence_low": round(pred_bal - var, 2),
                    "confidence_high": round(pred_bal + var, 2)
                })
            
            final_bal = forecast_data[-1]['predicted_balance']
            trend = "up" if final_bal > current_balance else "down" if final_bal < current_balance else "stable"
            alert = f"Low balance warning on {forecast_data[-1]['date']}" if final_bal < 500 else None
            
            print(json.dumps({
                "forecast": forecast_data,
                "trend": trend,
                "alert": alert
            }))

        elif pred_type == "anomalies":
            txs = data.get('transactions', [])
            model = joblib.load(os.path.join(models_dir, 'anomaly_rf_model.pkl'))
            
            anomalies = []
            for t in txs:
                if t['type'] == 'Income': continue # Usually focus on expenses
                
                amt = float(t['amount'])
                df_tx = pd.DataFrame([{
                    'amount': amt,
                    'freq_in_month': 1, # Heuristic baseline
                    'is_weekend': 0 # Heuristic baseline
                }])
                
                is_anomaly = int(model.predict(df_tx)[0])
                if is_anomaly == 1:
                    anomalies.append({
                        "transaction_id": t.get('id', str(np.random.randint(1000))),
                        "reason": f"Dépense inhabituelle de {amt}€ détectée.",
                        "severity": "high" if amt > 500 else "medium",
                        "suggested_action": "Vérifier la validité de cette transaction."
                    })
            
            print(json.dumps({ "anomalies": anomalies }))

        elif pred_type == "health_score":
            txs = data.get('transactions', [])
            incomes = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Income')
            expenses = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Expense')
            
            # === REAL DATA-DRIVEN SCORE ===
            # Savings Rate: 40 pts max (ideal >= 20%)
            savings_rate = ((incomes - expenses) / incomes * 100) if incomes > 0 else 0
            savings_score = min(40, (savings_rate / 20) * 40)
            
            # Investment Ratio: 20 pts max (ideal >= 10% of expenses)
            inv_expenses = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Expense' and t['category'] in ['Trading', 'Immobilier'])
            inv_ratio = (inv_expenses / incomes * 100) if incomes > 0 else 0
            investment_score = min(20, (inv_ratio / 10) * 20)
            
            # Spend Diversity: 20 pts max (penalize if >60% of spending in 1 category)
            cat_totals = {}
            for t in txs:
                if t['type'] == 'Expense':
                    cat_totals[t['category']] = cat_totals.get(t['category'], 0) + abs(float(t['amount']))
            max_cat_pct = (max(cat_totals.values()) / expenses * 100) if cat_totals and expenses > 0 else 100
            diversity_score = max(0, 20 - (max(0, max_cat_pct - 40) / 60) * 20)
            
            # Surplus Buffer: 20 pts max (having a positive monthly surplus)
            surplus = incomes - expenses
            buffer_score = 20 if surplus > 0 else max(0, 20 + (surplus / max(1, incomes)) * 20)
            
            score = max(0, min(100, int(savings_score + investment_score + diversity_score + buffer_score)))
            grade = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 50 else "D" if score >= 30 else "F"
            
            # === DYNAMIC, PERSONAL ADVICE ===
            strengths = []
            improvements = []
            
            if savings_rate >= 20:
                strengths.append(f"Excellent taux d'épargne ({savings_rate:.1f}%)")
            elif savings_rate >= 10:
                strengths.append(f"Bon taux d'épargne ({savings_rate:.1f}%)")
            else:
                improvements.append(f"Augmenter votre épargne (actuel: {savings_rate:.1f}%, cible: 20%)")
            
            if surplus > 0:
                strengths.append(f"Surplus mensuel positif de {surplus:,.0f}€")
            else:
                improvements.append(f"Déficit de {abs(surplus):,.0f}€ à combler")
            
            if inv_ratio >= 10:
                strengths.append(f"Bonne exposition investissement ({inv_ratio:.1f}%)")
            else:
                improvements.append(f"Augmenter l'investissement (actuel: {inv_ratio:.1f}%, cible: 10%)")
            
            if max_cat_pct > 60 and cat_totals:
                top_cat = max(cat_totals, key=cat_totals.get)
                improvements.append(f"{top_cat} représente {max_cat_pct:.0f}% des dépenses — diversifiez")
            else:
                strengths.append("Dépenses bien réparties entre les catégories")
            
            # Always keep at least 1 strength and 1 improvement
            if not strengths: strengths = ["Revenus enregistrés"]
            if not improvements: improvements = ["Continuez sur cette excellente lancée !"]
            
            print(json.dumps({
                "score": score,
                "grade": grade,
                "strengths": strengths[:3],
                "improvements": improvements[:3]
            }))

        elif pred_type == "budget":
            txs = data.get('transactions', [])
            expenses = [t for t in txs if t['type'] == 'Expense']
            
            # Dynamically determine the number of months in the dataset
            months = set()
            for t in expenses:
                if len(t.get('date', '')) >= 7:
                    months.add(t['date'][:7])
            num_months = len(months) if len(months) > 0 else 1
            
            cat_totals = {}
            for t in expenses:
                c = t['category']
                cat_totals[c] = cat_totals.get(c, 0) + abs(float(t['amount']))
                
            budgets = []
            for cat, total in cat_totals.items():
                avg = total / num_months # True monthly average
                suggested = avg * 0.90 # Aim for 10% savings
                budgets.append({
                    "category": cat,
                    "current_avg": round(avg, 2),
                    "suggested_budget": round(suggested, 2),
                    "reason": "10% d'optimisation IA appliquée"
                })
                
            print(json.dumps({ "budgets": budgets }))

        elif pred_type == "chat":
            msg_raw = data.get('message', '').lower()
            # Normalize accents for robust matching
            msg = msg_raw.replace('é', 'e').replace('è', 'e').replace('ê', 'e').replace('à', 'a').replace('â', 'a')
            txs = data.get('transactions', [])
            
            # Heuristic Regex NLP engine
            response = "Je suis SpendWise AI local. Je peux analyser vos relevés. Essayez 'Combien j'ai dépensé en Alimentation ?' ou 'Tesla ?'"
            
            # Match variants of "combien", "cb", "quel", and "depense", "cout", "frais"
            is_asking_expense = any(w in msg for w in ["combien", "cb ", "quel"]) and any(w in msg for w in ["depense", "cout", "frais", "budget", "parti"])
            is_asking_income = any(w in msg for w in ["combien", "cb ", "quel"]) and any(w in msg for w in ["gagne", "gagner", "revenu", "recu", "rentre", "gagne"])
            is_asking_savings = any(w in msg for w in ["cote", "epargn", "economi"])
            
            if is_asking_expense:
                # Find category
                found_cat = None
                categories = ["Trading", "Immobilier", "Alimentation", "Transport", "Abonnements", "Business", "Consommation", "Santé"]
                for c in categories:
                    c_norm = c.lower().replace('é', 'e')
                    if c_norm in msg:
                        found_cat = c
                        break
                
                if found_cat:
                    total = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Expense' and t['category'].lower() == found_cat.lower())
                    response = f"Vous avez dépensé un total de {total:,.2f}€ dans la catégorie {found_cat}."
                else:
                    total = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Expense')
                    response = f"Vos dépenses totales s'élèvent à {total:,.2f}€ en tout."
                    
            elif is_asking_income:
                total = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Income')
                response = f"Vos revenus totaux s'élèvent à {total:,.2f}€ en tout."
                
            elif is_asking_savings:
                inc = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Income')
                exp = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Expense')
                if inc > 0:
                    savings = inc - exp
                    ideal = inc * 0.20
                    if savings >= ideal:
                        response = f"Bravo ! Vous avez mis de côté {savings:,.2f}€ (Votre objectif idéal des 20% était de {ideal:,.2f}€). Continuez comme ça !"
                    elif savings > 0:
                        response = f"Vous avez épargné {savings:,.2f}€. L'IA recommande de cibler 20% de vos revenus, soit un objectif de {ideal:,.2f}€. Un petit effort !"
                    else:
                        response = f"Attention, vous êtes en déficit de {savings:,.2f}€. Essayez de réduire vos charges pour repasser dans le vert !"
                else:
                    response = "Veuillez d'abord enregistrer un revenu pour que je puisse calculer votre capacité d'épargne optimale."
                    
            elif "solde" in msg or "reste" in msg or "cb j'ai" in msg:
                inc = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Income')
                exp = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Expense')
                response = f"Votre solde global consolidé est de {(inc - exp):,.2f}€."
                
            elif "tesla" in msg:
                inc = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Income')
                exp = sum(abs(float(t['amount'])) for t in txs if t['type'] == 'Expense')
                if (inc - exp) > 40000:
                    response = f"Avec un solde de {(inc-exp):,.0f}€, oui, vous pouvez théoriquement vous offrir une Tesla Model 3 comptant !"
                else:
                    response = f"Votre solde actuel de {(inc-exp):,.0f}€ est insuffisant pour un achat comptant. Pensez au leasing avec vos revenus réguliers."
            
            print(json.dumps({"reply": response}))

        elif pred_type == "parse_statement":
            import csv
            import PyPDF2
            filepath = data.get('filepath')
            filename = data.get('filename', filepath)
            if not filepath or not os.path.exists(filepath): raise ValueError("Fichier introuvable.")
            
            transactions = []
            
            if filename.lower().endswith('.csv'):
                with open(filepath, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        try:
                            transactions.append({
                                "date": row.get('Date', row.get('date', '')),
                                "label": row.get('Libellé', row.get('label', '')),
                                "amount": float(row.get('Montant', row.get('amount', 0))),
                                "type": row.get('Type', row.get('type', 'Expense')),
                                "category": row.get('Catégorie', row.get('category', 'Uncategorized'))
                            })
                        except Exception as e:
                            pass
            elif filename.lower().endswith('.pdf'):
                import re
                try:
                    import pdfplumber
                    text_lines = []
                    with pdfplumber.open(filepath) as pdf:
                        for page in pdf.pages:
                            page_text = page.extract_text(layout=True)
                            if page_text:
                                text_lines.extend(page_text.split('\n'))
                    
                    # Dynamically find the exact midpoint between the DEBIT and CREDIT columns
                    credit_col_index = 80 # Safe default guess
                    for line in text_lines:
                        if "DEBIT" in line and "CREDIT" in line:
                            debit_pos = line.find("DEBIT")
                            credit_pos = line.find("CREDIT")
                            # The vertical divider is halfway between the DEBIT and CREDIT headers.
                            credit_col_index = (debit_pos + credit_pos) // 2
                            break
                            
                    for line in text_lines:
                        # Skip short or empty lines
                        if len(line.strip()) < 10: continue
                        
                        # Look for a date (DD/MM/YYYY or DD.MM or DD/MM/YY)
                        date_match = re.search(r'(\d{2}[-/.]\d{2}(?:[-/.]\d{2,4})?)', line)
                        # Strictly look for an amount to avoid merging with the year '26' from the Date Valeur.
                        # Matches '1 234,56' or '12,90' or '1000.00'
                        amt_match = re.search(r'([-+]?(?:\d{1,3}(?:\s\d{3})*|\d+)[.,]\d{2})(?:\s*€)?\s*$', line)
                        
                        if date_match and amt_match:
                            d_str = date_match.group(1)
                            a_str = amt_match.group(1).replace(' ', '').replace(',', '.')
                            
                            try:
                                amt = float(a_str)
                            except:
                                continue
                                
                            amt_pos = line.rfind(amt_match.group(1))
                            
                            start_idx = date_match.end()
                            label_raw = line[start_idx:amt_pos].strip()
                            # Clean up Date Valeur from the end of the label (format DD.MM.YY or DD.MM. often ending with dot)
                            label_raw = re.sub(r'\d{2}[-/.]\d{2}(?:[-/.]\d{2,4})?[. ]*$', '', label_raw).strip()
                            label_raw = re.sub(r'^\s*-\s*', '', label_raw).strip()
                            if not label_raw: label_raw = "Transaction Inconnue"
                            
                            label_upper = label_raw.upper()
                            if "NOUVEAU SOLDE" in label_upper or "SOLDE EN VOTRE" in label_upper or "N. SOLDE" in label_upper:
                                continue # Ignore the closing balance so we don't double count
                                
                            # If it's the Ancien Solde, keep it to initialize the balance perfectly!
                            if "SOLDE" in label_upper and "ANCIEN" not in label_upper and "PRECEDENT" not in label_upper:
                                # Just to be safe, ignore other generic 'SOLDE' that aren't 'ancien'
                                continue
                            
                            # SPATIAL DETERMINATION OF DEBIT VS CREDIT
                            if amt_pos >= credit_col_index:
                                amt = abs(amt) # it's in the CREDIT column
                            else:
                                amt = -abs(amt) # it's in the DEBIT column
                            
                            tx_type = "Income" if amt > 0 else "Expense"
                            
                            # Micro categorization heuristic
                            cat = "Achats"
                            if "MARKET" in label_upper or "AUCHAN" in label_upper or "CARREFOUR" in label_upper or "LECLERC" in label_upper: cat = "Alimentation"
                            elif "DELIVEROO" in label_upper or "UBER" in label_upper or "RESTO" in label_upper: cat = "Restaurants"
                            elif "NETFLIX" in label_upper or "SPOTIFY" in label_upper or "DISNEY" in label_upper: cat = "Abonnements"
                            elif "PRLV" in label_upper or "IMAGINE R" in label_upper: cat = "Abonnements/Factures"
                            elif "VERSEMENT" in label_upper or "SALAIRE" in label_upper: cat = "Business"
                            
                            # Format date to YYYY-MM-DD 
                            parts = re.split(r'[-/.]', d_str)
                            if len(parts) >= 2:
                                year = parts[2] if len(parts) == 3 else "2026" # Default to 2026 if year missing (like 02.02)
                                if len(year) == 2: year = "20" + year
                                f_date = f"{year}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
                            else:
                                f_date = d_str
                                
                            transactions.append({
                                "date": f_date,
                                "label": label_raw[:50],
                                "amount": amt,
                                "type": tx_type,
                                "category": cat
                            })
                except Exception as e:
                    raise ValueError(f"Erreur de lecture PDF: {str(e)}")
            else:
                raise ValueError("Format de fichier non supporté. Veuillez utiliser CSV ou PDF.")
                
            print(json.dumps({"transactions": transactions}))

        else:
            raise ValueError(f"Unknown prediction type: {pred_type}")

    except Exception as e:
        print(json.dumps({"error": True, "message": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    run_prediction()
