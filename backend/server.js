require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db'); // Initializes SQLite sync

const app = express();

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/simulations', require('./routes/simulations'));
app.use('/api/ml', require('./routes/ml'));

app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date(), db: 'sqlite' }));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log('✅ SQLite Database ready');
  console.log(`🚀 SpendWise API running on http://localhost:${PORT}`);
});
