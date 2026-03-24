const mongoose = require('mongoose');

const SimulationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  amount: { type: Number },
  duration: { type: Number },
  risk: { type: String },
  date: { type: String },
  result: { type: String },
  signal: { type: String, enum: ['BUY', 'SELL', 'WAIT'] },
  sl: { type: String },
  tp: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Simulation', SimulationSchema);
