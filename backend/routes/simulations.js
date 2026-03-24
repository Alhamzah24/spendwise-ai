const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM simulations WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
    const sims = rows.map(r => ({ ...r, _id: r.id.toString() }));
    return res.json(sims);
  } catch (err) { res.status(500).json({ message: 'Server error.', error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const { type, amount, duration, risk, date, result, signal, sl, tp } = req.body;
    
    const stmt = db.prepare('INSERT INTO simulations (user_id, type, amount, duration, risk, date, result, signal, sl, tp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(req.userId, type, amount, duration, risk, date, result, signal, sl, tp);
    
    const s = { _id: info.lastInsertRowid.toString(), userId: req.userId, type, amount, duration, risk, date, result, signal, sl, tp };
    return res.status(201).json(s);
  } catch (err) { res.status(500).json({ message: 'Server error.', error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM simulations WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    if (info.changes === 0) return res.status(404).json({ message: 'Not found.' });
    return res.json({ message: 'Deleted.' });
  } catch (err) { res.status(500).json({ message: 'Server error.', error: err.message }); }
});

module.exports = router;

