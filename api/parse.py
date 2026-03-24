import json
import base64
import io
import re
import pandas as pd
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
                df = pd.read_csv(io.StringIO(content))
                # Basic normalization
                for _, row in df.iterrows():
                    amt = float(str(row.get('Montant', row.get('Amount', 0))).replace(',', '.').replace(' ', ''))
                    transactions.append({
                        "type": "Income" if amt >= 0 else "Expense",
                        "amount": amt,
                        "label": str(row.get('Libellé', row.get('Label', 'Transaction'))),
                        "date": str(row.get('Date', '')),
                        "category": str(row.get('Catégorie', 'Business'))
                    })
            else:
                # PDF parsing with pdfplumber
                with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                    for page in pdf.pages:
                        text = page.extract_text()
                        if not text: continue
                        
                        # Use same logic as our local predict.py
                        lines = text.split('\n')
                        for line in lines:
                            # Search for amount at end of line
                            amt_match = re.search(r'([-+]?\d{1,3}(?:\s?\d{3})*[,.]\d{2})\s*€?\s*$', line)
                            date_match = re.search(r'(\d{2}[./]\d{2}[./]\d{2,4})', line)
                            
                            if amt_match and date_match:
                                raw_amt = float(amt_match.group(1).replace(' ', '').replace(',', '.'))
                                label = line[date_match.end():amt_match.start()].strip()
                                
                                if "SOLDE" in label.upper() or len(label) < 2: continue
                                
                                dp = date_match.group(1).replace('.', '/').split('/')
                                date_str = f"20{dp[2][-2:]}-{dp[1].zfill(2)}-{dp[0].zfill(2)}"
                                
                                transactions.append({
                                    "type": "Income" if raw_amt >= 0 else "Expense",
                                    "amount": raw_amt,
                                    "label": label,
                                    "date": date_str,
                                    "category": self._detect_category(label)
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
        l = label.lower()
        if any(w in l for w in ['netflix', 'spotify', 'amazon prime', 'abonnement']): return 'Abonnements'
        if any(w in l for w in ['burger', 'mcdonald', 'kfc', 'resto', 'food', 'market', 'carrefour']): return 'Alimentation'
        if any(w in l for w in ['uber', 'bolt', 'sncf', 'train', 'bus']): return 'Transport'
        if any(w in l for w in ['loyer', 'immo']): return 'Immobilier'
        if any(w in l for w in ['trading', 'bourse', 'invest']): return 'Trading'
        return 'Business'
