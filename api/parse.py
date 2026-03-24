import json
import base64
import csv
import io
import re
import pdfplumber
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        data = json.loads(body)
        
        filename = data.get('filename', '')
        file_base64 = data.get('fileBase64', '')
        
        if not file_base64:
            self._send_json(400, {"message": "No file content"})
            return

        file_bytes = base64.b64decode(file_base64)
        transactions = []

        try:
            if filename.lower().endswith('.csv'):
                content = file_bytes.decode('utf-8')
                f = io.StringIO(content)
                reader = csv.DictReader(f)
                # Map headers to lower for easier matching
                for row in reader:
                    # Case-insensitive header lookup
                    r = {k.lower(): v for k, v in row.items()}
                    raw_amt = r.get('montant', r.get('amount', r.get('debit', r.get('credit', '0'))))
                    try:
                        amt = float(str(raw_amt).replace(',', '.').replace(' ', '').replace('€', ''))
                    except: amt = 0
                    
                    label = r.get('libellé', r.get('label', r.get('description', 'Transaction')))
                    transactions.append({
                        "type": "Income" if amt >= 0 else "Expense",
                        "amount": amt,
                        "label": label,
                        "date": r.get('date', ''),
                        "category": r.get('catégorie', r.get('category', self._detect_category(label)))
                    })
            else:
                # PDF parsing with pdfplumber (Robuste logic from predict.py)
                with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                    text_lines = []
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
                            credit_col_index = (debit_pos + credit_pos) // 2
                            break
                            
                    for line in text_lines:
                        if len(line.strip()) < 10: continue
                        
                        date_match = re.search(r'(\d{2}[-/.]\d{2}(?:[-/.]\d{2,4})?)', line)
                        # Match amount with optional leading sign and optional whitespace
                        amt_match = re.search(r'([-+]\s*)?((?:\d{1,3}(?:\s\d{3})*|\d+)[.,]\d{2})(?:\s*€)?\s*$', line)
                        
                        if date_match and amt_match:
                            d_str = date_match.group(1)
                            sign = amt_match.group(1).strip() if amt_match.group(1) else ""
                            a_str = amt_match.group(2).replace(' ', '').replace(',', '.')
                            
                            try:
                                amt = float(a_str)
                            except: continue
                                
                            amt_pos = line.rfind(amt_match.group(0).strip())
                            start_idx = date_match.end()
                            label_raw = line[start_idx:amt_pos].strip()
                            
                            # Clean up Date Valeur from the end of the label
                            label_raw = re.sub(r'\d{2}[-/.]\d{2}(?:[-/.]\d{2,4})?[. ]*$', '', label_raw).strip()
                            label_raw = re.sub(r'^\s*-\s*', '', label_raw).strip()
                            if not label_raw: label_raw = "Transaction Inconnue"
                            
                            label_upper = label_raw.upper()
                            if any(x in label_upper for x in ["SOLDE", "VOTRE FAVEUR"]): continue
                            
                            # SIGN DETECTION (Prioritize explicit sign over spatial)
                            if sign == '-':
                                amt = -abs(amt)
                            elif sign == '+':
                                amt = abs(amt)
                            else:
                                # Fallback to spatial if no explicit sign
                                if amt_pos < credit_col_index:
                                    amt = -abs(amt)
                                else:
                                    amt = abs(amt)
                            
                            # Format date
                            parts = re.split(r'[-/.]', d_str)
                            year = parts[2] if len(parts) == 3 else "2026"
                            if len(year) == 2: year = "20" + year
                            f_date = f"{year}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
                            
                            transactions.append({
                                "type": "Income" if amt > 0 else "Expense",
                                "amount": amt,
                                "label": label_raw[:50],
                                "date": f_date,
                                "category": self._detect_category(label_raw)
                            })

            self._send_json(200, {"filename": filename, "transactions": transactions})

        except Exception as e:
            import traceback
            error_msg = f"Error in {filename}: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)
            self._send_json(500, {"message": error_msg})

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _detect_category(self, label):
        l = label.upper()
        if any(w in l for w in ['NETFLIX', 'SPOTIFY', 'PRLV', 'IMAGINE R', 'ABONNEMENT', 'DISNEY']): return 'Abonnements'
        if any(w in l for w in ['MARKET', 'CARREFOUR', 'AUCHAN', 'LECLERC', 'FOOD', 'MONOPRIX', 'LIDL']): return 'Alimentation'
        if any(w in l for w in ['UBER', 'BOLT', 'SNCF', 'TRAIN', 'BUS', 'RATP']): return 'Transport'
        if any(w in l for w in ['LOYER', 'IMMO', 'FONCIER']): return 'Immobilier'
        if any(w in l for w in ['TRADING', 'BOURSE', 'INVEST', 'BINANCE', 'COINBASE']): return 'Trading'
        if any(w in l for w in ['RESTO', 'BURGER', 'MCDO', 'KFC', 'DELIVEROO', 'EAT']): return 'Restaurants'
        if any(w in l for w in ['VERSEMENT', 'SALAIRE', 'URSSAF', 'VIREMENT']): return 'Business'
        return 'Achats'
