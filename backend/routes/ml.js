const express = require('express');
const router = express.Router();
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });

const runPythonML = (type, dataObj) => {
  return new Promise((resolve, reject) => {
    // Determine path to local venv python executable
    const pythonPath = path.join(__dirname, '..', 'ml', 'venv', 'bin', 'python');
    const scriptPath = path.join(__dirname, '..', 'ml', 'predict.py');
    const dataStr = JSON.stringify(dataObj);

    const process = spawn(pythonPath, [scriptPath, type, dataStr]);
    
    let output = '';
    let errorOutput = '';

    process.stdout.on('data', (data) => { output += data.toString(); });
    process.stderr.on('data', (data) => { errorOutput += data.toString(); });

    process.on('close', (code) => {
      try {
        if (!output.trim()) throw new Error(errorOutput || 'No output from python');
        const result = JSON.parse(output);
        if (result.error) reject(new Error(result.message));
        resolve(result);
      } catch (err) {
        console.error('Python ML Error:', err.message, '| Stderr:', errorOutput);
        reject(new Error('Erreur interne du moteur ML.'));
      }
    });
  });
};

router.post('/predict', async (req, res) => {
  try {
    const data = req.body;
    const result = await runPythonML('trading', data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/forecast', async (req, res) => {
  try {
    const data = req.body;
    const result = await runPythonML('forecast', data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/anomalies', async (req, res) => {
  try {
    const data = req.body;
    const result = await runPythonML('anomalies', data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/health-score', async (req, res) => {
  try {
    const data = req.body;
    const result = await runPythonML('health_score', data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/budget', async (req, res) => {
  try {
    const data = req.body;
    const result = await runPythonML('budget', data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const data = req.body;
    const result = await runPythonML('chat', data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier uploadé.' });
    // Call Python script with the file path
    const result = await runPythonML('analyze_document', { filepath: req.file.path });
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    res.json({ filename: req.file.originalname, analysis: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/upload-statement', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier uploadé.' });
    const result = await runPythonML('parse_statement', { 
        filepath: req.file.path,
        filename: req.file.originalname
    });
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    res.json({ filename: req.file.originalname, ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
