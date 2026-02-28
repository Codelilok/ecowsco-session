const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require("body-parser");

const PORT = process.env.PORT || 50900;
__path = process.cwd();

// Routes
const {
  qrRoute,
  pairRoute
} = require('./routes');

// Prevent Max Listener warnings
require('events').EventEmitter.defaultMaxListeners = 2000;

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/qr', qrRoute);
app.use('/code', pairRoute);

// Frontend Pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 200,
    success: true,
    service: 'ECOWSCO-MD Session Server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`
🚀 ECOWSCO-MD SESSION SERVER STARTED
🌐 Running on: http://localhost:${PORT}
🟢 Status: Online
  `);
});

module.exports = app;
