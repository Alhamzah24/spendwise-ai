const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/transactions
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
    // Map SQLite row to object matching frontend expectations
    const transactions = rows.map(r => ({ ...r, _id: r.id.toString() }));
    return res.json(transactions);
  } catch (err) { res.status(500).json({ message: 'Server error.', error: err.message }); }
});

// POST /api/transactions
router.post('/', (req, res) => {
  try {
    const { type, category = 'Business', amount, label, date } = req.body;
    if (!type || !amount || !label || !date) return res.status(400).json({ message: 'Missing required fields.' });
    
    const stmt = db.prepare('INSERT INTO transactions (user_id, type, category, amount, label, date) VALUES (?, ?, ?, ?, ?, ?)');
    const info = stmt.run(req.userId, type, category, amount, label, date);
    
    const t = { _id: info.lastInsertRowid.toString(), userId: req.userId, type, category, amount, label, date };
    return res.status(201).json(t);
  } catch (err) { res.status(500).json({ message: 'Server error.', error: err.message }); }
});

// DELETE /api/transactions/actions/clear
router.delete('/actions/clear', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM transactions WHERE user_id = ?').run(req.userId);
    return res.json({ message: 'All transactions deleted.', deleted: info.changes });
  } catch (err) { res.status(500).json({ message: 'Server error.', error: err.message }); }
});

// DELETE /api/transactions/:id
router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    if (info.changes === 0) return res.status(404).json({ message: 'Not found.' });
    return res.json({ message: 'Deleted.' });
  } catch (err) { res.status(500).json({ message: 'Server error.', error: err.message }); }
});

module.exports = router;

